import { describe, expect, it } from 'vitest';
import { npcHeartAllowance, planNpcHeartRefill } from './db-npc-heart-recharge.js';

const archiveId = 'binpc2:event-anon:v1:2026-10-13:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const atStart = '2026-10-13T18:00:00+09:00';
const npc = 'npc-owner';
const row = (sender: string, kind: string, source = 'grant') =>
  ({ liker_id: sender, heart_type: kind, like_source: source });

describe('bounded NPC allowance, history preserved', () => {
  it('refills exactly one of each classic heart plus four rainbows, with historical sends preserved', () => {
    const old = [row(npc, 'red'), row(npc, 'green'), row('participant', 'blue')];
    const start = planNpcHeartRefill({ archiveId, npcId: npc, phase: 'start', previous: null,
      now: atStart, likes: old });
    const usage = npcHeartAllowance({ marker: start, archiveId, npcId: npc, likes: old });
    expect(usage.active).toBe(true);
    expect(usage.grantUsed.red).toBe(false);
    expect(usage.rainbowUsed).toBe(0);
    const later = [...old, row(npc, 'red'), row(npc, 'green'), row(npc, 'red', 'rainbow')];
    const after = npcHeartAllowance({ marker: start, archiveId, npcId: npc, likes: later });
    expect(after.grantUsed.red).toBe(true);
    expect(after.grantUsed.green).toBe(true);
    expect(after.grantUsed.blue).toBe(false);
    expect(after.rainbowUsed).toBe(1);
    expect(old).toHaveLength(3);
  });
  it('allows just one refill on start and one on end, regardless of repeated calls or reopen', () => {
    const start = planNpcHeartRefill({ archiveId, npcId: npc, phase: 'start',
      previous: null, now: atStart, likes: [] });
    const rows = [row(npc, 'red'), row(npc, 'blue', 'rainbow')];
    const again = planNpcHeartRefill({ archiveId, npcId: npc, phase: 'start', previous: start,
      now: '2026-10-13T20:00:00+09:00', likes: rows });
    expect(again).toEqual(start);
    const ended = planNpcHeartRefill({ archiveId, npcId: npc, phase: 'end', previous: start,
      now: '2026-10-14T01:00:00+09:00', likes: rows });
    expect(ended.phases).toEqual(['start', 'end']);
    expect(npcHeartAllowance({ marker: ended, archiveId, npcId: npc, likes: rows }).rainbowUsed).toBe(0);
    expect(npcHeartAllowance({ marker: ended, archiveId, npcId: npc, likes: rows }).grantUsed.red).toBe(false);
    const duplicateEnd = planNpcHeartRefill({ archiveId, npcId: npc, phase: 'end', previous: ended,
      now: '2026-10-14T02:00:00+09:00', likes: rows });
    expect(duplicateEnd).toEqual(ended);
  });
  it('cannot apply another event or participant allowance to NPC', () => {
    const start = planNpcHeartRefill({ archiveId, npcId: npc, phase: 'start', previous: null,
      now: atStart, likes: [] });
    expect(npcHeartAllowance({ marker: start, archiveId: 'other', npcId: npc, likes: [] }).active).toBe(false);
    expect(npcHeartAllowance({ marker: start, archiveId, npcId: 'participant', likes: [] }).active).toBe(false);
    expect(npcHeartAllowance({ marker: null, archiveId, npcId: npc, likes: [] }).grantUsed.red).toBe(true);
  });
  it('never derives a negative allowance count from a newer marker baseline', () => {
    const marker = planNpcHeartRefill({
      archiveId, npcId: npc, phase: 'start', previous: null, now: atStart,
      likes: [row(npc, 'red'), row(npc, 'red', 'rainbow')],
    });
    const usage = npcHeartAllowance({ marker, archiveId, npcId: npc, likes: [] });
    expect(usage.rainbowUsed).toBe(0);
    expect(usage.grantUsed.red).toBe(false);
  });

});
