/** 프로필 카드·플레이스홀더용 파스텔 배경색 — 분류 피커(내 설정) */
export type AvatarColorChoice = {
  /** null = 닉네임 기반 자동 */
  index: number | null;
  label: string;
};

export type AvatarColorCategory = {
  label: string;
  colors: AvatarColorChoice[];
};

export const AVATAR_COLOR_CATEGORIES: AvatarColorCategory[] = [
  {
    label: '✨ 자동',
    colors: [{ index: null, label: '닉네임 맞춤' }],
  },
  {
    label: '💙 쿨톤',
    colors: [
      { index: 0, label: '하늘 블루' },
      { index: 1, label: '민트 시안' },
      { index: 8, label: '연보라' },
      { index: 9, label: '청록' },
    ],
  },
  {
    label: '💚 그린',
    colors: [
      { index: 2, label: '민트 그린' },
      { index: 3, label: '라임' },
    ],
  },
  {
    label: '💛 웜톤',
    colors: [
      { index: 4, label: '레몬' },
      { index: 11, label: '피치' },
    ],
  },
  {
    label: '💗 핑크',
    colors: [
      { index: 5, label: '벚꽃' },
      { index: 7, label: '로즈' },
      { index: 10, label: '라일락' },
    ],
  },
  {
    label: '💜 퍼플',
    colors: [{ index: 6, label: '라벤더' }],
  },
];

export const AVATAR_COLOR_COUNT = 12;
