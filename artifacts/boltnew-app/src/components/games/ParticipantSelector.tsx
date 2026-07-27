import React, { useState, useEffect } from 'react';
import type { Seat, Profile } from '../../types/app';
import { MAX_GAME_PARTICIPANTS } from './gameConstants';

export function ParticipantSelector({ seats, tableNumber, selected, onChange, profileMap }: {
  seats: Seat[];
  tableNumber: number | null;
  selected: string[];
  onChange: (names: string[]) => void;
  profileMap: Map<string, Profile>;
}) {
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [input, setInput] = useState('');

  const autoList = seats
    .filter(s => s.status === 'occupied' && s.profile_id && tableNumber !== null && s.table_number === tableNumber)
    .map(s => profileMap.get(s.profile_id!)?.nickname)
    .filter((n): n is string => !!n);

  const allOccupied = seats
    .filter(s => s.status === 'occupied' && s.profile_id)
    .map(s => profileMap.get(s.profile_id!)?.nickname)
    .filter((n): n is string => !!n);

  useEffect(() => {
    if (mode === 'auto') onChange(autoList.slice(0, MAX_GAME_PARTICIPANTS));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, tableNumber, autoList.join(',')]);

  const switchMode = (m: 'auto' | 'manual') => { setMode(m); if (m === 'manual') onChange([]); };
  const toggle = (name: string) => {
    if (selected.includes(name)) onChange(selected.filter(n => n !== name));
    else if (selected.length < MAX_GAME_PARTICIPANTS) onChange([...selected, name]);
  };
  const addManual = () => {
    const name = input.trim();
    if (!name || selected.includes(name) || selected.length >= MAX_GAME_PARTICIPANTS) return;
    onChange([...selected, name]);
    setInput('');
  };

  return (
    <div className="space-y-3">
      <div className="flex bg-gray-100 rounded-xl p-1">
        {(['auto', 'manual'] as const).map(m => (
          <button key={m} onClick={() => switchMode(m)}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${mode === m ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
            {m === 'auto' ? '🪑 자동 (내 테이블)' : '✏️ 직접 입력'}
          </button>
        ))}
      </div>

      {mode === 'auto' && (
        tableNumber === null ? (
          <div className="text-center py-5 bg-gray-50 rounded-xl border border-gray-200">
            <p className="text-xs font-bold text-gray-500">좌석이 배정되지 않았습니다</p>
            <p className="text-[11px] text-gray-400 mt-1">직접 입력 탭을 사용하세요</p>
          </div>
        ) : autoList.length === 0 ? (
          <div className="text-center py-5 bg-gray-50 rounded-xl border border-gray-200">
            <p className="text-xs font-bold text-gray-500">{tableNumber}번 테이블에 착석한 인원이 없습니다</p>
            <p className="text-[11px] text-gray-400 mt-1">직접 입력 탭을 사용하세요</p>
          </div>
        ) : (
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">
                {tableNumber}번 테이블 · {selected.length}/{autoList.length}명 참여
              </p>
              <div className="flex gap-1">
                <button onClick={() => onChange(autoList.slice(0, MAX_GAME_PARTICIPANTS))}
                  className="text-[10px] text-violet-600 font-bold px-2 py-0.5 rounded-lg hover:bg-violet-100">전체</button>
                <span className="text-[10px] text-violet-300">탭하여 제외</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {autoList.map(name => {
                const isIn = selected.includes(name);
                return (
                  <button key={name}
                    onClick={() => isIn ? onChange(selected.filter(n => n !== name)) : (selected.length < MAX_GAME_PARTICIPANTS ? onChange([...selected, name]) : undefined)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-full transition-all active:scale-95 ${isIn ? 'bg-violet-500 text-white' : 'bg-gray-200 text-gray-400 line-through'}`}>
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        )
      )}

      {mode === 'manual' && (
        <div className="space-y-3">
          {allOccupied.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500">탭하여 선택 (최대 {MAX_GAME_PARTICIPANTS}명)</p>
                <div className="flex gap-1">
                  <button onClick={() => onChange(allOccupied.slice(0, MAX_GAME_PARTICIPANTS))}
                    className="text-xs text-violet-600 font-bold px-2 py-0.5 rounded-lg hover:bg-violet-50">전체</button>
                  <button onClick={() => onChange([])}
                    className="text-xs text-gray-400 font-bold px-2 py-0.5 rounded-lg hover:bg-gray-100">초기화</button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {allOccupied.map(name => (
                  <button key={name} onClick={() => toggle(name)}
                    disabled={!selected.includes(name) && selected.length >= MAX_GAME_PARTICIPANTS}
                    className={`py-2 px-1 rounded-xl text-xs font-bold text-center truncate transition-all active:scale-95 border-2 ${selected.includes(name) ? 'bg-violet-500 border-violet-500 text-white' : 'bg-gray-50 border-gray-200 text-gray-700 hover:border-violet-300 disabled:opacity-40'}`}>
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <input type="text" value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addManual()}
              placeholder={`이름 직접 입력 (최대 ${MAX_GAME_PARTICIPANTS}명)`}
              disabled={selected.length >= MAX_GAME_PARTICIPANTS}
              className="flex-1 bg-gray-50 border border-gray-200 text-sm text-gray-900 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-50" />
            <button onClick={addManual} disabled={!input.trim() || selected.length >= MAX_GAME_PARTICIPANTS}
              className="px-4 py-2.5 bg-violet-500 text-white text-xs font-bold rounded-xl disabled:opacity-40 active:scale-95">추가</button>
          </div>
          {selected.length > 0 && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">참여자 {selected.length}/{MAX_GAME_PARTICIPANTS}</p>
                <button onClick={() => onChange([])} className="text-[10px] text-gray-400 hover:text-gray-600 font-semibold">전체 삭제</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selected.map(name => (
                  <button key={name} onClick={() => onChange(selected.filter(n => n !== name))}
                    className="flex items-center gap-1 px-2.5 py-1 bg-violet-500 text-white text-xs font-bold rounded-full active:scale-95 transition-all">
                    {name}<span className="text-violet-200 text-[10px] ml-0.5">✕</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
