import { it, expect } from "vitest";
import { persistenceFailureCode } from "./persistence-failure.js";
import { eventHubRateIdentity } from "./rate-limit-identity.js";
it("classifies pool saturation, DB locks and restart without exposing raw detail", () => {
  expect(
    persistenceFailureCode(
      Error("timeout exceeded when trying to connect; private.example/db"),
    ),
  ).toBe("POOL_CONNECTION_TIMEOUT");
  expect(
    persistenceFailureCode({ code: "55P03", message: "private query" }),
  ).toBe("DB_LOCK_TIMEOUT");
  expect(persistenceFailureCode({ code: "40P01" })).toBe("DB_DEADLOCK");
  expect(persistenceFailureCode({ code: "57P01" })).toBe("DB_RESTARTING");
  expect(persistenceFailureCode({ code: "person@email.test" })).toBe("UNKNOWN");
});
it("uses authenticated hub owners on venue NAT without removing anonymous limits", () => {
  expect(
    eventHubRateIdentity("hub-mutate", {
      hubOwner: "signed-owner",
      userId: "onsite-id",
    }),
  ).toBe("hub:signed-owner");
  expect(eventHubRateIdentity("hub-mutate", {})).toBe("");
  expect(eventHubRateIdentity("hub-session", {})).toBe("");
  expect(eventHubRateIdentity("op", { userId: "id" })).toBeUndefined();
});
