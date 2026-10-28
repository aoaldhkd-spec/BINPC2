/** Explicit isolated-development fixtures. Never accepts a remote database or API. */
import { createRequire } from "node:module";
import { createHmac } from "node:crypto";
import { readFile, mkdir, writeFile, appendFile } from "node:fs/promises";
import { prepareLegacyEventHubFixture } from "./lib/event-hub-legacy-fixture.mjs";
const require = createRequire(
  new URL("../artifacts/api-server/package.json", import.meta.url),
);
const { Pool } = require("pg");
if (!["development", "test"].includes(process.env.NODE_ENV))
  throw new Error("Set NODE_ENV=development or test for isolated fixtures");
const mode = process.argv[2];
const names = new Set([
  "binpc2_hub_dev",
  "binpc2_hub_test",
  "binpc2_reset_test",
  "binpc2_hub_resume_dev",
  "binpc2_hub_handoff_dev",
  "binpc2_hub_test_resume",
  "binpc2_reset_test_resume",
]);
function localDb(raw) {
  if (!raw) throw new Error("An explicit isolated database URL is required");
  const url = new URL(raw);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hash ||
    [...url.searchParams].some(
      ([key, value]) => key !== "sslmode" || value !== "disable",
    ) ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    !names.has(url.pathname.slice(1))
  )
    throw new Error("Refusing to modify a non-fixture database");
  return url;
}
if (mode === "database") {
  const migration = await readFile(
    new URL(
      "../artifacts/api-server/migrations/20261027_event_hub.sql",
      import.meta.url,
    ),
    "utf8",
  );
  for (const raw of [
    process.env.DATABASE_URL,
    process.env.HUB_TEST_DATABASE_URL,
    process.env.TEST_DATABASE_URL,
  ]) {
    const url = localDb(raw),
      name = url.pathname.slice(1),
      admin = new URL(url);
    admin.pathname = "/postgres";
    const db = new Pool({ connectionString: admin.href });
    try {
      const exists = await db.query(
        "SELECT 1 FROM pg_database WHERE datname=$1",
        [name],
      );
      if (!exists.rows.length) await db.query(`CREATE DATABASE "${name}"`);
    } finally {
      await db.end();
    }
    if (name.startsWith("binpc2_hub_")) {
      const isolated = new Pool({ connectionString: url.href });
      try {
        await isolated.query(migration);
      } finally {
        await isolated.end();
      }
    }
  }
  console.log("Isolated fixture databases and additive hub schema prepared.");
} else if (mode === "activate") {
  localDb(process.env.DATABASE_URL);
  const base = process.env.HUB_E2E_BASE_URL;
  if (!["http://127.0.0.1:3001", "http://127.0.0.1:3002"].includes(base))
    throw new Error("Only the dedicated local E2E API proxy is accepted");
  if (!process.env.SESSION_SECRET)
    throw new Error("The local API session binding is required");
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "116606";
  const token = createHmac("sha256", process.env.SESSION_SECRET + password)
    .update("admin-session")
    .digest("hex");
  await prepareLegacyEventHubFixture({
    databaseUrl: process.env.DATABASE_URL, baseUrl: base, adminToken: token,
  });
  for (const [name, args] of [
    [
      "admin_update_settings",
      { p_payload: { module_flags: { event_hub: true },admin_phone:"010-0000-0000",qr_base_url:"https://example.invalid/fixture" } },
    ],
    ["admin_toggle_session", { p_active: true }],
  ]) {
    const response = await fetch(`${base}/api/db/rpc/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...args, adminToken: token }),
    });
    const body = await response.json();
    if (!response.ok || body.error)
      throw new Error(
        `Isolated fixture activation failed: ${name} HTTP ${response.status}`,
      );
  }
  if (process.env.GITHUB_ENV)
    await appendFile(process.env.GITHUB_ENV, `HUB_E2E_ADMIN_TOKEN=${token}\n`);
  else {
    const dir = new URL("../.local/event-hub/", import.meta.url);
    await mkdir(dir, { recursive: true });
    await writeFile(
      new URL(
        base.endsWith(":3002") ? "browser-resume.env" : "browser.env",
        dir,
      ),
      `# Generated local E2E authentication; do not commit or display values.\nHUB_E2E_BASE_URL=${base}\nHUB_E2E_ADMIN_TOKEN=${token}\n`,
      { mode: 0o600 },
    );
  }
  console.log(
    "Dedicated local hub fixture enabled; browser test binding saved without displaying it.",
  );
} else throw new Error("Use database or activate");
