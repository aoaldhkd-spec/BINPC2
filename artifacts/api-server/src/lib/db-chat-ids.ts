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
