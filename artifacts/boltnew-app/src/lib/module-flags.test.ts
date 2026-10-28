import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODULE_FLAGS,
  parseModuleFlags,
  serializeModuleFlags,
} from "./module-flags";

describe("module-flags", () => {
  it("preserves current module defaults and keeps the new event hub opt-in", () => {
    expect(parseModuleFlags(undefined)).toEqual(DEFAULT_MODULE_FLAGS);
    expect(parseModuleFlags(null)).toMatchObject({
      hearts: true,
      direct_chat: true,
      group_chat: true,
      contact_qr: true,
      stats: true,
      ranking: true,
      push: true,
      event_hub: false,
      seasonal_landing: true,
    });
    expect(parseModuleFlags(serializeModuleFlags({ seasonal_landing: false }))).toMatchObject({ seasonal_landing: false, event_hub: false, hearts: true, direct_chat: true });
  });

  it("supports safe partial soft-detach", () => {
    expect(parseModuleFlags('{"group_chat":false}')).toEqual({
      ...DEFAULT_MODULE_FLAGS,
      group_chat: false,
    });
  });

  it("canonicalizes malformed/extra input", () => {
    expect(parseModuleFlags("{oops")).toEqual(DEFAULT_MODULE_FLAGS);
    expect(
      JSON.parse(serializeModuleFlags({ push: false, unknown: false })),
    ).toEqual({
      ...DEFAULT_MODULE_FLAGS,
      push: false,
    });
  });
});
