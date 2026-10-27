/** Reproducible isolated Cursor development. Never accepts production connection strings. */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { parseEnv } from "node:util";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const dir = path.join(root, ".local/event-hub");
const configFile = path.join(dir, "handoff-api.env");
const database =
  "postgresql://postgres@127.0.0.1:5432/binpc2_hub_handoff_dev?sslmode=disable";
const infrastructure = new Set([
  "PATH",
  "HOME",
  "USERPROFILE",
  "SystemRoot",
  "TEMP",
  "TMP",
  "TMPDIR",
  "COREPACK_HOME",
  "XDG_CACHE_HOME",
  "XDG_DATA_HOME",
  "PNPM_HOME",
  "LANG",
  "TERM",
]);
const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => infrastructure.has(key)),
);
const mode = process.argv[2] ?? "configure";
function run(program, args, env, cwd = root) {
  const result = spawnSync(program, args, {
    cwd,
    env: { ...cleanEnv, ...env },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error)
    throw new Error("Unable to launch the local development command");
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (mode === "configure") {
  if (process.env.NODE_ENV === "production")
    throw new Error("Refusing local configuration in production mode");
  const require = createRequire(
    new URL("../artifacts/api-server/package.json", import.meta.url),
  );
  const { Pool } = require("pg");
  const admin = new Pool({
    connectionString:
      "postgresql://postgres@127.0.0.1:5432/postgres?sslmode=disable",
  });
  try {
    const present = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname='binpc2_hub_handoff_dev'",
    );
    if (present.rowCount && !existsSync(configFile)) {
      const db = new Pool({ connectionString: database });
      try {
        const table = await db.query(
          "SELECT to_regclass('public.event_hub_records') AS name",
        );
        if (
          table.rows[0]?.name &&
          (await db.query("SELECT 1 FROM event_hub_records LIMIT 1")).rowCount
        )
          throw new Error(
            "Existing encrypted fixture found without its key. Restore the original local config; do not generate a replacement key.",
          );
      } finally {
        await db.end();
      }
    }
  } finally {
    await admin.end();
  }
  mkdirSync(dir, { recursive: true });
  if (!existsSync(configFile)) {
    const config = {
      NODE_ENV: "development",
      PORT: "8082",
      DATABASE_URL: database,
      SESSION_SECRET: randomBytes(48).toString("hex"),
      BOOTSTRAP_ADMIN_PASSWORD: randomBytes(16).toString("hex"),
      BOOTSTRAP_TEST_PASSWORD: randomBytes(16).toString("hex"),
    };
    writeFileSync(
      configFile,
      Object.entries(config)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n") + "\n",
      { mode: 0o600, flag: "wx" },
    );
  }
}
if (!existsSync(configFile))
  throw new Error(
    "Run configure first with a local PostgreSQL fixture running",
  );
const config = parseEnv(readFileSync(configFile, "utf8"));
if (
  config.DATABASE_URL !== database ||
  config.NODE_ENV !== "development" ||
  config.PORT !== "8082" ||
  !/^[a-f0-9]{96}$/.test(config.SESSION_SECRET ?? "")
)
  throw new Error("Refusing a modified or unsafe local fixture configuration");
const api = { ...config };
const web = {
  NODE_ENV: "development",
  PORT: "3002",
  LOCAL_API: "1",
  API_URL: "",
  API_PROXY_TARGET: "http://127.0.0.1:8082",
  API_PUBLIC_URL: "http://127.0.0.1:8082",
  VITE_SSE_ORIGIN: "http://127.0.0.1:8082",
  DEV_ADMIN_PASSWORD: config.BOOTSTRAP_ADMIN_PASSWORD,
};
if (mode === "configure") {
  run(process.execPath, ["scripts/prepare-event-hub-e2e.mjs", "database"], {
    ...api,
    HUB_TEST_DATABASE_URL:
      "postgresql://postgres@127.0.0.1:5432/binpc2_hub_test_resume?sslmode=disable",
    TEST_DATABASE_URL:
      "postgresql://postgres@127.0.0.1:5432/binpc2_reset_test_resume?sslmode=disable",
  });
  console.log(
    "Isolated fixture prepared. Keep .local/event-hub/handoff-api.env private and backed up separately; encryption keys are not exported.",
  );
} else if (mode === "api") {
  run(
    process.execPath,
    ["--dns-result-order=ipv4first", "--enable-source-maps", "dist/index.mjs"],
    api,
    path.join(root, "artifacts/api-server"),
  );
} else if (mode === "web") {
  run(
    "corepack",
    [
      "pnpm",
      "--filter",
      "@workspace/boltnew-app",
      "exec",
      "vite",
      "--config",
      "vite.config.ts",
      "--host",
      "127.0.0.1",
    ],
    web,
  );
} else if (mode === "activate") {
  run(process.execPath, ["scripts/prepare-event-hub-e2e.mjs", "activate"], {
    ...api,
    HUB_E2E_BASE_URL: "http://127.0.0.1:3002",
  });
} else if (mode === "check") {
  console.log(
    "PASS: fixed localhost fixture DB, development mode, persistent private key, and local-only web/API targets.",
  );
} else throw new Error("Use configure | check | api | web | activate");
