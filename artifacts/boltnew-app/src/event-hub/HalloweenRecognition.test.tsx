// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HalloweenRecognitionAdmin, HalloweenRecognitionNotice } from "./HalloweenRecognition";
import type { HubController, PrivateApplication } from "../lib/event-hub-client";

afterEach(cleanup);
const app = { id: "synthetic-application", eventId: "synthetic-event", revision: 7 } as PrivateApplication;
const controller = (kind = "halloween-friday") => ({
  status: "ready",
  state: { events: [{ id: app.eventId, campaign: { kind } }] },
  mutate: vi.fn(),
}) as unknown as HubController;

it("requires an operator reason and submits recognition with the current application revision", () => {
  const hub = controller();
  render(<HalloweenRecognitionAdmin app={app} hub={hub} />);
  fireEvent.click(screen.getByText("코스튬·페인팅·스티커 인정"));
  const save = screen.getByRole("button", { name: "인정 결과·회비 안내 저장" }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("운영자 분장 인정"), { target: { value: "costume" } });
  fireEvent.change(screen.getByLabelText("분장 인정·변경 사유"), { target: { value: "현장 확인" } });
  expect(save.disabled).toBe(false);
  fireEvent.click(save);
  expect(hub.mutate).toHaveBeenCalledWith({ action: "admin.application.costume", target: app.id, revision: 7, data: { kind: "costume", reason: "현장 확인" } });
});

it("shows the saved participant notice without a recognition control", () => {
  render(<HalloweenRecognitionNotice app={{ ...app, halloweenRecognition: {
    kind: "costume", at: "2026-10-30T13:30:00Z", finalFee: 23000, proposedFee: 15000,
    participantNotice: "기존 확정 금액 23,000원 유지. 관리자 별도 안내를 확인해 주세요.",
  } }} />);
  expect(screen.getByText(/기존 확정 금액 23,000원 유지/)).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
});

it("keeps the costume action out of tour applications", () => {
  render(<HalloweenRecognitionAdmin app={app} hub={controller("tour")} />);
  expect(screen.queryByText("코스튬·페인팅·스티커 인정")).toBeNull();
});
