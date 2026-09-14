import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const localdbSrc = readFileSync(join(here, '../lib/localdb.ts'), 'utf8');
const adminAppSrc = readFileSync(join(here, '../AdminApp.tsx'), 'utf8');
const sharedSrc = readFileSync(join(here, '../admin/shared.ts'), 'utf8');

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

  constructor(url: string | URL) {
    this.url = String(url);
    FakeEventSource.instances.push(this);
  }

  close() {
    this.readyState = FakeEventSource.CLOSED;
  }
}

describe('[Admin] SSE adminToken upgrade for hearts/chats', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.stubGlobal('sessionStorage', new MemoryStorage());
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('source guards: reconnectAdminSse + ensureSse upgrade + AdminApp wiring', () => {
    expect(localdbSrc).toContain('export function reconnectAdminSse');
    expect(localdbSrc).toContain('admin-sse-upgrade');
    expect(localdbSrc).toContain('sseConnectionHasAdminToken');
    expect(adminAppSrc).toContain('reconnectAdminSse()');
    expect(adminAppSrc).toContain('onSseReconnect');
    expect(adminAppSrc).toContain('admin-ldb-changes');
    expect(sharedSrc).toContain('reconnectAdminSse()');
  });

  it('upgrades anonymous EventSource to adminToken when token appears', async () => {
    const { supabase, reconnectAdminSse } = await import('../lib/localdb');

    const ch = supabase
      .channel('anon-then-admin')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'likes' }, () => {})
      .subscribe();

    expect(FakeEventSource.instances.length).toBe(1);
    expect(FakeEventSource.instances[0].url).not.toContain('adminToken=');

    localStorage.setItem('admin_token_v1', 'abc123');
    reconnectAdminSse();

    expect(FakeEventSource.instances.length).toBeGreaterThanOrEqual(2);
    const latest = FakeEventSource.instances[FakeEventSource.instances.length - 1];
    expect(latest.url).toContain('adminToken=');
    expect(latest.readyState).toBe(FakeEventSource.OPEN);

    ch.unsubscribe();
  });

  it('ensureSse upgrades open anonymous connection when admin token is present', async () => {
    const mod = await import('../lib/localdb');
    const { supabase } = mod;

    supabase
      .channel('pre-token')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {})
      .subscribe();

    expect(FakeEventSource.instances[0].url).not.toContain('adminToken=');

    localStorage.setItem('admin_token_v1', 'tok-admin');
    // setLocalDbUserId(null) early-returns when already null — must still upgrade via ensure path
    mod.setLocalDbUserId(null);
    // Force ensure via another subscribe (same as AdminApp remount)
    supabase
      .channel('post-token')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'likes' }, () => {})
      .subscribe();

    // Periodic ensureSse tick also upgrades
    vi.advanceTimersByTime(2_000);

    const open = FakeEventSource.instances.filter((es) => es.readyState === FakeEventSource.OPEN);
    expect(open.some((es) => es.url.includes('adminToken='))).toBe(true);
  });
});
