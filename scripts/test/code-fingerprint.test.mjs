import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { codeFingerprint } from "../lib/code-fingerprint.mjs";
test("fingerprints actual app changes while evidence and documentation cannot attest themselves", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "binpc2-fingerprint-"));
  try {
    execFileSync("git", ["init", "-q", dir]);
    mkdirSync(path.join(dir, "artifacts/api-server/src"), { recursive: true });
    mkdirSync(path.join(dir, "artifacts/api-server/verification"), {
      recursive: true,
    });
    writeFileSync(
      path.join(dir, "artifacts/api-server/src/app.ts"),
      "export const app=1;",
    );
    execFileSync("git", ["add", "."], { cwd: dir });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        "commit",
        "-qm",
        "fixture",
      ],
      { cwd: dir },
    );
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: dir,
        encoding: "utf8",
      }).trim(),
      same = codeFingerprint(dir);
    assert.equal(codeFingerprint(dir, sha), same);
    writeFileSync(
      path.join(dir, "artifacts/api-server/verification/history.json"),
      "{}",
    );
    writeFileSync(path.join(dir, "report.md"), "changed docs");
    assert.equal(codeFingerprint(dir), same);
    writeFileSync(
      path.join(dir, "artifacts/api-server/src/app.ts"),
      "export const app=2;",
    );
    assert.notEqual(codeFingerprint(dir), same);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
