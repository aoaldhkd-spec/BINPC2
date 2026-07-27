// ─── 공유 상수 ────────────────────────────────────────────────────────────────
// App.tsx, AdminApp.tsx, SeatingMap.tsx, SeatManagementMode.tsx, StatsTabs.tsx
// 등 여러 파일에 중복 선언되어 있던 상수들을 한 곳에 모았습니다.

// ─── localStorage 키 ────────────────────────────────────────────────────────
export const MATCHING_USER_KEY          = 'matching_app_user_id';
export const MATCHING_DRAFT_KEY         = 'matching_app_draft_step1';
export const MATCHING_LAST_RESET_KEY    = 'matching_app_last_reset_signal';
export const MATCHING_GUIDE_SHOWN_KEY   = 'matching_guide_shown';
export const MATCHING_PROFILES_CACHE_KEY = 'matching_profiles_cache';
export const MATCHING_SEATS_CACHE_KEY   = 'matching_seats_cache';
export const ENTRY_VERIFIED_KEY         = 'matching_entry_verified';

// ─── 아바타 색상 ─────────────────────────────────────────────────────────────
export const AVATAR_COLORS = [
  '#0891b2','#0d9488','#059669','#16a34a','#ca8a04',
  '#d97706','#ea580c','#dc2626','#db2777','#9333ea',
  '#2563eb','#06b6d4','#10b981','#f97316','#a855f7',
] as const;

// ─── MBTI 목록 ───────────────────────────────────────────────────────────────
export const MBTI_LIST = [
  'INTJ','INTP','ENTJ','ENTP',
  'INFJ','INFP','ENFJ','ENFP',
  'ISTJ','ISFJ','ESTJ','ESFJ',
  'ISTP','ISFP','ESTP','ESFP',
] as const;

// ─── 관심사 목록 ─────────────────────────────────────────────────────────────
export const BIO_LIST = ['여행','독서','운동','영화','요리','음악','게임','캠핑','사진','패션'] as const;

// ─── 좌석 레이블 후보 ────────────────────────────────────────────────────────
export const LETTERS = ['A','B','C','D','E','F','G','H','I','J'] as const;

// ─── 하트 유형 ───────────────────────────────────────────────────────────────
export type HeartType = 'red' | 'blue' | 'pink' | 'green';

export const HEART_TYPES: { type: HeartType; label: string; desc: string; bg: string; border: string; ring: string; text: string; fillText: string; solidBg: string; solidHover: string; emoji: string }[] = [
  { type: 'red', label: '맘에 드는 사람', desc: '로맨틱한 호감을 표현해요', bg: 'bg-rose-50', border: 'border-rose-300', ring: 'ring-rose-200', text: 'text-rose-700', fillText: 'fill-rose-400 text-rose-400', solidBg: 'bg-rose-500', solidHover: 'hover:bg-rose-600', emoji: '❤️' },
  { type: 'blue', label: '친구하고 싶어요', desc: '친구가 되고 싶을 때 보내요', bg: 'bg-blue-50', border: 'border-blue-300', ring: 'ring-blue-200', text: 'text-blue-700', fillText: 'fill-blue-400 text-blue-400', solidBg: 'bg-blue-500', solidHover: 'hover:bg-blue-600', emoji: '💙' },
  { type: 'pink', label: '뜨밤', desc: '함께 밤을 보내고 싶어요', bg: 'bg-orange-50', border: 'border-orange-300', ring: 'ring-orange-200', text: 'text-orange-700', fillText: 'fill-orange-400 text-orange-400', solidBg: 'bg-orange-500', solidHover: 'hover:bg-orange-600', emoji: '💗' },
  { type: 'green', label: '칭찬 하트', desc: '칭찬만 전달 (연락처 공유 불가)', bg: 'bg-emerald-50', border: 'border-emerald-300', ring: 'ring-emerald-200', text: 'text-emerald-700', fillText: 'fill-emerald-400 text-emerald-400', solidBg: 'bg-emerald-500', solidHover: 'hover:bg-emerald-600', emoji: '💚' },
];

export const HEART_META = {
  red: { label: '맘에 드는 사람', emoji: '❤️', color: '#ef4444' },
  blue: { label: '친구하고 싶어요', emoji: '💙', color: '#3b82f6' },
  pink: { label: '뜨밤', emoji: '💗', color: '#ec4899' },
  green: { label: '칭찬 하트', emoji: '💚', color: '#10b981' },
} as const;

/** Convenience wrapper — looks up full metadata for a HeartType */
export const heartMeta = (t: HeartType) => HEART_TYPES.find(h => h.type === t)!;

export const HEART_TYPE_META: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
  red:   { emoji: '❤️', label: '호감', color: 'text-rose-600',    bg: 'bg-rose-100' },
  blue:  { emoji: '💙', label: '친구', color: 'text-blue-600',   bg: 'bg-blue-100' },
  pink:  { emoji: '💗', label: '뜨밤', color: 'text-pink-600',   bg: 'bg-pink-100' },
  green: { emoji: '💚', label: '칭찬', color: 'text-emerald-600', bg: 'bg-emerald-100' },
};

// ─── 테이블 레이아웃 설정 ────────────────────────────────────────────────────
export interface TableConfig {
  type: 'row1' | 'sofa';
  leftCol: number[];
  rightCol: number[];
  topRow?: number[];
  bottomRow?: number[];
  sofaOnLeft: boolean;
}

export const TABLE_POSITIONS: Record<number, TableConfig> = {
  5:  { type: 'row1', leftCol: [1,2,3], rightCol: [8,7,6], bottomRow: [4,5], sofaOnLeft: false },
  6:  { type: 'row1', leftCol: [1,2,3], rightCol: [8,7,6], bottomRow: [4,5], sofaOnLeft: false },
  7:  { type: 'row1', leftCol: [1,2,3], rightCol: [8,7,6], bottomRow: [4,5], sofaOnLeft: false },
  8:  { type: 'row1', leftCol: [1,2,3], rightCol: [8,7,6], bottomRow: [4,5], sofaOnLeft: false },
  2:  { type: 'sofa', leftCol: [1,2,3], rightCol: [8,7,6], bottomRow: [4,5], sofaOnLeft: false },
  4:  { type: 'sofa', leftCol: [1,2,3], rightCol: [8,7,6], bottomRow: [4,5], sofaOnLeft: true },
  9:  { type: 'sofa', leftCol: [1,2,3], rightCol: [8,7,6], bottomRow: [4,5], sofaOnLeft: false },
  11: { type: 'sofa', leftCol: [1,2,3], rightCol: [8,7,6], bottomRow: [4,5], sofaOnLeft: true },
  1:  { type: 'sofa', leftCol: [3,2,1], rightCol: [6,7,8], topRow: [4,5], sofaOnLeft: false },
  3:  { type: 'sofa', leftCol: [3,2,1], rightCol: [6,7,8], topRow: [4,5], sofaOnLeft: true },
  10: { type: 'sofa', leftCol: [3,2,1], rightCol: [6,7,8], topRow: [4,5], sofaOnLeft: false },
  12: { type: 'sofa', leftCol: [3,2,1], rightCol: [6,7,8], topRow: [4,5], sofaOnLeft: true },
};
