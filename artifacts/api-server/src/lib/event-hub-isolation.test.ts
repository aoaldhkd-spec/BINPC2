import { describe, it, expect } from "vitest";
import { isolatedFixtureDatabase } from "./event-hub-isolation.js";
describe("destructive test database isolation", () => {
  it("permits only named localhost PostgreSQL fixtures", () => {
    expect(
      isolatedFixtureDatabase(
        "postgres://postgres@127.0.0.1:5432/binpc2_hub_test_resume?sslmode=disable",
        ["binpc2_hub_test_resume"],
      ).hostname,
    ).toBe("127.0.0.1");
    for (const raw of [
      "postgres://postgres@remote.test/binpc2_hub_test_resume",
      "postgres://postgres@127.0.0.1/production",
      "postgres://postgres@127.0.0.1/binpc2_hub_test_resume?host=remote.test",
      "postgres://postgres@127.0.0.1/binpc2_hub_test_resume?options=-hremote",
      "https://127.0.0.1/binpc2_hub_test_resume",
    ])
      expect(() =>
        isolatedFixtureDatabase(raw, ["binpc2_hub_test_resume"]),
      ).toThrow();
  });
});
