// ─── 프로필 관련 공유 헬퍼 ────────────────────────────────────────────────────
// App.tsx, AdminApp.tsx, SeatingMap.tsx, StatsTabs.tsx 등에 흩어져 있던
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

/** 부드러운 파스텔 그라디언트 + 포인트 컬러 (닉네임별로 다양하게 분산) */
const AVATAR_PALETTE: Array<{ from: string; to: string; accent: string }> = [
  { from: '#dbeafe', to: '#bfdbfe', accent: '#2563eb' },
  { from: '#cffafe', to: '#a5f3fc', accent: '#0891b2' },
  { from: '#d1fae5', to: '#a7f3d0', accent: '#059669' },
  { from: '#ecfccb', to: '#d9f99d', accent: '#65a30d' },
  { from: '#fef3c7', to: '#fde68a', accent: '#d97706' },
  { from: '#fce7f3', to: '#fbcfe8', accent: '#db2777' },
  { from: '#ede9fe', to: '#ddd6fe', accent: '#7c3aed' },
  { from: '#ffe4e6', to: '#fecdd3', accent: '#e11d48' },
  { from: '#e0e7ff', to: '#c7d2fe', accent: '#4f46e5' },
  { from: '#ccfbf1', to: '#99f6e4', accent: '#0d9488' },
  { from: '#fae8ff', to: '#f5d0fe', accent: '#a855f7' },
  { from: '#ffedd5', to: '#fed7aa', accent: '#ea580c' },
];

export function genAvatar(nickname: string): string {
  const nick = nickname.trim() || '?';
  const { from, to, accent } = AVATAR_PALETTE[avatarPaletteIndex(nick) % AVATAR_PALETTE.length];
  const initial = nick.charAt(0);
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">',
    `<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">`,
    `<stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/></linearGradient></defs>`,
    '<rect width="400" height="400" fill="url(#g)"/>',
    `<text x="200" y="228" text-anchor="middle" font-family="system-ui,sans-serif" font-size="148" font-weight="600" fill="${accent}" opacity="0.88">${initial}</text>`,
    '</svg>',
  ].join('');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
