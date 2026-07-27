import type { GameState } from '../../types/app';

export const GAME_TYPE_LABELS: Record<GameState['type'], string> = {
  balance: '밸런스 게임', image: '이미지 게임', custom: '커스텀 게임',
  dice: '주사위 게임', roulette: '룰렛', ladder: '사다리타기',
};

export const GAME_TYPE_ICONS: Record<GameState['type'], string> = {
  balance: '⚖️', image: '🖼️', custom: '🎯',
  dice: '🎲', roulette: '🎡', ladder: '🪜',
};

export const WHEEL_COLORS = [
  '#7c3aed','#9333ea','#c026d3','#db2777','#e11d48',
  '#ea580c','#d97706','#16a34a','#0891b2','#2563eb',
];

export const LADDER_PRESET_PRIZES = [
  '왕 👑', '꽝 💀', '술 앞잔(원샷X) 🍺', '질문 받기 ❓', '19금 질문받기 🔞',
];

export const MAX_GAME_PARTICIPANTS = 10;
