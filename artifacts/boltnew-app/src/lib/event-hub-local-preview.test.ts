import { describe, it, expect } from "vitest";
import { localDevAdminOrigin } from "../../vite-dev-admin-session";
describe("local-only developer admin bridge", () => {
  it("requires explicit local mode and refuses a production/default target", () => {
    expect(localDevAdminOrigin({})).toBeNull();
    expect(
      localDevAdminOrigin({ API_PUBLIC_URL: "http://127.0.0.1:8082" }),
    ).toBeNull();
    expect(
      localDevAdminOrigin({
        LOCAL_API: "1",
        API_PUBLIC_URL: "https://binpc2.onrender.com",
      }),
    ).toBeNull();
    expect(
      localDevAdminOrigin({
        LOCAL_API: "1",
        API_PUBLIC_URL: "http://127.0.0.1:8082",
      }),
    ).toBe("http://127.0.0.1:8082");
  });
  it("rejects misleading hosts, embedded credentials and URL routes", () => {
    for (const url of [
      "http://127.0.0.1.evil.test",
      "http://localhost@evil.test",
      "http://secret@localhost:8082",
      "http://localhost:8082/api",
      "http://localhost:8082/?secret=1",
      "http://localhost:8082/#secret",
    ])
      expect(
        localDevAdminOrigin({ LOCAL_API: "1", API_PUBLIC_URL: url }),
      ).toBeNull();
  });
});
