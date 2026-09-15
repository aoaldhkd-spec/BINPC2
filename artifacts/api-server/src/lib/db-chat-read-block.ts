/**
 * Chat read stamp + mutual-block pure helpers — extracted from routes/db.ts.
 * Store lookup and clock stay in db.ts (thin wrappers).
 */

/** chat_reads.write 는 서버 시계 — 폰 시계가 느리면 말풍선 '1'이 안 지워진다. */
export function stampChatReadAt(
  row: Record<string, unknown>,
  nowIso: string,
): void {
  const provided = String(row.read_at ?? '');
  row.read_at = provided > nowIso ? provided : nowIso;
}

/** Mutual block (block_type=block) between chat participants — hide is profile-only. */
export function isChatPairBlocked(
  blockedUsers: Record<string, unknown>[],
  userA: string,
  userB: string,
): boolean {
  const a = String(userA);
  const b = String(userB);
  return blockedUsers.some(row =>
    row.block_type === 'block' && (
      (String(row.user_id) === a && String(row.target_id) === b)
      || (String(row.user_id) === b && String(row.target_id) === a)
    ),
  );
}
