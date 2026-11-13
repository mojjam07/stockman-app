-- StockMan Inventory: schema, security and server-side functions.
-- Run once in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- (Or `supabase db push` if you use the Supabase CLI.)

-- ───────────────────────────────────────────── tables
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  business_name text not null default '' check (char_length(business_name) <= 120),
  telephone     text not null default '' check (char_length(telephone) <= 20),
  created_at    timestamptz not null default now()
);

create table if not exists public.inventory_items (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 100),
  size        text not null default '' check (char_length(size) <= 50),
  price       numeric(12, 2) not null check (price > 0),
  quantity    integer not null default 0 check (quantity >= 0),
  image_path  text,                       -- object path inside the `stock-images` bucket
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- One row per name + size for each owner, ignoring letter case.
create unique index if not exists inventory_items_owner_name_size_key
  on public.inventory_items (owner_id, lower(name), lower(size));

create table if not exists public.sales (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users (id) on delete cascade,
  number         integer not null,        -- receipt number, counts up per owner
  customer_name  text not null default '' check (char_length(customer_name) <= 100),
  total          numeric(14, 2) not null default 0,
  created_at     timestamptz not null default now(),
  unique (owner_id, number)
);
create index if not exists sales_owner_created_idx on public.sales (owner_id, created_at desc);

create table if not exists public.sale_items (
  id          uuid primary key default gen_random_uuid(),
  sale_id     uuid not null references public.sales (id) on delete cascade,
  item_id     uuid references public.inventory_items (id) on delete set null,
  -- Copied at sale time so history stays correct if the item is later edited or deleted.
  name        text not null,
  size        text not null default '',
  unit_price  numeric(12, 2) not null,
  quantity    integer not null check (quantity > 0),
  line_total  numeric(14, 2) not null
);
create index if not exists sale_items_sale_idx on public.sale_items (sale_id);

-- ───────────────────────────────────────────── new accounts get a profile
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, business_name, telephone)
  values (
    new.id,
    coalesce(left(new.raw_user_meta_data ->> 'business_name', 120), ''),
    coalesce(left(new.raw_user_meta_data ->> 'telephone', 20), '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ───────────────────────────────────────────── checkout (atomic)
-- p_items: [{"item_id": "<uuid>", "quantity": 2}, ...]. Raises a readable error if stock is short;
-- any error rolls the whole sale back, so stock is never half-updated.
create or replace function public.create_sale(p_owner uuid, p_customer text, p_items jsonb)
returns uuid language plpgsql set search_path = public as $$
declare
  r        record;
  it       public.inventory_items;
  v_sale   uuid;
  v_number integer;
  v_total  numeric(14, 2) := 0;
  v_line   numeric(14, 2);
  v_label  text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item to the sale.' using errcode = 'P0001';
  end if;

  -- Lock this owner's profile row: sales for one shop are handled one at a time,
  -- which also keeps receipt numbers gap-free and unique.
  perform 1 from public.profiles where id = p_owner for update;
  if not found then
    raise exception 'Account not found.' using errcode = 'P0001';
  end if;

  select coalesce(max(number), 0) + 1 into v_number from public.sales where owner_id = p_owner;
  insert into public.sales (owner_id, number, customer_name)
  values (p_owner, v_number, left(btrim(coalesce(p_customer, '')), 100))
  returning id into v_sale;

  -- Repeated lines for the same item are combined; cart order is kept.
  for r in
    select (e ->> 'item_id')::uuid as item_id, sum((e ->> 'quantity')::int) as qty, min(ord) as ord
    from jsonb_array_elements(p_items) with ordinality as t(e, ord)
    group by 1 order by min(ord)
  loop
    select * into it from public.inventory_items
    where id = r.item_id and owner_id = p_owner for update;
    if not found then
      raise exception 'An item in your cart no longer exists. Refresh the page and try again.' using errcode = 'P0001';
    end if;
    v_label := case when it.size <> '' then it.name || ' (' || it.size || ')' else it.name end;
    if r.qty < 1 then
      raise exception 'Quantity for % must be at least 1.', v_label using errcode = 'P0001';
    end if;
    if r.qty > it.quantity then
      raise exception 'Only % of % left in stock.', it.quantity, v_label using errcode = 'P0001';
    end if;

    v_line := round(it.price * r.qty, 2);
    insert into public.sale_items (sale_id, item_id, name, size, unit_price, quantity, line_total)
    values (v_sale, it.id, it.name, it.size, it.price, r.qty, v_line);
    update public.inventory_items set quantity = quantity - r.qty, updated_at = now() where id = it.id;
    v_total := v_total + v_line;
  end loop;

  update public.sales set total = v_total where id = v_sale;
  return v_sale;
end $$;

-- ───────────────────────────────────────────── add item (merges with an existing one)
create or replace function public.upsert_item(
  p_owner uuid, p_name text, p_size text, p_price numeric, p_quantity integer, p_image_path text
) returns jsonb language plpgsql set search_path = public as $$
declare
  existing public.inventory_items;
  result   public.inventory_items;
  v_prev   text := null;
  v_merged boolean := false;
begin
  select * into existing from public.inventory_items
  where owner_id = p_owner and lower(name) = lower(btrim(p_name)) and lower(size) = lower(btrim(p_size))
  for update;

  if found then
    v_merged := true;
    if p_image_path is not null then v_prev := existing.image_path; end if;
    update public.inventory_items
       set quantity = quantity + p_quantity,
           price = p_price,
           image_path = coalesce(p_image_path, image_path),
           updated_at = now()
     where id = existing.id
    returning * into result;
  else
    insert into public.inventory_items (owner_id, name, size, price, quantity, image_path)
    values (p_owner, btrim(p_name), btrim(p_size), p_price, p_quantity, p_image_path)
    returning * into result;
  end if;

  return jsonb_build_object('item', to_jsonb(result), 'merged', v_merged, 'previous_image_path', v_prev);
end $$;

-- These functions take an owner id as an argument, so they must only ever be called by
-- the Express server (service role), never directly by a browser.
revoke all on function public.create_sale(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.upsert_item(uuid, text, text, numeric, integer, text) from public, anon, authenticated;
grant execute on function public.create_sale(uuid, text, jsonb) to service_role;
grant execute on function public.upsert_item(uuid, text, text, numeric, integer, text) to service_role;

-- ───────────────────────────────────────────── row level security
-- The browser never writes to these tables (the Express server does, using the service role).
-- Reads are allowed only for your own rows, as defence in depth.
alter table public.profiles        enable row level security;
alter table public.inventory_items enable row level security;
alter table public.sales           enable row level security;
alter table public.sale_items      enable row level security;

drop policy if exists "own profile"    on public.profiles;
drop policy if exists "own items"      on public.inventory_items;
drop policy if exists "own sales"      on public.sales;
drop policy if exists "own sale lines" on public.sale_items;
create policy "own profile" on public.profiles        for select to authenticated using (id = (select auth.uid()));
create policy "own items"   on public.inventory_items for select to authenticated using (owner_id = (select auth.uid()));
create policy "own sales"   on public.sales           for select to authenticated using (owner_id = (select auth.uid()));
create policy "own sale lines" on public.sale_items   for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id and s.owner_id = (select auth.uid())));

revoke insert, update, delete, truncate on public.profiles, public.inventory_items, public.sales, public.sale_items
  from anon, authenticated;

-- ───────────────────────────────────────────── image storage
-- Public bucket: product photos are shown in the app by URL. Uploads go through the server only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stock-images', 'stock-images', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
