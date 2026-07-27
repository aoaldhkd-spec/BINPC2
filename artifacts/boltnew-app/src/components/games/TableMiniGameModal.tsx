import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { TableMiniGameSession } from '../../types/app';
import { WHEEL_COLORS } from './gameConstants';

export function TableMiniGameModal({ session, onClose }: {
  session: TableMiniGameSession;
  onClose: () => void;
}) {
  const wheelRef = useRef<SVGSVGElement>(null);
  const [showRouletteResult, setShowRouletteResult] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [visible, setVisible] = useState(false);

  const n = session.participants.length;
  const segAngle = n > 0 ? 360 / n : 0;

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30);
    if (session.type === 'roulette' && session.winnerIdx !== undefined) {
      const winnerCenter = session.winnerIdx * segAngle + segAngle / 2;
      const finalRot = 360 * 8 + (360 - winnerCenter % 360);
      requestAnimationFrame(() => {
        if (wheelRef.current) {
          wheelRef.current.style.transition = 'none';
          wheelRef.current.style.transform = 'rotate(0deg)';
          requestAnimationFrame(() => {
            if (wheelRef.current) {
              wheelRef.current.style.transition = 'transform 4s cubic-bezier(0.25, 0.1, 0.1, 1)';
              wheelRef.current.style.transform = `rotate(${finalRot}deg)`;
            }
          });
        }
      });
      const tm = setTimeout(() => setShowRouletteResult(true), 4250);
      return () => { clearTimeout(t); clearTimeout(tm); };
    }
    if (session.type === 'ladder' && session.endCols) {
      const timers: ReturnType<typeof setTimeout>[] = [];
      session.endCols.forEach((_, idx) => {
        timers.push(setTimeout(() => setRevealed(idx + 1), idx * 350 + 600));
      });
      return () => { clearTimeout(t); timers.forEach(clearTimeout); };
    }
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.sessionId]);

  const SIZE = 240, CX = SIZE / 2, CY = SIZE / 2, R = SIZE / 2 - 6;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const getSeg = (i: number) => {
    const s = i * segAngle - 90, e = (i + 1) * segAngle - 90;
    const x1 = CX + R * Math.cos(toRad(s)), y1 = CY + R * Math.sin(toRad(s));
    const x2 = CX + R * Math.cos(toRad(e)), y2 = CY + R * Math.sin(toRad(e));
    const mid = s + segAngle / 2, tr = R * 0.65;
    return {
      path: `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${segAngle > 180 ? 1 : 0} 1 ${x2} ${y2} Z`,
      tx: CX + tr * Math.cos(toRad(mid)), ty: CY + tr * Math.sin(toRad(mid)), tAngle: mid + 90,
    };
  };

  const bars = session.bars ?? [], endCols = session.endCols ?? [], shuffledPrizes = session.shuffledPrizes ?? [];
  const ROWS = Math.max(6, n + 2), SVG_PAD = 24;
  const SVG_W = Math.max(180, Math.min(320, SVG_PAD * 2 + n * 42)), SVG_H = 130;
  const colGap = n > 1 ? (SVG_W - SVG_PAD * 2) / (n - 1) : 0, rowGap = SVG_H / (ROWS + 1);
  const cx = (col: number) => SVG_PAD + col * colGap, ry = (row: number) => rowGap * (row + 1);

  return (
    <div className={`fixed inset-0 z-[97] flex items-end justify-center transition-all duration-300 ${visible ? 'bg-black/80 backdrop-blur-sm' : 'bg-transparent'}`}>
      <div className={`w-full max-w-sm bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[88dvh] transition-all duration-400 ${visible ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-4 flex items-center gap-3 flex-shrink-0 rounded-t-3xl">
          <span className="text-3xl">{session.type === 'ladder' ? '🪜' : '🎡'}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-violet-200 font-semibold">{session.tableNumber}번 테이블</p>
            <p className="text-sm font-black text-white leading-tight">
              {session.hostNickname}님이 {session.type === 'ladder' ? '사다리타기' : '돌림판'}를 시작했어요!
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 text-white active:scale-90">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-4">
          <div className="flex flex-wrap gap-1.5 justify-center">
            {session.participants.map((name, i) => (
              <span key={i} className="px-2.5 py-1 bg-violet-100 text-violet-700 text-xs font-bold rounded-full">{name}</span>
            ))}
          </div>

          {session.type === 'roulette' && n >= 2 && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-1">
                <div className="w-0 h-0" style={{ borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: '22px solid #7c3aed', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.25))' }} />
                <div className="rounded-full shadow-xl overflow-hidden" style={{ width: SIZE, height: SIZE }}>
                  <svg ref={wheelRef} width={SIZE} height={SIZE} style={{ display: 'block', transformOrigin: `${CX}px ${CY}px` }}>
                    {session.participants.map((name, i) => {
                      const { path, tx, ty, tAngle } = getSeg(i);
                      return (
                        <g key={i}>
                          <path d={path} fill={WHEEL_COLORS[i % WHEEL_COLORS.length]} stroke="white" strokeWidth="2" />
                          <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle"
                            fill="white" fontSize={n > 6 ? 9 : 11} fontWeight="bold"
                            transform={`rotate(${tAngle},${tx},${ty})`}>
                            {name.length > 5 ? name.slice(0, 5) + '…' : name}
                          </text>
                        </g>
                      );
                    })}
                    <circle cx={CX} cy={CY} r={18} fill="white" stroke="#7c3aed" strokeWidth="3" />
                    <circle cx={CX} cy={CY} r={9} fill="#7c3aed" />
                  </svg>
                </div>
              </div>
              {showRouletteResult && session.winnerIdx !== undefined && (
                <div className="text-center" style={{ animation: 'slideInUp 0.35s ease-out' }}>
                  <div className="inline-block bg-gradient-to-r from-violet-500 to-purple-600 rounded-2xl px-8 py-4 shadow-xl shadow-violet-500/30">
                    <p className="text-[10px] font-bold text-violet-200 uppercase tracking-widest mb-1">🏆 당첨!</p>
                    <p className="text-2xl font-black text-white">{session.participants[session.winnerIdx]}</p>
                  </div>
                </div>
              )}
              {!showRouletteResult && <p className="text-center text-xs text-gray-400 animate-pulse">🎡 돌아가는 중...</p>}
            </div>
          )}

          {session.type === 'ladder' && n >= 2 && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-2xl p-4">
                <div className="flex justify-center">
                  <svg width={SVG_W} height={SVG_H + 32} style={{ overflow: 'visible' }}>
                    {session.participants.map((name, i) => (
                      <text key={i} x={cx(i)} y={10} textAnchor="middle" fontSize={n > 6 ? 8 : 9} fontWeight="bold" fill="#6d28d9">
                        {name.length > 3 ? name.slice(0, 3) + '…' : name}
                      </text>
                    ))}
                    {session.participants.map((_, i) => (
                      <line key={i} x1={cx(i)} y1={15} x2={cx(i)} y2={SVG_H + 4} stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round" />
                    ))}
                    {bars.map((b, i) => (
                      <line key={i} x1={cx(b.col)} y1={ry(b.row)} x2={cx(b.col + 1)} y2={ry(b.row)} stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
                    ))}
                    {endCols.map((endCol, i) => (
                      <text key={i} x={cx(endCol)} y={SVG_H + 22} textAnchor="middle" fontSize={8} fill="#d97706" fontWeight="bold">
                        {(shuffledPrizes[endCol] ?? '').slice(0, 6)}
                      </text>
                    ))}
                  </svg>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">결과</p>
                {session.participants.slice(0, revealed).map((name, i) => (
                  <div key={i} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3" style={{ animation: 'slideInUp 0.3s ease-out' }}>
                    <span className="font-black text-gray-900 text-sm">{name}</span>
                    <span className="text-amber-700 font-black text-sm">{shuffledPrizes[endCols[i]] ?? ''}</span>
                  </div>
                ))}
                {revealed < n && <p className="text-center text-xs text-gray-400 animate-pulse py-1">결과 공개 중...</p>}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 pb-6 pt-3 flex-shrink-0">
          <button onClick={onClose}
            className="w-full py-3.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white font-black rounded-2xl text-sm shadow-lg shadow-violet-500/30 active:scale-[0.98]">
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
