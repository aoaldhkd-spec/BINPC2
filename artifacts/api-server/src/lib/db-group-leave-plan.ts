/**
 * Group leave / opt-out / slot-count pure planners — extracted from routes/db.ts.
 * Persist, store mutate, and SSE stay in db.ts (thin wrappers + I/O).
 */
import { afterpartySlotKey, groupLimitSlotKey } from './db-group-room-plan.js';

export function hasGroupOptOut(
  optOuts: Record<string, unknown>[],
  userId: string,
  optKey: string,
): boolean {
  return optOuts.some(
    r => String(r.user_id) === userId && String(r.opt_key) === optKey,
  );
}

/**
 * Group ids that share a leave slot with `groupId` (self + merged + afterparty/year/age peers).
 * `resolveMergedId` defaults to identity; db.ts passes resolveMergedGroupId.
 */
export function groupIdsInSameLeaveSlot(
  groupId: string,
  groupChats: Record<string, unknown>[],
  resolveMergedId: (id: string) => string = (id) => id,
): Set<string> {
  const resolved = resolveMergedId(groupId);
  const ids = new Set<string>([groupId, resolved]);
  const target = groupChats.find(g => String(g.id) === resolved || String(g.id) === groupId);
  if (!target) return ids;
  const ap = afterpartySlotKey(target);
  const name = String(target.name ?? '');
  const yearOrAge = /^\d{4}년생 모임$/.test(name) || /^\d+대 모임$/.test(name);
  for (const g of groupChats) {
    const gid = String(g.id);
    if (ap && afterpartySlotKey(g) === ap) ids.add(gid);
    else if (yearOrAge && String(g.name) === name) ids.add(gid);
  }
  return ids;
}

export function participantRowsToLeave(
  userId: string,
  groupId: string,
  participants: Record<string, unknown>[],
  groupChats: Record<string, unknown>[],
  resolveMergedId: (id: string) => string = (id) => id,
): Record<string, unknown>[] {
  if (!userId || !groupId) return [];
  const ids = groupIdsInSameLeaveSlot(groupId, groupChats, resolveMergedId);
  return participants.filter(p => {
    if (String(p.user_id) !== userId) return false;
    const gid = String(p.group_id ?? '');
    return ids.has(gid) || ids.has(resolveMergedId(gid));
  });
}

/** Distinct catalog leave-slots the user currently occupies (hidden/merged/legacy excluded). */
export function countUserGroupSlots(
  userId: string,
  participants: Record<string, unknown>[],
  groupChats: Record<string, unknown>[],
): number {
  const keys = new Set<string>();
  for (const p of participants) {
    if (String(p.user_id) !== userId) continue;
    const gid = String(p.group_id ?? '');
    const g = groupChats.find(row => String(row.id) === gid);
    const key = groupLimitSlotKey(g, gid);
    if (key) keys.add(key);
  }
  return keys.size;
}
