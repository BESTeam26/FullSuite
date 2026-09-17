/**
 * Making an image smaller before it is stored.
 *
 * Dee, 2026-09-17: "All images should be clear but will be automatically be
 * available on smaller on bytes to save storage capacity. but still good
 * quality."
 *
 * A phone screenshot is commonly 3–8MB and is displayed in a column about
 * 600px wide. Storing the original costs BES the whole file, every time,
 * forever — conversations are kept for seven years.
 *
 * ── WHAT IS NEVER TOUCHED ─────────────────────────────────────────────────
 *
 * A GIF. Drawing one to a canvas keeps a single frame, which is exactly the
 * bug Dee hit when a pasted GIF arrived as a still. Animation cannot survive
 * this and must not be attempted on it.
 *
 * An SVG, because it is text and already small, and rasterising it throws away
 * the thing that makes it an SVG.
 *
 * Anything already small enough. Re-encoding a 40KB image to save 3KB costs
 * quality for nothing.
 *
 * ── AND WHAT QUALITY MEANS HERE ───────────────────────────────────────────
 *
 * Long edge capped at 2000px — above a retina display's worth for the width
 * these are read at — and WebP at 0.85, which is visually indistinguishable
 * for screenshots and photographs and is a fraction of the bytes.
 *
 * If the result is not actually smaller, the ORIGINAL is kept. A re-encode
 * that grows the file has done nothing but lose information.
 */

/** Long edge, in pixels. Above a retina column's worth. */
const MAX_EDGE = 2000;
/** Below this, the saving is not worth the loss. */
const FLOOR_BYTES = 200 * 1024;
const QUALITY = 0.85;

/** Animation cannot survive a canvas, and a vector should not be rasterised. */
const untouchable = (type: string, name: string): boolean =>
  type === "image/gif" || /\.gif$/i.test(name)
  || type === "image/svg+xml" || /\.svg$/i.test(name);

const isRaster = (type: string): boolean =>
  type.startsWith("image/") && !untouchable(type, "");

/** `photo.png` → `photo.webp`, keeping whatever the person called it. */
const rename = (name: string): string => name.replace(/\.[^./\\]+$/, "") + ".webp";

/**
 * Returns a smaller version, or the original when shrinking would not help.
 *
 * Never throws: a file that cannot be decoded is a file to upload as it is,
 * not an error to show somebody who only wanted to send a picture.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (!isRaster(file.type) || untouchable(file.type, file.name)) return file;
  if (file.size <= FLOOR_BYTES) return file;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close?.(); return file; }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", QUALITY));
    /* No blob, or the browser ignored the type and gave back PNG — either way
       there is nothing to gain. */
    if (!blob || blob.type !== "image/webp") return file;
    /* Bigger than what we started with. A re-encode that grows the file has
       lost information and saved nothing. */
    if (blob.size >= file.size) return file;

    return new File([blob], rename(file.name), { type: "image/webp" });
  } catch {
    /* Undecodable, out of memory, a tainted canvas — send the original. */
    return file;
  }
}

/** How much smaller, for the line that tells somebody what happened. */
export const savedPercent = (before: number, after: number): number =>
  before > 0 && after < before ? Math.round(((before - after) / before) * 100) : 0;
