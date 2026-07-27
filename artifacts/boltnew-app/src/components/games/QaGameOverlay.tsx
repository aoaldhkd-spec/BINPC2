import React, { useState, useEffect } from 'react';
import { CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Seat } from '../../types/app';

export function QaGameOverlay({
  game, currentUserId, currentUserNickname, seats, alreadySubmitted, onSubmitted, onDismiss,
}: {
  game: { id: string; question: string; correct_answer: string | null };
  currentUserId: string | null;
  currentUserNickname: string | null;
  seats: Seat[];
  alreadySubmitted: boolean;
  onSubmitted: () => void;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(alreadySubmitted);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  const submit = async () => {
    if (!answer.trim() || !currentUserId) return;
    setSubmitting(true);
    const seatRow = seats.find(s => s.profile_id === currentUserId);
    const { error: insertError } = await supabase.from('qa_answers').insert({
      game_id: game.id,
      user_id: currentUserId,
      nickname: currentUserNickname,
      answer: answer.trim(),
      table_number: seatRow?.table_number ?? null,
    });
    if (insertError) { console.error('Q&A 답변 제출 실패:', insertError); setSubmitting(false); return; }
    setSubmitted(true);
    onSubmitted();
    setSubmitting(false);
  };

  return (
    <div className={`fixed inset-0 z-[110] flex items-center justify-center p-4 transition-all duration-300 ${visible ? 'bg-black/70 backdrop-blur-sm' : 'bg-transparent'}`}>
      <div className={`w-full max-w-sm transition-all duration-500 ${visible ? 'scale-100 opacity-100 translate-y-0' : 'scale-90 opacity-0 translate-y-8'}`}>
        <div className="relative mb-4 flex justify-center">
          <div className="absolute w-24 h-24 rounded-full bg-teal-500/30 animate-ping" />
          <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-2xl shadow-teal-500/50">
            <span className="text-4xl">📣</span>
          </div>
        </div>
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl border border-teal-500/40 shadow-2xl shadow-teal-500/20 overflow-hidden">
          <div className="bg-gradient-to-r from-teal-600 to-cyan-700 px-5 py-4 text-center">
            <div className="text-[10px] font-black text-teal-200 uppercase tracking-widest mb-1">관리자가 Q&A를 시작합니다!</div>
            <h2 className="text-lg font-black text-white leading-snug">{game.question}</h2>
          </div>
          <div className="p-5 space-y-4">
            {submitted ? (
              <div className="flex items-center gap-3 bg-teal-500/20 rounded-2xl border border-teal-500/30 px-4 py-4">
                <CheckCircle className="w-6 h-6 text-teal-400 flex-shrink-0" />
                <p className="text-sm font-bold text-teal-200">답변을 제출했습니다!</p>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <input type="text" value={answer} onChange={e => setAnswer(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && answer.trim()) submit(); }}
                    placeholder="답변을 입력하세요..."
                    className="flex-1 bg-slate-700 text-white placeholder-slate-400 text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-teal-500 border border-slate-600"
                    autoFocus />
                  <button onClick={submit} disabled={!answer.trim() || submitting || !currentUserId}
                    className="px-4 py-3 bg-teal-500 hover:bg-teal-400 text-white font-black text-sm rounded-xl disabled:opacity-40 transition-all">
                    {submitting ? '...' : '제출'}
                  </button>
                </div>
                {!currentUserId && <p className="text-xs text-slate-400 text-center">프로필을 등록해야 답변할 수 있습니다</p>}
              </>
            )}
          </div>
          <div className="px-5 pb-5">
            <button onClick={onDismiss}
              className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold rounded-xl transition-all text-sm">
              {submitted ? '닫기' : '나중에 답변하기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
