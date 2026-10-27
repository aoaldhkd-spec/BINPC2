/** Offline developer/CI evidence importer. No HTTP execution or operational DB access. */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeFingerprint } from "./lib/code-fingerprint.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = process.argv[2];
if (!input)
  throw Error(
    "Pass a GitHub run metadata JSON file from gh run view --json jobs,headSha,url,conclusion,status",
  );
const meta = JSON.parse(await readFile(input, "utf8"));
if (
  meta.status !== "completed" ||
  !["success", "failure", "cancelled"].includes(meta.conclusion) ||
  !/^[a-f0-9]{40}$/.test(meta.headSha) ||
  !/^https:\/\/github.com\/aoaldhkd-spec\/BINPC2\/actions\/runs\/\d+$/.test(
    meta.url,
  )
)
  throw Error("Completed official repository run metadata is required");
const job = meta.jobs?.find((j) => j.name === "event-hub");
if (!job?.startedAt) throw Error("Missing actual event-hub job");
const defs = [
  ["build", "실제 앱 빌드", "build", /run build/i],
  ["unit", "API·React 단위 회귀검사", "unit", /unit regression/],
  [
    "postgres",
    "실제 격리 PostgreSQL·초기화 보호",
    "postgres",
    /Actual PostgreSQL/,
  ],
  ["browser", "실제 React/API/DB 브라우저", "browser", /Browser recovery/],
  [
    "mixed",
    "150명 실제 HTTP/PostgreSQL 혼합 검사",
    "mixed-http-postgres",
    /Actual 150-person/,
  ],
  ["guard", "기존 기능 보호검사", "guard", /core-protection/],
];
const checks = defs.map(([id, title, kind, re]) => {
  const steps = job.steps.filter((s) => re.test(s.name));
  const failed = steps.find((s) => s.conclusion === "failure");
  return {
    id,
    title,
    kind,
    status: failed
      ? "FAIL"
      : steps.length && steps.every((s) => s.conclusion === "success")
        ? "PASS"
        : "NOT_RUN",
    ...(failed
      ? { reason: failed.name + " 실패. 연결된 실제 실행 기록을 확인하세요." }
      : {}),
  };
});
checks.push({
  id: "physical",
  title: "물리 Galaxy/iPhone",
  kind: "physical-device",
  status: "UNKNOWN",
  reason: "실기기 검사 이력 없음. Chromium을 실기기 성적으로 바꾸지 않음.",
});
const file = root + "/artifacts/api-server/verification/history.json",
  history = JSON.parse(await readFile(file, "utf8"));
const id = "github-" + meta.url.split("/").at(-1),
  run = {
    id,
    sourceVersion: meta.headSha,
    codeFingerprint: codeFingerprint(root, meta.headSha),
    environment:
      "GitHub Actions Ubuntu24.04 · 실제 React/Express · PostgreSQL16 · Chromium",
    startedAt: job.startedAt,
    finishedAt: job.completedAt,
    reportUrl: meta.url,
    checks,
  };
if (history.runs.some((r) => r.id === id)) {
  console.log("Existing actual run retained:", id);
  process.exit(0);
}
history.runs.push(run);
await writeFile(file, JSON.stringify(history, null, 2) + "\n");
console.log("Actual completed run imported:", id);
