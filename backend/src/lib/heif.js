/* ==========================================================================
   HEIC / HEIF and AVIF photos (owner, 2026-10-25).

   iPhones and many newer Android phones save their camera photos as HEIC (or
   HEIF); some apps save AVIF. Browsers and most print software can't open
   HEIC. The owner's rule is that a customer's original is kept exactly as it
   was uploaded, so for these photos FrameX keeps the original AND makes one
   full-quality JPEG copy of it (same pixels, nothing enhanced or resized):
   the copy is what is shown and printed; the original can still be downloaded.

     detectHeif(head)              -> { format: "heic" | "avif", width, height } | null   (from the file's first bytes)
     toJpeg(filePath, format)      -> { jpeg: Buffer, width, height }
     toView(filePath, format, opts) -> { webp: Buffer, width, height }  a copy to SHOW (review photos: 1600 px inside;
                                    promotion pictures: { edge: 2400, fit: "width", quality: 86 }), any format
   HEIC is decoded with libheif (libheif-js, WebAssembly), AVIF by sharp; sharp
   writes the JPEG (quality 92, no colour subsampling). One photo is converted
   at a time: a 24-megapixel photo needs about 100 MB of memory while it is open.
   ========================================================================== */
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let libheif = null;
let sharp = null;
const heifLib = () => (libheif ||= require("libheif-js/wasm-bundle"));
const sharpLib = () => (sharp ||= require("sharp"));

/** Larger than this is refused before anything is decoded (about 60 megapixels: a 48 MP phone photo fits). */
export const MAX_PIXELS = 60_000_000;
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "miaf"]);
const AVIF_BRANDS = new Set(["avif", "avis"]);

/**
 * The first bytes of a file (a few hundred kilobytes) -> what it is, or null.
 * The size is the largest "ispe" (image size) the header names: the full picture (the others are thumbnails or tiles).
 */
export function detectHeif(head) {
  if (head.length < 16 || head.toString("latin1", 4, 8) !== "ftyp") return null;
  const boxEnd = Math.min(head.readUInt32BE(0), head.length);
  const brands = [head.toString("latin1", 8, 12)];
  for (let at = 16; at + 4 <= boxEnd; at += 4) brands.push(head.toString("latin1", at, at + 4));
  const format = brands.some((b) => AVIF_BRANDS.has(b)) ? "avif" : brands.some((b) => HEIC_BRANDS.has(b)) ? "heic" : null;
  if (!format) return null;
  let width = 0;
  let height = 0;
  for (let at = head.indexOf("ispe"); at >= 4 && at + 16 <= head.length; at = head.indexOf("ispe", at + 4)) {
    const w = head.readUInt32BE(at + 8);
    const h = head.readUInt32BE(at + 12);
    if (w * h > width * height) [width, height] = [w, h];
  }
  return width > 0 && height > 0 ? { format, width, height } : null;
}

let queue = Promise.resolve();
/** The full-quality JPEG copy (one conversion at a time). */
export function toJpeg(filePath, format) {
  const run = queue.then(() => convert(filePath, format));
  queue = run.catch(() => {});
  return run;
}

const JPEG = { quality: 92, chromaSubsampling: "4:4:4" };

/** The longest side of a medium copy: sharp on a phone and a laptop, a fraction of a camera photo's size. */
export const VIEW_EDGE = 1600;
/** A WebP copy to show, the right way up (one conversion at a time, like toJpeg). The original is not touched.
    fit "inside": the longest side at most `edge`; "width": the width at most `edge`. Never made bigger. */
export function toView(filePath, format, { edge = VIEW_EDGE, fit = "inside", quality = 80 } = {}) {
  const run = queue.then(async () => {
    const source = format === "heic" ? (await convert(filePath, format)).jpeg : await fs.promises.readFile(filePath);
    const { data, info } = await sharpLib()(source, { limitInputPixels: MAX_PIXELS })
      .rotate()
      .resize(fit === "width" ? { width: edge, withoutEnlargement: true } : { width: edge, height: edge, fit: "inside", withoutEnlargement: true })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });
    return { webp: data, width: info.width, height: info.height };
  });
  queue = run.catch(() => {});
  return run;
}

async function convert(filePath, format) {
  const bytes = await fs.promises.readFile(filePath);
  if (format === "avif") {
    const { data, info } = await sharpLib()(bytes, { limitInputPixels: MAX_PIXELS }).rotate().jpeg(JPEG).toBuffer({ resolveWithObject: true });
    return { jpeg: data, width: info.width, height: info.height };
  }
  const images = new (heifLib().HeifDecoder)().decode(bytes);
  if (!images || !images.length) throw new Error("no picture in the HEIC file");
  // The first top-level picture is the photo itself (thumbnails and depth maps hang under it)
  const image = images[0];
  try {
    const width = image.get_width();
    const height = image.get_height();
    if (!(width > 0 && height > 0) || width * height > MAX_PIXELS) throw new Error(`picture too large (${width} x ${height})`);
    // display() applies the photo's own rotation / mirroring, so the copy stands the way the phone showed it
    const rgba = await new Promise((resolve, reject) =>
      image.display({ data: new Uint8ClampedArray(width * height * 4), width, height }, (out) => (out ? resolve(out.data) : reject(new Error("the HEIC picture couldn't be decoded"))))
    );
    const jpeg = await sharpLib()(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), { raw: { width, height, channels: 4 } }).jpeg(JPEG).toBuffer();
    return { jpeg, width, height };
  } finally {
    for (const i of images) if (i && typeof i.free === "function") i.free();
  }
}
