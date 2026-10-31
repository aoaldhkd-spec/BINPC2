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
const LEDGER_SENTINEL_SQL = "SELECT kind,id,data FROM event_hub_records WHERE data ? 'crypto_box' ORDER BY kind,id LIMIT 1";
function ledgerKeyUnavailable(): never {
  fail(
    "LEDGER_KEY_UNAVAILABLE",
    "행사 기록의 암호화 키를 확인할 수 없습니다. 기존 키를 복원한 뒤 다시 시도해 주세요. 기록은 변경하지 않았습니다.",
    503,
  );
}
export const normalizeHubNickname = (s: string) =>
  s.normalize("NFKC").toLocaleLowerCase("ko-KR").trim();
export class HubTx {
  // Only explicitly prefetched rows, scoped to one locked transaction. Never a
  // cross-request authorization cache. put() invalidates its row immediately.
  private prefetched = new Map<string, Record<string, unknown> | undefined>();
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
        ? {
            eventId: data.eventId,
            owner: data.owner,
            rank: data.rank,
            nicknameLookup: this.nicknameHash(
              normalizeHubNickname(
                String((data.basic as { nickname?: string })?.nickname ?? ""),
              ),
            ),
          }
        : {}),
      ...(kind === "stock" ? { eventId: data.eventId } : {}),
      ...(kind === "owner" ? { recoveryHash: data.recoveryHash } : {}),
      ...(kind === "member"
        ? {
            owner: data.owner,
            nicknameLookup: this.nicknameHash(String(data.nicknameKey)),
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
  /** Fail before the callback can write with an accidentally replaced encryption key. */
  async assertLedgerReadable(prefetchedRows?: unknown) {
    const rows = prefetchedRows === undefined
      ? (await this.db.query(LEDGER_SENTINEL_SQL)).rows
      : prefetchedRows;
    // Only an explicit empty SELECT result means that no encrypted ledger exists.
    // Missing/malformed batch output must never become an empty-ledger bypass.
    if (!Array.isArray(rows) || rows.length > 1) ledgerKeyUnavailable();
    if (rows.length === 0) return;
    const row = rows[0];
    if (!row || typeof row.kind !== "string" || !row.kind || typeof row.id !== "string" || !row.id ||
      !row.data || typeof row.data !== "object" || Array.isArray(row.data) ||
      !row.data.crypto_box || typeof row.data.crypto_box !== "object" || Array.isArray(row.data.crypto_box))
      ledgerKeyUnavailable();
    try {
      this.decode(row.kind, row.id, row.data);
    } catch {
      ledgerKeyUnavailable();
    }
  }
  async get<T>(kind: string, id: string): Promise<T | undefined> {
    const lookup = JSON.stringify([kind,id]);
    if (this.prefetched.has(lookup)) {
      const data = this.prefetched.get(lookup);
      return data ? this.decode<T>(kind,id,structuredClone(data)) : undefined;
    }
    const row = (
      await this.db.query(
        "SELECT data FROM event_hub_records WHERE kind=$1 AND id=$2",
        [kind, id],
      )
    ).rows[0];
    return row ? this.decode<T>(kind, id, row.data) : undefined;
  }
  async prefetch(records: {kind: string; id: string}[]) {
    const rows = (await this.db.query(
      "SELECT wanted.kind,wanted.id,r.data FROM jsonb_to_recordset($1::jsonb) AS wanted(kind text,id text) LEFT JOIN event_hub_records r ON r.kind=wanted.kind AND r.id=wanted.id",
      [JSON.stringify(records)],
    )).rows;
    for (const row of rows) this.prefetched.set(JSON.stringify([row.kind,row.id]),row.data ?? undefined);
  }
  /** Fixed mutation inputs plus module state and an optional owner-scoped list.
   * The list is a separate snapshot, never a replacement for global/nickname
   * lookups. All values still pass authenticated decryption when consumed.
   */
  async mutationInputs<T>(records: {kind:string;id:string}[],applicationOwner?:string) {
    const rows=(await this.db.query(
      `SELECT 'fixed' AS source,wanted.kind,wanted.id,r.data
       FROM jsonb_to_recordset($1::jsonb) AS wanted(kind text,id text)
       LEFT JOIN event_hub_records r ON r.kind=wanted.kind AND r.id=wanted.id
       UNION ALL
       SELECT 'owner-application' AS source,kind,id,data FROM event_hub_records
       WHERE kind='application' AND $2::text IS NOT NULL AND data->>'owner'=$2
       UNION ALL
       (SELECT 'app-settings' AS source,'app-settings' AS kind,row_id AS id,data
        FROM app_kv_rows WHERE table_name='app_settings' LIMIT 1)
       ORDER BY source,kind,id`,
      [JSON.stringify(records),applicationOwner??null],
    )).rows;
    const applications:T[]=[];
    let appSettings:Record<string,unknown>|undefined;
    for(const row of rows){
      if(row.source==='app-settings'){appSettings=row.data;continue;}
      if(row.source==='owner-application'){applications.push(this.decode<T>('application',row.id,row.data));continue;}
      this.prefetched.set(JSON.stringify([row.kind,row.id]),row.data??undefined);
    }
    return {appSettings,applications};
  }
  /** One state-read round trip inside the existing locked transaction. The
   * routing predicate only narrows candidates; callers still check decoded
   * ownership. Nothing survives this transaction or bypasses ciphertext checks.
   */
  async stateInputs(owner: string | undefined, admin: boolean) {
    const fixed = [
      {kind:'laboratory-mode',id:'global'},
      ...['global','privacy-policy',...(admin?['venue-directory']:[])].map(id=>({kind:'settings',id})),
      ...(owner?[{kind:'owner',id:owner},{kind:'thread',id:owner}]:[]),
    ];
    const rows = (await this.db.query(
      `SELECT 'hub' AS source,kind,id,data FROM event_hub_records WHERE
        (kind='laboratory-mode' AND id='global')
        OR (kind='settings' AND id=ANY($3::text[]))
        OR kind='event'
        OR (kind IN ('owner','thread') AND ($2::boolean OR ($1::text IS NOT NULL AND id=$1)))
        OR (kind='application' AND ($2::boolean OR ($1::text IS NOT NULL AND data->>'owner'=$1)))
        OR (kind='member' AND ($2::boolean OR ($1::text IS NOT NULL AND (data->>'owner'=$1 OR NOT(data ? 'owner')))))
        OR ($2::boolean AND kind IN ('stock','error'))
      UNION ALL
      (SELECT 'app-settings' AS source,'app-settings' AS kind,row_id AS id,data
       FROM app_kv_rows WHERE table_name='app_settings' LIMIT 1)
      ORDER BY source,kind,id`,
      [owner ?? null,admin,['global','privacy-policy',...(admin?['venue-directory']:[])]],
    )).rows;
    // Cache missing fixed keys too, rather than issuing a second read for a
    // legitimate absent optional setting. put() already invalidates each key.
    for(const r of fixed)this.prefetched.set(JSON.stringify([r.kind,r.id]),undefined);
    const byKind = new Map<string,{id:string;data:Record<string,unknown>}[]>();
    let appSettings: Record<string,unknown> | undefined;
    for(const row of rows){
      if(row.source==='app-settings'){appSettings=row.data;continue;}
      this.prefetched.set(JSON.stringify([row.kind,row.id]),row.data);
      const records=byKind.get(row.kind)??[];
      records.push({id:row.id,data:row.data});byKind.set(row.kind,records);
    }
    return {
      appSettings,
      all:<T>(kind:string):T[] => (byKind.get(kind)??[]).map(r=>this.decode<T>(kind,r.id,r.data)),
    };
  }
  async all<T>(kind: string): Promise<T[]> {
    return (
      await this.db.query(
        "SELECT id,data FROM event_hub_records WHERE kind=$1 ORDER BY id",
        [kind],
      )
    ).rows.map((r) => this.decode<T>(kind, r.id, r.data));
  }
  async byPrefix<T>(kind: string, prefix: string): Promise<T[]> {
    const rows = (await this.db.query(
      "SELECT id,data FROM event_hub_records WHERE kind=$1 AND starts_with(id,$2) ORDER BY id", [kind,prefix],
    )).rows;
    return rows.map(row => this.decode<T>(kind,row.id,row.data));
  }
  /** Owner routing metadata is already stored beside encrypted application data.
   * Filter before decrypting so one participant does not load every other application.
   * The caller still checks authenticated payload ownership after decoding.
   */
  async applicationsForOwner<T>(owner: string): Promise<T[]> {
    return (
      await this.db.query(
        "SELECT id,data FROM event_hub_records WHERE kind='application' AND data->>'owner'=$1 ORDER BY id",
        [owner],
      )
    ).rows.map((r) => this.decode<T>("application", r.id, r.data));
  }
  /** Filter routing metadata before decryption, then verify the authenticated
   * eventId too. Legacy records without metadata remain eligible for inspection. */
  async stocksForEvent<T extends { eventId: string }>(eventId: string): Promise<T[]> {
    const rows = (await this.db.query(
      "SELECT id,data FROM event_hub_records WHERE kind='stock' AND (data->>'eventId'=$1 OR NOT(data ? 'eventId')) ORDER BY id",
      [eventId],
    )).rows;
    return rows.map(r => this.decode<T>('stock',r.id,r.data)).filter(s => s.eventId === eventId);
  }
  /** Uses the existing unique recovery-hash index before decrypting a single owner. */
  async ownerForRecoveryHash<T>(hash: string): Promise<T | undefined> {
    const row = (
      await this.db.query(
        "SELECT id,data FROM event_hub_records WHERE kind='owner' AND data->>'recoveryHash'=$1",
        [hash],
      )
    ).rows[0];
    return row ? this.decode<T>("owner", row.id, row.data) : undefined;
  }
  private nicknameHash(normalized: string) {
    return createHmac("sha256", this.key).update(normalized).digest("hex");
  }
  /** One round trip for independent basic-form reads; ciphertext and owner checks
   * are still verified after decoding. Legacy lookup-free records are included. */
  async basicInputs<A, M>(owner: string, normalized: string) {
    const rows = (await this.db.query(
      `SELECT DISTINCT ON (kind,id) kind,id,data FROM (
        SELECT kind,id,data FROM event_hub_records WHERE kind='application' AND data->>'owner'=$1
        UNION ALL SELECT kind,id,data FROM event_hub_records WHERE kind='member' AND data->>'owner'=$1
        UNION ALL SELECT kind,id,data FROM event_hub_records WHERE kind='application' AND data->>'nicknameLookup'=$2
        UNION ALL SELECT kind,id,data FROM event_hub_records WHERE kind='member' AND data->>'nicknameLookup'=$2
        UNION ALL SELECT kind,id,data FROM event_hub_records WHERE kind='application' AND NOT(data ? 'nicknameLookup')
        UNION ALL SELECT kind,id,data FROM event_hub_records WHERE kind='member' AND NOT(data ? 'nicknameLookup')
        UNION ALL SELECT kind,id,data FROM event_hub_records WHERE kind='member' AND NOT(data ? 'owner')
      ) candidates
      UNION ALL SELECT 'live-profile' AS kind,row_id AS id,jsonb_build_object('nickname',data->'nickname','event_hub_owner',data->'event_hub_owner') AS data FROM app_kv_rows WHERE table_name='profiles'`,
      [owner, this.nicknameHash(normalized)],
    )).rows;
    return {
      applications: rows.filter(r=>r.kind==='application' && r.data.owner===owner).map(r=>this.decode<A>('application',r.id,r.data)),
      members: rows.filter(r=>r.kind==='member' && (r.data.owner===owner || !Object.hasOwn(r.data,'owner'))).map(r=>this.decode<M>('member',r.id,r.data)),
      nicknameApplications: () => rows.filter(r=>r.kind==='application').map(r=>this.decode<A>('application',r.id,r.data)),
      nicknameMembers: () => rows.filter(r=>r.kind==='member').map(r=>this.decode<M>('member',r.id,r.data)),
      profiles: rows.filter(r=>r.kind==='live-profile').map(r=>r.data as {nickname?:string;event_hub_owner?:string}),
    };
  }
  async nicknameCandidates<T>(
    kind: "application" | "member",
    normalized: string,
  ): Promise<T[]> {
    const rows = (
      await this.db.query(
        "SELECT id,data FROM event_hub_records WHERE kind=$1 AND data->>'nicknameLookup'=$2 UNION ALL SELECT id,data FROM event_hub_records WHERE kind=$1 AND NOT(data ? 'nicknameLookup')",
        [kind, this.nicknameHash(normalized)],
      )
    ).rows;
    return rows.map((r) => this.decode<T>(kind, r.id, r.data));
  }
  async membersForOwner<T>(owner: string): Promise<T[]> {
    const rows = (
      await this.db.query(
        "SELECT id,data FROM event_hub_records WHERE kind='member' AND data->>'owner'=$1 UNION ALL SELECT id,data FROM event_hub_records WHERE kind='member' AND NOT(data ? 'owner')",
        [owner],
      )
    ).rows;
    return rows.map((r) => this.decode<T>("member", r.id, r.data));
  }
  /** Offline, explicitly approved preparation only. Ciphertext, business revisions and timestamps stay byte-identical. */
  async prepareLookupMetadata(limit = 200): Promise<number> {
    const rows = (
      await this.db.query(
        "SELECT kind,id,data FROM event_hub_records WHERE (kind='application' AND NOT(data ? 'nicknameLookup')) OR (kind='member' AND (NOT(data ? 'owner') OR NOT(data ? 'nicknameLookup'))) OR (kind='stock' AND NOT(data ? 'eventId')) ORDER BY kind,id LIMIT $1 FOR UPDATE",
        [Math.min(200, Math.max(1, limit))],
      )
    ).rows;
    for (const r of rows) {
      const v = this.decode<Record<string, unknown>>(r.kind, r.id, r.data);
      if (v.id !== r.id || (r.kind === "stock" ? typeof v.eventId !== "string" || !v.eventId : typeof v.owner !== "string" || !v.owner))
        fail(
          "LOOKUP_METADATA_INTEGRITY",
          "원장 식별자를 먼저 확인하세요.",
          409,
        );
      const metadata =
        r.kind === "stock" ? { eventId: v.eventId } : r.kind === "application"
          ? {
              nicknameLookup: this.nicknameHash(
                normalizeHubNickname(
                  String((v.basic as { nickname?: string })?.nickname ?? ""),
                ),
              ),
            }
          : {
              owner: v.owner,
              nicknameLookup: this.nicknameHash(String(v.nicknameKey)),
            };
      await this.db.query(
        "UPDATE event_hub_records SET data=data||$1::jsonb WHERE kind=$2 AND id=$3",
        [JSON.stringify(metadata), r.kind, r.id],
      );
    }
    return rows.length;
  }
  async put(kind: string, id: string, data: unknown) {
    this.prefetched.delete(JSON.stringify([kind,id]));
    await this.db.query(
      "INSERT INTO event_hub_records(kind,id,data) VALUES($1,$2,$3) ON CONFLICT(kind,id) DO UPDATE SET data=EXCLUDED.data,updated_at=now()",
      [kind, id, JSON.stringify(this.encode(kind, id, data))],
    );
  }
}
export function eventHubEncryptionKey(secret = process.env.SESSION_SECRET): Buffer {
  if (!secret) throw new Error("SESSION_SECRET is required for the private event ledger");
  return Buffer.from(hkdfSync("sha256", secret, "binpc2-event-hub-v6", "private-records", 32));
}
// Every hub transaction already takes the same database-wide advisory lock.
// Queue locally before borrowing a connection, so lock waiters cannot occupy the
// entire shared pool and starve session reads / realtime notifications. The DB
// locks below remain authoritative across processes and the 17:00 reset.
const hubTurns = new WeakMap<Pool, Promise<void>>();
export class HubStore {
  readonly key: Buffer;
  constructor(
    readonly pool: Pool,
    secret = process.env.SESSION_SECRET,
  ) {
    this.key = eventHubEncryptionKey(secret);
  }
  /** Concurrent reads share reset protection, never the global mutation queue.
   * PostgreSQL READ ONLY enforces that this path cannot draw or change stock.
   * Keep READ COMMITTED so the sentinel/profile read starts after any reset wait.
   */
  async readOnly<T>(fn: (tx: HubTx) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      const opening: unknown = await c.query(`BEGIN READ ONLY; SET LOCAL lock_timeout='6000ms';
        SET LOCAL statement_timeout='8000ms';
        SELECT pg_advisory_xact_lock_shared(hashtext('${EVENT_RESET_LOCK_KEY}'));
        ${LEDGER_SENTINEL_SQL};`);
      const commands = ['BEGIN','SET','SET','SELECT','SELECT'];
      if (!Array.isArray(opening) || opening.length !== commands.length ||
        commands.some((command,index) => opening[index]?.command !== command)) ledgerKeyUnavailable();
      const sentinel = opening[4];
      if (!Array.isArray(sentinel.rows) || sentinel.rowCount !== sentinel.rows.length) ledgerKeyUnavailable();
      const tx = new HubTx(c,this.key);
      await tx.assertLedgerReadable(sentinel.rows);
      const result = await fn(tx);
      await c.query('COMMIT');
      return result;
    } catch (error) {
      try { await c.query('ROLLBACK'); } catch { /* fail closed */ }
      throw error;
    } finally { c.release(); }
  }
  async transaction<T>(fn: (tx: HubTx) => Promise<T>): Promise<T> {
    const previous = hubTurns.get(this.pool) ?? Promise.resolve();
    let finishTurn!: () => void;
    const turn = new Promise<void>((resolve) => { finishTurn = resolve; });
    hubTurns.set(this.pool, turn);
    await previous;
    try {
      const c = await this.pool.connect();
      try {
        // One round trip, unchanged transaction/timeout/lock order. The exact
        // existing sentinel SELECT runs after both locks and is authenticated
        // before any callback, including on a genuinely empty new ledger.
        const opening: unknown = await c.query(`BEGIN; SET LOCAL lock_timeout='10000ms';
          SELECT pg_advisory_xact_lock(hashtext('${EVENT_RESET_LOCK_KEY}'));
          SELECT pg_advisory_xact_lock(hashtext('binpc2:event-hub:v6'));
          ${LEDGER_SENTINEL_SQL};`);
        const commands = ["BEGIN", "SET", "SELECT", "SELECT", "SELECT"];
        if (!Array.isArray(opening) || opening.length !== commands.length ||
          commands.some((command, index) => opening[index]?.command !== command))
          ledgerKeyUnavailable();
        const sentinel = opening[4];
        if (!Array.isArray(sentinel.rows) || sentinel.rowCount !== sentinel.rows.length)
          ledgerKeyUnavailable();
        const tx = new HubTx(c, this.key);
        await tx.assertLedgerReadable(sentinel.rows);
        const result = await fn(tx);
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
    } finally {
      finishTurn();
      if (hubTurns.get(this.pool) === turn) hubTurns.delete(this.pool);
    }
  }
}
export const digest = (v: string) =>
  createHash("sha256").update(v).digest("hex");
