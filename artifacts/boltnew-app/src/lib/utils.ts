// ─── 공통 유틸리티 ────────────────────────────────────────────────────────────
// App.tsx에서 분리된 순수 함수 모음.


const CHOSUNG_LIST = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

export function getKoreanChosung(str: string): string {
  return str.split('').map(ch => {
    const code = ch.charCodeAt(0) - 0xAC00;
    if (code < 0 || code > 11171) return ch;
    return CHOSUNG_LIST[Math.floor(code / 588)];
  }).join('');
}

export function koreanMatch(text: string, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (text.toLowerCase().includes(q)) return true;
  const isChosung = [...q].every(c => CHOSUNG_LIST.includes(c));
  if (isChosung) return getKoreanChosung(text).includes(q);
  return false;
}

const BANNED_WORDS = [
  '씨발','시발','씨팔','ㅆㅂ','개새끼','씹새','병신','ㅂㅅ','찐따','꼴통',
  '닥쳐','꺼져','지랄','ㅈㄹ','개소리','보지','자지','창녀','창남',
  '니미','니맘','느그엄마','느그아빠','니애미','니애비','네미','니어미',
  '문재인','윤석열','이재명','한동훈','박근혜','홍준표',
  '국민의힘','더불어민주당','민주당','공산당','좌빨','빨갱이',
];

export function hasBannedWord(text: string): boolean {
  const t = text.replace(/\s/g, '');
  return BANNED_WORDS.some((w) => t.includes(w));
}

// ─── MBTI badge Tailwind classes ──────────────────────────────────────────────
export const MBTI_COLORS: Record<string, string> = {
  'INTJ': 'bg-violet-100 text-violet-700 border-violet-200', 'INTP': 'bg-violet-100 text-violet-700 border-violet-200',
  'ENTJ': 'bg-violet-100 text-violet-700 border-violet-200', 'ENTP': 'bg-violet-100 text-violet-700 border-violet-200',
  'INFJ': 'bg-teal-100 text-teal-700 border-teal-200',       'INFP': 'bg-teal-100 text-teal-700 border-teal-200',
  'ENFJ': 'bg-teal-100 text-teal-700 border-teal-200',       'ENFP': 'bg-teal-100 text-teal-700 border-teal-200',
  'ISTJ': 'bg-amber-100 text-amber-700 border-amber-200',    'ISFJ': 'bg-amber-100 text-amber-700 border-amber-200',
  'ESTJ': 'bg-amber-100 text-amber-700 border-amber-200',    'ESFJ': 'bg-amber-100 text-amber-700 border-amber-200',
  'ISTP': 'bg-sky-100 text-sky-700 border-sky-200',          'ISFP': 'bg-sky-100 text-sky-700 border-sky-200',
  'ESTP': 'bg-sky-100 text-sky-700 border-sky-200',          'ESFP': 'bg-sky-100 text-sky-700 border-sky-200',
};

/** Badge label + Tailwind color classes for dom/sub score */
export const domSubLabel = (score: number | null): { label: string; color: string } | null => {
  if (score === null || score === undefined) return null;
  if (score <= 2)  return { label: 'Dominant',  color: 'bg-rose-100 text-rose-700 border-rose-200' };
  if (score <= 4)  return { label: 'Dom 선호',   color: 'bg-rose-50 text-rose-600 border-rose-100' };
  if (score <= 6)  return { label: 'Switch',     color: 'bg-gray-100 text-gray-600 border-gray-200' };
  if (score <= 8)  return { label: 'Sub 선호',   color: 'bg-sky-50 text-sky-600 border-sky-100' };
  return             { label: 'Submissive',       color: 'bg-sky-100 text-sky-700 border-sky-200' };
};

// ── MBTI 배지 색상 ─────────────────────────────────────────────────────────────
export function getMbtiStyle(mbti: string | null): { bg: string; color: string; border: string } {
  if (!mbti) return { bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' };
  const g = mbti.length >= 3
    ? (mbti[1] === 'N' ? (mbti[2] === 'T' ? 'NT' : 'NF') : (mbti[2] === 'J' ? 'SJ' : 'SP'))
    : 'NT';
  return ({
    NT: { bg: '#ede9fe', color: '#7c3aed', border: '#c4b5fd' },
    NF: { bg: '#fce7f3', color: '#be185d', border: '#f9a8d4' },
    SJ: { bg: '#fef3c7', color: '#b45309', border: '#fcd34d' },
    SP: { bg: '#cffafe', color: '#0e7490', border: '#67e8f9' },
  } as Record<string, { bg: string; color: string; border: string }>)[g] ?? { bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' };
}
