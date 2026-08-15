import { describe, it, expect, beforeEach, vi } from 'vitest';

// Reset module state between tests by dynamic import after resetModules
async function loadNetHealth() {
  vi.resetModules();
  return import('../lib/net-health');
}

describe('net-health', () => {
  beforeEach(() => {
    vi.useFakeTimers();
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

  it('shows reconnecting only after sustained down', async () => {
    const nh = await loadNetHealth();
    nh.reportLinkDown('long');
    vi.advanceTimersByTime(12_500);
    expect(nh.getNetUiStatus()).toBe('reconnecting');
    nh.reportLinkUp('ok');
    vi.advanceTimersByTime(500);
    expect(nh.getNetUiStatus()).toBe('ok');
  });

  it('escalates to error after long failure', async () => {
    const nh = await loadNetHealth();
    nh.reportLinkDown('hard');
    vi.advanceTimersByTime(12_500);
    expect(nh.getNetUiStatus()).toBe('reconnecting');
    vi.advanceTimersByTime(40_500);
    expect(nh.getNetUiStatus()).toBe('error');
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
