import { describe, expect, it } from 'vitest';
import { DEFAULT_MODULE_FLAGS } from './db-module-flags.js';
import { buildRuntimeStatus } from './db-runtime-status.js';

describe('buildRuntimeStatus', () => {
  it('builds deterministic non-PII runtime health data', () => {
    const status = buildRuntimeStatus({
      commit: 'abc12345',
      service: 'BINPC2',
      node: 'v24.0.0',
      nowMs: Date.parse('2026-10-06T00:00:00.000Z'),
      uptimeSec: 3600.9,
      pushConfigured: true,
      pushSubscriptions: 3,
      moduleFlags: { ...DEFAULT_MODULE_FLAGS, group_chat: false },
    });

    expect(status).toMatchObject({
      commit: 'abc12345',
      service: 'BINPC2',
      uptimeSec: 3600,
      processStartedAt: '2026-10-05T23:00:00.000Z',
      pushConfigured: true,
      pushSubscriptions: 3,
      moduleFlags: { ...DEFAULT_MODULE_FLAGS, group_chat: false },
    });
    expect(JSON.stringify(status)).not.toMatch(/phone|nickname|userId|token|secret/i);
  });

  it('falls back safely and clamps counters', () => {
    const status = buildRuntimeStatus({
      commit: '',
      service: '',
      node: 'v24',
      nowMs: 0,
      uptimeSec: -1,
      pushConfigured: false,
      pushSubscriptions: -2,
      moduleFlags: DEFAULT_MODULE_FLAGS,
    });
    expect(status.commit).toBe('unknown');
    expect(status.service).toBe('BINPC2');
    expect(status.uptimeSec).toBe(0);
    expect(status.pushSubscriptions).toBe(0);
  });
});
