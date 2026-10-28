// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  EventArtwork,
  EventDetailHeader,
  EventListCard,
  eventDateLabel,
} from "./EventPresentation";
import type { HubEvent, PrivateApplication } from "../lib/event-hub-client";
const event = {
  id: "halloween-fri",
  title: "할로윈 술번개",
  type: "halloween",
  date: "2026-10-30",
  start: "22:30",
  end: "01:00",
  area: "부산",
  theme: "halloween",
  themeEnabled: true,
  recruitment: true,
  notice: "신분증을 준비해 주세요.",
  media: [],
  materials: [],
  fee: 23000,
} as unknown as HubEvent;
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("keeps canonical Friday/Saturday dates and hides fees and protected map media in the public card", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-30T13:30:00Z"));
  const e = {
    ...event,
    media: ["/private-map.png"],
    materials: [{ id: "map", purpose: "map", url: "/private-map.png" }],
  } as HubEvent;
  const open = vi.fn();
  const v = render(<EventListCard event={e} now={new Date()} onOpen={open} />);
  expect(eventDateLabel(event)).toBe("10월 30일 (금)");
  expect(eventDateLabel({ ...event, date: "2026-10-31" })).toBe(
    "10월 31일 (토)",
  );
  expect(v.container.textContent).not.toContain("23,000");
  expect(v.container.querySelector('img[src="/private-map.png"]')).toBeNull();
  expect(v.container.querySelector("button a,button button")).toBeNull();
  fireEvent.click(screen.getByRole("button"));
  expect(open).toHaveBeenCalledTimes(1);
});
it("uses only a visible notice explicitly projected into media as a cover", () => {
  const materials = [
    { id: "hidden", purpose: "notice", url: "/hidden.png", hidden: true },
    { id: "legacy", purpose: "notice", url: "/not-public.png" },
    { id: "visible", purpose: "notice", url: "/public.png", alt: "공개 안내" },
  ].map((m) => ({
    hidden: false,
    at: "2026-10-30T13:00:00Z",
    ...m,
  })) as HubEvent["materials"];
  const v = render(
    <EventArtwork
      event={{
        ...event,
        themeEnabled: false,
        media: ["/hidden.png", "/public.png"],
        materials,
      }}
    />,
  );
  expect(v.container.querySelector("img")?.getAttribute("src")).toBe(
    "/public.png",
  );
  expect(v.container.querySelector("a,button")).toBeNull();
});
it("ends decorative Halloween artwork at the event-specific 17:00 expiry, keeping notices and schedule", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-31T07:59:59Z"));
  const v = render(<EventArtwork event={event} />);
  expect(screen.queryByAltText("할로윈 행사 분위기 일러스트")).not.toBeNull();
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.queryByAltText("할로윈 행사 분위기 일러스트")).toBeNull();
  v.unmount();
  render(<EventDetailHeader event={event} />);
  expect(screen.queryByAltText("할로윈 행사 분위기 일러스트")).toBeNull();
  expect(screen.getByText("신분증을 준비해 주세요.")).toBeTruthy();
  expect(screen.getByText(/22:30~익일 01:00/)).toBeTruthy();
});
it("never reveals a leaked location field without payment approval and keeps the map tab locked", () => {
  const app = {
    payment: "reported",
    venue: {
      address: "승인 전 비공개 주소",
      mapUrl: "https://example.invalid/private",
    },
  } as PrivateApplication;
  const v = render(<EventDetailHeader event={event} app={app} />);
  fireEvent.click(screen.getByRole("tab", { name: "위치·지도" }));
  expect(v.container.textContent).not.toContain("승인 전 비공개 주소");
  expect(v.container.querySelector('a[href*="private"]')).toBeNull();
  expect(screen.getByText("상세 장소는 승인 후 열려요")).toBeTruthy();
});
