/**
 * ensureAdminProfile / restore-after-wipe planners — extracted from routes/db.ts.
 * Pure given settings/profiles snapshots; persist / SSE / PIN resolve stay in db.ts.
 */
import {
  ADMIN_FIXED_NICKNAME,
  adminPhoneDigitsFromSettings,
  findAdminProfileInRows,
  isAdminProfilePhone,
  withFixedAdminNickname,
} from './db-admin-identity.js';
import { deterministicAdminProfileId } from './db-chat-ids.js';

export type EnsureAdminProfilePlan =
  | { action: 'skip' }
  | { action: 'keep'; row: Record<string, unknown> }
  | {
      action: 'repair';
      fixed: Record<string, unknown>;
      existing: Record<string, unknown>;
      profileIndex: number;
    }
  | {
      action: 'needs_seed';
      adminPhoneDigits: string;
      phoneDisplay: string;
    };

/**
 * Decide whether 범일NPC should be skipped, kept, repaired, or seeded.
 * Seed PIN / id fallback stay with the caller (pin pool + crypto).
 */
export function planEnsureAdminProfile(input: {
  settings: Record<string, unknown>;
  profiles: Record<string, unknown>[];
  now: string;
  npcAvatarSentinel: string;
}): EnsureAdminProfilePlan {
  const { settings, profiles, now, npcAvatarSentinel } = input;
  const adminPhoneDigits = adminPhoneDigitsFromSettings(settings);
  const phoneDisplay = String(settings['admin_phone'] ?? '').trim();
  if (!adminPhoneDigits && !phoneDisplay) return { action: 'skip' };

  const existing = findAdminProfileInRows(profiles, adminPhoneDigits);
  if (existing) {
    let fixed = withFixedAdminNickname({
      ...existing,
      nickname: ADMIN_FIXED_NICKNAME,
      phone_number: existing['phone_number'] ?? phoneDisplay,
      updated_at: now,
    }, adminPhoneDigits);
    const profileIndex = profiles.findIndex(p => String(p.id) === String(existing.id));
    const nicknameChanged = String(existing['nickname'] ?? '') !== ADMIN_FIXED_NICKNAME;
    const avatarNeedsRepair = String(existing['photo_url'] ?? '') !== npcAvatarSentinel;
    if (avatarNeedsRepair) {
      fixed = { ...fixed, photo_url: npcAvatarSentinel };
    }
    if (profileIndex >= 0 && (nicknameChanged || avatarNeedsRepair)) {
      return { action: 'repair', fixed, existing, profileIndex };
    }
    return { action: 'keep', row: fixed };
  }

  return { action: 'needs_seed', adminPhoneDigits, phoneDisplay };
}

/** Build the seed profile row once PIN is resolved. */
export function buildAdminSeedProfile(input: {
  adminPhoneDigits: string;
  phoneDisplay: string;
  now: string;
  fallbackId: string;
  pin: string;
  npcAvatarSentinel: string;
}): Record<string, unknown> {
  const { adminPhoneDigits, phoneDisplay, now, fallbackId, pin, npcAvatarSentinel } = input;
  const detId = adminPhoneDigits
    ? deterministicAdminProfileId(adminPhoneDigits)
    : fallbackId;
  return {
    id: detId,
    nickname: ADMIN_FIXED_NICKNAME,
    phone_number: phoneDisplay || adminPhoneDigits,
    photo_url: npcAvatarSentinel,
    pin_code: pin,
    personality_score: 50,
    created_at: now,
    updated_at: now,
  };
}

export type RestoreAdminAfterWipePlan =
  | { action: 'ensure_fallback' }
  | { action: 'restore'; row: Record<string, unknown> };

/**
 * After participant wipe: rebuild 범일NPC from backup/settings, or fall back to ensure.
 * Caller fills missing pin_code via pin pool when absent.
 */
export function planRestoreAdminProfileAfterWipe(input: {
  oldProfiles: Record<string, unknown>[];
  settingsRow: Record<string, unknown>;
  now: string;
  fallbackId: string;
  npcAvatarSentinel: string;
}): RestoreAdminAfterWipePlan {
  const { oldProfiles, settingsRow, now, fallbackId, npcAvatarSentinel } = input;
  const adminPhoneDigits = adminPhoneDigitsFromSettings(settingsRow);
  const adminBackup = adminPhoneDigits
    ? oldProfiles.find(p => isAdminProfilePhone(p['phone_number'], adminPhoneDigits))
    : undefined;
  if (!(adminBackup || adminPhoneDigits)) {
    return { action: 'ensure_fallback' };
  }
  const stableId = adminPhoneDigits
    ? deterministicAdminProfileId(adminPhoneDigits)
    : String(adminBackup?.['id'] ?? fallbackId);
  const restored = withFixedAdminNickname({
    ...(adminBackup ?? {}),
    id: String(adminBackup?.['id'] ?? stableId),
    nickname: ADMIN_FIXED_NICKNAME,
    phone_number: String(adminBackup?.['phone_number'] ?? settingsRow['admin_phone'] ?? ''),
    photo_url: npcAvatarSentinel,
    created_at: String(adminBackup?.['created_at'] ?? now),
    updated_at: now,
  }, adminPhoneDigits);
  return { action: 'restore', row: restored };
}
