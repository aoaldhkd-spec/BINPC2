// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MediaManager, NoticeEditor } from "./MediaManager";
import type { HubController, HubEvent } from "../lib/event-hub-client";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("retries a failed protected preview without uploading, replacing or deleting its saved original", async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(Error("temporary offline"))
    .mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["synthetic image"]),
    });
  vi.stubGlobal("fetch", fetch);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:retried-preview");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const mutate = vi.fn();
  const hub = { mutate, status: "idle" } as unknown as HubController;
  const event = {
    id: "saved-event",
    revision: 3,
    media: ["/api/event-hub/media/saved-image"],
    materials: [
      {
        id: "saved-image",
        url: "/api/event-hub/media/saved-image",
        purpose: "map",
        alt: "저장한 지도",
        hidden: false,
      },
    ],
  } as unknown as HubEvent;
  const view = render(<MediaManager event={event} hub={hub} />);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "기존 이미지 선택 (1)" }));
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("미리보기", { selector: "summary" }));
  await screen.findByText(/저장한 원본은 그대로 있습니다/);
  fireEvent.click(
    screen.getByRole("button", { name: "미리보기 다시 불러오기" }),
  );
  await waitFor(() =>
    expect(screen.getByAltText("저장한 지도").getAttribute("src")).toBe(
      "blob:retried-preview",
    ),
  );
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(
    fetch.mock.calls.every(
      ([url, options]) =>
        url === "/api/event-hub/media/saved-image" &&
        options.credentials === "include",
    ),
  ).toBe(true);
  expect(mutate).not.toHaveBeenCalled();
  view.unmount();
  expect(revoke).toHaveBeenCalledWith("blob:retried-preview");
});


function editableEvent(): HubEvent {
  return { id: "editable-event", revision: 7, title: "공지 시험", type: "normal", date: "2026-10-30", start: "22:00", end: "01:00", area: "부산", address: "기존 승인자 주소", mapUrl: "", notice: "기존 공지", media: [], materials: [], history: [], noticeVersion: 1 } as unknown as HubEvent;
}
function controller(event: HubEvent): HubController {
  return { status: "", error: "", state: { events: [event] }, load: vi.fn(async () => ({ events: [event] })), mutate: vi.fn(async () => ({ id: event.id })), setError: vi.fn() } as unknown as HubController;
}

it("requires public confirmation, immediately locks duplicate saves, and retains selected files after failure", async () => {
  const event = editableEvent(), hub = controller(event);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:selected-notice");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  let finish!: (value: { events: HubEvent[] }) => void;
  hub.load = vi.fn(() => new Promise(resolve => { finish = resolve; })) as unknown as HubController["load"];
  hub.mutate = vi.fn(async () => null);
  render(<MediaManager event={event} hub={hub} fixedPurpose="notice" />);
  fireEvent.change(screen.getByLabelText("공지 사진 파일 선택"), { target: { files: [new File(["image bytes"], "selected.png", { type: "image/png" })] } });
  const save = screen.getByRole("button", { name: "저장" }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.click(screen.getByLabelText("신청 전 공개할 사진입니다. 계좌·상세 장소·개인정보가 없는지 확인했습니다."));
  fireEvent.click(save); fireEvent.click(save);
  expect(hub.load).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "저장 중…" })).toBeTruthy();
  expect(screen.queryByText("사진 저장 완료")).toBeNull();
  finish({ events: [event] });
  await waitFor(() => expect(hub.mutate).toHaveBeenCalledTimes(1));
  await waitFor(() => expect((screen.getByRole("button", { name: "저장" }) as HTMLButtonElement).disabled).toBe(false));
  expect(screen.getByText(/selected.png/)).toBeTruthy();
  expect(hub.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "event.media.upload", data: expect.objectContaining({ purpose: "notice", publicConfirmed: true }) }));
});

it("designates only an existing public notice as cover while retaining every private original", async () => {
  const event = editableEvent();
  event.materials = [
    { id: "map", url: "/private-map.png", purpose: "map", alt: "지도", hidden: false, at: "2026-10-30T00:00:00Z" },
    { id: "notice-one", url: "/notice-one.png", purpose: "notice", alt: "공지1", hidden: false, at: "2026-10-30T00:00:00Z" },
    { id: "notice-two", url: "/notice-two.png", purpose: "notice", alt: "공지2", hidden: true, at: "2026-10-30T00:00:00Z" },
  ];
  event.media = ["/private-map.png", "/notice-one.png"];
  const hub = controller(event);
  render(<MediaManager event={event} hub={hub} coverMode />);
  fireEvent.click(screen.getByRole("button", { name: "기존 이미지 선택 (3)" }));
  const mapArticle = screen.getByDisplayValue("지도").closest("article")!;
  expect(mapArticle.textContent).not.toContain("대표 이미지 지정");
  const article = screen.getByDisplayValue("공지2").closest("article")!;
  fireEvent.click(Array.from(article.querySelectorAll("button")).find(button => button.textContent === "대표 이미지 지정")!);
  await waitFor(() => expect(hub.mutate).toHaveBeenCalledExactlyOnceWith({ action: "event.media.update", target: event.id, revision: 7, data: { items: [
    { id: "notice-two", alt: "공지2", hidden: false }, { id: "map", alt: "지도", hidden: false }, { id: "notice-one", alt: "공지1", hidden: false },
  ] } }));
  expect(event.materials).toHaveLength(3);
  expect(event.materials[2].hidden).toBe(true);
});

it("preserves unsaved notice and map drafts across tabs and a conflicting save", async () => {
  const event = editableEvent(), hub = controller(event);
  hub.load = vi.fn(async () => ({ events: [{ ...event, revision: 8, notice: "다른 관리자의 변경" }] })) as unknown as HubController["load"];
  const drafts = {};
  render(<NoticeEditor event={event} hub={hub} drafts={drafts} />);
  fireEvent.change(screen.getByLabelText("참가자 공지"), { target: { value: "작성 중 공지" } });
  fireEvent.click(screen.getByRole("tab", { name: "지도·장소" }));
  fireEvent.change(screen.getByLabelText("상세 주소·층수"), { target: { value: "작성 중 장소" } });
  fireEvent.click(screen.getByRole("tab", { name: "공지사항" }));
  expect((screen.getByLabelText("참가자 공지") as HTMLTextAreaElement).value).toBe("작성 중 공지");
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(hub.setError).toHaveBeenCalledWith(expect.stringContaining("다른 관리자가")));
  expect(hub.mutate).not.toHaveBeenCalled();
  expect((screen.getByLabelText("상세 주소·층수") as HTMLInputElement).value).toBe("작성 중 장소");
  expect(screen.queryByText("공지·장소 저장 완료")).toBeNull();
});

it("replaces through one atomic upload command without unlinking the old original first", async () => {
  const event = editableEvent();
  event.materials = [{ id: "existing-map", url: "/saved-map.png", purpose: "map", alt: "기존 지도", hidden: false, at: "2026-10-30T00:00:00Z" }];
  event.media = ["/saved-map.png"];
  const hub = controller(event);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:replacement-map");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  render(<MediaManager event={event} hub={hub} fixedPurpose="map" />);
  fireEvent.click(screen.getByRole("button", { name: "기존 이미지 선택 (1)" }));
  fireEvent.click(screen.getByRole("button", { name: "교체" }));
  expect(hub.mutate).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("지도·약도 사진 파일 선택"), { target: { files: [new File(["new image"], "replacement.png", { type: "image/png" })] } });
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await screen.findByText("사진 저장 완료");
  expect(hub.mutate).toHaveBeenCalledTimes(1);
  expect(hub.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: "event.media.upload", target: event.id, revision: event.revision,
    data: expect.objectContaining({ purpose: "map", replaceId: "existing-map", publicConfirmed: false }) }));
  expect(event.materials[0].hidden).toBe(false);
});
