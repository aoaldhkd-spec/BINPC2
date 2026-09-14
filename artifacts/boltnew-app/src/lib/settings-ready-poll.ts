/**
 * Backup /ready poll cadence while app_settings SSE may be down.
 */

export const SETTINGS_READY_POLL_HEALTHY_MS = 30_000;
export const SETTINGS_READY_POLL_UNHEALTHY_MS = 4_000;

export function settingsReadyPollGapMs(sseHealthy: boolean): number {
  return sseHealthy ? SETTINGS_READY_POLL_HEALTHY_MS : SETTINGS_READY_POLL_UNHEALTHY_MS;
}

export function shouldRunSettingsReadyPoll(input: {
  now: number;
  lastReadyAt: number;
  sseHealthy: boolean;
}): boolean {
  const gap = settingsReadyPollGapMs(input.sseHealthy);
  return input.now - input.lastReadyAt >= gap;
}
