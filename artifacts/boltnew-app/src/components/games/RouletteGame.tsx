import React, { useState, useRef } from 'react';
import type { Seat, Profile, TableMiniGameSession } from '../../types/app';
import { WHEEL_COLORS } from './gameConstants';
import { ParticipantSelector } from './ParticipantSelector';
import { HowToPlayCard } from './HowToPlayCard';

export function RouletteGame({ seats, tableNumber, onBroadcast, myNickname, profileMap }: {
  seats: Seat[];
  tableNumber: number | null;
  onBroadcast?: (s: TableMiniGameSession) => void;
  myNickname?: string;
  profileMap: Map<string, Profile>;
}) {
  const [participants, setParticipants] = useState<string[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [totalRot, setTotalRot] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const wheelRef = useRef<SVGSVGElement>(null);

  const SIZE = 260, CX = SIZE / 2, CY = SIZE / 2, R = SIZE / 2 - 6;
  const n = participants.length;
  const segAngle = n > 0 ? 360 / n : 0;
  const toRad = (d: number) => (d * Math.PI) / 180;

  const getSegment = (i: number) => {
    const s = i * segAngle - 90, e = (i + 1) * segAngle - 90;
    const x1 = CX + R * Math.cos(toRad(s)), y1 = CY + R * Math.sin(toRad(s));
    const x2 = CX + R * Math.cos(toRad(e)), y2 = CY + R * Math.sin(toRad(e));
    const mid = s + segAngle / 2, tr = R * 0.65;
    return {
      path: `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${segAngle > 180 ? 1 : 0} 1 ${x2} ${y2} Z`,
      tx: CX + tr * Math.cos(toRad(mid)), ty: CY + tr * Math.sin(toRad(mid)), tAngle: mid + 90,
    };
  };

  const reset = () => {
    setResult(null); setShowResult(false); setTotalRot(0);
    if (wheelRef.current) { wheelRef.current.style.transition = 'none'; wheelRef.current.style.transform = 'rotate(0deg)'; }
  };

  const spin = () => {
    if (spinning || n < 2) return;
    const winnerIdx = Math.floor(Math.random() * n);
    if (onBroadcast && tableNumber !== null) {
      const session: TableMiniGameSession = {
        sessionId: Date.now().toString(), type: 'roulette', participants: [...participants],
        hostNickname: myNickname ?? '알 수 없음', tableNumber, startedAt: new Date().toISOString(), winnerIdx,
      };
      onBroadcast(session); setParticipants([]); reset(); return;
    }
    setSpinning(true); setResult(null); setShowResult(false);
    const winnerCenter = winnerIdx * segAngle + segAngle / 2;
    const newRot = totalRot + 360 * 8 + (360 - winnerCenter % 360);
    setTotalRot(newRot);
    if (wheelRef.current) {
      wheelRef.current.style.transition = 'transform 4s cubic-bezier(0.25, 0.1, 0.1, 1)';
      wheelRef.current.style.transform = `rotate(${newRot}deg)`;
    }
    setTimeout(() => { setResult(participants[winnerIdx]); setSpinning(false); setTimeout(() => setShowResult(true), 60); }, 4150);
  };

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <HowToPlayCard color="bg-violet-50 border-violet-200" steps={[
        { icon: '👥', text: '아래에서 함께할 사람을 탭해서 선택하세요 (2명 이상)' },
        { icon: '🎡', text: '선택이 끝나면 "돌림판 시작!" 버튼을 누르세요' },
        { icon: '🏆', text: '바늘이 멈추면 당첨자가 공개돼요! 같은 테이블이면 모두에게 동시에 보여요' },
      ]} />
      <ParticipantSelector seats={seats} tableNumber={tableNumber} selected={participants}
        onChange={p => { setParticipants(p); reset(); }} profileMap={profileMap} />
      {n >= 2 ? (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-1">
            <div className="w-0 h-0" style={{ borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: '22px solid #7c3aed', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.25))' }} />
            <div className="rounded-full shadow-xl overflow-hidden" style={{ width: SIZE, height: SIZE }}>
              <svg ref={wheelRef} width={SIZE} height={SIZE} style={{ display: 'block', transformOrigin: `${CX}px ${CY}px` }}>
                {participants.map((name, i) => {
                  const { path, tx, ty, tAngle } = getSegment(i);
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
          {showResult && result && (
            <div className="text-center">
              <div className="inline-block bg-gradient-to-r from-violet-500 to-purple-600 rounded-2xl px-8 py-4 shadow-xl shadow-violet-500/30">
                <p className="text-[10px] font-bold text-violet-200 uppercase tracking-widest mb-1">🏆 당첨!</p>
                <p className="text-2xl font-black text-white">{result}</p>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={spin} disabled={spinning}
              className="flex-1 py-3.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white font-black rounded-2xl text-sm transition-all active:scale-95 disabled:opacity-60 shadow-lg shadow-violet-500/30">
              {spinning ? '🎡 돌아가는 중...' : '🎡 돌림판 시작!'}
            </button>
            {(result || totalRot > 0) && (
              <button onClick={reset} className="px-4 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-2xl transition-all active:scale-95">초기화</button>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="text-5xl mb-3 opacity-40">🎡</div>
          <p className="text-sm font-bold text-gray-400">참여자를 2명 이상 선택하세요</p>
          <p className="text-xs text-gray-300 mt-1">최대 10명</p>
        </div>
      )}
    </div>
  );
}
