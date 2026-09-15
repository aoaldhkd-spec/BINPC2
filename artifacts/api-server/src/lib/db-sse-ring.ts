/**
 * SSE Last-Event-ID ring buffer — extracted from routes/db.ts (behavior unchanged).
 * Used by broadcastAll / broadcastToUsers / /events replay.
 */

export type RingTargets = 'all' | string[];

export type RingEntry = {
  seq: number;
  ts: number;
  json: string;
  targets: RingTargets;
};

export type SseRingOptions = {
  /** Max retained events (~1000 × ~1 KB ≈ 1 MB) */
  max?: number;
  /** TTL before prune (default 20 min) */
  ttlMs?: number;
};

export type SseRing = {
  add: (json: string, targets: RingTargets) => number;
  getSince: (lastSeq: number, userId: string | null, isAdmin: boolean) => RingEntry[];
  latestSeq: () => number;
  size: () => number;
};

export const SSE_RING_MAX_DEFAULT = 1000;
export const SSE_RING_TTL_MS_DEFAULT = 20 * 60 * 1_000;

export function createSseRing(opts: SseRingOptions = {}): SseRing {
  const max = opts.max ?? SSE_RING_MAX_DEFAULT;
  const ttlMs = opts.ttlMs ?? SSE_RING_TTL_MS_DEFAULT;
  let seq = 0;
  const buffer: RingEntry[] = [];

  function add(json: string, targets: RingTargets): number {
    const next = ++seq;
    buffer.push({ seq: next, ts: Date.now(), json, targets });
    const cutoff = Date.now() - ttlMs;
    while (
      buffer.length > max ||
      (buffer.length > 0 && buffer[0].ts < cutoff)
    ) {
      buffer.shift();
    }
    return next;
  }

  function getSince(lastSeq: number, userId: string | null, isAdmin: boolean): RingEntry[] {
    return buffer.filter(e => {
      if (e.seq <= lastSeq) return false;
      if (isAdmin) return true;
      if (e.targets === 'all') return true;
      return userId ? (e.targets as string[]).includes(userId) : false;
    });
  }

  function latestSeq(): number {
    return buffer.length ? buffer[buffer.length - 1].seq : 0;
  }

  function size(): number {
    return buffer.length;
  }

  return { add, getSince, latestSeq, size };
}
