import { it, expect } from "vitest";
import {
  VerificationHistory,
  classifyVerificationHistory,
} from "@workspace/api-zod";
it("compares exact versions and keeps unknown and dirty builds historical", () => {
  const sha = "a".repeat(40),
    history = VerificationHistory.parse({
      schemaVersion: 1,
      runs: [
        {
          id: "actual",
          sourceVersion: sha,
          environment: "actual PostgreSQL",
          startedAt: "2026-10-27T00:00:00Z",
          reportUrl: "https://github.com/aoaldhkd-spec/BINPC2/actions/runs/1",
          checks: [{ id: "db", title: "DB", kind: "postgres", status: "PASS" }],
        },
      ],
    });
  expect(classifyVerificationHistory(history, sha).runs[0].historical).toBe(
    false,
  );
  expect(
    classifyVerificationHistory(history, sha + "-dirty-012345678abc").runs[0]
      .historical,
  ).toBe(true);
  expect(
    classifyVerificationHistory(history, "UNKNOWN").runs[0].historical,
  ).toBe(true);
});
it("does not accept an arbitrary executable or external report URL", () => {
  expect(
    VerificationHistory.safeParse({
      schemaVersion: 1,
      runs: [
        {
          id: "x",
          sourceVersion: "a".repeat(40),
          environment: "x",
          startedAt: "2026-10-27T00:00:00Z",
          reportUrl: "javascript:alert(1)",
          checks: [],
        },
      ],
    }).success,
  ).toBe(false);
});
it("keeps source SHA visible while allowing only a proven identical code fingerprint across evidence-only commits", () => {
  const sha = "a".repeat(40),
    fp = "c".repeat(64),
    history = VerificationHistory.parse({
      schemaVersion: 1,
      runs: [
        {
          id: "actual",
          sourceVersion: sha,
          codeFingerprint: fp,
          environment: "actual PG",
          startedAt: "2026-10-27T00:00:00Z",
          reportUrl: "https://github.com/aoaldhkd-spec/BINPC2/actions/runs/1",
          checks: [],
        },
      ],
    });
  expect(
    classifyVerificationHistory(history, "b".repeat(40), fp).runs[0].historical,
  ).toBe(false);
  expect(
    classifyVerificationHistory(history, "b".repeat(40), "d".repeat(64)).runs[0]
      .historical,
  ).toBe(true);
});
