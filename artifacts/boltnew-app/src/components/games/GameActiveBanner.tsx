import React from 'react';
import type { GameState } from '../../types/app';

const GAME_TYPE_ICONS: Record<GameState['type'], string> = {
  balance: '⚖️',
  image: '🖼️',
  custom: '🎯',
  dice: '🎲',
  roulette: '🎡',
  ladder: '🪜',
};

export function GameActiveBanner({ game, onClick }: { game: GameState; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-violet-600 to-purple-700 text-white px-4 py-2 flex items-center justify-between cursor-pointer shadow-lg animate-pulse"
    >
      <div className="flex items-center gap-2">
        <span className="text-base">{GAME_TYPE_ICONS[game.type]}</span>
        <span className="text-sm font-bold">게임 진행 중: {game.title}</span>
      </div>
      <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-bold">자세히 보기</span>
    </div>
  );
}
