// @vitest-environment happy-dom
import {
  render,
  screen,
  waitFor,
  cleanup,
  fireEvent,
} from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { VerificationResults } from "./VerificationResults";
const sha = "a".repeat(40),
  old = "b".repeat(40);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("shows old PASS and FAIL as historical and does not attest a changed current version", async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      currentVersion: sha,
      runs: [
        {
          id: "past-pass",
          sourceVersion: old,
          historical: true,
          environment: "actual PG",
          startedAt: "2026-10-27T00:00:00Z",
          reportUrl: "https://github.com/aoaldhkd-spec/BINPC2/actions/runs/1",
          checks: [
            { id: "db", title: "DB 검사", kind: "postgres", status: "PASS" },
          ],
        },
        {
          id: "past-fail",
          sourceVersion: old,
          historical: true,
          environment: "browser",
          startedAt: "2026-10-26T00:00:00Z",
          reportUrl: "https://github.com/aoaldhkd-spec/BINPC2/actions/runs/2",
          checks: [
            {
              id: "ui",
              title: "모바일 검사",
              kind: "browser",
              status: "FAIL",
              reason: "확인 안내가 클릭을 가림",
            },
          ],
        },
      ],
    }),
  });
  vi.stubGlobal("fetch", fetch);
  render(<VerificationResults />);
  await waitFor(() =>
    expect(screen.getByText(/현재 코드 버전 검사결과: 미실행/)).toBeTruthy(),
  );
  expect(screen.getByText(/과거 버전 · past-pass/)).toBeTruthy();
  expect(screen.getByText(/DB 검사: 성공/)).toBeTruthy();
  expect(screen.getByText(/확인 안내가 클릭을 가림/)).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "저장된 실제 검사 이력 새로고침" }),
  );
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(fetch.mock.calls.every((c) => c[1].method === "GET")).toBe(true);
});
it("keeps a failed evidence read unverified", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Error("offline")));
  render(<VerificationResults />);
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "성공으로 처리하지 않습니다",
    ),
  );
});
