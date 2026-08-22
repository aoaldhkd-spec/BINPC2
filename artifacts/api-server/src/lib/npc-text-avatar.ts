/** 범일NPC 전용 텍스트 아바타 — photo_url sentinel */
export const NPC_TEXT_AVATAR_SENTINEL = 'npc:text-v1';

export function isNpcTextAvatar(url: unknown): boolean {
  return url === NPC_TEXT_AVATAR_SENTINEL;
}
