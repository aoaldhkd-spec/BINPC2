import { describe, it, expect, vi } from 'vitest';
import {
  planParticipantSoTReload,
  planParticipantSoTDomains,
  runParticipantSoTReload,
  PARTICIPANT_SOT_FRESH_MS,
  PARTICIPANT_SOT_COALESCE_MS,
} from './participant-sot-resync';

describe('planParticipantSoTReload', () => {
  const base = { now: 100_000, lastReloadAt: 90_000, sseHealthy: true };

  it('always runs manual', () => {
    expect(planParticipantSoTReload({ ...base, trigger: 'manual', lastReloadAt: 99_500, sseHealthy: true }).shouldReload).toBe(true);
  });

  it('runs sse-reconnect even when healthy+fresh (SoT after disconnect)', () => {
    const p = planParticipantSoTReload({
      trigger: 'sse-reconnect',
      now: 100_000,
      lastReloadAt: 100_000 - (PARTICIPANT_SOT_FRESH_MS - 1_000),
      sseHealthy: true,
    });
    expect(p.shouldReload).toBe(true);
  });

  it('coalesces rapid sse-reconnect duplicates', () => {
    const p = planParticipantSoTReload({
      trigger: 'sse-reconnect',
      now: 100_000,
      lastReloadAt: 100_000 - (PARTICIPANT_SOT_COALESCE_MS - 100),
      sseHealthy: true,
    });
    expect(p).toEqual({ shouldReload: false, skipReason: 'coalesced' });
  });

  it('skips visibility when SSE healthy and data fresh', () => {
    const p = planParticipantSoTReload({
      trigger: 'visibility',
      now: 100_000,
      lastReloadAt: 100_000 - 10_000,
      sseHealthy: true,
    });
    expect(p).toEqual({ shouldReload: false, skipReason: 'sse-healthy-fresh' });
  });

  it('runs visibility when SSE unhealthy even if recent', () => {
    const p = planParticipantSoTReload({
      trigger: 'visibility',
      now: 100_000,
      lastReloadAt: 100_000 - 10_000,
      sseHealthy: false,
    });
    expect(p.shouldReload).toBe(true);
  });

  it('runs visibility when stale even if SSE healthy', () => {
    const p = planParticipantSoTReload({
      trigger: 'visibility',
      now: 100_000,
      lastReloadAt: 100_000 - PARTICIPANT_SOT_FRESH_MS - 1,
      sseHealthy: true,
    });
    expect(p.shouldReload).toBe(true);
  });

  it('coalesces visibility when unhealthy but within coalesce window', () => {
    const p = planParticipantSoTReload({
      trigger: 'visibility',
      now: 100_000,
      lastReloadAt: 100_000 - 500,
      sseHealthy: false,
    });
    expect(p).toEqual({ shouldReload: false, skipReason: 'coalesced' });
  });

  it('runs visibility on first load (lastReloadAt=0)', () => {
    expect(
      planParticipantSoTReload({
        trigger: 'visibility',
        now: 100_000,
        lastReloadAt: 0,
        sseHealthy: true,
      }).shouldReload,
    ).toBe(true);
  });
});

describe('planParticipantSoTDomains', () => {
  it('covers whole-app domains (not chat-only)', () => {
    const d = planParticipantSoTDomains('sse-reconnect');
    expect(d).toContain('profiles');
    expect(d).toContain('chatList');
    expect(d).toContain('likes');
    expect(d).toContain('receivedLikes');
    expect(d).toContain('contactShares');
    expect(d).toContain('sessionReady');
  });
});

describe('runParticipantSoTReload', () => {
  it('visibility: skips dependents when profiles empty', async () => {
    const loaders = {
      loadProfiles: vi.fn(async () => []),
      loadChatList: vi.fn(),
      loadLikes: vi.fn(),
      loadReceivedLikes: vi.fn(),
      loadContactShareData: vi.fn(),
    };
    await runParticipantSoTReload('visibility', 'u1', loaders);
    expect(loaders.loadProfiles).toHaveBeenCalled();
    expect(loaders.loadChatList).not.toHaveBeenCalled();
    expect(loaders.loadLikes).not.toHaveBeenCalled();
  });

  it('visibility: loads dependents when profiles non-empty', async () => {
    const loaders = {
      loadProfiles: vi.fn(async () => [{ id: 'p' }]),
      loadChatList: vi.fn(),
      loadLikes: vi.fn(),
      loadReceivedLikes: vi.fn(),
      loadContactShareData: vi.fn(),
    };
    await runParticipantSoTReload('visibility', 'u1', loaders);
    expect(loaders.loadChatList).toHaveBeenCalledWith('u1');
    expect(loaders.loadLikes).toHaveBeenCalledWith('u1');
    expect(loaders.loadReceivedLikes).toHaveBeenCalledWith('u1');
    expect(loaders.loadContactShareData).toHaveBeenCalledWith('u1');
  });

  it('sse-reconnect: parallel loads + sessionReady', async () => {
    const loaders = {
      loadProfiles: vi.fn(async () => [{ id: 'p' }]),
      loadChatList: vi.fn(),
      loadLikes: vi.fn(),
      loadReceivedLikes: vi.fn(),
      loadContactShareData: vi.fn(),
      refreshSessionReady: vi.fn(),
    };
    await runParticipantSoTReload('sse-reconnect', 'u1', loaders);
    expect(loaders.loadChatList).toHaveBeenCalledWith('u1');
    expect(loaders.loadProfiles).toHaveBeenCalled();
    expect(loaders.refreshSessionReady).toHaveBeenCalled();
  });
});
