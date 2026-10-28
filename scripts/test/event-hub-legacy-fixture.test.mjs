import test from "node:test";
import assert from "node:assert/strict";
import { prepareLegacyEventHubFixture } from "../lib/event-hub-legacy-fixture.mjs";

const fixture = {
  databaseUrl: "postgresql://fixture:fixture@127.0.0.1:5432/binpc2_hub_test?sslmode=disable",
  baseUrl: "http://127.0.0.1:3001",
  adminToken: "isolated-fixture-admin-token",
};

function laboratoryMock() {
  const requests = [];
  let mode = { enabled: true, publicAdmissionOpen: false, admissionOpenedAt: null,
    generation: 7, revision: 11, dirty: true, resetGeneration: null };
  const fetchImpl = async (url, options) => {
    const command = options.body ? JSON.parse(options.body) : undefined;
    requests.push({ url, options, command });
    if (command) {
      assert.equal(command.generation, mode.generation);
      assert.equal(command.revision, mode.revision);
    }
    if (command?.operation === "reset") {
      mode = { ...mode, generation: 8, revision: 12, dirty: false, resetGeneration: 8 };
    } else if (command?.operation === "mode") {
      assert.equal(command.resetGeneration, 8);
      assert.equal(command.enabled, false);
      mode = { ...mode, enabled: false, revision: 13 };
    } else if (command?.operation === "admission") {
      assert.equal(command.open, true);
      assert.equal(command.confirmOpen, true);
      assert.equal(mode.enabled, false);
      assert.equal(mode.publicAdmissionOpen, false);
      mode = { ...mode, publicAdmissionOpen: true, admissionOpenedAt: "2026-10-29T00:00:00Z", revision: 14 };
    }
    return { ok: true, status: 200, json: async () => ({ mode: { ...mode }, workspaces: {} }) };
  };
  return { requests, fetchImpl };
}

test("legacy fixture authenticates, resets, disables mode without opening and explicitly opens synthetic admission", async () => {
  const mock = laboratoryMock();
  const result = await prepareLegacyEventHubFixture({ ...fixture, fetchImpl: mock.fetchImpl });
  assert.deepEqual(result, { enabled: false, publicAdmissionOpen: true, generation: 8, revision: 14 });
  assert.equal(mock.requests.length, 4);
  assert.deepEqual(mock.requests.map(({ command }) => command?.operation), [undefined, "reset", "mode", "admission"]);
  for (const { url, options } of mock.requests) {
    assert.equal(url, "http://127.0.0.1:3001/api/event-hub/laboratory");
    assert.equal(options.headers["x-admin-token"], fixture.adminToken);
    assert.equal(options.redirect, "error");
  }
});

test("non-fixture databases, remote APIs and missing admin authentication fail before requests", async () => {
  for (const change of [
    { databaseUrl: "postgresql://fixture@db.example.com/binpc2_hub_test" },
    { databaseUrl: "postgresql://fixture@localhost/production" },
    { databaseUrl: `${fixture.databaseUrl}&host=db.example.com` },
    { baseUrl: "https://events.example.com" },
    { baseUrl: "http://127.0.0.1:8080" },
    { baseUrl: "http://127.0.0.1:3001/api" },
    { adminToken: "" },
  ]) {
    const mock = laboratoryMock();
    await assert.rejects(prepareLegacyEventHubFixture({ ...fixture, ...change, fetchImpl: mock.fetchImpl }));
    assert.equal(mock.requests.length, 0);
  }
});

test("failed or stale reset prevents mode OFF", async () => {
  for (const status of [403, 409, 503]) {
    const mock = laboratoryMock();
    const fetchImpl = async (url, options) => options.method === "GET"
      ? mock.fetchImpl(url, options)
      : { ok: false, status, json: async () => ({}) };
    await assert.rejects(prepareLegacyEventHubFixture({ ...fixture, fetchImpl }), new RegExp(`HTTP ${status}`));
    assert.equal(mock.requests.length, 1);
  }
});

test("unacknowledged reset cannot disable the guard", async () => {
  const calls = [];
  const fetchImpl = async (_url, options) => {
    calls.push(options);
    return { ok: true, status: 200, json: async () => ({
      mode: { enabled: true, publicAdmissionOpen: false, generation: 0, revision: 0, dirty: true, resetGeneration: null },
    }) };
  };
  await assert.rejects(prepareLegacyEventHubFixture({ ...fixture, fetchImpl }), /reset was not acknowledged/);
  assert.equal(calls.length, 2);
});
