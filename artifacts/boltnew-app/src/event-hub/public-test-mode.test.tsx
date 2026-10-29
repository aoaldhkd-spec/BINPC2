// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ApplicationSteps, BasicForm, EventProfileEditor, WaitingRoom, EventCards } from "./EventHubPage";
import { EventLaboratoryStore } from "./event-laboratory-store";
import type { HubController } from "../lib/event-hub-client";
import { TEST_MODE_BANNER } from "../lib/public-test-mode";

vi.mock("../lib/supabase", () => ({
  supabase: { from: vi.fn(), channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: vi.fn() },
  onSseReconnect: () => () => {}, isSseHealthy: () => true,
}));
vi.mock("../lib/webPush", () => ({ currentPushStatus: () => ({ code: "unsupported" }), requestPushPermissionFromClick: vi.fn() }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function setup(stage: "회비 확인" | "신청 확정" | "현장 입장" = "신청 확정") {
  const store = new EventLaboratoryStore();
  store.jump(stage);
  const state = store.state();
  state.testMode = { enabled: true, publicAdmissionOpen: false, banner: TEST_MODE_BANNER };
  const hub: HubController = { state, mutate: vi.fn(), load: vi.fn(), setError: vi.fn(), error: "", status: "" };
  return { hub, state, app: state.applications[0], event: state.events[0] };
}

it("blocks real basic/profile forms when ON or missing, and retains the return to saved records", () => {
  const { hub, app, event } = setup();
  const view = render(<BasicForm eventId={event.id} hub={hub} />);
  expect(screen.queryByRole("textbox")).toBeNull();
  expect((screen.getByRole("button", { name: "술번개 신청" }) as HTMLButtonElement).disabled).toBe(true);
  const close = vi.fn();
  view.rerender(<EventProfileEditor app={app} hub={hub} onClose={close} />);
  expect(screen.getByText(TEST_MODE_BANNER)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "신청 기록으로 돌아가기" }));
  expect(close).toHaveBeenCalledOnce();
  delete hub.state!.testMode;
  view.rerender(<BasicForm eventId={event.id} hub={hub} />);
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(hub.mutate).not.toHaveBeenCalled();
});

it("leaves notices and saved payment details readable while confirmation, reporting, entry and draws stay disabled", () => {
  const { hub, app, event } = setup("회비 확인");
  const view = render(<ApplicationSteps app={app} event={event} hub={hub} />);
  expect(screen.getByText(/최종 납부 금액/)).toBeTruthy();
  const confirm = screen.getByRole("button", { name: "금액 확인 후 신청 확정" }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  fireEvent.click(confirm);
  const waiting = setup("신청 확정");
  view.rerender(<WaitingRoom {...waiting} edit={vi.fn()} />);
  const report = screen.getByRole("button", { name: "입금했어요 (신고)" }) as HTMLButtonElement;
  expect(report.disabled).toBe(true);
  fireEvent.click(report);
  expect(screen.getAllByText(waiting.event.notice).length).toBeGreaterThan(0);
  expect(waiting.hub.mutate).not.toHaveBeenCalled();
  const entered = setup("현장 입장");
  view.rerender(<WaitingRoom {...entered} edit={vi.fn()} />);
  expect((screen.getByRole("button", { name: "술번개 입장하기" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole("button", { name: "카드 한 장 뽑기" })).toBeNull();
  view.rerender(<EventCards {...entered} />);
  expect((screen.getByRole("button", { name: "카드 한 장 뽑기" }) as HTMLButtonElement).disabled).toBe(true);
  expect(hub.mutate).not.toHaveBeenCalled();
});

it("keeps real forms and external second-round application links closed after test OFF until separate admission approval", () => {
  const { hub, state, app, event } = setup("현장 입장");
  state.testMode = { enabled: false, publicAdmissionOpen: false, banner: TEST_MODE_BANNER };
  event.campaign = { kind: "tour", round: 1, advance: 17000, secondRoundLink: "https://open.kakao.com/o/synthetic-room" };
  const before = structuredClone(app);
  const view = render(<WaitingRoom app={app} event={event} hub={hub} edit={vi.fn()} />);
  expect(screen.queryByRole("link", { name: "2차 오픈채팅 신청 (범일NPC 술번개 외부)" })).toBeNull();
  expect((screen.getByRole("button", { name: "2차 오픈채팅 신청 (접수 전)" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/웹·오픈채팅 모두 접수 전입니다/)).toBeTruthy();
  expect((screen.getByRole("button", { name: "술번개 입장하기" }) as HTMLButtonElement).disabled).toBe(true);
  view.rerender(<BasicForm eventId={event.id} hub={hub} />);
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(app).toEqual(before);
  expect(hub.mutate).not.toHaveBeenCalled();
  state.testMode.publicAdmissionOpen = true;
  view.rerender(<WaitingRoom app={app} event={event} hub={hub} edit={vi.fn()} />);
  expect(screen.getByRole("link", { name: "2차 오픈채팅 신청 (범일NPC 술번개 외부)" }).getAttribute("href")).toBe(event.campaign.secondRoundLink);
  expect(app).toEqual(before);
});

it("closes new Halloween draws at 01:00 and preserves saved results through 17:00", () => {
  const { hub, state, app, event } = setup("현장 입장");
  state.testMode = { enabled: false, publicAdmissionOpen: true, banner: TEST_MODE_BANNER };
  state.serverNow = "2026-10-31T00:59:59+09:00";
  const halloween = { ...event, type: "halloween" as const, date: "2026-10-30", start: "22:30", end: "01:00" };
  app.cards = [{ id: "saved-card", prize: "saved-prize", prizeLabel: "보존 테스트 상품", at: "2026-10-30T23:00:00+09:00" }];
  const view = render(<EventCards app={app} event={halloween} hub={hub} />);
  expect((screen.getByRole("button", { name: "카드 한 장 뽑기" }) as HTMLButtonElement).disabled).toBe(false);
  state.serverNow = "2026-10-31T01:00:00+09:00";
  view.rerender(<EventCards app={app} event={halloween} hub={hub} />);
  expect((screen.getByRole("button", { name: "카드 한 장 뽑기" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("🎁 보존 테스트 상품")).toBeTruthy();
  expect(hub.mutate).not.toHaveBeenCalled();
});
