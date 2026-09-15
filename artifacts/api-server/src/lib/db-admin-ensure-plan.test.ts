import { describe, expect, it } from 'vitest';
import { ADMIN_FIXED_NICKNAME } from './db-admin-identity.js';
import { deterministicAdminProfileId } from './db-chat-ids.js';
import { NPC_TEXT_AVATAR_SENTINEL } from './npc-text-avatar.js';
import {
  buildAdminSeedProfile,
  planEnsureAdminProfile,
  planRestoreAdminProfileAfterWipe,
} from './db-admin-ensure-plan.js';

describe('db-admin-ensure-plan', () => {
  const digits = '01038786740';
  const settings = { admin_phone: '010-3878-6740' };

  it('skips when no admin phone configured', () => {
    expect(planEnsureAdminProfile({
      settings: {},
      profiles: [],
      now: 't0',
      npcAvatarSentinel: NPC_TEXT_AVATAR_SENTINEL,
    }).action).toBe('skip');
  });

  it('keeps existing admin when nickname and avatar already correct', () => {
    const existing = {
      id: 'npc1',
      nickname: ADMIN_FIXED_NICKNAME,
      phone_number: '01038786740',
      photo_url: NPC_TEXT_AVATAR_SENTINEL,
    };
    const plan = planEnsureAdminProfile({
      settings,
      profiles: [existing],
      now: 't1',
      npcAvatarSentinel: NPC_TEXT_AVATAR_SENTINEL,
    });
    expect(plan.action).toBe('keep');
    if (plan.action === 'keep') {
      expect(plan.row.nickname).toBe(ADMIN_FIXED_NICKNAME);
      expect(plan.row.updated_at).toBe('t1');
    }
  });

  it('repairs nickname or NPC avatar when drifted', () => {
    const existing = {
      id: 'npc1',
      nickname: 'tmp',
      phone_number: '01038786740',
      photo_url: 'https://example.com/x.png',
    };
    const plan = planEnsureAdminProfile({
      settings,
      profiles: [existing],
      now: 't2',
      npcAvatarSentinel: NPC_TEXT_AVATAR_SENTINEL,
    });
    expect(plan.action).toBe('repair');
    if (plan.action === 'repair') {
      expect(plan.profileIndex).toBe(0);
      expect(plan.fixed.nickname).toBe(ADMIN_FIXED_NICKNAME);
      expect(plan.fixed.photo_url).toBe(NPC_TEXT_AVATAR_SENTINEL);
      expect(plan.existing).toBe(existing);
    }
  });

  it('needs_seed when no admin row; buildAdminSeedProfile uses deterministic id', () => {
    const plan = planEnsureAdminProfile({
      settings,
      profiles: [{ id: 'u1', nickname: 'other', phone_number: '01011112222' }],
      now: 't3',
      npcAvatarSentinel: NPC_TEXT_AVATAR_SENTINEL,
    });
    expect(plan.action).toBe('needs_seed');
    if (plan.action !== 'needs_seed') return;
    const row = buildAdminSeedProfile({
      adminPhoneDigits: plan.adminPhoneDigits,
      phoneDisplay: plan.phoneDisplay,
      now: 't3',
      fallbackId: 'rand',
      pin: '1234',
      npcAvatarSentinel: NPC_TEXT_AVATAR_SENTINEL,
    });
    expect(row.id).toBe(deterministicAdminProfileId(digits));
    expect(row.nickname).toBe(ADMIN_FIXED_NICKNAME);
    expect(row.pin_code).toBe('1234');
    expect(row.photo_url).toBe(NPC_TEXT_AVATAR_SENTINEL);
    expect(row.personality_score).toBe(50);
  });

  it('restore-after-wipe rebuilds from backup; ensure_fallback without phone', () => {
    expect(planRestoreAdminProfileAfterWipe({
      oldProfiles: [],
      settingsRow: {},
      now: 't4',
      fallbackId: 'fb',
      npcAvatarSentinel: NPC_TEXT_AVATAR_SENTINEL,
    }).action).toBe('ensure_fallback');

    const backup = {
      id: 'old-npc',
      phone_number: '010-3878-6740',
      nickname: 'x',
      pin_code: '9999',
      created_at: 'c0',
    };
    const plan = planRestoreAdminProfileAfterWipe({
      oldProfiles: [backup],
      settingsRow: settings,
      now: 't5',
      fallbackId: 'fb',
      npcAvatarSentinel: NPC_TEXT_AVATAR_SENTINEL,
    });
    expect(plan.action).toBe('restore');
    if (plan.action === 'restore') {
      expect(plan.row.id).toBe('old-npc');
      expect(plan.row.nickname).toBe(ADMIN_FIXED_NICKNAME);
      expect(plan.row.photo_url).toBe(NPC_TEXT_AVATAR_SENTINEL);
      expect(plan.row.pin_code).toBe('9999');
      expect(plan.row.updated_at).toBe('t5');
    }
  });
});
