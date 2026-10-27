// @vitest-environment happy-dom
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  readHubBrowserValue,
  writeHubBrowserValue,
  canStoreHubOnsiteIdentity,
} from "./event-hub-browser-storage";
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});
describe("event hub browser storage limitations", () => {
  it("keeps existing identity data intact and removes only its temporary probes", () => {
    localStorage.setItem("matching_app_user_id", "existing");
    expect(canStoreHubOnsiteIdentity()).toBe(true);
    expect(localStorage.getItem("matching_app_user_id")).toBe("existing");
    expect(
      Object.keys(localStorage).filter((k) =>
        k.startsWith("binpc2_hub_probe_"),
      ),
    ).toEqual([]);
    expect(sessionStorage.length).toBe(0);
  });
  it("handles blocked local storage without crashing and refuses live admission storage", () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(readHubBrowserValue("local", "dark_mode")).toBeNull();
    expect(writeHubBrowserValue("local", "draft", "value")).toBe(false);
    expect(canStoreHubOnsiteIdentity()).toBe(false);
  });
  it("also requires session storage and cleans a successful local probe if session storage is blocked", () => {
    vi.spyOn(sessionStorage, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(canStoreHubOnsiteIdentity()).toBe(false);
    expect(localStorage.length).toBe(0);
  });
});
