/** Append only a completed, private-data-free internal HTTP/PG runner result. */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  input = process.argv[2];
if (!input) throw Error("Pass a completed internal load result JSON");
const r = JSON.parse(await readFile(input, "utf8"));
if (
  r.mode !== "mixed" ||
  !r.finishedAt ||
  r.requests?.length !== r.requestCount ||
  r.cohortSizes?.join(",") !== "100,150" ||
  !r.builtIdentity?.sourceVersion ||
  !/^[a-f0-9]{64}$/.test(r.builtIdentity.codeFingerprint ?? "")
)
  throw Error("Missing actual HTTP/PG execution evidence or code identity");
const failed =
    r.failures.length > 0 ||
    r.requests.some((q) => q.status === 0 || q.status >= 500),
  duration = r.durationSeconds;
const check = {
  id: "mixed-http-postgres",
  title: `150명 실제 HTTP/PostgreSQL · ${duration}초`,
  kind: "mixed-http-postgres",
  status: failed ? "FAIL" : "PASS",
  count: r.requestCount,
  reason: failed
    ? r.failures
        .map((x) => `${x.stage}: ${x.reason}`)
        .join("; ")
        .slice(0, 1800)
    : `${r.requestCount}요청. 재시작 복구=${r.restartVerified}. 기존 누적 소유자${r.preexistingOwnerRows}건. 실제 벽시계${duration}초, 행사 시각만 격리 fixture로 이동. 기간을5시간/실기기로 확대 해석하지 않음.`,
};
const file = root + "/artifacts/api-server/verification/history.json",
  history = JSON.parse(await readFile(file, "utf8"));
if (history.runs.some((x) => x.id === r.runId)) {
  console.log("Existing execution retained");
  process.exit(0);
}
history.runs.push({
  id: r.runId,
  sourceVersion: r.builtIdentity.sourceVersion,
  codeFingerprint: r.builtIdentity.codeFingerprint,
  environment: r.environment,
  startedAt: r.startedAt,
  finishedAt: r.finishedAt,
  reportUrl:
    "https://github.com/aoaldhkd-spec/BINPC2/blob/feat/event-hub-v6-20261027/docs/EVENT_HUB_V6_COMPLETION_2026-10-27.md",
  checks: [
    check,
    {
      id: "physical",
      title: "물리 Galaxy/iPhone",
      kind: "physical-device",
      status: "UNKNOWN",
      reason: "내부 HTTP/Chromium 결과이며 실제 기기를 사용하지 않았음.",
    },
  ],
});
await writeFile(file, JSON.stringify(history, null, 2) + "\n");
console.log("Completed actual run appended:", r.runId);
