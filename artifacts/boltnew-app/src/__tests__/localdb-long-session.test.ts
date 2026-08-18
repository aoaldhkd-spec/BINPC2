import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const localdbSrc = readFileSync(join(here, '../lib/localdb.ts'), 'utf8');
const useChatSrc = readFileSync(join(here, '../hooks/useChat.ts'), 'utf8');
const appSrc = readFileSync(join(here, '../App.tsx'), 'utf8');

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];

  readonly url: string;
  readyState = FakeEventSource.OPEN;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  closeCount = 0;

  constructor(url: string | URL) {
    this.url = String(url);
    FakeEventSource.instances.push(this);
  }

  emit(data: unknown, lastEventId = '') {
    this.onmessage?.({ data: JSON.stringify(data), lastEventId } as MessageEvent<string>);
  }

  close() {
    this.closeCount++;
    this.readyState = FakeEventSource.CLOSED;
  }
}

const visHandlers: Array<() => void> = [];
const onlineHandlers: Array<() => void> = [];

describe('[Realtime] long-session stability', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    visHandlers.length = 0;
    onlineHandlers.length = 0;
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.stubGlobal('sessionStorage', new MemoryStorage());
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      addEventListener: (ev: string, fn: () => void) => {
        if (ev === 'visibilitychange') visHandlers.push(fn);
      },
      removeEventListener: () => {},
    });
    vi.stubGlobal('window', {
      addEventListener: (ev: string, fn: () => void) => {
        if (ev === 'online') onlineHandlers.push(fn);
      },
      removeEventListener: () => {},
    });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/login')) {
        return {
          ok: true,
          json: async () => ({
            sessionToken: 'sess',
            sessionExpiresAt: Math.floor(Date.now() / 1000) + 86400,
          }),
        };
      }
      if (url.includes('/auth/sse-token')) {
        return {
          ok: true,
          json: async () => ({
            token: `fresh-token-${Math.floor(Date.now() / 1000)}`,
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    }));
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('source: ensureSse must close expired EventSource (no browser 401 retry)', () => {
    expect(localdbSrc).toMatch(/closeSse\('expired-token-close'\)/);
    expect(localdbSrc).toMatch(/FORBIDDEN: 만료 EventSource/);
    expect(localdbSrc).toMatch(/refreshSseTokenIfStale\(\)/);
  });

  it('source: fetchSseToken cache restore schedules proactive refresh timer', () => {
    expect(localdbSrc).toMatch(/scheduleSseTokenRefresh/);
    expect(localdbSrc).toMatch(/restoredFromCache/);
    expect(localdbSrc).toMatch(/80% 창 — 즉시 재발급/);
  });

  it('source: endurance soak must track expiresAt and proactive 80% refresh', () => {
    const enduranceSrc = readFileSync(join(here, '../../../../scripts/endurance-5h.mjs'), 'utf8');
    expect(enduranceSrc).toMatch(/SSE_TOKEN_REFRESH_LEAD_SEC/);
    expect(enduranceSrc).toMatch(/expiresAt/);
    expect(enduranceSrc).toMatch(/scheduleProactiveRefresh|proactive-80pct/);
    expect(enduranceSrc).toMatch(/401/);
    expect(enduranceSrc).toMatch(/ensureConnected/);
    expect(enduranceSrc).toMatch(/isOpFunctionsLocked|FUNCTIONS_LOCKED mid-run/);
    expect(enduranceSrc).toMatch(/return 'locked'|result === 'locked'/);
    expect(enduranceSrc).toMatch(/admin_event_end_reset/);
    expect(enduranceSrc).toMatch(/acquireEnduranceLock/);
  });

  it('source: token refresh lead is 20% of 1h TTL (proactive, not only after 401)', async () => {
    const { SSE_TOKEN_REFRESH_LEAD_SEC, SSE_TOKEN_TTL_SEC } = await import('../lib/localdb');
    expect(SSE_TOKEN_TTL_SEC).toBe(3600);
    expect(SSE_TOKEN_REFRESH_LEAD_SEC).toBe(720);
    expect(SSE_TOKEN_REFRESH_LEAD_SEC).toBe(Math.floor(SSE_TOKEN_TTL_SEC * 0.2));
    expect(localdbSrc).toMatch(/refreshSseTokenIfStale\(\)/);
    expect(localdbSrc).toMatch(/토큰 만료 선제 갱신은 리스너 유무와 무관/);
    expect(localdbSrc).toMatch(/recoverSseAfterSleep/);
    expect(localdbSrc).toMatch(/SSE_TOKEN_WAKE_REFRESH_LEAD_SEC/);
    expect(localdbSrc).toMatch(/wake-ring-stale/);
    expect(localdbSrc).toMatch(/type === 'catchup'/);
  });

  it('source: client caches that grow with time stay capped', () => {
    expect(useChatSrc).toMatch(/const MAX_MESSAGES = 500/);
    expect(useChatSrc).toMatch(/const MAX_CACHED_CHAT_ROOMS = 8/);
    expect(useChatSrc).toMatch(/while \(cache\.size > MAX_CACHED_CHAT_ROOMS\)/);
    expect(appSrc).toMatch(/seenContactEventIdsRef\.current\.size > 500/);
  });

  it('keeps SSE listener count stable across subscribe/unsubscribe and many events', async () => {
    const { supabase, sseDebugState } = await import('../lib/localdb');

    for (let i = 0; i < 40; i++) {
      const ch = supabase.channel(`cycle-${i}`).subscribe();
      ch.unsubscribe();
    }
    expect(sseDebugState().listeners).toBe(0);

    const live = Array.from({ length: 6 }, (_, i) => supabase.channel(`live-${i}`).subscribe());
    expect(sseDebugState().listeners).toBe(6);

    const source = FakeEventSource.instances.at(-1)!;
    for (let i = 0; i < 200; i++) {
      source.emit({
        type: 'change',
        table: 'profiles',
        event: 'UPDATE',
        newRow: { id: `p${i % 8}`, updated_at: `t${i}` },
        oldRow: null,
      });
    }
    expect(sseDebugState().listeners).toBe(6);

    live.forEach((ch: { unsubscribe: () => void }) => ch.unsubscribe());
    expect(sseDebugState().listeners).toBe(0);
    expect(sseDebugState().hasEventSource).toBe(false);
  });

  it('visibility/online/interval cycles do not stack extra EventSource or listeners', async () => {
    const { supabase, sseDebugState } = await import('../lib/localdb');
    const channel = supabase.channel('stack-guard').subscribe();
    expect(sseDebugState().listeners).toBe(1);
    const openBefore = FakeEventSource.instances.filter(s => s.readyState !== FakeEventSource.CLOSED).length;
    expect(openBefore).toBe(1);

    for (let i = 0; i < 40; i++) {
      visHandlers.forEach(fn => fn());
      onlineHandlers.forEach(fn => fn());
    }
    await vi.advanceTimersByTimeAsync(2_000 * 20);

    expect(sseDebugState().listeners).toBe(1);
    const stillOpen = FakeEventSource.instances.filter(s => s.readyState !== FakeEventSource.CLOSED);
    expect(stillOpen).toHaveLength(1);

    channel.unsubscribe();
  });

  it('many reconnect cycles keep one live EventSource and a constant listener count', async () => {
    const { supabase, sseDebugState } = await import('../lib/localdb');
    const live = Array.from({ length: 4 }, (_, i) => supabase.channel(`re-${i}`).subscribe());
    expect(sseDebugState().listeners).toBe(4);

    for (let i = 0; i < 25; i++) {
      const open = FakeEventSource.instances.filter(s => s.readyState !== FakeEventSource.CLOSED);
      const current = open.at(-1);
      if (current) {
        current.close();
        current.onerror?.();
      }
      await vi.advanceTimersByTimeAsync(20_000);
    }

    expect(sseDebugState().listeners).toBe(4);
    const liveSources = FakeEventSource.instances.filter(s => s.readyState !== FakeEventSource.CLOSED);
    expect(liveSources.length).toBeLessThanOrEqual(1);

    live.forEach((ch: { unsubscribe: () => void }) => ch.unsubscribe());
    expect(sseDebugState().listeners).toBe(0);
  });

  it('refreshes SSE token at 80% TTL before expiry (not only after 401)', async () => {
    const { setLocalDbUserId, setSseToken, supabase, SSE_TOKEN_REFRESH_LEAD_SEC, SSE_TOKEN_TTL_SEC } = await import('../lib/localdb');
    setLocalDbUserId('user-proactive-refresh');
    await vi.advanceTimersByTimeAsync(0);
    const issued = Math.floor(Date.now() / 1000);
    const exp = issued + SSE_TOKEN_TTL_SEC;
    setSseToken('tok-original', exp);
    const channel = supabase.channel('proactive-refresh').subscribe();
    const original = FakeEventSource.instances.find(s => s.url.includes('tok-original'));
    expect(original).toBeTruthy();
    expect(original!.readyState).toBe(FakeEventSource.OPEN);

    vi.mocked(fetch).mockClear();
    const untilRefresh = (SSE_TOKEN_TTL_SEC - SSE_TOKEN_REFRESH_LEAD_SEC) * 1000 + 3_000;
    await vi.advanceTimersByTimeAsync(untilRefresh);

    const sseTokenCalls = vi.mocked(fetch).mock.calls.filter(c => String(c[0]).includes('/auth/sse-token'));
    expect(sseTokenCalls.length).toBeGreaterThan(0);
    expect(Math.floor(Date.now() / 1000)).toBeLessThan(exp);
    expect(original!.readyState).toBe(FakeEventSource.CLOSED);

    channel.unsubscribe();
  });

  it('closes EventSource on token expiry instead of native 401 retry', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/login')) {
        return {
          ok: true,
          json: async () => ({ sessionToken: 'sess', sessionExpiresAt: Math.floor(Date.now() / 1000) + 86400 }),
        };
      }
      if (url.includes('/auth/sse-token')) {
        await new Promise(() => { /* hang — 재발급 전 만료 연결이 닫히는지 본다 */ });
      }
      return { ok: false, json: async () => ({}) };
    });

    const { setLocalDbUserId, setSseToken, supabase } = await import('../lib/localdb');
    setLocalDbUserId('user-long-session');
    setSseToken('expiring-token', Math.floor(Date.now() / 1000) + 12);
    const channel = supabase.channel('expiry-test').subscribe();
    const source = FakeEventSource.instances.find(s => s.url.includes('expiring-token'));
    expect(source).toBeTruthy();
    expect(source!.readyState).toBe(FakeEventSource.OPEN);

    await vi.advanceTimersByTimeAsync(3_000);
    expect(source!.readyState).toBe(FakeEventSource.CLOSED);
    expect(source!.closeCount).toBeGreaterThan(0);
    expect(
      FakeEventSource.instances.filter(s => s.url.includes('expiring-token') && s.readyState !== FakeEventSource.CLOSED),
    ).toHaveLength(0);

    channel.unsubscribe();
  });

  it('simulated 5h of ticks keeps listener count stable and refreshes tokens before expiry', async () => {
    const { setLocalDbUserId, setSseToken, supabase, sseDebugState, SSE_TOKEN_TTL_SEC } = await import('../lib/localdb');
    setLocalDbUserId('user-five-hour');
    await vi.advanceTimersByTimeAsync(0);
    setSseToken('tok-5h', Math.floor(Date.now() / 1000) + SSE_TOKEN_TTL_SEC);
    const live = Array.from({ length: 3 }, (_, i) => supabase.channel(`h5-${i}`).subscribe());
    expect(sseDebugState().listeners).toBe(3);

    vi.mocked(fetch).mockClear();
    const fiveHours = 5 * 60 * 60 * 1000;
    await vi.advanceTimersByTimeAsync(fiveHours);

    expect(sseDebugState().listeners).toBe(3);
    const open = FakeEventSource.instances.filter(s => s.readyState !== FakeEventSource.CLOSED);
    expect(open.length).toBeLessThanOrEqual(1);
    const sseTokenCalls = vi.mocked(fetch).mock.calls.filter(c => String(c[0]).includes('/auth/sse-token'));
    expect(sseTokenCalls.length).toBeGreaterThanOrEqual(4);

    live.forEach((ch: { unsubscribe: () => void }) => ch.unsubscribe());
  }, 30_000);

  it('coalesces repeated _bulk_resync into one trailing reload instead of a reconnect storm', async () => {
    const { onSseReconnect, supabase } = await import('../lib/localdb');
    const resync = vi.fn();
    const removeReconnect = onSseReconnect(resync);
    const channel = supabase.channel('bulk-resync-storm').subscribe();
    const source = FakeEventSource.instances.at(-1)!;
    source.emit({ type: 'instance', instanceId: 'instance-a' });
    resync.mockClear();

    for (let i = 0; i < 12; i++) {
      source.emit({
        type: 'change',
        table: 'likes',
        event: 'UPDATE',
        newRow: { _bulk_resync: true, count: 100 + i },
        oldRow: { count: 90 },
      });
    }
    await vi.advanceTimersByTimeAsync(1_600);
    expect(resync.mock.calls.length).toBeLessThanOrEqual(2);
    expect(resync).toHaveBeenCalled();

    channel.unsubscribe();
    removeReconnect();
  });
});
