import React, { useState, useRef, useEffect } from 'react';
import type { Seat, Profile, TableMiniGameSession, LadderBar } from '../../types/app';
import { LADDER_PRESET_PRIZES } from './gameConstants';
import { ParticipantSelector } from './ParticipantSelector';
import { HowToPlayCard } from './HowToPlayCard';

function buildLadder(n: number, rows: number): LadderBar[] {
  const bars: LadderBar[] = [];
  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < n - 1) {
      if (Math.random() > 0.45) { bars.push({ row: r, col: c }); c += 2; } else c++;
    }
  }
  return bars;
}

function tracePath(_n: number, bars: LadderBar[], rows: number, startCol: number): number {
  let col = startCol;
  for (let r = 0; r < rows; r++) {
    if (bars.some(b => b.row === r && b.col === col)) { col++; continue; }
    if (col > 0 && bars.some(b => b.row === r && b.col === col - 1)) { col--; continue; }
  }
  return col;
}

export function LadderGame({ seats, tableNumber, onBroadcast, myNickname, profileMap }: {
  seats: Seat[];
  tableNumber: number | null;
  onBroadcast?: (s: TableMiniGameSession) => void;
  myNickname?: string;
  profileMap: Map<string, Profile>;
}) {
  const [participants, setParticipants] = useState<string[]>([]);
  const [prizes, setPrizes] = useState<string[]>([]);
  const [penaltyCount, setPenaltyCount] = useState(1);
  const [prizeInput, setPrizeInput] = useState('');
  const [running, setRunning] = useState(false);
  const [bars, setBars] = useState<LadderBar[] | null>(null);
  const [endCols, setEndCols] = useState<number[] | null>(null);
  const [shuffledPrizes, setShuffledPrizes] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(0);
  const ladderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  // 언마운트 시 타이머 정리 (메모리 누수 방지)
  useEffect(() => () => {
    if (ladderTimerRef.current) clearTimeout(ladderTimerRef.current);
    revealTimerRefs.current.forEach(t => clearTimeout(t));
  }, []);

  const n = participants.length;
  const ROWS = Math.max(6, n + 2);
  const effectivePenaltyCount = Math.min(penaltyCount, Math.max(1, n));

  const reset = () => { setBars(null); setEndCols(null); setRevealed(0); setRunning(false); };

  const startLadder = () => {
    if (n < 2) return;
    setRunning(true); setBars(null); setEndCols(null); setRevealed(0);
    const pc = effectivePenaltyCount;
    const penaltyPrizes = prizes.length >= pc ? prizes.slice(0, pc) : [...prizes, ...Array(pc - prizes.length).fill('벌칙 🎯')].slice(0, pc);
    const effectivePrizes = [...penaltyPrizes, ...Array(n - pc).fill('통과 ✓')];
    const sp = [...effectivePrizes].sort(() => Math.random() - 0.5);

    if (onBroadcast && tableNumber !== null) {
      const newBars = buildLadder(n, ROWS);
      const cols = participants.map((_, i) => tracePath(n, newBars, ROWS, i));
      const session: TableMiniGameSession = {
        sessionId: Date.now().toString(), type: 'ladder', participants: [...participants],
        hostNickname: myNickname ?? '알 수 없음', tableNumber, startedAt: new Date().toISOString(),
        bars: newBars, endCols: cols, shuffledPrizes: sp,
      };
      ladderTimerRef.current = setTimeout(() => { onBroadcast(session); setRunning(false); reset(); }, 800);
      return;
    }
    setShuffledPrizes(sp);
    const newBars = buildLadder(n, ROWS);
    const cols = participants.map((_, i) => tracePath(n, newBars, ROWS, i));
    ladderTimerRef.current = setTimeout(() => {
      setBars(newBars); setEndCols(cols); setRunning(false);
      revealTimerRefs.current.forEach(t => clearTimeout(t));
      revealTimerRefs.current = cols.map((_, idx) => setTimeout(() => setRevealed(idx + 1), idx * 350 + 200));
    }, 1400);
  };

  const addPrize = () => {
    if (prizeInput.trim() && prizes.length < effectivePenaltyCount) { setPrizes(p => [...p, prizeInput.trim()]); setPrizeInput(''); }
  };

  const SVG_PAD = 24, SVG_W = Math.max(180, Math.min(320, SVG_PAD * 2 + n * 42)), SVG_H = 130;
  const colGap = n > 1 ? (SVG_W - SVG_PAD * 2) / (n - 1) : 0, rowGap = SVG_H / (ROWS + 1);
  const cx = (col: number) => SVG_PAD + col * colGap, ry = (row: number) => rowGap * (row + 1);

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <HowToPlayCard color="bg-amber-50 border-amber-200" steps={[
        { icon: '👥', text: '함께할 사람을 탭해서 선택하세요 (2명 이상)' },
        { icon: '🎁', text: '벌칙 항목을 골라보세요 — 없으면 1등·2등·3등… 으로 자동 설정돼요' },
        { icon: '🪜', text: '"사다리타기 시작!" 버튼을 누르면 결과가 한 명씩 공개돼요' },
        { icon: '📡', text: '같은 테이블이면 모두의 화면에 동시에 결과가 나타나요!' },
      ]} />
      <ParticipantSelector seats={seats} tableNumber={tableNumber} selected={participants}
        onChange={p => { setParticipants(p); reset(); }} profileMap={profileMap} />

      {n >= 2 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">벌칙 인원</p>
            <div className="flex items-center gap-2">
              <button onClick={() => { const next = Math.max(1, penaltyCount - 1); setPenaltyCount(next); setPrizes(p => p.slice(0, next)); }}
                disabled={effectivePenaltyCount <= 1}
                className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 font-black text-sm flex items-center justify-center hover:bg-gray-200 disabled:opacity-30 active:scale-95">−</button>
              <span className="text-sm font-black text-amber-600 w-16 text-center">{effectivePenaltyCount} / {n}명</span>
              <button onClick={() => setPenaltyCount(c => Math.min(n, c + 1))} disabled={effectivePenaltyCount >= n}
                className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 font-black text-sm flex items-center justify-center hover:bg-gray-200 disabled:opacity-30 active:scale-95">+</button>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
              벌칙 항목 <span className="text-gray-400 font-normal normal-case">({prizes.length}/{effectivePenaltyCount} — 미선택 시 "벌칙 🎯" 자동)</span>
            </p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {LADDER_PRESET_PRIZES.map(p => (
                <button key={p} onClick={() => { if (!prizes.includes(p) && prizes.length < effectivePenaltyCount) setPrizes(prev => [...prev, p]); }}
                  disabled={prizes.includes(p) || prizes.length >= effectivePenaltyCount}
                  className={`text-xs px-2.5 py-1.5 rounded-xl border font-semibold transition-all disabled:opacity-40 active:scale-95 ${prizes.includes(p) ? 'bg-amber-100 border-amber-400 text-amber-700' : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-amber-300 hover:text-amber-600'}`}>
                  {p}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text" value={prizeInput} onChange={e => setPrizeInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addPrize()} placeholder="직접 입력"
                disabled={prizes.length >= effectivePenaltyCount}
                className="flex-1 bg-gray-50 border border-gray-200 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50" />
              <button onClick={addPrize} disabled={!prizeInput.trim() || prizes.length >= effectivePenaltyCount}
                className="px-3 py-2 bg-amber-500 text-white text-xs font-bold rounded-xl disabled:opacity-40 active:scale-95">추가</button>
            </div>
            {prizes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {prizes.map((p, i) => (
                  <button key={i} onClick={() => setPrizes(prev => prev.filter((_, j) => j !== i))}
                    className="flex items-center gap-1 px-2.5 py-1 bg-amber-100 border border-amber-300 text-amber-800 text-xs font-bold rounded-full active:scale-95">
                    {p}<span className="text-amber-400 text-[10px] ml-0.5">✕</span>
                  </button>
                ))}
              </div>
            )}
            {n > effectivePenaltyCount && (
              <p className="text-[11px] text-gray-400 mt-1.5">나머지 {n - effectivePenaltyCount}명 → <span className="font-bold text-green-600">통과 ✓</span></p>
            )}
          </div>
        </div>
      )}

      {bars && endCols && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <p className="text-xs font-bold text-gray-500 text-center uppercase tracking-wider mb-3">🪜 사다리</p>
          <div className="flex justify-center">
            <svg width={SVG_W} height={SVG_H + 32} style={{ overflow: 'visible' }}>
              {participants.map((name, i) => (
                <text key={i} x={cx(i)} y={10} textAnchor="middle" fontSize={n > 6 ? 8 : 9} fontWeight="bold" fill="#6d28d9">
                  {name.length > 3 ? name.slice(0, 3) + '…' : name}
                </text>
              ))}
              {participants.map((_, i) => (
                <line key={i} x1={cx(i)} y1={15} x2={cx(i)} y2={SVG_H + 4} stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round" />
              ))}
              {bars.map((b, i) => (
                <line key={i} x1={cx(b.col)} y1={ry(b.row)} x2={cx(b.col + 1)} y2={ry(b.row)} stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
              ))}
              {endCols.map((endCol, i) => (
                <text key={i} x={cx(endCol)} y={SVG_H + 22} textAnchor="middle" fontSize={8} fill="#d97706" fontWeight="bold">
                  {(shuffledPrizes[endCol] ?? '').length > 6 ? (shuffledPrizes[endCol] ?? '').slice(0, 6) : (shuffledPrizes[endCol] ?? '')}
                </text>
              ))}
            </svg>
          </div>
        </div>
      )}

      {endCols && shuffledPrizes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">결과</p>
          {participants.slice(0, revealed).map((name, i) => (
            <div key={i} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3" style={{ animation: 'slideInUp 0.3s ease-out' }}>
              <span className="font-black text-gray-900 text-sm">{name}</span>
              <span className="text-amber-700 font-black text-sm">{shuffledPrizes[endCols[i]] ?? ''}</span>
            </div>
          ))}
        </div>
      )}

      {running && (
        <div className="text-center py-10">
          <div className="text-5xl mb-3 animate-bounce">🪜</div>
          <p className="text-sm font-bold text-gray-500">사다리 타는 중...</p>
        </div>
      )}

      {n >= 2 ? (
        <div className="flex gap-2">
          <button onClick={startLadder} disabled={running}
            className="flex-1 py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black rounded-2xl text-sm transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-amber-500/30">
            {running ? '사다리 타는 중...' : '🪜 사다리타기 시작!'}
          </button>
          {(bars || running) && (
            <button onClick={reset} className="px-4 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-2xl transition-all active:scale-95">다시</button>
          )}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="text-5xl mb-3 opacity-40">🪜</div>
          <p className="text-sm font-bold text-gray-400">참여자를 2명 이상 선택하세요</p>
          <p className="text-xs text-gray-300 mt-1">최대 10명</p>
        </div>
      )}
    </div>
  );
}
