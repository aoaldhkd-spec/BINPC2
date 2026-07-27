import React from 'react';
import type { BalanceGame } from '../../types/app';

export function BalanceGameCard({
  game, myVote, voteCounts, currentUserId, eligibleCount, onVote, onEnd,
}: {
  game: BalanceGame;
  myVote: 'a' | 'b' | null;
  voteCounts: { a: number; b: number };
  currentUserId: string | null;
  eligibleCount: number;
  onVote: (gameId: string, option: 'a' | 'b') => void;
  onEnd?: (gameId: string) => void;
}) {
  const total = voteCounts.a + voteCounts.b;
  const pctA = total > 0 ? Math.round((voteCounts.a / total) * 100) : 50;
  const pctB = 100 - pctA;
  const ended = game.status === 'ended';
  const allVoted = eligibleCount > 0 && total >= eligibleCount;
  const showResult = ended || allVoted || !!myVote;

  return (
    <div className={`bg-white rounded-2xl shadow-sm border overflow-hidden transition-all ${ended ? 'opacity-70 border-gray-200' : 'border-violet-200 shadow-violet-100'}`}>
      <div className={`px-4 py-3 flex items-center justify-between ${ended ? 'bg-gray-50' : 'bg-gradient-to-r from-violet-50 to-purple-50'}`}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-violet-500 bg-violet-100 px-2 py-0.5 rounded-full">
            {game.scope === 'table' ? `${game.table_number}번 테이블` : '전체'}
          </span>
          {game.creator_nickname && <span className="text-xs text-gray-400">by {game.creator_nickname}</span>}
        </div>
        <div className="flex items-center gap-2">
          {ended ? (
            <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">종료됨</span>
          ) : (
            <span className="flex items-center gap-1 text-xs font-bold text-violet-500">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse inline-block" />
              투표 중 · {total}/{eligibleCount}명
            </span>
          )}
          {onEnd && !ended && currentUserId === game.creator_id && (
            <button onClick={() => onEnd(game.id)} className="text-[10px] font-bold text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded-full border border-red-200 transition-colors">게임 종료</button>
          )}
        </div>
      </div>

      <div className="px-4 py-4">
        <p className="text-base font-black text-gray-900 text-center mb-4 leading-snug">{game.question}</p>
        {showResult ? (
          <div className="space-y-2.5 mb-3">
            {(['a', 'b'] as const).map((opt) => {
              const label = opt === 'a' ? game.option_a : game.option_b;
              const pct = opt === 'a' ? pctA : pctB;
              const count = opt === 'a' ? voteCounts.a : voteCounts.b;
              const isMyVote = myVote === opt;
              const isWinner = ended && count > (opt === 'a' ? voteCounts.b : voteCounts.a);
              const colorFill = opt === 'a' ? 'bg-blue-500/25' : 'bg-rose-500/25';
              const colorBar = opt === 'a' ? 'bg-blue-500' : 'bg-rose-500';
              const colorLabel = opt === 'a' ? 'text-blue-700' : 'text-rose-700';
              const colorCount = opt === 'a' ? 'text-blue-600' : 'text-rose-600';
              const borderColor = isMyVote ? (opt === 'a' ? 'border-blue-400' : 'border-rose-400') : 'border-gray-100';
              return (
                <div key={opt} className={`rounded-xl overflow-hidden border-2 transition-all ${borderColor}`}>
                  <div className="relative h-14 bg-gray-50">
                    <div className={`absolute inset-y-0 left-0 transition-all duration-700 ease-out ${colorFill}`} style={{ width: `${pct}%` }} />
                    <div className="absolute inset-0 flex items-center justify-between px-3">
                      <span className={`text-sm font-bold ${colorLabel} leading-tight`}>
                        {isMyVote && <span className="mr-1 text-xs">✓</span>}{label}
                        {isWinner && <span className="ml-1 text-base">🏆</span>}
                      </span>
                      <div className={`flex flex-col items-end ${colorCount}`}>
                        <span className="text-lg font-black leading-none">{pct}%</span>
                        <span className="text-[10px] font-semibold opacity-70">{count}명</span>
                      </div>
                    </div>
                  </div>
                  <div className={`h-1 ${colorBar} transition-all duration-700 ease-out`} style={{ width: `${pct}%` }} />
                </div>
              );
            })}
            <div className="flex items-center justify-center gap-2 pt-1">
              {allVoted && !ended && <span className="text-[11px] font-black text-violet-600 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">전원 투표 완료!</span>}
              <span className="text-[11px] text-gray-400 font-medium">총 {total}명 참여</span>
              {ended && total > 0 && (<>
                <span className="text-gray-300">·</span>
                <span className="text-[11px] font-bold text-blue-600">{game.option_a} {voteCounts.a}명</span>
                <span className="text-gray-300">vs</span>
                <span className="text-[11px] font-bold text-rose-600">{voteCounts.b}명 {game.option_b}</span>
              </>)}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button onClick={() => onVote(game.id, 'a')}
              className="py-3 rounded-xl font-bold text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 border-2 border-blue-200 hover:border-blue-400 transition-all active:scale-95">{game.option_a}</button>
            <button onClick={() => onVote(game.id, 'b')}
              className="py-3 rounded-xl font-bold text-sm bg-rose-50 hover:bg-rose-100 text-rose-700 border-2 border-rose-200 hover:border-rose-400 transition-all active:scale-95">{game.option_b}</button>
          </div>
        )}
      </div>
    </div>
  );
}
