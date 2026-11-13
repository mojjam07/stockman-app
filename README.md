# StockMan Inventory

Stock with photos, fast sales and printed receipts for small shops.

**Vite + React** front end · **Node + Express** API · **Supabase** (Postgres, Auth, Storage)

```
client/      React app (Vite). Built into client/dist and served by Express in production.
server/      Express API: validates input, checks the login, talks to Supabase with the service key.
supabase/    SQL migration: tables, security rules, checkout and add-item functions, image bucket.
api/         Vercel serverless API entry point.
vercel.json  Vercel deployment config.
```

How the pieces fit: the browser logs in with **Supabase Auth** and sends its token to the **Express API**.
Express verifies the token and does every read and write for that owner only. Product photos are shrunk
in the browser (about 50 KB instead of 5 MB), uploaded through Express, and stored in a Supabase **Storage** bucket.
Checkout and "add item" run as single Postgres functions, so two tills can never oversell the same unit.

## 1. Set up Supabase (10 minutes)

1. Create a project at supabase.com. Pick a region near your shops and save the database password.
2. **SQL Editor > New query**, paste all of `supabase/migrations/20261021000000_init.sql`, **Run**.
   This creates the tables, security rules, the `stock-images` storage bucket and the checkout functions. It is safe to run twice.
3. **Authentication > Providers > Email**: for the smoothest start, turn **off** "Confirm email" so new shops can log in immediately.
   (If you leave it on, sign-up shows "check your email" and they confirm first. Both work.)
4. **Project Settings > API**: copy the **Project URL**, the **anon / publishable key**, and the **service_role / secret key**.

## 2. Run it locally

Needs Node 20+.

```bash
npm install
cp .env.example .env        # then paste the three values from step 1
npm run dev                 # API on :4000, app on http://localhost:5173
```

Open http://localhost:5173, create a shop account, add an item with a photo, and make a sale.
`npm test` runs the API tests (no Supabase needed).

To run the production build locally: `npm run build && npm start`, then open http://localhost:4000.

## 3. Deploy to Vercel

1. Push this repository to GitHub.
2. In Vercel, click **Add New Project** and import the repo.
3. Set the project root to the repository root.
4. In **Framework Preset**, choose **Other** (this is a Vite frontend plus a serverless API, not a standard Next.js app).
5. Set the build command to:
   ```bash
   npm run build
   ```
6. Set the output directory to:
   ```bash
   client/dist
   ```
7. Add these environment variables in Vercel:
   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-or-secret-key
   ```
   You can also set `SUPABASE_URL` explicitly if you prefer; otherwise the app falls back to `VITE_SUPABASE_URL`.
8. Deploy.
9. After the first deployment, copy your Vercel production URL and add it in Supabase:
   **Authentication > URL Configuration > Site URL**.
   This is required for email redirects and auth callbacks.

If you add or change a `VITE_` value later, trigger a new deployment: those values are baked in at build time.

## Security notes

- The **service_role key is a master key.** It lives only in the server's environment. Never put it in a `VITE_` variable, the client, or Git.
- Every API route requires a valid login and filters by the signed-in owner. The database also enforces this: row-level
  security lets a browser read only its own rows and blocks all browser writes.
- Uploaded files are checked by their real content (not their name), limited to JPG/PNG/WebP and 3 MB, and stored in the owner's own folder.
- Photos are in a **public** bucket: anyone with an exact photo URL can view it. They are unguessable, but don't photograph anything private.
- Sales are records: they can be created and read, never edited or deleted through the app.

## Good to know

- **Free tiers:** Vercel and Supabase free plans are enough to test the app, but production shops should consider paid plans for reliability.
- **Backups:** download periodic exports (`pg_dump`) or use a paid Supabase plan with backups.
- **Not included yet:** password-reset emails, multiple staff logins per shop, and importing data from the older Django EasyBook app.

# stockman-app
