/** JPEG APP1(EXIF·XMP)·APP13(IPTC)·주석, PNG 텍스트/EXIF 청크를 제거한다. */

function concatBytes(parts: Uint8Array[]): Uint8Array {
  let size = 0;
  for (const part of parts) size += part.length;
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function stripJpegMetadata(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let i = 2;
  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const markerStart = i;
    i += 1;
    while (i < bytes.length && bytes[i] === 0xff) i += 1;
    if (i >= bytes.length) return null;
    const marker = bytes[i];
    i += 1;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      parts.push(Uint8Array.of(0xff, marker));
      if (marker === 0xd9) return concatBytes(parts);
      continue;
    }
    if (i + 1 >= bytes.length) return null;
    const len = (bytes[i] << 8) | bytes[i + 1];
    if (len < 2 || i + len > bytes.length) return null;
    const drop = marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (!drop) parts.push(bytes.subarray(markerStart, i + len));
    const next = i + len;
    if (marker === 0xda) {
      parts.push(bytes.subarray(next));
      return concatBytes(parts);
    }
    i = next;
  }
  return null;
}

const PNG_DROP = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

function stripPngMetadata(bytes: Uint8Array): Uint8Array | null {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 8) return null;
  for (let i = 0; i < sig.length; i += 1) {
    if (bytes[i] !== sig[i]) return null;
  }
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= bytes.length) {
    const len =
      ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>>
      0;
    if (i + 12 + len > bytes.length) return null;
    const type = String.fromCharCode(
      bytes[i + 4],
      bytes[i + 5],
      bytes[i + 6],
      bytes[i + 7],
    );
    const end = i + 12 + len;
    if (!PNG_DROP.has(type)) parts.push(bytes.subarray(i, end));
    i = end;
    if (type === "IEND") return concatBytes(parts);
  }
  return null;
}

/** 해석할 수 없으면 null. GIF·BMP 는 EXIF/XMP 용기가 아니라 그대로 둔다. */
export function stripImageMetadata(
  bytes: Uint8Array,
): { bytes: Uint8Array; mime: string } | null {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const next = stripJpegMetadata(bytes);
    return next ? { bytes: next, mime: "image/jpeg" } : null;
  }
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    const next = stripPngMetadata(bytes);
    return next ? { bytes: next, mime: "image/png" } : null;
  }
  if (bytes.length >= 3 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { bytes, mime: "image/gif" };
  }
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return { bytes, mime: "image/bmp" };
  }
  return null;
}

export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}
