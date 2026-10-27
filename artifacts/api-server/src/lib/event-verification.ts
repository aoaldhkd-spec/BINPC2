import { readFile } from "node:fs/promises";
import {
  VerificationHistory,
  classifyVerificationHistory,
} from "@workspace/api-zod";
const identity = readFile(
  new URL("./build-identity.json", import.meta.url),
  "utf8",
)
  .then(JSON.parse)
  .catch(() => ({}));
export async function readVerificationEvidence() {
  let currentVersion = "UNKNOWN",
    builtAt: string | undefined,
    currentFingerprint: string | undefined;
  try {
    const id = await identity;
    if (typeof id.sourceVersion === "string") currentVersion = id.sourceVersion;
    if (typeof id.builtAt === "string") builtAt = id.builtAt;
    if (
      typeof id.codeFingerprint === "string" &&
      /^[a-f0-9]{64}$/.test(id.codeFingerprint)
    )
      currentFingerprint = id.codeFingerprint;
  } catch {
    /* Missing identity must never attest a current PASS. */
  }
  try {
    const history = VerificationHistory.parse(
      JSON.parse(
        await readFile(
          new URL("./verification-history.json", import.meta.url),
          "utf8",
        ),
      ),
    );
    return {
      ...classifyVerificationHistory(
        history,
        currentVersion,
        currentFingerprint,
      ),
      builtAt,
    };
  } catch {
    return {
      currentVersion,
      builtAt,
      runs: [],
      error:
        "검증 자료를 읽지 못했습니다. 현재 버전의 검사 완료로 처리하지 않습니다.",
    };
  }
}
