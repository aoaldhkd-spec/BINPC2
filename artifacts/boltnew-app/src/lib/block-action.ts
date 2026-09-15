/**
 * Pure planners for block/hide + unblock wiring.
 * App owns ensureWriteSession, insert/delete, and setState.
 */
import type { BlockedUser } from '../types/app';

export const BLOCK_SESSION_EXPIRED_MESSAGE =
  '로그인 세션이 만료되었습니다. 앱을 새로고침한 뒤 다시 시도해 주세요.';

export type BlockType = 'block' | 'hide';

export type BlockRowLite = {
  user_id: string;
  target_id: string;
  block_type: string;
};

/** Skip self-target, missing session user, or duplicate same-type row. */
export function shouldSkipBlock(opts: {
  currentUserId: string | null | undefined;
  targetId: string;
  type: BlockType;
  blockedUsers: readonly BlockRowLite[];
}): boolean {
  const { currentUserId, targetId, type, blockedUsers } = opts;
  if (!currentUserId || targetId === currentUserId) return true;
  return blockedUsers.some(
    (b) => b.user_id === currentUserId && b.target_id === targetId && b.block_type === type,
  );
}

export function buildBlockedUserRow(opts: {
  id: string;
  currentUserId: string;
  targetId: string;
  type: BlockType;
  createdAt: string;
}): BlockedUser {
  return {
    id: opts.id,
    user_id: opts.currentUserId,
    target_id: opts.targetId,
    block_type: opts.type,
    created_at: opts.createdAt,
  };
}

export function blockFailureMessage(type: BlockType): string {
  return type === 'block'
    ? '차단에 실패했어요. 다시 시도해 주세요.'
    : '숨기기에 실패했어요. 다시 시도해 주세요.';
}

export function unblockFailureMessage(): string {
  return '차단 해제에 실패했어요. 다시 시도해 주세요.';
}
