import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { BalanceGame, TableMiniGameSession, Seat, Profile } from '../types/app';

export function useGames(
  currentUserId: string | null,
  seats: Seat[],
  profiles: Profile[],
) {
  const [balanceGames, setBalanceGames] = useState<BalanceGame[]>([]);
  const [voteCounts, setVoteCounts] = useState<Map<string, { a: number; b: number }>>(new Map());
  const [myVotes, setMyVotes] = useState<Map<string, 'a' | 'b'>>(new Map());
  const [gameEndResult, setGameEndResult] = useState<{ game: BalanceGame; counts: { a: number; b: number } } | null>(null);
  const [incomingTableGame, setIncomingTableGame] = useState<TableMiniGameSession | null>(null);
  const tableMinigameChRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── 테이블 미니게임 브로드캐스트 채널 ──────────────────────────────────────────
  useEffect(() => {
    if (!currentUserId) return;
    const tableNum = seats.find(s => s.profile_id === currentUserId)?.table_number ?? null;

    if (tableMinigameChRef.current) {
      supabase.removeChannel(tableMinigameChRef.current);
      tableMinigameChRef.current = null;
    }
    if (tableNum === null) return;

    const ch = supabase
      .channel(`table-minigame-${tableNum}`)
      .on('broadcast', { event: 'game_start' }, ({ payload }: { payload: TableMiniGameSession }) => {
        setIncomingTableGame(payload as TableMiniGameSession);
      })
      .subscribe();
    tableMinigameChRef.current = ch;

    return () => {
      if (tableMinigameChRef.current) {
        supabase.removeChannel(tableMinigameChRef.current);
        tableMinigameChRef.current = null;
      }
    };
  }, [currentUserId, seats]);

  const loadBalanceGames = useCallback(async () => {
    try {
      const { data: games } = await supabase.from('balance_games').select('*').order('created_at', { ascending: false }).limit(30);
      if (!games) return;
      setBalanceGames(games as BalanceGame[]);
      const activeIds = (games as { id: string; status: string }[]).filter(g => g.status === 'active').map(g => g.id);
      if (activeIds.length > 0) {
        const { data: votes } = await supabase.from('balance_votes').select('game_id, option').in('game_id', activeIds);
        if (votes) {
          const counts = new Map<string, { a: number; b: number }>();
          (votes as { game_id: string; option: string }[]).forEach(v => {
            const c = counts.get(v.game_id) || { a: 0, b: 0 };
            counts.set(v.game_id, { ...c, [v.option]: c[v.option as 'a' | 'b'] + 1 });
          });
          setVoteCounts(counts);
        }
      }
    } catch (e) { console.warn('[useGames] loadBalanceGames 실패:', e); }
  }, []);

  const loadMyVotes = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase.from('balance_votes').select('game_id, option').eq('voter_id', userId);
      if (data) setMyVotes(new Map((data as { game_id: string; option: string }[]).map(v => [v.game_id, v.option as 'a' | 'b'])));
    } catch (e) { console.warn('[useGames] loadMyVotes 실패:', e); }
  }, []);

  const voteOnGame = async (gameId: string, option: 'a' | 'b') => {
    if (!currentUserId || myVotes.has(gameId)) return;
    // #39: 낙관적 업데이트 → 네트워크 실패 시 롤백
    setMyVotes(prev => new Map(prev).set(gameId, option));
    setVoteCounts(prev => {
      const copy = new Map(prev);
      const c = copy.get(gameId) || { a: 0, b: 0 };
      copy.set(gameId, { ...c, [option]: c[option] + 1 });
      return copy;
    });
    const { error } = await supabase.from('balance_votes').insert({ game_id: gameId, voter_id: currentUserId, option });
    if (error) {
      // 실패 시 낙관적 업데이트 롤백
      setMyVotes(prev => { const m = new Map(prev); m.delete(gameId); return m; });
      setVoteCounts(prev => {
        const copy = new Map(prev);
        const c = copy.get(gameId);
        if (c) copy.set(gameId, { ...c, [option]: Math.max(0, c[option] - 1) });
        return copy;
      });
      alert('투표 저장에 실패했습니다. 다시 시도해 주세요.');
    }
  };

  const voteOnImageGame = async (gameId: string, votedProfileId: string) => {
    if (!currentUserId) return;
    // #39: 이미지 투표도 실패 시 사용자에게 알림
    const { error } = await supabase.from('image_votes').insert({ game_id: gameId, voter_id: currentUserId, voted_profile_id: votedProfileId });
    if (error) alert('투표 저장에 실패했습니다. 다시 시도해 주세요.');
  };

  const createTableGame = async (question: string, optA: string, optB: string, scope: 'global' | 'table') => {
    if (!currentUserId) return;
    const currentProfile = profiles.find(p => p.id === currentUserId);
    const tableNumber = seats.find(s => s.profile_id === currentUserId)?.table_number ?? null;
    try {
      const { data, error } = await supabase.from('balance_games').insert({
        creator_id: currentUserId,
        creator_nickname: currentProfile?.nickname ?? null,
        scope,
        table_number: scope === 'table' ? tableNumber : null,
        question, option_a: optA, option_b: optB,
      }).select().single();
      if (error) throw error;
      if (data) setBalanceGames(prev => prev.some(g => g.id === (data as BalanceGame).id) ? prev : [data as BalanceGame, ...prev]);
    } catch {
      alert('게임 생성에 실패했습니다. 다시 시도해 주세요.');
    }
  };

  const endBalanceGame = async (gameId: string) => {
    try {
      const { error } = await supabase.from('balance_games').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', gameId);
      if (error) throw error;
      // setState 중첩 호출 금지: 먼저 업데이트 값 계산 후 두 setter 분리 호출
      const target = balanceGames.find(g => g.id === gameId);
      if (target) {
        const updated = { ...target, status: 'ended' as const };
        const counts = voteCounts.get(gameId) || { a: 0, b: 0 };
        setGameEndResult({ game: updated, counts });
      }
      setBalanceGames(prev => prev.map(g => g.id !== gameId ? g : { ...g, status: 'ended' as const }));
    } catch {
      alert('게임 종료에 실패했습니다. 다시 시도해 주세요.');
    }
  };

  const broadcastTableGame = useCallback((session: TableMiniGameSession) => {
    tableMinigameChRef.current?.send({
      type: 'broadcast',
      event: 'game_start',
      payload: session,
    });
    setIncomingTableGame(session);
  }, []);

  return {
    balanceGames, setBalanceGames,
    voteCounts, setVoteCounts,
    myVotes, setMyVotes,
    gameEndResult, setGameEndResult,
    incomingTableGame, setIncomingTableGame,
    tableMinigameChRef,
    loadBalanceGames,
    loadMyVotes,
    voteOnGame,
    voteOnImageGame,
    createTableGame,
    endBalanceGame,
    broadcastTableGame,
  };
}
