// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MediaManager } from "./MediaManager";
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
