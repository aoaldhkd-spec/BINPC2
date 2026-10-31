/** Share only the public, short-lived first-page settings read; never profile/auth data. */
type ReadyPayload = { ready?: boolean; settings?: Record<string, unknown> };
type Prefetch = { startedAt: number; promise: Promise<ReadyPayload | null> };
const MAX_AGE_MS = 5_000;
let pending: Prefetch | undefined;

declare global {
  interface Window { __binpcReadyBootstrap?: Prefetch }
}

export function readBootstrapReady(): Promise<ReadyPayload | null> {
  const now = Date.now();
  const early = window.__binpcReadyBootstrap;
  const usable = (value: Prefetch | undefined): value is Prefetch => Boolean(value
    && now >= value.startedAt && now - value.startedAt < MAX_AGE_MS
    && typeof value.promise?.then === 'function');
  if (usable(pending)) return pending.promise;
  if (usable(early)) {
    pending = early;
    return early.promise;
  }
  const promise = fetch('/api/db/ready', {
    cache: 'no-store', credentials: 'include', signal: AbortSignal.timeout(8_000),
  }).then(response => response.ok ? response.json() as Promise<ReadyPayload> : null).catch(() => null);
  pending = { startedAt: now, promise };
  return promise;
}
