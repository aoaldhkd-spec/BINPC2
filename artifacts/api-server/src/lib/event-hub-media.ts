import { z } from "@workspace/api-zod";
import { fail } from "./event-hub-store.js";
export const HUB_MEDIA_PATH =
  /^\/api\/event-hub\/media\/([a-f0-9-]{36})\.(png|jpg|webp|mp4|webm)$/;
export type HubMedia = {
  id: string;
  eventId: string;
  mime: string;
  base64: string;
  createdAt: string;
  purpose?: "venue-logo";
};
/** Bounded, signature-checked, passive formats only. No filenames or external storage credentials. */
export function validateHubMedia(raw: unknown) {
  const input = z
    .object({
      mime: z.enum([
        "image/png",
        "image/jpeg",
        "image/webp",
        "video/mp4",
        "video/webm",
      ]),
      base64: z.string().max(7_000_000),
    })
    .parse(raw);
  if (
    input.base64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64)
  )
    fail("MEDIA", "올바른 파일 인코딩이 아닙니다.");
  const bytes = Buffer.from(input.base64, "base64");
  if (bytes.toString("base64") !== input.base64)
    fail("MEDIA", "올바른 파일 인코딩이 아닙니다.");
  const max = input.mime.startsWith("image/")
    ? 2 * 1024 * 1024
    : 5 * 1024 * 1024;
  if (bytes.length < 12 || bytes.length > max)
    fail("MEDIA_SIZE", "이미지는 2MB, 영상은 5MB 이하만 업로드할 수 있습니다.");
  const good =
    input.mime === "image/png"
      ? bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : input.mime === "image/jpeg"
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : input.mime === "image/webp"
          ? bytes.toString("ascii", 0, 4) === "RIFF" &&
            bytes.toString("ascii", 8, 12) === "WEBP"
          : input.mime === "video/mp4"
            ? bytes.toString("ascii", 4, 8) === "ftyp"
            : bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]));
  if (!good)
    fail(
      "MEDIA_TYPE",
      "파일 내용과 형식이 일치하지 않습니다. SVG·HTML은 허용하지 않습니다.",
    );
  return {
    ...input,
    extension: (
      {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
        "video/mp4": "mp4",
        "video/webm": "webm",
      } as const
    )[input.mime],
  };
}
