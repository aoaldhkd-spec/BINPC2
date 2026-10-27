import { createHash } from "node:crypto";
import { z } from "@workspace/api-zod";
import { validateHubMedia } from "./event-hub-media.js";
import { fail } from "./event-hub-store.js";

/** Passive image containers only. Keep original bytes; never crop, regenerate or re-encode. */
export function validateLogoOriginal(raw: unknown) {
  const fields = z
    .object({
      label: z.string().trim().min(1).max(80),
      role: z.enum(["venue", "thanks"]),
      provenance: z.enum(["original", "design"]),
      sourceNote: z.string().trim().max(300).default(""),
    })
    .parse(raw);
  const file = validateHubMedia(raw);
  if (!file.mime.startsWith("image/"))
    fail("LOGO_TYPE", "로고는 PNG·JPEG·WebP 이미지만 가능합니다.");
  const b = Buffer.from(file.base64, "base64");
  let width = 0,
    height = 0;
  if (file.mime === "image/png") {
    if (
      b.length < 45 ||
      b.toString("ascii", 12, 16) !== "IHDR" ||
      b.readUInt32BE(8) !== 13
    )
      fail("LOGO_IMAGE", "PNG 이미지 구조를 확인해 주세요.");
    width = b.readUInt32BE(16);
    height = b.readUInt32BE(20);
    let p = 8,
      ended = false,
      hasData = false;
    while (p + 12 <= b.length) {
      const n = b.readUInt32BE(p),
        type = b.toString("ascii", p + 4, p + 8);
      if (n > b.length - p - 12) break;
      if (type === "IDAT" && n > 0) hasData = true;
      p += 12 + n;
      if (type === "IEND") {
        ended = n === 0 && p === b.length;
        break;
      }
    }
    if (!ended || !hasData)
      fail("LOGO_IMAGE", "완전한 PNG 원본을 올려 주세요.");
  } else if (file.mime === "image/jpeg") {
    if (b[b.length - 2] !== 255 || b[b.length - 1] !== 217)
      fail("LOGO_IMAGE", "완전한 JPEG 원본을 올려 주세요.");
    let p = 2;
    while (p + 4 <= b.length) {
      if (b[p++] !== 255) break;
      while (b[p] === 255) p++;
      const marker = b[p++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (p + 2 > b.length) break;
      const n = b.readUInt16BE(p);
      if (n < 2 || p + n > b.length) break;
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker) &&
        n >= 8
      ) {
        height = b.readUInt16BE(p + 3);
        width = b.readUInt16BE(p + 5);
        break;
      }
      p += n;
    }
  } else {
    if (b.readUInt32LE(4) + 8 !== b.length)
      fail("LOGO_IMAGE", "WebP 파일 길이가 올바르지 않습니다.");
    const kind = b.toString("ascii", 12, 16),
      n = b.length;
    if (kind === "VP8X" && n >= 30) {
      width = 1 + b.readUIntLE(24, 3);
      height = 1 + b.readUIntLE(27, 3);
    } else if (kind === "VP8L" && n >= 25 && b[20] === 0x2f) {
      const bits = b.readUInt32LE(21);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
    } else if (
      kind === "VP8 " &&
      n >= 30 &&
      b[23] === 0x9d &&
      b[24] === 1 &&
      b[25] === 0x2a
    ) {
      width = b.readUInt16LE(26) & 0x3fff;
      height = b.readUInt16LE(28) & 0x3fff;
    }
  }
  if (
    !width ||
    !height ||
    width > 8192 ||
    height > 8192 ||
    width * height > 24_000_000
  )
    fail(
      "LOGO_DIMENSIONS",
      "가로·세로 8192px 이하, 전체 2400만 화소 이하의 원본을 사용하세요.",
    );
  return {
    ...file,
    ...fields,
    width,
    height,
    size: b.length,
    sha256: createHash("sha256").update(b).digest("hex"),
  };
}
