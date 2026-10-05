import type { ModuleFlags } from './db-module-flags.js';

type RuntimeStatusInput = {
  commit?: string | null;
  service?: string | null;
  node: string;
  nowMs: number;
  uptimeSec: number;
  pushConfigured: boolean;
  pushSubscriptions: number;
  moduleFlags: ModuleFlags;
};

export function buildRuntimeStatus(input: RuntimeStatusInput) {
  const uptimeSec = Math.max(0, Math.floor(input.uptimeSec));
  return {
    commit: String(input.commit || 'unknown'),
    service: String(input.service || 'BINPC2'),
    uptimeSec,
    processStartedAt: new Date(input.nowMs - uptimeSec * 1000).toISOString(),
    node: input.node,
    pushConfigured: input.pushConfigured,
    pushSubscriptions: Math.max(0, Math.floor(input.pushSubscriptions)),
    moduleFlags: input.moduleFlags,
    dailyCycle: '23:00 hearts / 24:00 rainbow / 01:00 close / 17:00 reset',
  };
}
