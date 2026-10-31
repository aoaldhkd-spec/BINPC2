// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { WaitingOverlay } from "./WaitingOverlay";
import { TEST_MODE_BANNER, usePublicTestMode } from "../lib/public-test-mode";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("keeps application and entry disabled until OFF and a separate authoritative admission approval, with notices and inquiry available", async () => {
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
  expect((screen.getByRole("button", { name: "술번개 신청" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/웹·오픈채팅 모두 접수 전입니다/)).toBeTruthy();
  fireEvent.focus(window);
  await act(async () => complete(new Response(JSON.stringify({ enabled: false, publicAdmissionOpen: false, banner: TEST_MODE_BANNER }))));
  expect((screen.getByRole("button", { name: "술번개 신청" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.focus(window);
  await act(async () => complete(new Response(JSON.stringify({ enabled: false, publicAdmissionOpen: true, banner: TEST_MODE_BANNER }))));
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
  await act(async () => requests[0](new Response(JSON.stringify({ enabled: false, publicAdmissionOpen: true }))));
  expect(result.current).toBe(true);
  fireEvent.focus(window);
  await act(async () => requests[2](new Response(JSON.stringify({ enabled: false, publicAdmissionOpen: true }))));
  await waitFor(() => expect(result.current).toBe(false));
  fireEvent.focus(window);
  await act(async () => requests[3](new Response("unavailable", { status: 503 })));
  expect(result.current).toBe(true);
});

it("does not repeat the public-mode read for verified boss access and rechecks when that access ends", async () => {
  let complete!: (response: Response) => void;
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  const { result, rerender } = renderHook(({ boss }) => usePublicTestMode(boss), { initialProps: { boss: true } });
  expect(result.current).toBe(false);
  fireEvent.focus(window);
  fireEvent(document, new Event("visibilitychange"));
  expect(fetch).not.toHaveBeenCalled();
  rerender({ boss: false });
  expect(result.current).toBe(true);
  expect(fetch).toHaveBeenCalledOnce();
  await act(async () => complete(new Response(JSON.stringify({ enabled: false, publicAdmissionOpen: false }))));
  expect(result.current).toBe(true);
});

it("discards an older public-open result across the verified-boss transition", async () => {
  const requests: ((response: Response) => void)[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(resolve => requests.push(resolve)));
  const { result, rerender } = renderHook(({ boss }) => usePublicTestMode(boss), { initialProps: { boss: false } });
  rerender({ boss: true });
  await act(async () => requests[0](new Response(JSON.stringify({ enabled: false, publicAdmissionOpen: true }))));
  rerender({ boss: false });
  expect(result.current).toBe(true);
  await act(async () => requests[1](new Response("temporary error", { status: 503 })));
  expect(result.current).toBe(true);
});

it("keeps recruitment closed without polling event APIs during independently permitted HeartNow access",()=>{
 const fetch=vi.spyOn(globalThis,"fetch");
 const {result}=renderHook(()=>usePublicTestMode(false,true));
 expect(result.current).toBe(true);fireEvent.focus(window);expect(fetch).not.toHaveBeenCalled();
});
