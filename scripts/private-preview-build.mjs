/** Explicit preview build; never uses dev-server bridges or operational deployment config. */
import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
if (
  process.env.APP_MODE !== "private-preview" ||
  process.env.NODE_ENV !== "production"
)
  throw Error("Explicit private preview production-security build required");
const expected = process.env.PREVIEW_SOURCE_SHA ?? "";
if (!/^[a-f0-9]{40}$/.test(expected))
  throw Error("A verified frozen PREVIEW_SOURCE_SHA is required");
const current = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
if (current !== expected)
  throw Error(
    "Refusing a moving branch HEAD: deploy the explicitly verified commitId",
  );
if (
  execFileSync("git", ["diff", "--name-only", "HEAD"], {
    encoding: "utf8",
  }).trim() ||
  execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
    encoding: "utf8",
  }).trim()
)
  throw Error("Refusing modified or untracked source");
for (const [key, value] of Object.entries({
  VITE_SSE_ORIGIN: "",
  VITE_PRIVATE_PREVIEW: "1",
}))
  process.env[key] = value;
// Never pass a build-time localhost auto-login secret to the frontend.
delete process.env.DEV_ADMIN_PASSWORD;
delete process.env.DEV_TEST_PASSWORD;
for (const args of [
  ["pnpm", "install", "--frozen-lockfile", "--prod=false"],
  ["pnpm", "--filter", "@workspace/boltnew-app", "build"],
]) {
  const r = spawnSync("corepack", args, { stdio: "inherit", env: process.env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
mkdirSync("artifacts/boltnew-app/dist/public", { recursive: true });
writeFileSync(
  "artifacts/boltnew-app/dist/public/preview-version.json",
  JSON.stringify({
    sourceSha: expected,
    mode: "private-preview",
    builtAt: new Date().toISOString(),
  }) + "\n",
);
const api = spawnSync(
  "corepack",
  ["pnpm", "--filter", "@workspace/api-server", "build"],
  { stdio: "inherit", env: process.env },
);
process.exit(api.status ?? 1);
