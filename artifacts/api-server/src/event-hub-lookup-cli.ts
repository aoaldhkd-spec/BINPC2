/** Offline preparation. Not routed by Express or run automatically in production. */
import pg from "pg";
import { HubStore } from "./lib/event-hub-store.js";
import { isolatedFixtureDatabase } from "./lib/event-hub-isolation.js";
import { withPgSslParams } from "./lib/pg-options.js";
async function main() {
  const args = process.argv.slice(2),
    scope = args[args.indexOf("--scope") + 1],
    apply = args.includes("--apply");
  if (!args.includes("--scope")) {
    console.log(
      "Plan: add keyed lookup metadata only; preserve ciphertext, keys, revisions, dates and all application/payment/prize history. Default is no connection/no changes. Pass explicit --scope and --dry-run to inspect counts.",
    );
    process.exit(0);
  }
  if (apply && args.includes("--dry-run"))
    throw Error("Apply and dry-run cannot be combined");
  const raw = process.env.DATABASE_URL;
  if (!raw) throw Error("An explicit database URL is required");
  if (scope === "isolated")
    isolatedFixtureDatabase(raw, [
      "binpc2_hub_load_v6",
      "binpc2_hub_browser_v6",
      "binpc2_hub_test_resume",
      "binpc2_hub_dev",
    ]);
  else if (scope !== "production")
    throw Error("Explicit isolated or production scope required");
  if (
    apply &&
    scope === "production" &&
    (process.env.NODE_ENV !== "production" ||
      process.env.EVENT_HUB_LOOKUP_MIGRATION_APPROVED !==
        "metadata-only-after-backup" ||
      process.env.EVENT_HUB_LOOKUP_DB_NAME !== new URL(raw).pathname.slice(1))
  )
    throw Error(
      "Production metadata writes require separate approval, backup and exact database-name confirmation",
    );
  if (!apply && !args.includes("--dry-run"))
    throw Error("Choose read-only --dry-run or explicitly approved --apply");
  if (apply && !process.env.SESSION_SECRET)
    throw Error("Preserved ledger key required; do not generate or rotate it");
  const parsed = new URL(raw);
  if (
    [...parsed.searchParams].some(
      ([key, value]) =>
        !(
          key === "sslmode" &&
          ["disable", "prefer", "require", "verify-ca", "verify-full"].includes(
            value,
          )
        ) && !(key === "uselibpqcompat" && value === "true"),
    )
  )
    throw Error("Connection overrides are not accepted");
  const pool = new pg.Pool({
    connectionString: withPgSslParams(raw),
    ssl:
      parsed.searchParams.get("sslmode") === "disable"
        ? undefined
        : { rejectUnauthorized: false },
    max: 1,
  });
  try {
    const actual = String(
      (await pool.query("SELECT current_database() name")).rows[0].name,
    );
    if (actual !== parsed.pathname.slice(1))
      throw Error("Connected database does not match the approved target");
    const count = Number(
      (
        await pool.query(
          "SELECT count(*) n FROM event_hub_records WHERE (kind='application' AND NOT(data ? 'nicknameLookup')) OR (kind='member' AND (NOT(data ? 'owner') OR NOT(data ? 'nicknameLookup')))",
        )
      ).rows[0].n,
    );
    let updated = 0;
    if (apply) {
      const store = new HubStore(pool);
      for (;;) {
        const n = await store.transaction((tx) => tx.prepareLookupMetadata());
        updated += n;
        if (!n) break;
      }
    }
    console.log(
      JSON.stringify({
        scope,
        mode: apply ? "apply-metadata-only" : "read-only",
        rowsNeedingMetadata: count,
        updated,
        plaintextRecordsDeleted: 0,
        ciphertextOrKeysChanged: false,
      }),
    );
  } finally {
    await pool.end();
  }
}
void main().catch(() => {
  console.error(
    "Lookup metadata preparation failed. Credentials and row details were not logged; earlier committed metadata-only batches remain safe to resume.",
  );
  process.exitCode = 1;
});
