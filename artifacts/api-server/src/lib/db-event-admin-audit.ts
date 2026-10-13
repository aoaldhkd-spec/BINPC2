/** Aggregate actions only. No operator name, ID, message or raw audit payload persists. */
export type AdminEventActionKind = 'start' | 'end' | 'autoEnd' | 'settings' | 'lock';
export type AdminEventActionCounts = Record<AdminEventActionKind, number>;
const KINDS: AdminEventActionKind[] = ['start', 'end', 'autoEnd', 'settings', 'lock'];
export function normaliseEventActions(raw: unknown): AdminEventActionCounts {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown> : {};
  return Object.fromEntries(KINDS.map(k => [
    k, Number.isSafeInteger(obj[k]) && Number(obj[k]) >= 0 ? Math.min(1_000_000, Number(obj[k])) : 0,
  ])) as AdminEventActionCounts;
}
export function eventActionsAfter(input: {
  previous: unknown; action: AdminEventActionKind; isNewEvent?: boolean;
}): AdminEventActionCounts {
  const counts = input.isNewEvent ? normaliseEventActions(null) : normaliseEventActions(input.previous);
  counts[input.action] = Math.min(1_000_000, counts[input.action] + 1);
  return counts;
}
