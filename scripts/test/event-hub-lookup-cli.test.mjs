import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  ),
  cli = path.join(root, "artifacts/api-server/dist/event-hub-lookup-cli.mjs");
function run(args, extra = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 3000,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "development",
      DATABASE_URL: "postgres://fixture:never-log-this@127.0.0.1:1/forbidden",
      ...extra,
    },
  });
}
test("default lookup preparation never connects or changes records", () => {
  const result = run([]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Default is no connection\/no changes/);
});
test("production metadata writes fail before connecting without explicit approval and key", () => {
  const result = run(["--scope", "production", "--apply"]);
  assert.equal(result.status, 1);
  assert.doesNotMatch(
    result.stderr,
    /never-log-this|ECONNREFUSED|postgres:\/\//,
  );
  assert.match(result.stderr, /Credentials and row details were not logged/);
});
test("isolated preparation rejects external hosts and nonfixture databases", () => {
  for (const url of [
    "postgres://fixture@external.invalid/binpc2_hub_load_v6",
    "postgres://fixture@127.0.0.1:1/forbidden",
  ]) {
    const result = run(["--scope", "isolated", "--apply"], {
      DATABASE_URL: url,
    });
    assert.equal(result.status, 1);
    assert.doesNotMatch(
      result.stderr,
      /external.invalid|ECONNREFUSED|forbidden/,
    );
  }
});
test("connection overrides and conflicting apply/dry-run are rejected", () => {
  for (const [args, env] of [
    [
      ["--scope", "production", "--dry-run"],
      {
        DATABASE_URL:
          "postgres://fixture@127.0.0.1:1/forbidden?host=external.invalid",
      },
    ],
    [["--scope", "production", "--dry-run", "--apply"], {}],
  ]) {
    const result = run(args, env);
    assert.equal(result.status, 1);
    assert.doesNotMatch(
      result.stderr,
      /external.invalid|ECONNREFUSED|forbidden/,
    );
  }
});
