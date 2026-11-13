import path from "node:path";
import express from "express";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { z } from "zod";
import { ConflictError, SaleError } from "./errors.js";
import { MAX_IMAGE_BYTES, newImagePath, sniffImage } from "./images.js";

const MAX_SALES_RETURNED = 2000;
const pad = (n) => String(n).padStart(5, "0");

/* ------------------------------------------------------------------ validation */
const number = (message) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? NaN : Number(v)), z.number({ invalid_type_error: message, required_error: message }));

const itemFields = {
  name: z.string({ required_error: "Enter the item’s name." }).trim().min(1, "Enter the item’s name.").max(100, "Keep the name under 100 characters."),
  size: z.string().trim().max(50, "Keep the size under 50 characters.").default(""),
  price: number("Enter a price greater than zero.").pipe(z.number().gt(0, "Enter a price greater than zero.").max(1e9, "That price is too large.")).transform((n) => Math.round(n * 100) / 100),
  quantity: number("Enter a whole number, 0 or more.").pipe(z.number().int("Enter a whole number, 0 or more.").min(0, "Enter a whole number, 0 or more.").max(10_000_000, "That quantity is too large.")),
};
const newItemSchema = z.object(itemFields);
const editItemSchema = z.object({ name: itemFields.name, size: z.string().trim().max(50, "Keep the size under 50 characters."), price: itemFields.price, quantity: itemFields.quantity }).partial();
const saleSchema = z.object({
  customerName: z.string().trim().max(100, "Keep the customer name under 100 characters.").default(""),
  items: z
    .array(z.object({ itemId: z.string().uuid(), quantity: z.number().int().min(1).max(100_000) }))
    .min(1, "Add at least one item to the sale.")
    .max(200),
});
const profileSchema = z.object({ businessName: z.string().trim().max(120).optional(), telephone: z.string().trim().max(20).optional() });

class BadRequest extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.fields = fields;
  }
}
function parse(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields = {};
  for (const issue of result.error.issues) fields[issue.path[0] ?? "form"] ??= issue.message;
  throw new BadRequest(Object.values(fields)[0], fields);
}

/* ---------------------------------------------------------------------- app */
export function createApp({ repo, verifyToken, clientDir = null, supabaseOrigin = "" }) {
  const app = express();
  app.set("trust proxy", 1); // Render sits behind a proxy
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:", ...(supabaseOrigin ? [supabaseOrigin] : [])],
          connectSrc: ["'self'", ...(supabaseOrigin ? [supabaseOrigin] : [])],
          fontSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: null,
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(compression());
  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 10 } });
  const api = express.Router();
  api.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests. Slow down and try again." } }));
  api.use(express.json({ limit: "100kb" }));

  api.use(async (req, res, next) => {
    const token = /^Bearer (.+)$/i.exec(req.get("authorization") || "")?.[1];
    const user = token ? await verifyToken(token) : null;
    if (!user) return res.status(401).json({ error: "Please log in." });
    req.user = user;
    next();
  });

  const withUrl = (item) => {
    const { imagePath, ...rest } = item;
    return { ...rest, imageUrl: repo.imageUrl(imagePath) };
  };
  const saleOut = (s) => ({ ...s, receiptNumber: pad(s.number) });
  const dropImage = (p) => (p ? repo.removeImage(p).catch((e) => console.warn("Could not delete image", p, e.message)) : undefined);

  /** Validate and store an uploaded photo; returns its storage path (or null if none was sent). */
  async function storePhoto(req) {
    if (!req.file) return null;
    const kind = sniffImage(req.file.buffer);
    if (!kind) throw new BadRequest("That file isn’t a photo. Use a JPG, PNG or WebP image.", { image: "Use a JPG, PNG or WebP image." });
    const imagePath = newImagePath(req.user.id, kind.ext);
    await repo.uploadImage(imagePath, req.file.buffer, kind.type);
    return imagePath;
  }

  /* profile */
  api.get("/me", async (req, res) => {
    res.json({ id: req.user.id, email: req.user.email, ...(await repo.getProfile(req.user.id)) });
  });
  api.patch("/me", async (req, res) => {
    const patch = parse(profileSchema, req.body);
    res.json({ id: req.user.id, email: req.user.email, ...(await repo.updateProfile(req.user.id, patch)) });
  });

  /* inventory */
  api.get("/items", async (req, res) => res.json((await repo.listItems(req.user.id)).map(withUrl)));

  api.post("/items", upload.single("image"), async (req, res) => {
    const fields = parse(newItemSchema, req.body);
    const imagePath = await storePhoto(req);
    try {
      const { item, merged, previousImagePath } = await repo.upsertItem(req.user.id, { ...fields, imagePath });
      await dropImage(previousImagePath);
      res.status(merged ? 200 : 201).json({ item: withUrl(item), merged });
    } catch (err) {
      await dropImage(imagePath); // don't leave an orphaned photo behind
      throw err;
    }
  });

  api.patch("/items/:id", upload.single("image"), async (req, res) => {
    const fields = parse(editItemSchema, req.body);
    const imagePath = await storePhoto(req);
    const patch = { ...fields };
    if (imagePath) patch.imagePath = imagePath;
    else if (req.body.removeImage === "true") patch.imagePath = null;
    try {
      const result = await repo.updateItem(req.user.id, req.params.id, patch);
      if (!result) {
        await dropImage(imagePath);
        return res.status(404).json({ error: "That item no longer exists." });
      }
      await dropImage(result.previousImagePath);
      res.json({ item: withUrl(result.item) });
    } catch (err) {
      await dropImage(imagePath);
      throw err;
    }
  });

  api.delete("/items/:id", async (req, res) => {
    const result = await repo.deleteItem(req.user.id, req.params.id);
    if (!result) return res.status(404).json({ error: "That item no longer exists." });
    await dropImage(result.imagePath);
    res.status(204).end();
  });

  /* sales (records: created and read, never edited or deleted here) */
  api.get("/sales", async (req, res) => res.json((await repo.listSales(req.user.id, MAX_SALES_RETURNED)).map(saleOut)));

  api.post("/sales", async (req, res) => {
    const { customerName, items } = parse(saleSchema, req.body);
    const sale = await repo.createSale(req.user.id, { customerName, lines: items });
    res.status(201).json(saleOut(sale));
  });

  api.use((_req, res) => res.status(404).json({ error: "Not found." }));
  app.use("/api", api);

  /* the built React app */
  if (clientDir) {
    app.use("/assets", express.static(path.join(clientDir, "assets"), { immutable: true, maxAge: "1y" }));
    app.use(express.static(clientDir, { index: false, maxAge: "1h" }));
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      res.set("Cache-Control", "no-cache").sendFile(path.join(clientDir, "index.html"));
    });
  }

  /* errors */
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof BadRequest) return res.status(400).json({ error: err.message, fields: err.fields });
    if (err instanceof SaleError) return res.status(400).json({ error: err.message });
    if (err instanceof ConflictError) return res.status(409).json({ error: err.message, fields: { name: err.message } });
    if (err instanceof multer.MulterError) {
      const tooBig = err.code === "LIMIT_FILE_SIZE";
      return res.status(tooBig ? 413 : 400).json({ error: tooBig ? "That photo is too large (3 MB maximum)." : "Couldn’t read the upload.", fields: { image: "Choose a smaller photo." } });
    }
    if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid request." });
    console.error(err);
    res.status(500).json({ error: "Something went wrong on our side. Try again in a moment." });
  });

  return app;
}
