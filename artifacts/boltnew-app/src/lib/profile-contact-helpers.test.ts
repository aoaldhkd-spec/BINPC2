import { describe, expect, it } from 'vitest';
import type { BlockedUser, Profile } from '../types/app';
import {
  derivePrivacyProfileIds,
  type ScannedContact,
  upsertScannedContact,
} from './profile-contact-helpers';

describe('profile contact helpers', () => {
  it('moves a rescanned contact to the front and keeps the 50-item limit', () => {
    const existing = Array.from({ length: 50 }, (_, index): ScannedContact => ({
      id: `contact-${index}`,
      nickname: `연락처${index}`,
      scanned_at: 'old',
    }));
    const profile = {
      id: 'contact-20',
      nickname: '새 이름',
      mbti: 'INTJ',
      phone_number: '010-0000-0000',
    } as Profile;

    const next = upsertScannedContact(existing, profile, '2026-08-17T00:00:00.000Z');
    expect(next).toHaveLength(50);
    expect(next[0]).toMatchObject({
      id: 'contact-20',
      nickname: '새 이름',
      scanned_at: '2026-08-17T00:00:00.000Z',
    });
    expect(next.filter(contact => contact.id === 'contact-20')).toHaveLength(1);
  });

  it('derives mutual blocks separately from profiles that hid the current user', () => {
    const rows = [
      { id: '1', user_id: 'me', target_id: 'blocked-by-me', block_type: 'block' },
      { id: '2', user_id: 'blocked-me', target_id: 'me', block_type: 'block' },
      { id: '3', user_id: 'hid-me', target_id: 'me', block_type: 'hide' },
      { id: '4', user_id: 'me', target_id: 'i-hid', block_type: 'hide' },
    ] as BlockedUser[];

    const result = derivePrivacyProfileIds(rows, 'me');
    expect(result.blockedUserIds).toEqual(new Set(['blocked-by-me', 'blocked-me']));
    expect(result.hiddenByIds).toEqual(new Set(['hid-me']));
  });
});
