// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { WaitingOverlay } from "./WaitingOverlay";
import { TEST_MODE_BANNER, usePublicTestMode } from "../lib/public-test-mode";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("keeps application and entry disabled until an authoritative OFF response, with notices and inquiry available", async () => {
  let complete!: (response: Response) => void;
  const request = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
  const enter = vi.fn();
  render(<WaitingOverlay sessionActive onEnter={enter} />);
  expect(screen.getByText(TEST_MODE_BANNER)).toBeTruthy();
  expect((screen.getByRole("button", { name: "술번개 신청" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "입장하기" }));
  expect(enter).not.toHaveBeenCalled();
  expect(screen.getByRole("link", { name: "행사 공지 · 관리자 문의" }).getAttribute("href")).toBe("/events");
  expect(screen.getByRole("link", { name: "신청대기방" })).toBeTruthy();
  expect(request.mock.calls[0][0]).toBe("/api/event-hub/test-mode");
  await act(async () => complete(new Response(JSON.stringify({ enabled: false, banner: TEST_MODE_BANNER }))));
  expect(screen.queryByText(TEST_MODE_BANNER)).toBeNull();
  expect(screen.getByRole("link", { name: "술번개 신청" })).toBeTruthy();
});

it("does not accept a stale OFF response after a newer ON response and fails closed on refresh errors", async () => {
  const requests: ((response: Response) => void)[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise((resolve) => requests.push(resolve)));
  const { result } = renderHook(() => usePublicTestMode());
  expect(result.current).toBe(true);
  fireEvent.focus(window);
  await act(async () => requests[1](new Response(JSON.stringify({ enabled: true }))));
  await act(async () => requests[0](new Response(JSON.stringify({ enabled: false }))));
  expect(result.current).toBe(true);
  fireEvent.focus(window);
  await act(async () => requests[2](new Response(JSON.stringify({ enabled: false }))));
  await waitFor(() => expect(result.current).toBe(false));
  fireEvent.focus(window);
  await act(async () => requests[3](new Response("unavailable", { status: 503 })));
  expect(result.current).toBe(true);
});
