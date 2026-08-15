// ─── 공유 상수 ────────────────────────────────────────────────────────────────

// ─── localStorage 키 ────────────────────────────────────────────────────────
export const MATCHING_USER_KEY = 'matching_app_user_id';
export const MATCHING_DRAFT_KEY = 'matching_app_draft_step1';
export const MATCHING_LAST_RESET_KEY = 'matching_app_last_reset_signal';
export const MATCHING_PROFILES_CACHE_KEY = 'matching_profiles_cache';
export const ENTRY_VERIFIED_KEY = 'matching_entry_verified';
export const SCANNED_CONTACTS_KEY = 'matching_scanned_contacts';

// ─── MBTI 목록 ───────────────────────────────────────────────────────────────
export const MBTI_LIST = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
] as const;

// ─── 관심사 목록 ─────────────────────────────────────────────────────────────
export const BIO_LIST = ['여행', '독서', '운동', '영화', '요리', '음악', '게임', '캠핑', '사진', '패션'] as const;

// ─── 좌석 레이블 후보 (테스트 대시보드용) ────────────────────────────────────
export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const;

// ─── 하트 유형 ───────────────────────────────────────────────────────────────
export type HeartType = 'red' | 'blue' | 'pink' | 'green';

export const HEART_TYPES: {
  type: HeartType;
  label: string;
  desc: string;
  bg: string;
  border: string;
  ring: string;
  text: string;
  fillText: string;
  solidBg: string;
  solidHover: string;
  emoji: string;
}[] = [
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
  red: { emoji: '❤️', label: '호감', color: 'text-rose-600', bg: 'bg-rose-100' },
  blue: { emoji: '💙', label: '친구', color: 'text-blue-600', bg: 'bg-blue-100' },
  pink: { emoji: '💗', label: '뜨밤', color: 'text-pink-600', bg: 'bg-pink-100' },
  green: { emoji: '💚', label: '칭찬', color: 'text-emerald-600', bg: 'bg-emerald-100' },
};
