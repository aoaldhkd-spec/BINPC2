import { createHash } from 'node:crypto';

/** user1/user2 쌍 키 (항상 lex sort) — FE `lib/chat-pair.ts` 와 동일 규칙 */
export function chatPairKey(u1: string, u2: string): string {
  const [a, b] = [String(u1), String(u2)].sort();
  return `${a}:${b}`;
}

/** 멀티 인스턴스에서도 동일 쌍 → 동일 row id (중복 채팅방 생성 방지) */
export function deterministicChatId(u1: string, u2: string): string {
  return `c_${createHash('sha256').update(chatPairKey(u1, u2)).digest('hex').slice(0, 32)}`;
}

/** 보낸 사람 → 받은 사람 시그널 한 줄. 방향이 있으므로 sort 하지 않음. */
export function deterministicSignalId(senderId: string, receiverId: string): string {
  return `sig_${createHash('sha256').update(`${senderId}\0${receiverId}`).digest('hex').slice(0, 32)}`;
}

/** 범일NPC(admin_phone) 프로필 — 재시드·리셋 후에도 동일 row id 유지 */
export function deterministicAdminProfileId(adminPhoneDigits: string): string {
  return `npc_${createHash('sha256').update(`admin-profile\0${adminPhoneDigits}`).digest('hex').slice(0, 32)}`;
}
