/** Shrink a photo in the browser before upload: phone cameras produce 3-8 MB files, which are slow
 *  on mobile data and unnecessary for a 56px thumbnail. Result is ~50-150 KB. */
export async function compressImage(file, maxSide = 900, quality = 0.82) {
  if (!file.type.startsWith("image/")) throw new Error("Choose a photo (JPG, PNG or WebP).");

  let source;
  try {
    source = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    source = await new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That photo couldn’t be read. Try another one.")); };
      img.src = url;
    });
  }
  const w = source.width, h = source.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // transparent PNGs become white instead of black when saved as JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();

  const toBlob = (type) => new Promise((r) => canvas.toBlob(r, type, quality));
  let blob = await toBlob("image/webp");
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg"); // older Safari
  if (!blob) throw new Error("That photo couldn’t be prepared. Try another one.");
  return blob;
}
