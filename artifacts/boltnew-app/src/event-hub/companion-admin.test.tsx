// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CompanionAdminGroups, CompanionLinkRequests, companionAdminGroups } from "./CompanionAdmin";
import { ApplicationRoster, EventDateTabs } from "./EventHubAdmin";
import { BenefitResults } from "./EventOperations";
import { EventLaboratoryStore } from "./event-laboratory-store";
import type { CompanionLinkRequest, HubController, PrivateApplication } from "../lib/event-hub-client";

vi.mock("../lib/supabase", () => ({ supabase: { from: vi.fn(), channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: vi.fn() }, onSseReconnect: () => () => {}, isSseHealthy: () => true }));
vi.mock("../lib/webPush", () => ({ currentPushStatus: () => ({ code: "unsupported" }), requestPushPermissionFromClick: vi.fn() }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

it("shows each full event date once while preserving an already selected event on that date", () => {
  const event = new EventLaboratoryStore().state(true).events[0];
  const friday = { ...event, id: "first", date: "2026-10-30", campaign: { ...event.campaign!, kind: "halloween-friday" as const } };
  const retained = { ...friday, id: "retained" };
  const later = { ...friday, id: "later", date: "2027-10-30" };
  const select = vi.fn();
  const view = render(<EventDateTabs events={[friday, retained]} selected={retained.id} onSelect={select} />);
  expect(screen.getAllByRole("button", { name: "10/30 금요일" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "10/30 금요일" }));
  expect(select).toHaveBeenLastCalledWith("retained");
  view.rerender(<EventDateTabs events={[friday, retained, later]} selected={retained.id} onSelect={select} />);
  expect(screen.getByRole("button", { name: "2026/10/30 금요일" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "2027/10/30 토요일" }));
  expect(select).toHaveBeenLastCalledWith("later");
});

function fixture() {
  const state = new EventLaboratoryStore().state(true);
  const event = state.events[0];
  event.campaign = undefined;
  const base = state.applications[0];
  const representative: PrivateApplication = { ...base, id: "representative-app", owner: "representative-owner", rank: 1,
    basic: { ...base.basic, nickname: "대표본인" }, payment: "reported", waivedAt: undefined,
    confirmedAt: "2026-10-30T12:00:00Z", quote: { fee: 20000, original: 20000, benefit: "기본", version: 1 } };
  const friend: PrivateApplication = { ...structuredClone(representative), id: "friend-app", owner: "pending-owner", rank: 2,
    sponsorOwner: representative.owner, companionDraftId: "friend-draft", basic: { nickname: "동반친구", birthYear: 1998, location: "서울" },
    quote: { fee: 18000, original: 20000, benefit: "선착순", version: 1 },
    companionSubmission: { submittedAt: "2026-10-30T12:00:00Z", permissionToProvideAt: "2026-10-30T12:00:00Z", personalConsentPending: true },
    combinedPaymentReport: { sponsorOwner: "representative-owner", batchId: "batch-1", at: "2026-10-30T12:01:00Z" } };
  representative.combinedPaymentReport = { ...friend.combinedPaymentReport! };
  const request: CompanionLinkRequest = { id: "request-123456", owner: "actual-friend-owner", eventId: event.id, at: "2026-10-30T12:10:00Z", revision: 2, status: "pending" };
  state.applications = [representative, friend];
  state.companionLinkRequests = [request];
  const hub: HubController = { state, status: "", error: "", mutate: vi.fn(async () => ({ saved: true })), load: vi.fn(), setError: vi.fn() };
  return { representative, friend, request, event, hub, state };
}

it("keeps group totals event-scoped and opens only the selected person's existing controls", () => {
  const { representative, friend, event } = fixture();
  const unrelated = { ...structuredClone(friend), id: "different-event", eventId: "other-event", rank: 5 };
  const groups = companionAdminGroups([representative, friend, unrelated]);
  expect(groups).toHaveLength(2);
  expect(groups.find(group => group.eventId === event.id)?.members.map(app => app.id)).toEqual([representative.id, friend.id]);
  const select = vi.fn();
  render(<CompanionAdminGroups applications={[representative, friend]} events={[event]} onSelect={select} />);
  fireEvent.click(screen.getByText("대표본인 · 2명 · 회비 합계 38,000원"));
  expect(screen.getByText(/동반친구 · 접수 2번 · 18,000원/)).toBeTruthy();
  expect(screen.getByText(/본인 동의 대기/)).toBeTruthy();
  expect(screen.getByText(/합산 신고 대상 · 대표본인 · 동반친구 · 현재 회비 38,000원 · 승인 개별 처리/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "동반친구 처리" }));
  expect(select).toHaveBeenCalledExactlyOnceWith(friend.id);
  expect(screen.queryByRole("button", { name: /일괄.*승인|전체.*승인/ })).toBeNull();
});

it("links only a persisted authenticated request after explicit identity confirmation and exact revisions", async () => {
  const { friend, request, hub } = fixture();
  const anotherEvent = { ...structuredClone(friend), id: "other-event-app", eventId: "other-event", basic: { ...friend.basic, nickname: "다른행사친구" } };
  render(<CompanionLinkRequests applications={[friend, anotherEvent]} hub={hub} />);
  const submit = screen.getByRole("button", { name: "본인 연결" }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  expect(screen.queryByRole("option", { name: /다른행사친구/ })).toBeNull();
  fireEvent.change(screen.getByLabelText(`연결할 친구 · ${request.id.slice(0, 8)}`), { target: { value: friend.id } });
  expect(submit.disabled).toBe(true);
  expect(hub.mutate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("요청자 본인과 선택한 친구가 같은 사람임을 확인했습니다."));
  fireEvent.click(submit);
  await waitFor(() => expect(hub.mutate).toHaveBeenCalledExactlyOnceWith({ action: "admin.companion.link", target: request.id, revision: request.revision,
    data: { eventId: friend.eventId, applicationId: friend.id, applicationRevision: friend.revision, identityChecked: true } }));
});

it("rejects a stale selection and requires a fresh identity check after another admin changes the application", () => {
  const { friend, request, hub } = fixture();
  const view = render(<CompanionLinkRequests applications={[friend]} hub={hub} />);
  const label = `연결할 친구 · ${request.id.slice(0, 8)}`;
  fireEvent.change(screen.getByLabelText(label), { target: { value: friend.id } });
  fireEvent.click(screen.getByLabelText("요청자 본인과 선택한 친구가 같은 사람임을 확인했습니다."));
  const newer = { ...friend, revision: friend.revision + 1 };
  view.rerender(<CompanionLinkRequests applications={[newer]} hub={hub} />);
  expect(screen.getByRole("alert").textContent).toContain("신청 정보가 바뀌었습니다");
  expect((screen.getByRole("button", { name: "본인 연결" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "다시 선택" }));
  fireEvent.change(screen.getByLabelText(label), { target: { value: newer.id } });
  expect((screen.getByLabelText("요청자 본인과 선택한 친구가 같은 사람임을 확인했습니다.") as HTMLInputElement).checked).toBe(false);
  expect(hub.mutate).not.toHaveBeenCalled();
});

it("uses existing single-person bank approval even for a combined deposit, preserving the other person's status", async () => {
  const { friend, representative, hub, state } = fixture();
  vi.stubGlobal("confirm", vi.fn(() => true));
  render(<ApplicationRoster applications={state.applications} hub={hub} />);
  fireEvent.click(screen.getByText("대표본인 · 2명 · 회비 합계 38,000원"));
  fireEvent.click(screen.getByRole("button", { name: "동반친구 처리" }));
  expect(screen.getByText("합산 입금 신고 · 이 참가자만 승인합니다.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "입금 승인" }));
  await waitFor(() => expect(hub.mutate).toHaveBeenCalledExactlyOnceWith({ action: "admin.application.payment", target: friend.id, revision: friend.revision,
    data: { status: "approved", bankChecked: true, testChecked: false } }));
  expect(representative.payment).toBe("reported");
  expect(friend.companionSubmission?.personalConsentPending).toBe(true);
});

it("renders benefit records safely before a companion provides their own phone", () => {
  const { friend, hub, state } = fixture();
  state.applications = [friend];
  render(<BenefitResults hub={hub} />);
  expect(screen.queryByText(/연락처 미입력/)).toBeNull();
  expect(screen.queryByLabelText(/전화번호|수령 연락처/)).toBeNull();
  expect(hub.mutate).not.toHaveBeenCalled();
});
