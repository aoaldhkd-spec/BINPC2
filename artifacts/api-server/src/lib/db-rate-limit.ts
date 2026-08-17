/**
 * IP/키 단위 in-memory rate limit. persist/SSE store 와 독립.
 * 분산 quota(`app_kv_rows`)는 db.ts 에 그대로 둔다.
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
