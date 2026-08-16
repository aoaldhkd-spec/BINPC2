import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Reset module state between tests by dynamic import after resetModules
async function loadNetHealth() {
  vi.resetModules();
  return import('../lib/net-health');
}

describe('net-health', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('does not show UI for brief disconnect under quiet window', async () => {
    const nh = await loadNetHealth();
    const seen: string[] = [];
    nh.subscribeNetUi((s) => seen.push(s));
    nh.reportLinkDown('blip');
    vi.advanceTimersByTime(5_000);
    expect(nh.getNetUiStatus()).toBe('ok');
    nh.reportLinkUp('recovered');
    vi.advanceTimersByTime(500);
    expect(nh.getNetUiStatus()).toBe('ok');
    expect(seen.filter((s) => s !== 'ok')).toHaveLength(0);
  });

  it('does not flash reconnecting when link recovers just before quiet expires', async () => {
    const nh = await loadNetHealth();
    const seen: string[] = [];
    nh.subscribeNetUi((s) => seen.push(s));
    nh.reportLinkDown('race');
    vi.advanceTimersByTime(nh.NET_QUIET_MS - 200);
    expect(nh.getNetUiStatus()).toBe('ok');
    nh.reportLinkUp('recovered');
    vi.advanceTimersByTime(1_000);
    expect(nh.getNetUiStatus()).toBe('ok');
    expect(seen.filter((s) => s !== 'ok')).toHaveLength(0);
  });

  it('shows reconnecting only after sustained down', async () => {
    const nh = await loadNetHealth();
    nh.reportLinkDown('long');
    vi.advanceTimersByTime(nh.NET_QUIET_MS - 500);
    expect(nh.getNetUiStatus()).toBe('ok');
    vi.advanceTimersByTime(1_000);
    expect(nh.getNetUiStatus()).toBe('reconnecting');
    nh.reportLinkUp('ok');
    vi.advanceTimersByTime(500);
    expect(nh.getNetUiStatus()).toBe('ok');
  });

  it('escalates to error after long failure', async () => {
    const nh = await loadNetHealth();
    nh.reportLinkDown('hard');
    vi.advanceTimersByTime(nh.NET_QUIET_MS + 500);
    expect(nh.getNetUiStatus()).toBe('reconnecting');
    vi.advanceTimersByTime(nh.NET_ERROR_AFTER_MS + 500);
    expect(nh.getNetUiStatus()).toBe('error');
  });

  it('does not immediately show reconnecting on browser offline flicker', async () => {
    const nh = await loadNetHealth();
    nh.reportBrowserOffline();
    expect(nh.getNetUiStatus()).toBe('ok');
    vi.advanceTimersByTime(1_000);
    expect(nh.getNetUiStatus()).toBe('ok');
    nh.reportBrowserOnline();
    vi.advanceTimersByTime(500);
    expect(nh.getNetUiStatus()).toBe('ok');
  });

  it('shows reconnecting if browser stays offline past debounce', async () => {
    const nh = await loadNetHealth();
    vi.stubGlobal('navigator', { onLine: false });
    nh.reportBrowserOffline();
    vi.advanceTimersByTime(nh.NET_OFFLINE_QUIET_MS + 100);
    expect(nh.getNetUiStatus()).toBe('reconnecting');
  });

  it('ignores seats-removed 400 and 429 as network failure', async () => {
    const nh = await loadNetHealth();
    expect(nh.shouldIgnoreDownReason('http:400:seats')).toBe(true);
    expect(nh.shouldIgnoreDownReason('TABLE_NOT_ALLOWED seats')).toBe(true);
    expect(nh.shouldIgnoreDownReason('sse:429')).toBe(true);
    expect(nh.shouldIgnoreDownReason('RATE_LIMIT')).toBe(true);
    expect(nh.shouldIgnoreDownReason('sse:onerror')).toBe(false);

    nh.reportLinkDown('op:400:seats');
    nh.reportLinkDown('http:429');
    vi.advanceTimersByTime(nh.NET_QUIET_MS + 5_000);
    expect(nh.getNetUiStatus()).toBe('ok');
  });

  it('treats OPEN and short CONNECTING EventSource as not down', async () => {
    const nh = await loadNetHealth();
    expect(nh.sseReadyStateBlocksNetDownUi(1, 30_000)).toBe(true);
    expect(nh.sseReadyStateBlocksNetDownUi(0, 5_000)).toBe(true);
    expect(nh.sseReadyStateBlocksNetDownUi(0, nh.NET_SSE_CONNECTING_GRACE_MS + 1)).toBe(false);
    expect(nh.sseReadyStateBlocksNetDownUi(2, 8_000)).toBe(false);
    expect(nh.sseReadyStateBlocksNetDownUi(null, 8_000)).toBe(false);
  });
});

describe('diag', () => {
  it('redacts sensitive keys and supports corr lookup', async () => {
    vi.resetModules();
    const d = await import('../lib/diag');
    const corr = d.newCorrId('t');
    d.diag('error', 'api', 'fail', { corr, data: { token: 'secret', table: 'messages' } });
    const found = d.findDiagByCorr(corr);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].data?.token).toBe('[redacted]');
    expect(found[0].data?.table).toBe('messages');
  });
});
