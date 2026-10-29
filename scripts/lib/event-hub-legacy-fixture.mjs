/** Explicit legacy-suite opt-out; only dedicated local fixture databases and APIs. */
const fixtureDatabases = new Set([
  "binpc2_hub_dev", "binpc2_hub_test", "binpc2_reset_test",
  "binpc2_hub_resume_dev", "binpc2_hub_handoff_dev",
  "binpc2_hub_test_resume", "binpc2_reset_test_resume",
  "binpc2_hub_load_v6", "binpc2_hub_browser_v4", "binpc2_hub_browser_v6", "binpc2_hub_browser_current",
]);
const fixturePorts = new Set([
  "3001", "3002", "3003", "3004", "3005", "3006",
  ...Array.from({ length: 10 }, (_, i) => String(8120 + i)),
]);

export async function prepareLegacyEventHubFixture({
  databaseUrl, baseUrl, adminToken, fetchImpl = globalThis.fetch,
}) {
  const db = new URL(databaseUrl);
  const api = new URL(baseUrl);
  if (!["postgres:", "postgresql:"].includes(db.protocol)
    || !["127.0.0.1", "localhost"].includes(db.hostname)
    || !fixtureDatabases.has(db.pathname.slice(1)) || db.hash
    || [...db.searchParams].some(([key, value]) => key !== "sslmode" || value !== "disable")) {
    throw new Error("Legacy suite opt-out requires a dedicated local fixture database");
  }
  if (api.protocol !== "http:" || api.hostname !== "127.0.0.1"
    || !fixturePorts.has(api.port) || api.pathname !== "/"
    || api.search || api.hash || api.username || api.password) {
    throw new Error("Legacy suite opt-out requires a dedicated loopback fixture API");
  }
  if (typeof adminToken !== "string" || !adminToken.trim()) {
    throw new Error("Legacy suite opt-out requires fixture administrator authentication");
  }
  async function laboratory(command) {
    const response = await fetchImpl(`${api.origin}/api/event-hub/laboratory`, {
      method: command ? "POST" : "GET",
      headers: { "content-type": "application/json", "x-admin-token": adminToken },
      ...(command ? { body: JSON.stringify(command) } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Isolated laboratory ${command?.operation ?? "read"} failed: HTTP ${response.status}`);
    }
    const body = await response.json();
    const mode = body?.mode;
    if (!mode || !Number.isSafeInteger(mode.generation) || mode.generation < 0
      || !Number.isSafeInteger(mode.revision) || mode.revision < 0
      || typeof mode.enabled !== "boolean" || typeof mode.publicAdmissionOpen !== "boolean") {
      throw new Error("Isolated laboratory returned invalid mode metadata");
    }
    return mode;
  }
  const current = await laboratory();
  // This endpoint resets only laboratory-workspace snapshots, never event/profile data.
  const reset = await laboratory({
    operation: "reset", generation: current.generation, revision: current.revision,
  });
  if (reset.dirty !== false || reset.generation !== current.generation + 1
    || reset.revision !== current.revision + 1 || reset.resetGeneration !== reset.generation) {
    throw new Error("Isolated laboratory reset was not acknowledged");
  }
  const off = await laboratory({
    operation: "mode", enabled: false,
    generation: reset.generation, revision: reset.revision,
    resetGeneration: reset.generation,
  });
  if (off.enabled || off.publicAdmissionOpen || off.dirty !== false || off.generation !== reset.generation
    || off.revision !== reset.revision + 1 || off.resetGeneration !== off.generation) {
    throw new Error("Isolated laboratory mode remained enabled");
  }
  // Only these allowlisted loopback fixtures explicitly open synthetic admission.
  // Disabling test mode alone must never perform this transition.
  const opened = await laboratory({
    operation: "admission", open: true, confirmOpen: true,
    generation: off.generation, revision: off.revision,
  });
  if (opened.enabled || !opened.publicAdmissionOpen || !opened.admissionOpenedAt
    || opened.generation !== off.generation || opened.revision !== off.revision + 1) {
    throw new Error("Isolated fixture admission was not explicitly acknowledged");
  }
  return { enabled: opened.enabled, publicAdmissionOpen: opened.publicAdmissionOpen,
    generation: opened.generation, revision: opened.revision };
}
