// ─── 프로필 관련 공유 헬퍼 ────────────────────────────────────────────────────
// App.tsx, AdminApp.tsx, StatsTabs.tsx 등에 흩어져 있던
// 동일한 함수들을 이 파일 하나에 통합했습니다.

// ─── 포지션 (탑/바텀) ────────────────────────────────────────────────────────
export function getPositionLabel(score: number): string {
  if (score < 0)   return '비선호';
  if (score <= 0)  return '개바텀';
  if (score <= 24) return '바텀';
  if (score <= 49) return '올텀';
  if (score === 50) return '올';
  if (score <= 64) return '탑에 가까운 올';
  if (score <= 89) return '올탑';
  if (score <= 98) return '탑';
  return '퓨어탑';
}

export function getPositionBg(score: number): string {
  if (score < 0)   return '#6b7280';
  if (score <= 0)  return '#15803d';
  if (score <= 24) return '#22c55e';
  if (score <= 49) return '#84cc16';
  if (score <= 55) return '#eab308';
  if (score <= 75) return '#f59e0b';
  if (score <= 89) return '#3b82f6';
  if (score <= 98) return '#2563eb';
  return '#1d4ed8';
}

// ─── 돔/섭 ────────────────────────────────────────────────────────────────────
export function getDomSubLabel(score: number | null): string {
  if (score === null)  return '일반/보통';
  if (score <= 10)     return '완전 섭';
  if (score <= 30)     return '섭';
  if (score <= 49)     return '섭에 가까운 스위치';
  if (score <= 60)     return '스위치';
  if (score <= 69)     return '돔에 가까운 스위치';
  if (score <= 89)     return '돔';
  return '완전 돔';
}

export function getDomSubBg(score: number | null): string {
  if (score === null) return '#6b7280';
  if (score <= 10)    return '#ec4899';
  if (score <= 30)    return '#f472b6';
  if (score <= 49)    return '#fb923c';
  if (score <= 60)    return '#eab308';
  if (score <= 69)    return '#60a5fa';
  if (score <= 89)    return '#1d4ed8';
  return '#1e3a8a';
}

// ─── 포지션 배지 스타일 (파스텔 — 가독성 개선) ───────────────────────────────
export function getPositionStyle(score: number): { bg: string; text: string; border: string } {
  if (score < 0)   return { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' };
  if (score <= 24) return { bg: '#f0fdf4', text: '#15803d', border: '#86efac' };   // green
  if (score <= 49) return { bg: '#f7fee7', text: '#4d7c0f', border: '#bef264' };   // lime
  if (score <= 55) return { bg: '#fefce8', text: '#a16207', border: '#fde68a' };   // yellow
  if (score <= 75) return { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' };   // orange
  if (score <= 89) return { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' };   // blue
  if (score <= 98) return { bg: '#eef2ff', text: '#3730a3', border: '#c7d2fe' };   // indigo
  return           { bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe' };           // violet
}

// ─── 나이 계산 ────────────────────────────────────────────────────────────────
export function getKoreanAge(birthYear: number | null): string {
  if (!birthYear) return '나이 미입력';
  const age = new Date().getFullYear() - birthYear + 1;
  return `${age}세`;
}

// ─── 아바타 SVG 생성 ─────────────────────────────────────────────────────────
/** 닉네임 전체를 해시 — 첫 글자만 쓰면 한글 닉네임이 주황색에 몰림 */
function avatarPaletteIndex(nickname: string): number {
  let h = 0;
  for (let i = 0; i < nickname.length; i++) {
    h = ((h << 5) - h + nickname.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** 부드러운 파스텔 그라디언트 (닉네임별로 다양하게 분산, 텍스트 없음) */
const AVATAR_PALETTE: Array<{ from: string; to: string }> = [
  { from: '#dbeafe', to: '#bfdbfe' },
  { from: '#cffafe', to: '#a5f3fc' },
  { from: '#d1fae5', to: '#a7f3d0' },
  { from: '#ecfccb', to: '#d9f99d' },
  { from: '#fef3c7', to: '#fde68a' },
  { from: '#fce7f3', to: '#fbcfe8' },
  { from: '#ede9fe', to: '#ddd6fe' },
  { from: '#ffe4e6', to: '#fecdd3' },
  { from: '#e0e7ff', to: '#c7d2fe' },
  { from: '#ccfbf1', to: '#99f6e4' },
  { from: '#fae8ff', to: '#f5d0fe' },
  { from: '#ffedd5', to: '#fed7aa' },
];

/** 실제 업로드·프리셋 webp만 사진으로 취급 — null/dicebear/구형 SVG → genAvatar */
export function hasUploadedPhoto(url: string | null | undefined): boolean {
  if (!url || !url.trim()) return false;
  if (url.includes('dicebear')) return false;
  if (url.startsWith('data:image/svg')) return false;
  return true;
}

export function getAvatarGradient(nickname: string): { from: string; to: string } {
  const nick = nickname.trim() || '?';
  return AVATAR_PALETTE[avatarPaletteIndex(nick) % AVATAR_PALETTE.length];
}

/** 카드 배경·플레이스홀더용 CSS 그라디언트 (genAvatar SVG와 동일 색) */
export function getAvatarGradientCss(nickname: string): string {
  const { from, to } = getAvatarGradient(nickname);
  return `linear-gradient(135deg, ${from} 0%, ${to} 100%)`;
}

export function getAvatarSrc(url: string | null | undefined, nick: string): string {
  if (!hasUploadedPhoto(url)) return genAvatar(nick);
  return url!;
}

export function genAvatar(nickname: string): string {
  const nick = nickname.trim() || '?';
  const { from, to } = getAvatarGradient(nick);
  // 1:1 — 프리셋 webp·카드 flipZone과 동일
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">',
    `<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">`,
    `<stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/></linearGradient></defs>`,
    '<rect width="400" height="400" fill="url(#g)"/>',
    '</svg>',
  ].join('');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
