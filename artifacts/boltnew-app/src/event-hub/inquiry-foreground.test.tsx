// @vitest-environment happy-dom
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { useInquiryReadReceipt } from "./useInquiryReadReceipt";
import { AdminInquiry } from "./AdminInquiry";
import { AdminThreads } from "./EventHubAdmin";
import type { HubController, HubState } from "../lib/event-hub-client";
vi.mock("../lib/supabase", () => ({ supabase: { from: vi.fn(), channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: vi.fn() }, onSseReconnect: () => () => {}, isSseHealthy: () => true }));
vi.mock("../lib/webPush", () => ({ currentPushStatus: () => ({ code: "unsupported" }), requestPushPermissionFromClick: vi.fn() }));
let visibility: DocumentVisibilityState = "visible";
beforeEach(() => { visibility = "visible"; vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility); });
afterEach(() => { cleanup(); document.querySelector("[data-boss-access]")?.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); window.history.replaceState({}, "", "/events"); });
const visible = (value: DocumentVisibilityState, event = "visibilitychange") => act(() => { visibility = value; (event === "pageshow" ? window : document).dispatchEvent(new Event(event)); });
const options = (markRead: HubController["mutate"]) => ({ active: true, threadId: "thread-a", unreadMessageId: "message-a", status: "", markRead });

it("never marks a delayed background message read, then acknowledges it after foregrounding", () => {
  visibility = "hidden";const markRead = vi.fn().mockResolvedValue({ saved: true });
  renderHook(() => useInquiryReadReceipt(options(markRead)));
  expect(markRead).not.toHaveBeenCalled();visible("visible");
  expect(markRead).toHaveBeenCalledExactlyOnceWith({ action: "thread.read" });
});

it("waits for another save/check to finish and acknowledges only the currently selected administrator conversation", () => {
  const markRead = vi.fn().mockResolvedValue({ saved: true });
  const { rerender } = renderHook(props => useInquiryReadReceipt(props), { initialProps: { ...options(markRead), admin: true, status: "saving" } });
  rerender({ ...options(markRead), admin: true, threadId: "thread-b", unreadMessageId: "message-b", status: "checking" });
  expect(markRead).not.toHaveBeenCalled();
  rerender({ ...options(markRead), admin: true, threadId: "thread-b", unreadMessageId: "message-b", status: "saved" });
  expect(markRead).toHaveBeenCalledExactlyOnceWith({ action: "thread.read", target: "thread-b" });
});

it("does not retry a failed acknowledgement endlessly, but retries once when the conversation is deliberately reopened", () => {
  const markRead = vi.fn().mockResolvedValue(null), initial = options(markRead);
  const { rerender } = renderHook(props => useInquiryReadReceipt(props), { initialProps: initial });
  for (const status of ["saving", "checking", "failed", "failed"]) rerender({ ...initial, status });
  expect(markRead).toHaveBeenCalledTimes(1);
  rerender({ ...initial, active: false, status: "failed" });rerender({ ...initial, status: "failed" });
  expect(markRead).toHaveBeenCalledTimes(2);
});

it("does not acknowledge after closing, backgrounding or unmounting while another save was pending", () => {
  const markRead = vi.fn().mockResolvedValue({ saved: true }), initial = { ...options(markRead), status: "saving" };
  const { rerender, unmount } = renderHook(props => useInquiryReadReceipt(props), { initialProps: initial });
  rerender({ ...initial, active: false, status: "saved" });visible("hidden");visible("visible");unmount();visible("visible", "pageshow");
  expect(markRead).not.toHaveBeenCalled();
});

it("a late old-conversation completion cannot replace or suppress the current read target", async () => {
  let finish!: (result: unknown) => void;
  const markRead = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue({ saved: true });
  const initial = { ...options(markRead), admin: true };
  const { rerender } = renderHook(props => useInquiryReadReceipt(props), { initialProps: initial });
  rerender({ ...initial, threadId: "thread-b", unreadMessageId: "message-b", status: "saving" });
  await act(async () => { finish({ saved: true }); });
  rerender({ ...initial, threadId: "thread-b", unreadMessageId: "message-b", status: "saved" });
  expect(markRead.mock.calls.map(([command]) => command.target)).toEqual(["thread-a", "thread-b"]);
});

it("uses the newest message after a pageshow resume and does not duplicate reads under StrictMode", () => {
  visibility = "hidden";const markRead = vi.fn().mockResolvedValue({ saved: true }), initial = options(markRead);
  const { rerender } = renderHook(props => useInquiryReadReceipt(props), { initialProps: initial, wrapper: StrictMode });
  rerender({ ...initial, unreadMessageId: "newest-message" });visible("visible", "pageshow");
  expect(markRead).toHaveBeenCalledTimes(1);
  rerender({ ...initial, unreadMessageId: "newest-message", status: "saved" });expect(markRead).toHaveBeenCalledTimes(1);
});

it("waits until a preserved conversation is visible again after an access recheck", async () => {
  const boundary = document.createElement("div");boundary.dataset.bossAccess = "authorized";boundary.hidden = true;document.body.append(boundary);
  const markRead = vi.fn().mockResolvedValue({ saved: true });
  renderHook(() => useInquiryReadReceipt(options(markRead)));
  visible("visible", "pageshow");expect(markRead).not.toHaveBeenCalled();
  await act(async () => { boundary.hidden = false; });
  expect(markRead).toHaveBeenCalledExactlyOnceWith({ action: "thread.read" });
});

it("cannot consume a pending administrator unread while the access boundary hides the saved screen", async () => {
  const boundary = document.createElement("div");boundary.dataset.bossAccess = "authorized";document.body.append(boundary);
  const markRead = vi.fn().mockResolvedValue({ saved: true }), initial = { ...options(markRead), status: "saving", admin: true };
  const { rerender } = renderHook(props => useInquiryReadReceipt(props), { initialProps: initial });
  await act(async () => { boundary.hidden = true; });
  rerender({ ...initial, threadId: "thread-b", unreadMessageId: "message-b", status: "saved" });
  expect(markRead).not.toHaveBeenCalled();
  await act(async () => { boundary.hidden = false; });
  expect(markRead).toHaveBeenCalledExactlyOnceWith({ action: "thread.read", target: "thread-b" });
});

const state = (sender: "admin" | "user"): HubState => ({ enabled: true, hasSession: true, events: [], applications: [], stocks: [], threads: [{ id: "thread-a", readUserAt: "", readAdminAt: "", tags: [], history: [], messages: [{ id: "message-a", sender, text: "합성 새 메시지", at: "2026-10-30T14:00:00Z" }] }] });
const hub = (data: HubState, mutate: HubController["mutate"], status = ""): HubController => ({ state: data, status, error: "", mutate, load: vi.fn(), setError: vi.fn() });

it("participant drawer keeps unread/draft while hidden and resumes its pending read after foreground + saving finishes", async () => {
  visibility = "hidden";const mutate = vi.fn().mockResolvedValue({ saved: true }), data = state("admin");
  const view = render(<AdminInquiry hub={hub(data, mutate, "saving")} />);
  fireEvent.click(screen.getByRole("button", { name: /관리자 문의/ }));
  fireEvent.change(screen.getByLabelText("문의 내용"), { target: { value: "앱을 옮겨도 보존할 문의" } });
  expect(mutate).not.toHaveBeenCalled();visible("visible");expect(mutate).not.toHaveBeenCalled();
  view.rerender(<AdminInquiry hub={hub(data, mutate, "saved")} />);
  await waitFor(() => expect(mutate).toHaveBeenCalledExactlyOnceWith({ action: "thread.read" }));
  expect((screen.getByLabelText("문의 내용") as HTMLTextAreaElement).value).toBe("앱을 옮겨도 보존할 문의");
});

it("administrator conversation does not consume unread while hidden and marks only its selected thread after returning", async () => {
  visibility = "hidden";const mutate = vi.fn().mockResolvedValue({ saved: true }), data = state("user");
  render(<AdminThreads state={data} hub={hub(data, mutate)} initialOwner="thread-a" />);
  await waitFor(() => expect((screen.getByLabelText("문의 대상") as HTMLSelectElement).value).toBe("thread-a"));
  expect(mutate).not.toHaveBeenCalled();visible("visible");
  expect(mutate).toHaveBeenCalledExactlyOnceWith({ action: "thread.read", target: "thread-a" });
});

it("adjusts the inquiry sheet for a smaller visual viewport without losing input when storage is unavailable", () => {
  const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0 });
  vi.stubGlobal("visualViewport", viewport);vi.stubGlobal("innerHeight", 844);
  vi.spyOn(sessionStorage, "setItem").mockImplementation(() => { throw Error("Storage blocked"); });
  const mutate = vi.fn().mockResolvedValue({ saved: true });render(<AdminInquiry hub={hub({ ...state("user"), threads: [] }, mutate)} />);
  fireEvent.click(screen.getByRole("button", { name: /관리자 문의/ }));
  fireEvent.change(screen.getByLabelText("문의 내용"), { target: { value: "보존된 작성 내용" } });
  act(() => { viewport.height = 380;viewport.dispatchEvent(new Event("resize")); });
  const dialog = screen.getByRole("dialog", { name: "관리자 문의" });
  expect(dialog.style.maxHeight).toBe("342px");expect(dialog.parentElement?.style.bottom).toBe("464px");
  expect(document.querySelector<HTMLElement>(".event-hub-dock")?.style.getPropertyValue("--hub-keyboard-inset")).toBe("464px");
  expect(document.documentElement.style.getPropertyValue("--hub-viewport-height")).toBe("380px");
  visible("hidden");visible("visible");
  expect((screen.getByLabelText("문의 내용") as HTMLTextAreaElement).value).toBe("보존된 작성 내용");
  expect(screen.getByText(/브라우저가 임시 저장을 차단했습니다/)).toBeTruthy();expect(mutate).not.toHaveBeenCalled();
});
