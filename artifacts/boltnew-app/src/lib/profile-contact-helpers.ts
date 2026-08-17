import type { BlockedUser, Profile } from '../types/app';

export type ScannedContact = {
  id: string;
  nickname: string;
  mbti?: string | null;
  photo_url?: string | null;
  kakao_id?: string | null;
  instagram_id?: string | null;
  phone_number?: string | null;
  contact_private?: boolean | null;
  scanned_at: string;
};

export function upsertScannedContact(
  contacts: readonly ScannedContact[],
  profile: Profile,
  scannedAt: string,
): ScannedContact[] {
  if (!profile.id) return [...contacts];
  const entry: ScannedContact = {
    id: profile.id,
    nickname: profile.nickname ?? '?',
    mbti: profile.mbti,
    photo_url: profile.photo_url,
    kakao_id: profile.kakao_id,
    instagram_id: profile.instagram_id,
    phone_number: profile.phone_number,
    contact_private: profile.contact_private,
    scanned_at: scannedAt,
  };
  return [entry, ...contacts.filter(contact => contact.id !== entry.id)].slice(0, 50);
}

export function derivePrivacyProfileIds(
  blockedUsers: readonly BlockedUser[],
  currentUserId: string | null,
): { blockedUserIds: Set<string>; hiddenByIds: Set<string> } {
  const blockedUserIds = new Set<string>();
  const hiddenByIds = new Set<string>();

  for (const block of blockedUsers) {
    if (block.block_type === 'block') {
      if (block.user_id === currentUserId) blockedUserIds.add(block.target_id);
      else if (block.target_id === currentUserId) blockedUserIds.add(block.user_id);
    } else if (block.block_type === 'hide' && block.target_id === currentUserId) {
      hiddenByIds.add(block.user_id);
    }
  }

  return { blockedUserIds, hiddenByIds };
}
