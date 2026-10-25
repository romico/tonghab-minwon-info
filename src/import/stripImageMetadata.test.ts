import { stripImageMetadata } from "./stripImageMetadata.ts";

const exif = new TextEncoder().encode("Exif\0\0GPS-SECRET");
const app1Len = 2 + exif.length;
const jpeg = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe1, (app1Len >> 8) & 255, app1Len & 255, ...exif,
  0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9,
]);
const stripped = stripImageMetadata(jpeg);
if (!stripped) throw new Error("jpeg strip null");
const text = new TextDecoder().decode(stripped.bytes);
if (text.includes("GPS-SECRET") || text.includes("Exif")) {
  throw new Error(`exif remains ${stripped.bytes.length}`);
}
if (stripped.bytes[0] !== 0xff || stripped.bytes[1] !== 0xd8) {
  throw new Error("soi");
}
if (stripped.bytes.at(-2) !== 0xff || stripped.bytes.at(-1) !== 0xd9) {
  throw new Error("eoi");
}

const comment = new TextEncoder().encode("Comment\0secret-xmp");
const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0, 0, 0, comment.length,
  0x74, 0x45, 0x58, 0x74,
  ...comment,
  0, 0, 0, 0,
  0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);
const pngOut = stripImageMetadata(png);
if (!pngOut) throw new Error("png null");
if (new TextDecoder().decode(pngOut.bytes).includes("secret-xmp")) {
  throw new Error("png text remains");
}
if (stripImageMetadata(new Uint8Array([1, 2, 3, 4])) !== null) {
  throw new Error("unknown kept");
}
console.log("ok", stripped.bytes.length, pngOut.bytes.length);
