import { createClient } from "@supabase/supabase-js";
import { ConflictError, SaleError } from "./errors.js";

const BUCKET = "stock-images";

const toItem = (r) => ({
  id: r.id,
  name: r.name,
  size: r.size,
  price: Number(r.price),
  quantity: r.quantity,
  imagePath: r.image_path ?? null,
  createdAt: r.created_at,
});

const toSale = (r) => ({
  id: r.id,
  number: r.number,
  customerName: r.customer_name,
  total: Number(r.total),
  createdAt: r.created_at,
  items: (r.sale_items ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    size: l.size,
    unitPrice: Number(l.unit_price),
    quantity: l.quantity,
    lineTotal: Number(l.line_total),
  })),
});

const SALE_COLUMNS = "id,number,customer_name,total,created_at,sale_items(id,name,size,unit_price,quantity,line_total)";

function check({ data, error }) {
  if (error) throw error;
  return data;
}

/** Real data layer: Postgres through PostgREST, photos in Supabase Storage. Uses the service role,
 *  so every query below is explicitly scoped to the signed-in owner. */
export function createSupabaseBackend({ url, serviceKey }) {
  const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const publicBase = `${url}/storage/v1/object/public/${BUCKET}/`;

  // Verifying a token is a network call; remember good ones for a short while.
  const tokens = new Map();
  async function verifyToken(token) {
    const hit = tokens.get(token);
    if (hit && hit.expires > Date.now()) return hit.user;
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data?.user) return null;
    const user = { id: data.user.id, email: data.user.email ?? "" };
    if (tokens.size > 500) tokens.clear();
    tokens.set(token, { user, expires: Date.now() + 30_000 });
    return user;
  }

  const repo = {
    imageUrl: (path) => (path ? publicBase + path : null),

    async getProfile(ownerId) {
      let row = check(await sb.from("profiles").select("business_name,telephone").eq("id", ownerId).maybeSingle());
      if (!row) {
        // Accounts created before the migration have no profile yet.
        row = check(await sb.from("profiles").upsert({ id: ownerId }, { onConflict: "id" }).select("business_name,telephone").single());
      }
      return { businessName: row.business_name, telephone: row.telephone };
    },

    async updateProfile(ownerId, { businessName, telephone }) {
      const patch = {};
      if (businessName !== undefined) patch.business_name = businessName;
      if (telephone !== undefined) patch.telephone = telephone;
      await repo.getProfile(ownerId);
      const row = check(await sb.from("profiles").update(patch).eq("id", ownerId).select("business_name,telephone").single());
      return { businessName: row.business_name, telephone: row.telephone };
    },

    async listItems(ownerId) {
      const rows = check(await sb.from("inventory_items").select("*").eq("owner_id", ownerId).order("name").order("size"));
      return rows.map(toItem);
    },

    async upsertItem(ownerId, { name, size, price, quantity, imagePath }) {
      const out = check(
        await sb.rpc("upsert_item", {
          p_owner: ownerId, p_name: name, p_size: size, p_price: price, p_quantity: quantity, p_image_path: imagePath ?? null,
        })
      );
      return { item: toItem(out.item), merged: out.merged, previousImagePath: out.previous_image_path ?? null };
    },

    async updateItem(ownerId, id, patch) {
      const current = check(await sb.from("inventory_items").select("image_path").eq("id", id).eq("owner_id", ownerId).maybeSingle());
      if (!current) return null;
      const dbPatch = { updated_at: new Date().toISOString() };
      for (const k of ["name", "size", "price", "quantity"]) if (patch[k] !== undefined) dbPatch[k] = patch[k];
      if (patch.imagePath !== undefined) dbPatch.image_path = patch.imagePath;
      const { data, error } = await sb.from("inventory_items").update(dbPatch).eq("id", id).eq("owner_id", ownerId).select().maybeSingle();
      if (error?.code === "23505") throw new ConflictError("You already have an item with this name and size.");
      if (error) throw error;
      if (!data) return null;
      const replaced = patch.imagePath !== undefined && current.image_path && current.image_path !== patch.imagePath;
      return { item: toItem(data), previousImagePath: replaced ? current.image_path : null };
    },

    async deleteItem(ownerId, id) {
      const current = check(await sb.from("inventory_items").select("image_path").eq("id", id).eq("owner_id", ownerId).maybeSingle());
      if (!current) return null;
      check(await sb.from("inventory_items").delete().eq("id", id).eq("owner_id", ownerId));
      return { imagePath: current.image_path ?? null };
    },

    async listSales(ownerId, limit) {
      const rows = check(
        await sb.from("sales").select(SALE_COLUMNS).eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(limit)
      );
      return rows.map(toSale);
    },

    async createSale(ownerId, { customerName, lines }) {
      const { data: saleId, error } = await sb.rpc("create_sale", {
        p_owner: ownerId,
        p_customer: customerName,
        p_items: lines.map((l) => ({ item_id: l.itemId, quantity: l.quantity })),
      });
      if (error?.code === "P0001") throw new SaleError(error.message);
      if (error) throw error;
      return toSale(check(await sb.from("sales").select(SALE_COLUMNS).eq("id", saleId).eq("owner_id", ownerId).single()));
    },

    async uploadImage(path, buffer, contentType) {
      const { error } = await sb.storage.from(BUCKET).upload(path, buffer, { contentType, cacheControl: "31536000", upsert: false });
      if (error) throw error;
    },

    async removeImage(path) {
      await sb.storage.from(BUCKET).remove([path]);
    },
  };

  return { repo, verifyToken };
}
