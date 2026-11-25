// make.fun entry: Convince the AI Judge to Visit Your House — A Letter in One Image
// Copies the invitation image (letter.png, shipped in this repo) to the
// grader's output directory as entry.png, validating the gate rules:
//   - whole PNG or JPEG
//   - at most 1 MiB (1,048,576 bytes)
//   - at most 1024 x 1024 pixels
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SOURCE = "letter.png";
const OUTPUT_NAME = "entry.png";
const MAX_BYTES = 1_048_576;
const MAX_DIM = 1024;

// Minimal PNG/JPEG header parsing (no dependencies).
function pngDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 33) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  if (buf.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function jpegDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let off = 2;
  while (off + 9 < buf.length) {
    if (buf[off] !== 0xff) return null;
    const marker = buf[off + 1];
    if (marker === 0xd9 || marker === 0xda) return null; // EOI / SOS: no SOF found
    const len = buf.readUInt16BE(off + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
    }
    off += 2 + len;
  }
  return null;
}

function main(): void {
  // An empty env var counts as unset, so a bare export cannot break the run.
  const outDir = (process.env.MAKEFUN_OUTPUT_DIR || "").trim() || "/output";
  const baseDir = import.meta.dirname ?? process.cwd();
  const src = join(baseDir, SOURCE);
  if (!existsSync(src)) {
    throw new Error(`source image missing: ${src} (expected letter.png shipped in this repo)`);
  }

  const buf = readFileSync(src);
  const size = statSync(src).size;
  if (size === 0) throw new Error("source image is empty");
  if (size > MAX_BYTES) {
    throw new Error(`image is ${size} bytes, over the 1 MiB gate cap (${MAX_BYTES})`);
  }

  const dims = pngDimensions(buf) ?? jpegDimensions(buf);
  if (!dims) throw new Error("source image is not a whole PNG or JPEG");
  if (dims.width > MAX_DIM || dims.height > MAX_DIM) {
    throw new Error(`image is ${dims.width}x${dims.height}, over the 1024x1024 gate cap`);
  }
  if (dims.width < 1 || dims.height < 1) throw new Error("image has invalid dimensions");

  mkdirSync(outDir, { recursive: true });
  const dest = join(outDir, OUTPUT_NAME);
  copyFileSync(src, dest);

  // Round-trip check: re-read what was written and re-validate it, so a
  // truncated or corrupted copy is caught here instead of at the gate.
  const written = readFileSync(dest);
  if (written.length !== size) {
    throw new Error(`wrote ${written.length} bytes, expected ${size}`);
  }
  if (!written.equals(buf)) throw new Error("written file differs from source image");
  const outDims = pngDimensions(written) ?? jpegDimensions(written);
  if (!outDims || outDims.width !== dims.width || outDims.height !== dims.height) {
    throw new Error("written file failed re-validation as a whole PNG/JPEG");
  }
  const format = pngDimensions(written) ? "PNG" : "JPEG";
  console.log(`wrote ${dest} (${format}, ${dims.width}x${dims.height}, ${size} bytes)`);
}

main();
