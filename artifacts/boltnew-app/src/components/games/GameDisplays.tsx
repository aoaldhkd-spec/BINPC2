import React, { useState, useEffect } from 'react';

export function DiceDisplay({ result }: { result?: string }) {
  const diceFaces: Record<string, string> = { '1':'⚀','2':'⚁','3':'⚂','4':'⚃','5':'⚄','6':'⚅' };
  const face = result ? (diceFaces[result] ?? result) : null;
  return (
    <div className="flex flex-col items-center py-4">
      {face ? (
        <div className="text-center">
          <div className="text-9xl mb-2 animate-bounce">{face}</div>
          <p className="text-2xl font-black text-white">{result}이 나왔습니다!</p>
        </div>
      ) : (
        <div className="text-center">
          <div className="text-7xl mb-3 opacity-50">🎲</div>
          <p className="text-sm text-slate-400">관리자가 주사위를 굴리는 중...</p>
        </div>
      )}
    </div>
  );
}

export function RouletteDisplay({ result, options }: { result?: string; options?: string[] }) {
  const [spinning, setSpinning] = useState(!result);
  const [displayResult, setDisplayResult] = useState(result);
  useEffect(() => {
    if (result && !displayResult) {
      setSpinning(true);
      const t = setTimeout(() => { setSpinning(false); setDisplayResult(result); }, 1500);
      return () => clearTimeout(t);
    }
    setDisplayResult(result);
    return undefined;
  }, [result]);
  return (
    <div className="flex flex-col items-center py-4">
      {spinning ? (
        <div className="text-center">
          <div className="text-7xl mb-3 animate-spin" style={{ animationDuration: '0.3s' }}>🎡</div>
          <p className="text-sm text-slate-400">룰렛이 돌아가는 중...</p>
        </div>
      ) : displayResult ? (
        <div className="text-center">
          <div className="text-5xl mb-3">🏆</div>
          <p className="text-xs font-bold text-violet-300 uppercase tracking-widest mb-2">당첨!</p>
          <div className="bg-gradient-to-r from-violet-600 to-purple-600 rounded-2xl px-6 py-4">
            <p className="text-2xl font-black text-white">{displayResult}</p>
          </div>
        </div>
      ) : (
        <div className="text-center">
          {options && options.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 mb-3">
              {options.map((opt, i) => (
                <span key={i} className="px-3 py-1 bg-violet-500/20 border border-violet-500/40 rounded-full text-sm text-violet-200">{opt}</span>
              ))}
            </div>
          )}
          <div className="text-7xl mb-2 opacity-50">🎡</div>
          <p className="text-sm text-slate-400">관리자가 룰렛을 돌리는 중...</p>
        </div>
      )}
    </div>
  );
}

export function LadderDisplay({ result, participants }: { result?: string; participants?: string[] }) {
  const pairs: { participant: string; prize: string }[] = [];
  if (result) {
    try { const parsed = JSON.parse(result); if (Array.isArray(parsed)) pairs.push(...parsed); } catch {}
  }
  return (
    <div className="flex flex-col items-center py-3 w-full">
      {pairs.length > 0 ? (
        <div className="w-full space-y-2">
          <p className="text-xs font-bold text-violet-300 uppercase tracking-widest text-center mb-3">사다리 결과!</p>
          {pairs.map((p, i) => (
            <div key={i} className="flex items-center justify-between bg-slate-700/60 rounded-xl px-4 py-2.5 border border-slate-600/40">
              <span className="font-bold text-white text-sm">{p.participant}</span>
              <span className="text-violet-300 font-black text-sm">{p.prize}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center">
          <div className="text-7xl mb-2 opacity-50">🪜</div>
          {participants && participants.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5 mb-3">
              {participants.map((p, i) => <span key={i} className="px-2 py-0.5 bg-slate-700 rounded-full text-xs text-slate-300">{p}</span>)}
            </div>
          )}
          <p className="text-sm text-slate-400">관리자가 사다리를 진행 중...</p>
        </div>
      )}
    </div>
  );
}
