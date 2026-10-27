import { describe, it, expect } from "vitest";
import { validateLogoOriginal } from "./event-hub-logo.js";
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD9sAAAAASUVORK5CYII=";
const logo = {
  mime: "image/png",
  base64: png,
  label: "격리 원본",
  role: "venue",
  provenance: "original",
};
describe("immutable logo originals", () => {
  it("keeps original bytes and bounded natural dimensions with a content hash", () => {
    expect(validateLogoOriginal(logo)).toMatchObject({
      base64: png,
      width: 1,
      height: 1,
      role: "venue",
    });
    expect(validateLogoOriginal(logo).sha256).toHaveLength(64);
  });
  it("rejects a forged MIME, incomplete container, oversized and decompression-sized originals", () => {
    expect(() =>
      validateLogoOriginal({ ...logo, mime: "image/jpeg" }),
    ).toThrow();
    expect(() =>
      validateLogoOriginal({
        ...logo,
        base64: Buffer.from(png, "base64").subarray(0, 40).toString("base64"),
      }),
    ).toThrow();
    const huge = Buffer.from(png, "base64");
    huge.writeUInt32BE(99999, 16);
    expect(() =>
      validateLogoOriginal({ ...logo, base64: huge.toString("base64") }),
    ).toThrow();
    expect(() =>
      validateLogoOriginal({
        ...logo,
        base64: Buffer.alloc(2 * 1024 * 1024 + 4).toString("base64"),
      }),
    ).toThrow();
  });
  it("rejects active SVG/HTML and video while retaining thanks/design classifications", () => {
    expect(() =>
      validateLogoOriginal({
        ...logo,
        mime: "image/svg+xml",
        base64: Buffer.from('<svg onload="alert(1)"/>').toString("base64"),
      }),
    ).toThrow();
    expect(
      validateLogoOriginal({ ...logo, role: "thanks", provenance: "design" }),
    ).toMatchObject({ role: "thanks", provenance: "design" });
  });
});
