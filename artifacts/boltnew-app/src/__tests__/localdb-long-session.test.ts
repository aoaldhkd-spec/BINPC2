import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('[Realtime] long-session stability', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.stubGlobal('sessionStorage', new MemoryStorage());
    vi.stubGlobal('EventSource', FakeEventSource);
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
            token: 'fresh-token',
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
});
