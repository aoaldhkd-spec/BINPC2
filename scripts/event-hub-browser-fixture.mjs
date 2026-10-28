/** Dedicated local actual-app browser fixture; no external listener or operational DB. */
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir, open } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareLegacyEventHubFixture } from "./lib/event-hub-legacy-fixture.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  require = createRequire(root + "/artifacts/api-server/package.json"),
  { Pool } = require("pg"),
  out = root + "/.local/v6-finish";
await mkdir(out, { recursive: true });
const v4=process.argv.includes("--v4");
const configFile=out+(v4?"/browser-v4-private-env.json":"/browser-private-env.json");
const dbName = v4?"binpc2_hub_browser_v4":"binpc2_hub_browser_v6",
  dbUrl = `postgresql://postgres@127.0.0.1:5432/${dbName}?sslmode=disable`,
  adminDb = new Pool({
    connectionString:
      "postgresql://postgres@127.0.0.1:5432/postgres?sslmode=disable",
    max: 1,
  });
const exists = (
  await adminDb.query("SELECT 1 FROM pg_database WHERE datname=$1", [dbName])
).rowCount;
if (!exists) await adminDb.query(`CREATE DATABASE ${dbName}`);
await adminDb.end();
let cfg;
try {
  cfg = JSON.parse(await readFile(configFile, "utf8"));
} catch {
  if (exists)
    throw Error(
      "Refusing to replace a missing key for an existing fixture database",
    );
  const timing = JSON.parse(
    await readFile(out + "/load-private-env.json", "utf8"),
  );
  cfg = {
    DATABASE_URL: dbUrl,
    SESSION_SECRET: randomBytes(48).toString("hex"),
    BOOTSTRAP_ADMIN_PASSWORD: randomBytes(32).toString("hex"),
    BOOTSTRAP_TEST_PASSWORD: randomBytes(32).toString("hex"),
    HUB_LOAD_CLOCK_OFFSET_MS: v4 ? String(Date.parse("2026-10-30T14:10:00Z")-Date.now()) : timing.HUB_LOAD_CLOCK_OFFSET_MS,
  };
  await writeFile(configFile, JSON.stringify(cfg), {
    mode: 0o600,
  });
}
if (cfg.DATABASE_URL !== dbUrl) throw Error("Refusing a non-fixture database");
const pool = new Pool({ connectionString: dbUrl, max: 1 });
await pool.query(
  await readFile(
    root + "/artifacts/api-server/migrations/20261027_event_hub.sql",
    "utf8",
  ),
);
await pool.query(
  "CREATE TABLE IF NOT EXISTS app_kv_rows(table_name text NOT NULL,row_id text NOT NULL,data jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(table_name,row_id))",
);
await pool.query(
  "INSERT INTO app_kv_rows(table_name,row_id,data) VALUES('app_settings','1',$1) ON CONFLICT DO NOTHING",
  [
    JSON.stringify({
      id: 1,
      session_active: false,
      event_cycle_reset_complete: true,
      admin_phone: "010-0000-0000",
      admin_password: cfg.BOOTSTRAP_ADMIN_PASSWORD,
      test_password: cfg.BOOTSTRAP_TEST_PASSWORD,
      reset_password: cfg.BOOTSTRAP_ADMIN_PASSWORD,
      entry_password: "internal-only",
      module_flags: JSON.stringify({ event_hub: true, push: false }),
      qr_base_url: "https://example.invalid/fixture",
    }),
  ],
);
await pool.end();
const apiPort = process.argv.includes("--v4") ? 8127 : process.argv.includes("--fresh") ? 8122 : 8121,
  webPort = process.argv.includes("--v4") ? 3006 : process.argv.includes("--fresh") ? 3005 : 3003;
const apiLog = await open(out + "/browser-api-private.log", "a"),
  webLog = await open(out + "/browser-vite-private.log", "a"),
  env = {
    PATH: process.env.PATH,
    COREPACK_HOME: process.env.COREPACK_HOME,
    ...cfg,
    NODE_ENV: "development",
    PG_POOL_MAX: "10",
  };
const api = spawn(
  process.execPath,
  [
    "--import",
    root + "/scripts/event-hub-load-clock.mjs",
    root + "/artifacts/api-server/dist/index.mjs",
  ],
  {
    cwd: root + "/artifacts/api-server",
    env: { ...env, PORT: String(apiPort) },
    stdio: ["ignore", apiLog.fd, apiLog.fd],
  },
);
const web = spawn(
  "corepack",
  [
    "pnpm",
    "--filter",
    "@workspace/boltnew-app",
    "exec",
    "vite",
    "--host",
    "127.0.0.1",
  ],
  {
    cwd: root,
    detached: true,
    env: {
      ...env,
      PORT: String(webPort),
      API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
      LOCAL_API: "1",
      VITE_SSE_ORIGIN: "",
    },
    stdio: ["ignore", webLog.fd, webLog.fd],
  },
);
async function shutdown() {
  api.kill("SIGTERM");
  try {
    process.kill(-web.pid, "SIGTERM");
  } catch {
    web.kill("SIGTERM");
  }
  await apiLog.close();
  await webLog.close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.stdin.on("data", () => void shutdown());
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let ready = false;
for (let i = 0; i < 120; i++) {
  if(api.exitCode!==null||web.exitCode!==null)throw Error("Fixture process stopped; refusing a stale server");
  try {
    const r = await fetch(`http://127.0.0.1:${webPort}/api/healthz`);
    if (r.ok) {
      ready = true;
      break;
    }
  } catch {}
  await delay(500);
}
if (!ready) {
  await shutdown();
  throw Error("Dedicated browser fixture did not start");
}
await delay(800);
async function rpc(name, data) {
  const r = await fetch(`http://127.0.0.1:${webPort}/api/db/rpc/` + name, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    }),
    body = await r.json();
  if (!r.ok || body.error) throw Error("Fixture RPC failed: " + name);
  return body.data ?? body;
}
const token = await rpc("admin_create_session", {
  p_phone: "01000000000",
  p_admin_password: cfg.BOOTSTRAP_ADMIN_PASSWORD,
});
await prepareLegacyEventHubFixture({
  databaseUrl: cfg.DATABASE_URL,
  baseUrl: `http://127.0.0.1:${webPort}`,
  adminToken: token,
});
await rpc("admin_update_settings", {
  p_payload: { module_flags: { event_hub: true } },
  adminToken: token,
});
await rpc("admin_toggle_session", { p_active: !process.argv.includes("--before-start"), adminToken: token });
await writeFile(
  out + "/browser-binding.env",
  `HUB_E2E_BASE_URL=http://127.0.0.1:${webPort}\nHUB_E2E_ADMIN_TOKEN=${token}\nHUB_E2E_CLOCK_OFFSET_MS=${cfg.HUB_LOAD_CLOCK_OFFSET_MS}\n`,
  { mode: 0o600 },
);
console.log(
  "Dedicated local real React/API/PostgreSQL browser fixture ready; credentials remain private.",
);
