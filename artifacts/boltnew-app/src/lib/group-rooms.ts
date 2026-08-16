import type { GroupChat } from '../types/app';

/** 사람당 입장 가능한 단톡 수. 방 정원(인원) 제한이 아님. */
export const MAX_GROUPS_PER_USER = 3;

const GROUP_LIMIT_MSG = '단체 채팅은 최대 3개까지 입장할 수 있어요.';

export function groupLimitMessage(): string {
  return GROUP_LIMIT_MSG;
}

export function groupRoomVisual(group: Pick<GroupChat, 'id' | 'name' | 'interest_tag'> & { room_kind?: string | null }): {
  emoji: string;
  afterparty: boolean;
  label: string;
} {
  const kind = group.room_kind ?? '';
  const tag = group.interest_tag ?? '';
  const name = group.name ?? '';
  if (kind === 'afterparty_club' || tag === '2차클럽' || group.id === 'group_afterparty_club' || name.includes('2차 클럽')) {
    return { emoji: '🪩', afterparty: true, label: '2차 클럽' };
  }
  if (kind === 'afterparty_drink' || tag === '2차술' || group.id === 'group_afterparty_drink' || name.includes('2차 술')) {
    return { emoji: '🍻', afterparty: true, label: '2차 술' };
  }
  return { emoji: '👥', afterparty: false, label: tag ? `#${tag}` : '단톡' };
}

export function sortGroupRooms(a: GroupChat, b: GroupChat): number {
  const va = groupRoomVisual(a).afterparty ? 0 : 1;
  const vb = groupRoomVisual(b).afterparty ? 0 : 1;
  if (va !== vb) return va - vb;
  if (!!a.joined !== !!b.joined) return a.joined ? -1 : 1;
  return (a.name ?? '').localeCompare(b.name ?? '', 'ko');
}
