import React, { useState, useEffect } from 'react';
import type { BalanceGame } from '../../types/app';

export function GameResultModal({ game, counts, onClose }: { game: BalanceGame; counts: { a: number; b: number }; onClose: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 50); return () => clearTimeout(t); }, []);
  const total = counts.a + counts.b;
  const pctA = total > 0 ? Math.round((counts.a / total) * 100) : 50;
  const pctB = 100 - pctA;
  const winnerA = counts.a >= counts.b;
  return (
    <div className={`fixed inset-0 z-[120] flex items-center justify-center p-4 transition-all duration-300 ${visible ? 'bg-black/75 backdrop-blur-sm' : 'bg-transparent'}`}>
      <div className={`w-full max-w-sm transition-all duration-500 ${visible ? 'scale-100 opacity-100 translate-y-0' : 'scale-90 opacity-0 translate-y-8'}`}>
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl border border-violet-500/40 shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-violet-600 to-purple-700 px-5 py-4 text-center">
            <div className="text-2xl mb-1">🏆</div>
            <div className="text-[10px] font-black text-violet-200 uppercase tracking-widest mb-1">밸런스 게임 결과</div>
            <h2 className="text-base font-black text-white leading-snug">{game.question}</h2>
          </div>
          <div className="p-5 space-y-3">
            {(['a', 'b'] as const).map((opt) => {
              const label = opt === 'a' ? game.option_a : game.option_b;
              const pct = opt === 'a' ? pctA : pctB;
              const count = opt === 'a' ? counts.a : counts.b;
              const isWinner = opt === 'a' ? winnerA : !winnerA;
              return (
                <div key={opt} className={`rounded-2xl overflow-hidden border ${isWinner ? 'border-violet-400/60' : 'border-slate-600/40'}`}>
                  <div className={`px-4 py-3 flex items-center justify-between ${isWinner ? 'bg-violet-500/20' : 'bg-slate-700/30'}`}>
                    <div className="flex items-center gap-2">
                      {isWinner && <span className="text-base">🥇</span>}
                      <span className={`text-sm font-black ${isWinner ? 'text-white' : 'text-slate-400'}`}>{label}</span>
                    </div>
                    <span className={`text-lg font-black ${isWinner ? 'text-violet-300' : 'text-slate-500'}`}>{pct}%</span>
                  </div>
                  <div className="h-2 bg-slate-700">
                    <div className={`h-full transition-all duration-700 ${isWinner ? 'bg-gradient-to-r from-violet-500 to-purple-500' : 'bg-slate-600'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className={`px-4 py-1.5 text-xs ${isWinner ? 'text-violet-400' : 'text-slate-500'}`}>{count}명 선택</div>
                </div>
              );
            })}
            <p className="text-center text-slate-500 text-xs pt-1">총 {total}명 참여</p>
          </div>
          <div className="px-5 pb-5">
            <button onClick={onClose} className="w-full py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold rounded-xl transition-all shadow-lg">
              확인
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
