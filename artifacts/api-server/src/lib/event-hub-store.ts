import type { Pool, PoolClient } from "pg";
import {
  createHash,
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  hkdfSync,
} from "node:crypto";
import { EVENT_RESET_LOCK_KEY } from "./db-event-reset-transaction.js";

export class HubError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function fail(code: string, message: string, status = 400): never {
  throw new HubError(status, code, message);
}
export class HubTx {
  constructor(
    readonly db: PoolClient,
    readonly key: Buffer,
  ) {}
  private encode(kind: string, id: string, value: unknown) {
    const data = value as Record<string, unknown>;
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(`${kind}:${id}:v1`));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    // Only minimal uniqueness/routing metadata stays outside authenticated encryption.
    return {
      id,
      ...(kind === "application"
        ? { eventId: data.eventId, owner: data.owner, rank: data.rank }
        : {}),
      ...(kind === "owner" ? { recoveryHash: data.recoveryHash } : {}),
      ...(kind === "member"
        ? {
            nicknameKey: createHmac("sha256", this.key)
              .update(String(data.nicknameKey))
              .digest("hex"),
          }
        : {}),
      crypto_box: {
        v: 1,
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        ciphertext: ciphertext.toString("base64"),
      },
    };
  }
  private decode<T>(
    kind: string,
    id: string,
    value: Record<string, unknown>,
  ): T {
    const box = value.crypto_box as
      { v: number; iv: string; tag: string; ciphertext: string } | undefined;
    if (!box) return value as T; // Supports explicit migration of pre-encryption development rows.
    if (box.v !== 1)
      throw new Error("Unsupported event hub encryption version");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(box.iv, "base64"),
    );
    decipher.setAAD(Buffer.from(`${kind}:${id}:v1`));
    decipher.setAuthTag(Buffer.from(box.tag, "base64"));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(box.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8"),
    ) as T;
  }
  async get<T>(kind: string, id: string): Promise<T | undefined> {
    const row = (
      await this.db.query(
        "SELECT data FROM event_hub_records WHERE kind=$1 AND id=$2",
        [kind, id],
      )
    ).rows[0];
    return row ? this.decode<T>(kind, id, row.data) : undefined;
  }
  async all<T>(kind: string): Promise<T[]> {
    return (
      await this.db.query(
        "SELECT id,data FROM event_hub_records WHERE kind=$1 ORDER BY id",
        [kind],
      )
    ).rows.map((r) => this.decode<T>(kind, r.id, r.data));
  }
  async put(kind: string, id: string, data: unknown) {
    await this.db.query(
      "INSERT INTO event_hub_records(kind,id,data) VALUES($1,$2,$3) ON CONFLICT(kind,id) DO UPDATE SET data=EXCLUDED.data,updated_at=now()",
      [kind, id, JSON.stringify(this.encode(kind, id, data))],
    );
  }
}
export class HubStore {
  readonly key: Buffer;
  constructor(
    readonly pool: Pool,
    secret = process.env.SESSION_SECRET,
  ) {
    if (!secret)
      throw new Error(
        "SESSION_SECRET is required for the private event ledger",
      );
    this.key = Buffer.from(
      hkdfSync("sha256", secret, "binpc2-event-hub-v6", "private-records", 32),
    );
  }
  async transaction<T>(fn: (tx: HubTx) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL lock_timeout='10000ms'");
      // Same order for every write, including admission; never race the 17:00 reset.
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        EVENT_RESET_LOCK_KEY,
      ]);
      await c.query(
        "SELECT pg_advisory_xact_lock(hashtext('binpc2:event-hub:v6'))",
      );
      const result = await fn(new HubTx(c, this.key));
      await c.query("COMMIT");
      return result;
    } catch (e) {
      try {
        await c.query("ROLLBACK");
      } catch {
        /* fail closed; client retries same request ID */
      }
      throw e;
    } finally {
      c.release();
    }
  }
}
export const digest = (v: string) =>
  createHash("sha256").update(v).digest("hex");
