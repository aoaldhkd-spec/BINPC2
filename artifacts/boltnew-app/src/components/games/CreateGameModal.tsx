import React, { useState } from 'react';
import { X } from 'lucide-react';

const QUICK_TEMPLATES = [
  { q: '평생 치킨만 먹기 vs 피자만 먹기', a: '치킨파', b: '피자파' },
  { q: '아침형 인간 vs 야행성 인간', a: '아침형', b: '야행성' },
  { q: '여름 vs 겨울', a: '여름', b: '겨울' },
  { q: '내향인 vs 외향인', a: '내향인', b: '외향인' },
  { q: '술 vs 안술', a: '술', b: '안술' },
  { q: '연상 vs 연하', a: '연상', b: '연하' },
];

export function CreateGameModal({
  tableNumber, currentUserNickname, onSubmit, onClose,
}: {
  tableNumber: number | null;
  currentUserNickname: string;
  onSubmit: (question: string, optA: string, optB: string, scope: 'global' | 'table') => void;
  onClose: () => void;
}) {
  const [optA, setOptA] = useState('');
  const [optB, setOptB] = useState('');
  const scope: 'table' = 'table';
  const question = optA && optB ? `${optA} vs ${optB}` : '';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-black text-gray-900">밸런스 게임 만들기</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">빠른 선택</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TEMPLATES.map((t, i) => (
                <button key={i} onClick={() => { setOptA(t.a); setOptB(t.b); }}
                  className="text-[11px] px-2.5 py-1 bg-violet-50 hover:bg-violet-100 text-violet-600 rounded-full border border-violet-200 transition-all">
                  {t.a} vs {t.b}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-blue-500 block mb-1">선택지 A *</label>
              <input type="text" value={optA} onChange={e => setOptA(e.target.value)} placeholder="예: 치킨"
                className="w-full border-2 border-blue-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            <div>
              <label className="text-xs font-bold text-rose-500 block mb-1">선택지 B *</label>
              <input type="text" value={optB} onChange={e => setOptB(e.target.value)} placeholder="예: 피자"
                className="w-full border-2 border-rose-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300" />
            </div>
          </div>
          {tableNumber && (
            <div className="px-3 py-2 bg-violet-50 rounded-xl border border-violet-200 text-xs text-violet-600 font-semibold text-center">
              {tableNumber}번 테이블 전용 게임으로 생성됩니다
            </div>
          )}
          <button disabled={!optA.trim() || !optB.trim()} onClick={() => onSubmit(question, optA, optB, scope)}
            className="w-full py-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:from-violet-500 hover:to-purple-500">
            게임 시작!
          </button>
        </div>
      </div>
    </div>
  );
}
