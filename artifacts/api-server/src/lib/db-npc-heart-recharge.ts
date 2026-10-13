/**
 * Operator-owned 범일NPC allowance; no historical like is deleted or rewritten.
 * One start refill and one end refill per archive ID, each with normal 1+1+1+1
 * grant hearts and four rainbow uses. Sending the same heart again to the same
 * person remains subject to the existing per-target/source deduplication gate.
 */
type Heart = 'red' | 'blue' | 'pink' | 'green';
const TYPES: Heart[] = ['red', 'blue', 'pink', 'green'];
export type NpcHeartCounts = Record<Heart | 'rainbow', number>;
export type NpcRefill = {
  archiveId: string;
  npcId: string;
  phase: 'start' | 'end';
  phases: Array<'start' | 'end'>;
  replenishedAt: string;
  usedBefore: NpcHeartCounts;
};
function countNpcSends(rows: Record<string, unknown>[], npcId: string): NpcHeartCounts {
  const out: NpcHeartCounts = { red: 0, blue: 0, pink: 0, green: 0, rainbow: 0 };
  for (const row of rows) {
    if (String(row.liker_id ?? '') !== npcId) continue;
    if (row.like_source === 'rainbow') out.rainbow++;
    else {
      const key = String(row.heart_type ?? '') as Heart;
      if (TYPES.includes(key)) out[key]++;
    }
  }
  return out;
}
export function parseNpcRefill(raw: unknown): NpcRefill | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const x = raw as Record<string, unknown>;
  if (typeof x.archiveId !== 'string' || !/^binpc2:event-anon:v1:\d{4}-\d{2}-\d{2}:[a-f0-9-]{36}$/.test(x.archiveId)
    || typeof x.npcId !== 'string' || !x.npcId
    || (x.phase !== 'start' && x.phase !== 'end')
    || !Array.isArray(x.phases)
    || !x.usedBefore || typeof x.usedBefore !== 'object') return null;
  const b = x.usedBefore as Record<string, unknown>;
  if (!['red','blue','pink','green','rainbow'].every(k => Number.isSafeInteger(b[k]) && Number(b[k]) >= 0)) return null;
  return {
    archiveId: x.archiveId, npcId: x.npcId,
    phase: x.phase, phases: (x.phases as unknown[]).filter((a): a is 'start' | 'end' => a === 'start' || a === 'end'),
    replenishedAt: String(x.replenishedAt ?? ''),
    usedBefore: { red: Number(b.red), blue: Number(b.blue), pink: Number(b.pink),
      green: Number(b.green), rainbow: Number(b.rainbow) },
  };
}
export function planNpcHeartRefill(input: {
  previous: unknown;
  archiveId: string;
  npcId: string;
  phase: 'start' | 'end';
  likes: Record<string, unknown>[];
  now: string;
}): NpcRefill {
  const old = parseNpcRefill(input.previous);
  if (!/^binpc2:event-anon:v1:\d{4}-\d{2}-\d{2}:[a-f0-9-]{36}$/.test(input.archiveId)
    || !input.npcId) throw new Error('NPC recharge requires a valid event archive and verified NPC ID');
  if (old?.archiveId === input.archiveId && old.npcId === input.npcId
    && old.phases.includes(input.phase)) return old; // retry/reopen cannot mint more uses
  return {
    archiveId: input.archiveId,
    npcId: input.npcId,
    phase: input.phase,
    phases: old?.archiveId === input.archiveId && old.npcId === input.npcId
      ? [...old.phases, input.phase] : [input.phase],
    replenishedAt: input.now,
    usedBefore: countNpcSends(input.likes, input.npcId),
  };
}
export function npcHeartAllowance(input: {
  marker: unknown; archiveId: unknown; npcId: string;
  likes: Record<string, unknown>[];
}): { grantUsed: Record<Heart, boolean>; rainbowUsed: number; active: boolean } {
  const marker = parseNpcRefill(input.marker);
  const active = Boolean(marker && marker.archiveId === input.archiveId && marker.npcId === input.npcId);
  if (!active || !marker) {
    return { grantUsed: { red: true, blue: true, pink: true, green: true }, rainbowUsed: 4, active: false };
  }
  const now = countNpcSends(input.likes, input.npcId);
  // More historical sends may exist than the verified refill baseline.
  // Never allow negative usage to reopen a consumed allowance.
  const used = {
    red: Math.max(0, now.red - marker.usedBefore.red),
    blue: Math.max(0, now.blue - marker.usedBefore.blue),
    pink: Math.max(0, now.pink - marker.usedBefore.pink),
    green: Math.max(0, now.green - marker.usedBefore.green),
    rainbow: Math.max(0, now.rainbow - marker.usedBefore.rainbow),
  };
  return {
    grantUsed: {
      red: used.red >= 1, blue: used.blue >= 1,
      pink: used.pink >= 1, green: used.green >= 1,
    },
    rainbowUsed: used.rainbow,
    active: true,
  };
}
