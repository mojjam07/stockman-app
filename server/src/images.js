import { randomUUID } from "node:crypto";

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/** Identify an image by its first bytes. We never trust the filename or the declared type. */
export function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { type: "image/png", ext: "png" };
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return { type: "image/webp", ext: "webp" };
  return null;
}

/** Every owner's photos live under their own folder, with an unguessable name. */
export const newImagePath = (ownerId, ext) => `${ownerId}/${randomUUID()}.${ext}`;
