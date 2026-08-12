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
const AVATAR_COLORS_FOR_GEN = [
  '#0891b2','#0d9488','#059669','#16a34a','#ca8a04',
  '#d97706','#ea580c','#dc2626','#db2777','#9333ea',
  '#2563eb','#06b6d4','#10b981','#f97316','#a855f7',
];

export function genAvatar(nickname: string): string {
  const bg = AVATAR_COLORS_FOR_GEN[(nickname.charCodeAt(0) ?? 0) % AVATAR_COLORS_FOR_GEN.length];
  // [Fix-3] 중앙 흰색 닉네임 텍스트 완전 제거 → 사람 실루엣 아이콘으로 대체
  // 하단 검은색 반투명 이름/나이 라벨만 정보 표시 담당
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="${bg}"/><circle cx="200" cy="152" r="88" fill="rgba(255,255,255,0.28)"/><ellipse cx="200" cy="378" rx="138" ry="96" fill="rgba(255,255,255,0.28)"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
