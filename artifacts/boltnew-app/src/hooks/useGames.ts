import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { BalanceGame, BalanceVote, TableMiniGameSession, Seat, Profile } from '../types/app';

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
  }, []);

  const loadMyVotes = useCallback(async (userId: string) => {
    const { data } = await supabase.from('balance_votes').select('game_id, option').eq('voter_id', userId);
    if (data) setMyVotes(new Map((data as { game_id: string; option: string }[]).map(v => [v.game_id, v.option as 'a' | 'b'])));
  }, []);

  const voteOnGame = async (gameId: string, option: 'a' | 'b') => {
    if (!currentUserId || myVotes.has(gameId)) return;
    setMyVotes(prev => new Map(prev).set(gameId, option));
    setVoteCounts(prev => {
      const copy = new Map(prev);
      const c = copy.get(gameId) || { a: 0, b: 0 };
      copy.set(gameId, { ...c, [option]: c[option] + 1 });
      return copy;
    });
    await supabase.from('balance_votes').insert({ game_id: gameId, voter_id: currentUserId, option });
  };

  const voteOnImageGame = async (gameId: string, votedProfileId: string) => {
    if (!currentUserId) return;
    await supabase.from('image_votes').insert({ game_id: gameId, voter_id: currentUserId, voted_profile_id: votedProfileId });
  };

  const createTableGame = async (question: string, optA: string, optB: string, scope: 'global' | 'table') => {
    if (!currentUserId) return;
    const currentProfile = profiles.find(p => p.id === currentUserId);
    const tableNumber = seats.find(s => s.profile_id === currentUserId)?.table_number ?? null;
    const { data } = await supabase.from('balance_games').insert({
      creator_id: currentUserId,
      creator_nickname: currentProfile?.nickname ?? null,
      scope,
      table_number: scope === 'table' ? tableNumber : null,
      question, option_a: optA, option_b: optB,
    }).select().single();
    if (data) setBalanceGames(prev => prev.some(g => g.id === (data as BalanceGame).id) ? prev : [data as BalanceGame, ...prev]);
  };

  const endBalanceGame = async (gameId: string) => {
    await supabase.from('balance_games').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', gameId);
    setBalanceGames(prev => prev.map(g => {
      if (g.id !== gameId) return g;
      const updated = { ...g, status: 'ended' as const };
      const counts = voteCounts.get(gameId) || { a: 0, b: 0 };
      setGameEndResult({ game: updated, counts });
      return updated;
    }));
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
