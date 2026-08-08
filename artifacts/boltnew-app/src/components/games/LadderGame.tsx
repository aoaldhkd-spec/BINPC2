import React, { useState, useRef, useEffect } from 'react';
import type { Seat, Profile, TableMiniGameSession, LadderBar } from '../../types/app';
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

  const reset = () => { setBars(null); setEndCols(null); setRevealed(0); setRunning(false); };

  const startLadder = () => {
    if (n < 2) return;
    setRunning(true); setBars(null); setEndCols(null); setRevealed(0);
    // 1등, 2등, 3등, ... 순위 배정
    const labels = participants.map((_, i) => `${i + 1}등`);
    const sp = [...labels].sort(() => Math.random() - 0.5);

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

  const SVG_PAD = 24, SVG_W = Math.max(180, Math.min(320, SVG_PAD * 2 + n * 42)), SVG_H = 130;
  const colGap = n > 1 ? (SVG_W - SVG_PAD * 2) / (n - 1) : 0, rowGap = SVG_H / (ROWS + 1);
  const cx = (col: number) => SVG_PAD + col * colGap, ry = (row: number) => rowGap * (row + 1);

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <HowToPlayCard color="bg-amber-50 border-amber-200" steps={[
        { icon: '👥', text: '함께할 사람을 탭해서 선택하세요 (2명 이상)' },
        { icon: '🪜', text: '"사다리타기 시작!" 버튼을 누르면 결과가 한 명씩 공개돼요' },
        { icon: '🏆', text: '결과는 1등, 2등, 3등… 순위로 자동 배정돼요' },
        { icon: '📡', text: '같은 테이블이면 모두의 화면에 동시에 결과가 나타나요!' },
      ]} />
      <ParticipantSelector seats={seats} tableNumber={tableNumber} selected={participants}
        onChange={p => { setParticipants(p); reset(); }} profileMap={profileMap} />

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
