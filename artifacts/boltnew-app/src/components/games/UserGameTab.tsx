import React, { useState, useMemo } from 'react';
import { Gamepad2, ChevronDown } from 'lucide-react';
import type { BalanceGame, Seat, Profile, TableMiniGameSession, UserGameSubTab } from '../../types/app';
import { BalanceGameCard } from './BalanceGameCard';
import { MiniGameTips } from './MiniGameTips';
import { CreateGameModal } from './CreateGameModal';
import { LadderGame } from './LadderGame';
import { RouletteGame } from './RouletteGame';

const isOxBalanceGame = (g: BalanceGame) => g.option_a === '⭕ O' && g.option_b === '❌ X';

export function UserGameTab({
  currentUserId, tableNumber, currentUserNickname, balanceGames, voteCounts, myVotes,
  seats, onVote, onCreateGame, onEndGame, onBroadcastGame, profileMap,
}: {
  currentUserId: string | null;
  tableNumber: number | null;
  currentUserNickname: string;
  balanceGames: BalanceGame[];
  voteCounts: Map<string, { a: number; b: number }>;
  myVotes: Map<string, 'a' | 'b'>;
  seats: Seat[];
  profileMap: Map<string, Profile>;
  onVote: (gameId: string, option: 'a' | 'b') => void;
  onCreateGame: (question: string, optA: string, optB: string, scope: 'global' | 'table') => void;
  onEndGame: (gameId: string) => void;
  onBroadcastGame?: (s: TableMiniGameSession) => void;
}) {
  const [subTab, setSubTab] = useState<UserGameSubTab>('balance');
  const [showCreate, setShowCreate] = useState(false);

  // 렌더마다 반복 filter 방지: balanceGames/tableNumber가 바뀔 때만 재계산
  const { activeGlobal, activeTable, allActive, ended } = useMemo(() => {
    const nonOx = balanceGames.filter(g => !isOxBalanceGame(g));
    return {
      activeGlobal: nonOx.filter(g => g.status === 'active' && g.scope === 'global'),
      activeTable: tableNumber != null
        ? nonOx.filter(g => g.status === 'active' && g.scope === 'table' && g.table_number === tableNumber)
        : [],
      allActive: nonOx.filter(g => g.status === 'active' && !(g.scope === 'table' && tableNumber !== null && g.table_number !== tableNumber)),
      ended: nonOx.filter(g => g.status === 'ended').slice(0, 5),
    };
  }, [balanceGames, tableNumber]);

  // 자리 점유 수 사전 계산 — .map() 내부 반복 filter 제거
  const occupiedTotal = useMemo(() => seats.filter(s => s.status === 'occupied').length, [seats]);
  const tableOccupied = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of seats) {
      if (s.status === 'occupied' && s.table_number != null)
        m.set(s.table_number, (m.get(s.table_number) ?? 0) + 1);
    }
    return m;
  }, [seats]);

  const SUBTABS: { id: UserGameSubTab; label: string; icon: string }[] = [
    { id: 'balance', label: '밸런스', icon: '⚡' },
    { id: 'ladder',  label: '사다리', icon: '🪜' },
    { id: 'roulette', label: '돌림판', icon: '🎡' },
  ];

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex bg-gray-100 rounded-2xl p-1 gap-1">
        {SUBTABS.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all ${subTab === t.id ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {subTab === 'balance' && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-gray-900">실시간 밸런스 게임</h2>
              <p className="text-xs text-gray-400 mt-0.5">투표 결과가 실시간으로 반영됩니다</p>
            </div>
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-violet-500 hover:bg-violet-600 text-white text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95">
              <Gamepad2 className="w-3.5 h-3.5" />게임 만들기
            </button>
          </div>

          {allActive.length === 0 && ended.length === 0 && (
            <div className="text-center py-16">
              <Gamepad2 className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">진행 중인 게임이 없습니다.</p>
              <p className="text-xs text-gray-300 mt-1">게임을 직접 만들어보세요!</p>
            </div>
          )}

          {activeGlobal.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] font-black text-violet-500 uppercase tracking-widest">전체 게임</p>
              {activeGlobal.map(g => (
                <BalanceGameCard key={g.id} game={g} myVote={myVotes.get(g.id) ?? null}
                  voteCounts={voteCounts.get(g.id) ?? { a: 0, b: 0 }} currentUserId={currentUserId}
                  eligibleCount={occupiedTotal}
                  onVote={onVote} onEnd={onEndGame} />
              ))}
            </div>
          )}

          {activeTable.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{tableNumber}번 테이블 게임</p>
              {activeTable.map(g => (
                <BalanceGameCard key={g.id} game={g} myVote={myVotes.get(g.id) ?? null}
                  voteCounts={voteCounts.get(g.id) ?? { a: 0, b: 0 }} currentUserId={currentUserId}
                  eligibleCount={tableOccupied.get(g.table_number!) ?? 0}
                  onVote={onVote} onEnd={onEndGame} />
              ))}
            </div>
          )}

          {ended.length > 0 && (
            <details className="group">
              <summary className="list-none flex items-center gap-2 cursor-pointer py-2 text-xs font-bold text-gray-400 hover:text-gray-500">
                <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />종료된 게임 ({ended.length})
              </summary>
              <div className="space-y-3 pt-2">
                {ended.map(g => (
                  <BalanceGameCard key={g.id} game={g} myVote={myVotes.get(g.id) ?? null}
                    voteCounts={voteCounts.get(g.id) ?? { a: 0, b: 0 }} currentUserId={currentUserId}
                    eligibleCount={g.scope === 'table' ? (tableOccupied.get(g.table_number!) ?? 0) : occupiedTotal}
                    onVote={onVote} />
                ))}
              </div>
            </details>
          )}

          <MiniGameTips />

          {showCreate && (
            <CreateGameModal tableNumber={tableNumber} currentUserNickname={currentUserNickname}
              onSubmit={(q, a, b, scope) => { onCreateGame(q, a, b, scope); setShowCreate(false); }}
              onClose={() => setShowCreate(false)} />
          )}
        </>
      )}

      {subTab === 'ladder' && (
        <LadderGame seats={seats} tableNumber={tableNumber}
          onBroadcast={onBroadcastGame} myNickname={currentUserNickname} profileMap={profileMap} />
      )}

      {subTab === 'roulette' && (
        <RouletteGame seats={seats} tableNumber={tableNumber}
          onBroadcast={onBroadcastGame} myNickname={currentUserNickname} profileMap={profileMap} />
      )}
    </div>
  );
}
