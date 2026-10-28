// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { WaitingOverlay } from "./WaitingOverlay";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("V4 central entry waits for the authoritative cycle, keeps recovery, and omits retired home banners", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-30T22:30:00+09:00"));
  const onEnter = vi.fn();
  const { rerender } = render(
    <WaitingOverlay sessionActive={null} onEnter={onEnter} />,
  );
  const entry = screen.getByRole("button", {
    name: "입장하기",
  }) as HTMLButtonElement;
  expect(entry.disabled).toBe(true);
  expect(
    screen.getByRole("link", { name: "술번개 신청" }).getAttribute("href"),
  ).toBe("/events");
  expect(
    screen.getByRole("link", { name: "신청대기방" }).getAttribute("href"),
  ).toBe("/events/waiting");
  expect(
    screen.getByRole("button", { name: /고유번호로 프로필 복구/ }),
  ).toBeTruthy();
  expect(screen.queryByText("입장 전 체크")).toBeNull();
  expect(screen.queryByText("모임이 시작되었습니다")).toBeNull();
  rerender(
    <WaitingOverlay
      sessionActive={false}
      eventCycleStartedAt="2026-10-30T22:30:00+09:00"
      eventCycleResetComplete={false}
      onEnter={onEnter}
    />,
  );
  expect(entry.disabled).toBe(true);
  rerender(
    <WaitingOverlay
      sessionActive
      eventCycleStartedAt="2026-10-30T22:30:00+09:00"
      eventCycleResetComplete={false}
      onEnter={onEnter}
    />,
  );
  expect(entry.disabled).toBe(false);
  rerender(
    <WaitingOverlay
      sessionActive
      eventCycleStartedAt="2026-10-29T22:30:00+09:00"
      eventCycleResetComplete={false}
      onEnter={onEnter}
    />,
  );
  expect(entry.disabled).toBe(true);
});
it("V4 01:00 closes only new entry and leaves the existing recovery route visible", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-31T01:00:00+09:00"));
  render(
    <WaitingOverlay
      sessionActive
      eventCycleStartedAt="2026-10-30T22:30:00+09:00"
      eventCycleResetComplete={false}
      onEnter={() => {}}
    />,
  );
  expect(
    (screen.getByRole("button", { name: "입장하기" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    screen.getByRole("button", { name: /고유번호로 프로필 복구/ }),
  ).toBeTruthy();
});
it('home Halloween expires at Nov 1 17:00 KST without changing admission or recovery', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-01T16:59:59+09:00'));
  const {container,rerender}=render(<WaitingOverlay sessionActive={false} onEnter={()=>{}}/>);
  expect(container.querySelector('[data-landing-season="halloween"]')).toBeTruthy();
  expect((screen.getByRole('button',{name:'입장하기'}) as HTMLButtonElement).disabled).toBe(true);
  const {act}=await import('@testing-library/react');act(()=>vi.advanceTimersByTime(1000));
  expect(container.querySelector('[data-landing-season="normal"]')).toBeTruthy();
  expect(screen.getByRole('button',{name:/고유번호로 프로필 복구/})).toBeTruthy();
  vi.setSystemTime(new Date('2026-10-28T20:00:00+09:00'));
  rerender(<WaitingOverlay sessionActive={false} landingThemeEnabled={false} onEnter={()=>{}}/>);
  expect(container.querySelector('img[src="/event-art/halloween-lounge.webp"]')).toBeNull();
});
