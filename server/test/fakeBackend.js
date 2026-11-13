import { randomUUID } from "node:crypto";
import { ConflictError, SaleError } from "../src/errors.js";

/** In-memory stand-in for the Supabase data layer, with the same rules as the SQL functions.
 *  Used by the tests and by the browser walkthrough; never by the real server. */
export function createFakeBackend() {
  const profiles = new Map();
  const items = [];
  const sales = [];
  const images = new Map(); // path -> { buffer, contentType }
  const users = new Map(); // token -> user

  const same = (a, b) => a.toLowerCase() === b.toLowerCase();
  const find = (owner, id) => items.find((i) => i.ownerId === owner && i.id === id);
  const copy = (i) => ({ id: i.id, name: i.name, size: i.size, price: i.price, quantity: i.quantity, imagePath: i.imagePath, createdAt: i.createdAt });

  const repo = {
    imageUrl: (p) => (p ? `/fake-storage/${p}` : null),
    async getProfile(id) {
      if (!profiles.has(id)) profiles.set(id, { businessName: "", telephone: "" });
      return { ...profiles.get(id) };
    },
    async updateProfile(id, patch) {
      const p = await repo.getProfile(id);
      Object.assign(p, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
      profiles.set(id, p);
      return { ...p };
    },
    async listItems(owner) {
      return items.filter((i) => i.ownerId === owner).sort((a, b) => a.name.localeCompare(b.name)).map(copy);
    },
    async upsertItem(owner, { name, size, price, quantity, imagePath }) {
      const hit = items.find((i) => i.ownerId === owner && same(i.name, name) && same(i.size, size));
      if (hit) {
        const previousImagePath = imagePath ? hit.imagePath : null;
        Object.assign(hit, { quantity: hit.quantity + quantity, price, imagePath: imagePath ?? hit.imagePath });
        return { item: copy(hit), merged: true, previousImagePath };
      }
      const item = { id: randomUUID(), ownerId: owner, name, size, price, quantity, imagePath: imagePath ?? null, createdAt: new Date().toISOString() };
      items.push(item);
      return { item: copy(item), merged: false, previousImagePath: null };
    },
    async updateItem(owner, id, patch) {
      const it = find(owner, id);
      if (!it) return null;
      const name = patch.name ?? it.name, size = patch.size ?? it.size;
      if (items.some((o) => o !== it && o.ownerId === owner && same(o.name, name) && same(o.size, size))) {
        throw new ConflictError("You already have an item with this name and size.");
      }
      const old = it.imagePath;
      for (const k of ["name", "size", "price", "quantity", "imagePath"]) if (patch[k] !== undefined) it[k] = patch[k];
      return { item: copy(it), previousImagePath: patch.imagePath !== undefined && old && old !== it.imagePath ? old : null };
    },
    async deleteItem(owner, id) {
      const it = find(owner, id);
      if (!it) return null;
      items.splice(items.indexOf(it), 1);
      return { imagePath: it.imagePath };
    },
    async listSales(owner, limit) {
      return sales.filter((s) => s.ownerId === owner).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map(({ ownerId, ...s }) => s);
    },
    async createSale(owner, { customerName, lines }) {
      const wanted = new Map();
      for (const l of lines) wanted.set(l.itemId, (wanted.get(l.itemId) ?? 0) + l.quantity);
      for (const [id, qty] of wanted) {
        const it = find(owner, id);
        if (!it) throw new SaleError("An item in your cart no longer exists. Refresh the page and try again.");
        if (qty > it.quantity) throw new SaleError(`Only ${it.quantity} of ${it.size ? `${it.name} (${it.size})` : it.name} left in stock.`);
      }
      const sale = { id: randomUUID(), ownerId: owner, number: sales.filter((s) => s.ownerId === owner).length + 1, customerName, total: 0, createdAt: new Date().toISOString(), items: [] };
      for (const [id, qty] of wanted) {
        const it = find(owner, id);
        const lineTotal = Math.round(it.price * qty * 100) / 100;
        sale.items.push({ id: randomUUID(), name: it.name, size: it.size, unitPrice: it.price, quantity: qty, lineTotal });
        it.quantity -= qty;
        sale.total += lineTotal;
      }
      sales.push(sale);
      const { ownerId, ...out } = sale;
      return out;
    },
    async uploadImage(path, buffer, contentType) { images.set(path, { buffer, contentType }); },
    async removeImage(path) { images.delete(path); },
  };

  return {
    repo,
    verifyToken: async (token) => users.get(token) ?? null,
    /** Create a user and return the bearer token for them. */
    addUser(id = randomUUID(), email = `${id.slice(0, 6)}@example.com`) {
      const token = `token-${id}`;
      users.set(token, { id, email });
      return { id, email, token };
    },
    images, items, sales, profiles,
  };
}
