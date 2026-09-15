/**
 * IP/키 단위 in-memory rate limit (+ PIN by-pin bucket). persist/SSE store 와 독립.
 * 분산 quota SQL builders live here; pool.query execution stays in db.ts.
 */

export type RateBucket = { count: number; resetAt: number };

export const RATE_MAP_MAX_SIZE = 50_000;
export const LOGIN_RATE_MAX = 10;
export const LOGIN_RATE_WINDOW_MS = 60_000;
/** 행사장 NAT: 150명이 같은 공인 IP로 입장·토큰갱신. 계정당 10회 한도는 유지. */
export const LOGIN_RATE_MAX_PER_IP = 600;
export const UPLOAD_RATE_MAX = 10;
export const UPLOAD_RATE_WINDOW_MS = 60_000;
/** 행사장 NAT: 업로드도 계정당 한도 + 공인 IP 버스트 상한. */
export const UPLOAD_RATE_MAX_PER_IP = 300;

export const loginRateMap = new Map<string, RateBucket>();
export const uploadRateMap = new Map<string, RateBucket>();
export const broadcastRateMap = new Map<string, RateBucket>();

export function pruneRateMap(map: Map<string, RateBucket>, now = Date.now()): void {
  for (const [k, v] of map) if (v.resetAt < now) map.delete(k);
}

/** 로그인 한도: 계정당 brute-force 10/min + NAT IP 버스트 상한. */
export function venueLoginRateKeys(userId: string | undefined, ip: string): { userKey: string; ipBurstKey: string } {
  const uid = userId?.trim();
  return {
    userKey: uid ? `login-user:${uid}` : `login-ip:${ip}`,
    ipBurstKey: `login-ip-burst:${ip}`,
  };
}

/** 업로드 한도: 계정당 스팸 10/min + NAT IP 버스트 상한. */
export function venueUploadRateKeys(userId: string | undefined, ip: string): { userKey: string; ipBurstKey: string } {
  const uid = userId?.trim();
  return {
    userKey: uid ? `upload-user:${uid}` : `upload-ip:${ip}`,
    ipBurstKey: `upload-ip-burst:${ip}`,
  };
}

/** 비밀번호 변경 성공 시 해당 클라이언트의 로그인 버킷만 해제 — 한도는 유지 */
export function resetRateLimit(map: Map<string, RateBucket>, key: string): void {
  map.delete(key);
}

/**
 * 기존 db.ts 버킷 로직과 동일: 창이 끝나면 리셋, 초과 시 limited.
 * maxMapSize 가 있으면 새 키 추가 전에 상한을 검사한다.
 */
export function consumeRateLimit(
  map: Map<string, RateBucket>,
  key: string,
  opts: { now?: number; windowMs: number; max: number; maxMapSize?: number },
): 'ok' | 'limited' | 'map_full' {
  const now = opts.now ?? Date.now();
  let bucket = map.get(key);
  if (!bucket || now > bucket.resetAt) {
    if (!bucket && opts.maxMapSize != null && map.size >= opts.maxMapSize) {
      return 'map_full';
    }
    bucket = { count: 0, resetAt: now + opts.windowMs };
    map.set(key, bucket);
  }
  bucket.count++;
  if (bucket.count > opts.max) return 'limited';
  return 'ok';
}

/** PIN lookup window (by-pin): 동일 PIN 무차별 대입 차단. */
export const PIN_WINDOW_MS_DEFAULT = 15 * 60 * 1000;

/**
 * PIN 버킷 — 창 안에서는 max 회까지 허용(count >= max 이면 거부).
 * consumeRateLimit 와 다르게 초과 시 count 를 더 올리지 않는다 (기존 db.ts 동작).
 */
export function consumePinBucket(
  map: Map<string, RateBucket>,
  key: string,
  max: number,
  windowMs: number,
  now = Date.now(),
): boolean {
  const prev = map.get(key);
  if (prev && prev.resetAt > now) {
    if (prev.count >= max) return false;
    prev.count++;
    return true;
  }
  map.set(key, { count: 1, resetAt: now + windowMs });
  return true;
}

/** Trusted SQL only — distributed rate_limits rows in app_kv_rows. Execution stays in db.ts. */

/** Claim a min-interval slot (RETURNING empty ⇒ too soon). Params: $1=rowId, $2=minIntervalMs. */
export function buildDistributedRateSlotSql(): string {
  return `INSERT INTO app_kv_rows (table_name, row_id, data, updated_at)
       VALUES ('rate_limits', $1, '{}'::jsonb, NOW())
       ON CONFLICT (table_name, row_id) DO UPDATE
       SET updated_at = NOW()
       WHERE app_kv_rows.updated_at < NOW() - ($2::double precision * INTERVAL '1 millisecond')
       RETURNING row_id`;
}

/** Claim a per-minute quota increment. Params: $1=rowId, $2=maxPerMinute. */
export function buildDistributedMinuteQuotaSql(): string {
  return `INSERT INTO app_kv_rows (table_name, row_id, data, updated_at)
       VALUES ('rate_limits', $1, jsonb_build_object('count', 1), NOW())
       ON CONFLICT (table_name, row_id) DO UPDATE
       SET data = jsonb_build_object(
             'count',
             LEAST($2::int, COALESCE((app_kv_rows.data->>'count')::int, 0) + 1)
           ),
           updated_at = NOW()
       WHERE COALESCE((app_kv_rows.data->>'count')::int, 0) < $2::int
       RETURNING (data->>'count')::int AS count`;
}

/** Delete rate_limits rows older than 10 minutes (periodic prune). */
export function buildRateLimitsPruneSql(): string {
  return `DELETE FROM app_kv_rows
       WHERE table_name = 'rate_limits'
         AND updated_at < NOW() - INTERVAL '10 minutes'`;
}
