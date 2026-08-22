/** 범일NPC 전용 텍스트 아바타 — photo_url sentinel (preset webp 아님) */
export const NPC_TEXT_AVATAR_SENTINEL = 'npc:text-v1';

export const NPC_TEXT_AVATAR_MESSAGE =
  '안녕하세요 범일NPC입니다 문의사항은 채팅이나 직접 알려주세요';

export const NPC_TEXT_AVATAR_LABEL = '범일NPC 안내';

export function isNpcTextAvatar(url: string | null | undefined): boolean {
  return url === NPC_TEXT_AVATAR_SENTINEL;
}

/** ProfileCard·설정 미리보기용 SVG data URL (읽기 쉬운 줄바꿈) */
export function genNpcTextAvatar(): string {
  const lines = [
    '안녕하세요',
    '범일NPC입니다',
    '문의사항은',
    '채팅이나',
    '직접 알려주세요',
  ];
  const tspans = lines
    .map((line, i) => `<tspan x="200" dy="${i === 0 ? 0 : 1.35}em">${escapeXml(line)}</tspan>`)
    .join('');
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">',
    '<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">',
    '<stop offset="0%" stop-color="#cffafe"/><stop offset="100%" stop-color="#67e8f9"/>',
    '</linearGradient></defs>',
    '<rect width="400" height="400" fill="url(#g)"/>',
    '<rect x="16" y="16" width="368" height="368" rx="24" fill="rgba(255,255,255,0.55)" stroke="rgba(6,182,212,0.35)" stroke-width="2"/>',
    `<text x="200" y="118" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-size="26" font-weight="700" fill="#0e7490">${tspans}</text>`,
    '</svg>',
  ].join('');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
