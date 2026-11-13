import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { createFakeBackend } from "./fakeBackend.js";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);

let server, base, fake, ada, bola;
before(async () => {
  fake = createFakeBackend();
  ada = fake.addUser("00000000-0000-4000-8000-00000000000a", "ada@example.com");
  bola = fake.addUser("00000000-0000-4000-8000-00000000000b", "bola@example.com");
  const app = createApp({ repo: fake.repo, verifyToken: fake.verifyToken });
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const call = (user, method, path, body) =>
  fetch(base + path, {
    method,
    headers: { ...(user ? { Authorization: `Bearer ${user.token}` } : {}), ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
const json = async (res) => ({ status: res.status, body: res.status === 204 ? null : await res.json() });

function itemForm(fields, file) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, String(v));
  if (file) f.set("image", new Blob([file.data], { type: file.type ?? "image/png" }), file.name ?? "photo.png");
  return f;
}
const addItem = async (user, fields, file) => json(await call(user, "POST", "/api/items", itemForm(fields, file)));

describe("auth", () => {
  test("every API route needs a valid token", async () => {
    for (const [m, p] of [["GET", "/api/items"], ["GET", "/api/sales"], ["GET", "/api/me"], ["POST", "/api/sales"], ["DELETE", "/api/items/x"]]) {
      assert.equal((await call(null, m, p)).status, 401, `${m} ${p}`);
    }
    const bad = await fetch(base + "/api/items", { headers: { Authorization: "Bearer nope" } });
    assert.equal(bad.status, 401);
  });
  test("health check is public", async () => assert.equal((await fetch(base + "/healthz")).status, 200));
  test("unknown API path is a JSON 404", async () => {
    const r = await json(await call(ada, "GET", "/api/nothing"));
    assert.equal(r.status, 404);
  });
});

describe("profile", () => {
  test("read and update shop details", async () => {
    const r = await json(await call(ada, "PATCH", "/api/me", { businessName: "Ada Stores", telephone: "0803 000 1111" }));
    assert.deepEqual([r.status, r.body.businessName, r.body.telephone, r.body.email], [200, "Ada Stores", "0803 000 1111", "ada@example.com"]);
    assert.equal((await json(await call(ada, "GET", "/api/me"))).body.businessName, "Ada Stores");
    assert.equal((await json(await call(bola, "GET", "/api/me"))).body.businessName, "");
  });
});

describe("inventory", () => {
  test("create without a photo, then list", async () => {
    const r = await addItem(ada, { name: "  Rice ", size: "50kg", price: "100.456", quantity: "10" });
    assert.equal(r.status, 201);
    assert.deepEqual([r.body.item.name, r.body.item.price, r.body.item.imageUrl, r.body.merged], ["Rice", 100.46, null, false]);
    const list = (await json(await call(ada, "GET", "/api/items"))).body;
    assert.equal(list.length, 1);
  });

  test("adding the same name and size merges stock and updates price", async () => {
    const r = await addItem(ada, { name: "rice", size: "50KG", price: "120", quantity: "5" });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.merged, r.body.item.quantity, r.body.item.price], [true, 15, 120]);
  });

  test("validation returns friendly per-field messages", async () => {
    const r = await addItem(ada, { name: " ", price: "-5", quantity: "1.5" });
    assert.equal(r.status, 400);
    assert.deepEqual(Object.keys(r.body.fields).sort(), ["name", "price", "quantity"]);
    const empty = await addItem(ada, { name: "X", price: "", quantity: "" });
    assert.equal(empty.status, 400);
  });

  test("owners never see or touch each other's items", async () => {
    const theirs = (await addItem(bola, { name: "Gold", price: "9999", quantity: "1" })).body.item;
    assert.ok(!(await json(await call(ada, "GET", "/api/items"))).body.some((i) => i.id === theirs.id));
    assert.equal((await call(ada, "PATCH", `/api/items/${theirs.id}`, { quantity: 0 })).status, 404);
    assert.equal((await call(ada, "DELETE", `/api/items/${theirs.id}`)).status, 404);
    assert.equal((await json(await call(bola, "GET", "/api/items"))).body.length, 1);
  });

  test("edit changes fields, and cannot collide with another item", async () => {
    const a = (await addItem(ada, { name: "Oil", size: "5L", price: "250", quantity: "3" })).body.item;
    const patched = await json(await call(ada, "PATCH", `/api/items/${a.id}`, new (class extends FormData {})()));
    assert.equal(patched.status, 200); // empty edit is a no-op
    const form = itemForm({ price: "300", quantity: "9" });
    const ok = await json(await call(ada, "PATCH", `/api/items/${a.id}`, form));
    assert.deepEqual([ok.body.item.price, ok.body.item.quantity, ok.body.item.name], [300, 9, "Oil"]);
    const clash = await json(await call(ada, "PATCH", `/api/items/${a.id}`, itemForm({ name: "Rice", size: "50kg" })));
    assert.equal(clash.status, 409);
  });
});

describe("photos", () => {
  test("a valid photo is stored under the owner's folder and exposed as a URL", async () => {
    const r = await addItem(ada, { name: "Shoe", size: "42", price: "6500", quantity: "4" }, { data: PNG });
    assert.equal(r.status, 201);
    assert.match(r.body.item.imageUrl, new RegExp(`^/fake-storage/${ada.id}/[0-9a-f-]{36}\\.png$`));
    const path = r.body.item.imageUrl.replace("/fake-storage/", "");
    assert.equal(fake.images.get(path).contentType, "image/png");
  });

  test("the file's real type wins over what the browser claims", async () => {
    const r = await addItem(ada, { name: "Hat", price: "1000", quantity: "1" }, { data: JPEG, type: "image/png", name: "x.png" });
    assert.match(r.body.item.imageUrl, /\.jpg$/);
  });

  test("non-images are rejected and nothing is stored or created", async () => {
    const before = fake.images.size;
    const r = await addItem(ada, { name: "Fake", price: "1", quantity: "1" }, { data: Buffer.from("<script>alert(1)</script> not an image at all"), type: "image/png", name: "evil.png" });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /isn’t a photo/);
    assert.equal(fake.images.size, before);
    assert.ok(!fake.items.some((i) => i.name === "Fake"));
  });

  test("oversized photos get a clear 413", async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]);
    const r = await addItem(ada, { name: "Big", price: "1", quantity: "1" }, { data: big });
    assert.equal(r.status, 413);
  });

  test("replacing a photo deletes the old file; removing clears it; deleting the item deletes it", async () => {
    const created = (await addItem(ada, { name: "Bag", price: "800", quantity: "2" }, { data: PNG })).body.item;
    const first = created.imageUrl.replace("/fake-storage/", "");
    const replaced = await json(await call(ada, "PATCH", `/api/items/${created.id}`, itemForm({}, { data: JPEG })));
    const second = replaced.body.item.imageUrl.replace("/fake-storage/", "");
    assert.notEqual(first, second);
    assert.ok(!fake.images.has(first) && fake.images.has(second));
    const removed = await json(await call(ada, "PATCH", `/api/items/${created.id}`, itemForm({ removeImage: "true" })));
    assert.equal(removed.body.item.imageUrl, null);
    assert.ok(!fake.images.has(second));
    const again = (await addItem(ada, { name: "Cap", price: "500", quantity: "2" }, { data: PNG })).body.item;
    const p = again.imageUrl.replace("/fake-storage/", "");
    assert.equal((await call(ada, "DELETE", `/api/items/${again.id}`)).status, 204);
    assert.ok(!fake.images.has(p));
  });

  test("merging into an existing item with a new photo swaps the file", async () => {
    const a = (await addItem(ada, { name: "Belt", price: "900", quantity: "1" }, { data: PNG })).body.item;
    const old = a.imageUrl.replace("/fake-storage/", "");
    const b = await addItem(ada, { name: "belt", price: "950", quantity: "2" }, { data: JPEG });
    assert.equal(b.status, 200);
    assert.ok(!fake.images.has(old));
  });
});

describe("sales", () => {
  let rice, oil;
  before(async () => {
    rice = (await addItem(bola, { name: "Rice", size: "50kg", price: "100", quantity: "10" })).body.item;
    oil = (await addItem(bola, { name: "Oil", size: "5L", price: "250.5", quantity: "3" })).body.item;
  });
  const sell = async (user, items, customerName = "Tunde") => json(await call(user, "POST", "/api/sales", { customerName, items }));

  test("a sale totals correctly, reduces stock and gets receipt #00001", async () => {
    const r = await sell(bola, [{ itemId: rice.id, quantity: 2 }, { itemId: oil.id, quantity: 3 }]);
    assert.equal(r.status, 201);
    assert.deepEqual([r.body.total, r.body.receiptNumber, r.body.customerName, r.body.items.length], [951.5, "00001", "Tunde", 2]);
    const items = (await json(await call(bola, "GET", "/api/items"))).body;
    assert.deepEqual(items.filter((i) => ["Oil", "Rice"].includes(i.name)).map((i) => [i.name, i.quantity]).sort(), [["Oil", 0], ["Rice", 8]]);
  });

  test("overselling is refused with a readable message and changes nothing", async () => {
    const r = await sell(bola, [{ itemId: rice.id, quantity: 2 }, { itemId: oil.id, quantity: 1 }]);
    assert.equal(r.status, 400);
    assert.match(r.body.error, /Only 0 of Oil \(5L\) left in stock/);
    assert.equal((await json(await call(bola, "GET", "/api/items"))).body.find((i) => i.name === "Rice").quantity, 8);
  });

  test("repeated lines are combined before the stock check", async () => {
    const r = await sell(bola, [{ itemId: rice.id, quantity: 5 }, { itemId: rice.id, quantity: 5 }]);
    assert.equal(r.status, 400);
  });

  test("you cannot sell someone else's item", async () => {
    const r = await sell(ada, [{ itemId: rice.id, quantity: 1 }]);
    assert.equal(r.status, 400);
  });

  test("bad payloads are rejected", async () => {
    assert.equal((await sell(bola, [])).status, 400);
    assert.equal((await sell(bola, [{ itemId: "not-a-uuid", quantity: 1 }])).status, 400);
    assert.equal((await sell(bola, [{ itemId: rice.id, quantity: 0 }])).status, 400);
  });

  test("sales list is newest first and private; sales cannot be edited or deleted", async () => {
    await sell(bola, [{ itemId: rice.id, quantity: 1 }], "second");
    const mine = (await json(await call(bola, "GET", "/api/sales"))).body;
    assert.deepEqual(mine.map((s) => s.customerName), ["second", "Tunde"]);
    assert.equal((await json(await call(ada, "GET", "/api/sales"))).body.length, 0);
    assert.equal((await call(bola, "DELETE", `/api/sales/${mine[0].id}`)).status, 404);
    assert.equal((await call(bola, "PATCH", `/api/sales/${mine[0].id}`, { total: 1 })).status, 404);
  });
});
