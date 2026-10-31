// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); delete window.__binpcReadyBootstrap; });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); delete window.__binpcReadyBootstrap; });

describe('first-page public settings read', () => {
  it('reuses the HTML head request across theme and entry bootstrap', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const payload = { ready: true, settings: { session_active: false } };
    window.__binpcReadyBootstrap = { startedAt: Date.now(), promise: Promise.resolve(payload) };
    const { readBootstrapReady } = await import('./bootstrap-ready');
    expect(await Promise.all([readBootstrapReady(), readBootstrapReady()])).toEqual([payload, payload]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not reuse an old document/settings snapshot, and shares the fresh request', async () => {
    window.__binpcReadyBootstrap = { startedAt: Date.now() - 6000, promise: Promise.resolve({ ready: true }) };
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ready: true, settings: { session_active: false } }) });
    vi.stubGlobal('fetch', fetcher);
    const { readBootstrapReady } = await import('./bootstrap-ready');
    const values = await Promise.all([readBootstrapReady(), readBootstrapReady()]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(values[0]?.settings?.session_active).toBe(false);
    expect(fetcher).toHaveBeenCalledWith('/api/db/ready', expect.objectContaining({ cache: 'no-store', credentials: 'include' }));
  });

  it('expires a completed result so a later bootstrap observes session closure', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ready: true, settings: { session_active: true } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ready: true, settings: { session_active: false } }) });
    vi.stubGlobal('fetch', fetcher);
    const { readBootstrapReady } = await import('./bootstrap-ready');
    expect((await readBootstrapReady())?.settings?.session_active).toBe(true);
    vi.setSystemTime(Date.now() + 5001);
    expect((await readBootstrapReady())?.settings?.session_active).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('returns no settings on connection or HTTP failure, never assuming admission is open', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('offline')); vi.stubGlobal('fetch', fetcher);
    const { readBootstrapReady } = await import('./bootstrap-ready');
    expect(await readBootstrapReady()).toBeNull();
  });
});
