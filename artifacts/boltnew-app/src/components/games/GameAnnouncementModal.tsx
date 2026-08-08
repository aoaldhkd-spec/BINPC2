import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import type { GameState, Seat, Profile } from '../../types/app';
import { GAME_TYPE_ICONS, GAME_TYPE_LABELS } from './gameConstants';
import { DiceDisplay, RouletteDisplay, LadderDisplay } from './GameDisplays';
import ProfileAvatar from '../ProfileAvatar';

export function GameAnnouncementModal({ game, onDismiss, onVote, onImageVote, currentUserId, seats, profiles }: {
  game: GameState;
  onDismiss: () => void;
  onVote?: (gameId: string, option: 'a' | 'b') => void;
  onImageVote?: (gameId: string, votedProfileId: string) => void;
  currentUserId?: string | null;
  seats?: Seat[];
  profiles?: Profile[];
}) {
  const [visible, setVisible] = useState(false);
  const [voted, setVoted] = useState<'a' | 'b' | null>(null);
  const [imageVoted, setImageVoted] = useState<string | null>(null);
  const [imageVoteCounts, setImageVoteCounts] = useState<Record<string, number>>({});
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { const t = setTimeout(() => setVisible(true), 50); return () => clearTimeout(t); }, []);
  // 언마운트 시 dismiss 타이머 정리
  useEffect(() => () => { if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current); }, []);

  useEffect(() => {
    if (game.type !== 'image' || !game.game_id) return;
    let mounted = true;
    const loadCounts = async () => {
      const { data } = await supabase.from('image_votes').select('voted_profile_id').eq('game_id', game.game_id!);
      if (!mounted) return;
      if (data) {
        const tally = (data as { voted_profile_id: string }[]).reduce((acc: Record<string, number>, v) => { acc[v.voted_profile_id] = (acc[v.voted_profile_id] ?? 0) + 1; return acc; }, {} as Record<string, number>);
        setImageVoteCounts(tally);
      }
      if (currentUserId) {
        const { data: myVote } = await supabase.from('image_votes').select('voted_profile_id').eq('game_id', game.game_id!).eq('voter_id', currentUserId).maybeSingle();
        if (mounted && myVote) setImageVoted(myVote.voted_profile_id);
      }
    };
    loadCounts();
    const ch = supabase.channel(`image-votes-modal-${game.game_id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'image_votes', filter: `game_id=eq.${game.game_id}` }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        const v = payload.new as { voted_profile_id: string };
        setImageVoteCounts(prev => ({ ...prev, [v.voted_profile_id]: (prev[v.voted_profile_id] ?? 0) + 1 }));
      }).subscribe(() => {});
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [game.type, game.game_id, currentUserId]);

  const handleImageVote = (profileId: string) => {
    if (imageVoted || !game.game_id || !onImageVote) return;
    setImageVoted(profileId);
    setImageVoteCounts(prev => ({ ...prev, [profileId]: (prev[profileId] ?? 0) + 1 }));
    onImageVote(game.game_id, profileId);
  };

  const userTableNum = seats?.find(s => s.profile_id === currentUserId)?.table_number ?? null;
  const tableScope = game.table_number ?? userTableNum;
  const candidateIds = seats?.filter(s => s.status === 'occupied' && s.profile_id && s.profile_id !== currentUserId && (!tableScope || s.table_number === tableScope)).map(s => s.profile_id!) ?? [];
  const candidates = profiles?.filter(p => candidateIds.includes(p.id)) ?? [];
  const totalImageVotes = Object.values(imageVoteCounts).reduce((a, b) => a + b, 0);
  const isInteractive = game.type === 'dice' || game.type === 'roulette' || game.type === 'ladder';
  const isBalance = game.type === 'balance' && game.option_a && game.option_b;

  const handleVote = (option: 'a' | 'b') => {
    if (voted || !game.game_id || !onVote) return;
    setVoted(option); onVote(game.game_id, option);
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => { onDismiss(); dismissTimerRef.current = null; }, 800);
  };

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-300 ${visible ? 'bg-black/70 backdrop-blur-sm' : 'bg-transparent'}`}>
      <div className={`w-full max-w-sm transition-all duration-500 ${visible ? 'scale-100 opacity-100 translate-y-0' : 'scale-90 opacity-0 translate-y-8'}`}>
        <div className="relative mb-4 flex justify-center">
          <div className="absolute w-24 h-24 rounded-full bg-violet-500/30 animate-ping" />
          <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-2xl shadow-violet-500/50">
            <span className="text-4xl">{GAME_TYPE_ICONS[game.type]}</span>
          </div>
        </div>
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl border border-violet-500/40 shadow-2xl shadow-violet-500/20 overflow-hidden">
          <div className="bg-gradient-to-r from-violet-600 to-purple-700 px-5 py-4 text-center">
            <div className="text-[10px] font-black text-violet-200 uppercase tracking-widest mb-1">관리자가 게임을 시작합니다!</div>
            <h2 className="text-xl font-black text-white">{game.title}</h2>
            <span className="inline-block mt-1 px-3 py-0.5 bg-white/20 text-white text-xs font-bold rounded-full">{GAME_TYPE_LABELS[game.type]}</span>
          </div>
          <div className="p-5 space-y-3">
            {isBalance && (
              <>
                {!voted && <p className="text-center text-xs font-bold text-slate-400 -mb-1">하나를 선택하세요!</p>}
                <div className="flex gap-2">
                  <button onClick={() => handleVote('a')} disabled={!!voted}
                    className={`flex-1 rounded-2xl border-2 p-4 text-center transition-all active:scale-[0.97] ${voted === 'a' ? 'bg-violet-500/40 border-violet-400 scale-[1.02]' : voted ? 'bg-slate-800/50 border-slate-700 opacity-50' : 'bg-gradient-to-br from-violet-500/20 to-violet-600/10 border-violet-500/40 hover:border-violet-400 hover:bg-violet-500/30 cursor-pointer'}`}>
                    <p className="text-[10px] font-black text-violet-400 uppercase tracking-wider mb-2">A</p>
                    <p className="text-base font-black text-white leading-snug">{game.option_a}</p>
                    {voted === 'a' && <p className="text-[10px] font-black text-violet-300 mt-2">선택!</p>}
                  </button>
                  <div className="flex items-center justify-center w-8 flex-shrink-0"><span className="text-base font-black text-slate-400">vs</span></div>
                  <button onClick={() => handleVote('b')} disabled={!!voted}
                    className={`flex-1 rounded-2xl border-2 p-4 text-center transition-all active:scale-[0.97] ${voted === 'b' ? 'bg-pink-500/40 border-pink-400 scale-[1.02]' : voted ? 'bg-slate-800/50 border-slate-700 opacity-50' : 'bg-gradient-to-br from-pink-500/20 to-pink-600/10 border-pink-500/40 hover:border-pink-400 hover:bg-pink-500/30 cursor-pointer'}`}>
                    <p className="text-[10px] font-black text-pink-400 uppercase tracking-wider mb-2">B</p>
                    <p className="text-base font-black text-white leading-snug">{game.option_b}</p>
                    {voted === 'b' && <p className="text-[10px] font-black text-pink-300 mt-2">선택!</p>}
                  </button>
                </div>
              </>
            )}
            {game.type === 'dice' && <DiceDisplay result={game.result} />}
            {game.type === 'roulette' && <RouletteDisplay result={game.result} options={game.roulette_options} />}
            {game.type === 'ladder' && <LadderDisplay result={game.result} participants={game.ladder_participants} prizes={game.ladder_prizes} />}
            {game.type === 'image' && (
              <div className="space-y-2">
                {!imageVoted && candidates.length > 0 && <p className="text-center text-xs font-bold text-slate-400">한 명을 선택하세요!</p>}
                {candidates.length === 0 && !imageVoted && <p className="text-center text-xs text-slate-400 py-2">같은 테이블에 참여자가 없습니다</p>}
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {candidates.map(p => {
                    const count = imageVoteCounts[p.id] ?? 0;
                    const pct = totalImageVotes > 0 ? Math.round((count / totalImageVotes) * 100) : 0;
                    const isMyVote = imageVoted === p.id;
                    return (
                      <button key={p.id} disabled={!!imageVoted} onClick={() => handleImageVote(p.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${isMyVote ? 'border-amber-400 bg-amber-500/20 scale-[1.01]' : imageVoted ? 'border-slate-700 bg-slate-800/30 opacity-60 cursor-default' : 'border-slate-700 bg-slate-800/50 hover:border-amber-400/60 hover:bg-amber-500/10 cursor-pointer'}`}>
                        <ProfileAvatar profile={p} size="xs" rounded="lg" />
                        <span className={`flex-1 text-sm font-bold truncate ${isMyVote ? 'text-amber-300' : 'text-white'}`}>{p.nickname}</span>
                        {imageVoted && <div className="flex items-center gap-1.5 flex-shrink-0"><div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all duration-500 ${isMyVote ? 'bg-amber-400' : 'bg-slate-500'}`} style={{ width: `${pct}%` }} /></div><span className={`text-xs font-bold w-8 text-right ${isMyVote ? 'text-amber-300' : 'text-slate-400'}`}>{pct}%</span></div>}
                        {isMyVote && <span className="text-amber-400 text-xs font-black flex-shrink-0">✓</span>}
                      </button>
                    );
                  })}
                </div>
                {imageVoted && <p className="text-center text-xs text-slate-400 pt-1">총 {totalImageVotes}명 투표</p>}
              </div>
            )}
            {game.image_url && <div className="rounded-xl overflow-hidden border border-slate-700"><img src={game.image_url} alt="game" className="w-full max-h-40 object-cover" /></div>}
            {game.description && !isInteractive && game.type !== 'balance' && <div className="p-3.5 bg-slate-700/40 rounded-xl border border-slate-600/50"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">게임 설명</p><p className="text-sm text-white leading-relaxed">{game.description}</p></div>}
            {game.rules && !isInteractive && <div className="p-3.5 bg-slate-700/40 rounded-xl border border-slate-600/50"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">방법</p><p className="text-sm text-slate-200 leading-relaxed">{game.rules}</p></div>}
          </div>
          {(!isBalance && game.type !== 'image') && (
            <div className="px-5 pb-5"><button onClick={onDismiss} className="w-full py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold rounded-xl transition-all shadow-lg">확인했습니다!</button></div>
          )}
          {game.type === 'image' && (
            <div className="px-5 pb-5"><button onClick={onDismiss} className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-bold rounded-xl transition-all shadow-lg">{imageVoted ? '확인했습니다!' : '나중에 투표할게요'}</button></div>
          )}
        </div>
      </div>
    </div>
  );
}
