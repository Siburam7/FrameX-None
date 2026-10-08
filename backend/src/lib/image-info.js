/* ==========================================================================
   What an uploaded file really is, read from its own bytes.

   A file name or a Content-Type header proves nothing, so the server opens the
   file and reads its format and pixel dimensions from the header:
     JPEG  the SOF segment (and the EXIF orientation, when there is one)
     PNG   the IHDR chunk
     WebP  the VP8 / VP8L / VP8X chunk
   Only the header is read (a few kilobytes even for a 50 MB photo). The image
   is never decoded, resized or re-saved.

     await inspectImage(path) -> { format, mime, width, height, orientation } | null
   null = not one of the formats FrameX accepts.
   ========================================================================== */
import fs from "node:fs";

const MIME = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

async function readAt(handle, position, length) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  return bytesRead === length ? buffer : buffer.subarray(0, bytesRead);
}

/** EXIF orientation (1-8) from an APP1 segment's bytes, or null. */
function exifOrientation(seg) {
  if (seg.length < 14 || seg.toString("latin1", 0, 6) !== "Exif\0\0") return null;
  const tiff = seg.subarray(6);
  const order = tiff.toString("latin1", 0, 2);
  if (order !== "II" && order !== "MM") return null;
  const le = order === "II";
  const u16 = (o) => (o + 2 <= tiff.length ? (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o)) : null);
  const u32 = (o) => (o + 4 <= tiff.length ? (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o)) : null);
  if (u16(2) !== 42) return null;
  const ifd = u32(4);
  const count = ifd === null ? null : u16(ifd);
  if (count === null) return null;
  for (let i = 0; i < Math.min(count, 200); i++) {
    const entry = ifd + 2 + i * 12;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

async function jpeg(handle, size) {
  let position = 2;
  let orientation = null;
  // Walk the segments; each says how long it is, so a large EXIF or colour profile is simply stepped over.
  for (let guard = 0; guard < 4000 && position + 4 <= size; guard++) {
    const head = await readAt(handle, position, 4);
    if (head.length < 4 || head[0] !== 0xff) return null;
    const marker = head[1];
    if (marker === 0xff) {
      position += 1; // padding byte
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      position += 2; // markers without a length
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // image data reached without a frame header
    const length = head.readUInt16BE(2);
    if (length < 2) return null;
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      const body = await readAt(handle, position + 4, 5);
      if (body.length < 5) return null;
      return { format: "jpeg", height: body.readUInt16BE(1), width: body.readUInt16BE(3), orientation };
    }
    if (marker === 0xe1 && orientation === null) orientation = exifOrientation(await readAt(handle, position + 4, Math.min(length - 2, 65533)));
    position += 2 + length;
  }
  return null;
}

async function png(handle) {
  const head = await readAt(handle, 8, 25);
  if (head.length < 25 || head.toString("latin1", 4, 8) !== "IHDR" || head.readUInt32BE(0) !== 13) return null;
  return { format: "png", width: head.readUInt32BE(8), height: head.readUInt32BE(12), orientation: null };
}

async function webp(handle) {
  const head = await readAt(handle, 12, 18);
  if (head.length < 18) return null;
  const chunk = head.toString("latin1", 0, 4);
  const data = head.subarray(8);
  if (chunk === "VP8 ") {
    if (data[3] !== 0x9d || data[4] !== 0x01 || data[5] !== 0x2a) return null;
    return { format: "webp", width: data.readUInt16LE(6) & 0x3fff, height: data.readUInt16LE(8) & 0x3fff, orientation: null };
  }
  if (chunk === "VP8L") {
    if (data[0] !== 0x2f) return null;
    const bits = data.readUInt32LE(1);
    return { format: "webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, orientation: null };
  }
  if (chunk === "VP8X") return { format: "webp", width: data.readUIntLE(4, 3) + 1, height: data.readUIntLE(7, 3) + 1, orientation: null };
  return null;
}

/** Read a file's real format and pixel size. Returns null for anything that isn't a JPEG, PNG or WebP image. */
export async function inspectImage(filePath) {
  let handle;
  try {
    handle = await fs.promises.open(filePath, "r");
    const { size } = await handle.stat();
    const start = await readAt(handle, 0, 12);
    if (start.length < 12) return null;
    let found = null;
    if (start[0] === 0xff && start[1] === 0xd8 && start[2] === 0xff) found = await jpeg(handle, size);
    else if (start.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) found = await png(handle);
    else if (start.toString("latin1", 0, 4) === "RIFF" && start.toString("latin1", 8, 12) === "WEBP") found = await webp(handle);
    if (!found || !(found.width > 0) || !(found.height > 0)) return null;
    return { ...found, mime: MIME[found.format] };
  } catch {
    return null;
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

export const IMAGE_MIME = MIME;
