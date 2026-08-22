import { AVATAR_CATEGORIES } from './avatar-catalog';
import { AVATAR_COLOR_CATEGORIES, type AvatarColorChoice } from './avatar-color-catalog';
import { NPC_TEXT_AVATAR_SENTINEL, NPC_TEXT_AVATAR_LABEL } from './npc-text-avatar';

export type AvatarPickerAvatar = (typeof AVATAR_CATEGORIES)[number]['avatars'][number];

export type AvatarPickerTab =
  | { kind: 'avatars'; label: string; avatars: AvatarPickerAvatar[] }
  | { kind: 'colors'; label: string; colors: AvatarColorChoice[] }
  | { kind: 'npc-text'; label: string; sentinel: string; previewLabel: string };

/** 아바타 분류 + 카드 배경색 분류 (+ 범일NPC 전용 탭)를 하나의 탭 행으로 묶는다. */
export function buildAvatarPickerTabs(includeNpcTab: boolean): AvatarPickerTab[] {
  const avatarTabs: AvatarPickerTab[] = AVATAR_CATEGORIES.map((c) => ({
    kind: 'avatars' as const,
    label: c.label,
    avatars: c.avatars,
  }));
  const colorTabs: AvatarPickerTab[] = AVATAR_COLOR_CATEGORIES.map((c) => ({
    kind: 'colors' as const,
    label: c.label,
    colors: c.colors,
  }));
  const npcTabs: AvatarPickerTab[] = includeNpcTab
    ? [{
      kind: 'npc-text' as const,
      label: '🛡️ 범일NPC',
      sentinel: NPC_TEXT_AVATAR_SENTINEL,
      previewLabel: NPC_TEXT_AVATAR_LABEL,
    }]
    : [];
  return [...avatarTabs, ...colorTabs, ...npcTabs];
}
