import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { ls } from '../lib/storage';
import { MATCHING_SEATS_CACHE_KEY } from '../lib/constants';
import type { Seat } from '../types/app';

export function useSeating(currentUserId: string | null) {
  const [seats, setSeats] = useState<Seat[]>(() => {
    try {
      const cached = ls.getItem(MATCHING_SEATS_CACHE_KEY);
      return cached ? (JSON.parse(cached) as Seat[]) : [];
    } catch { return []; }
  });
  const [seatDialog, setSeatDialog] = useState<Seat | null>(null);

  const loadSeats = useCallback(async () => {
    try {
      const { data } = await supabase.from('seats').select('*').order('table_number').order('seat_position');
      if (data) {
        setSeats(data);
        try { ls.setItem(MATCHING_SEATS_CACHE_KEY, JSON.stringify(data)); } catch { /* quota */ }
      }
    } catch (e) { console.warn('[useSeating] loadSeats 실패:', e); }
  }, []);

  // ✅ try/catch 추가 — 네트워크 오류 시 다이얼로그 닫고 사용자에게 안내
  const handleRegisterSeat = async (
    seat: Seat,
    seatingLocked: boolean,
    currentUserSeat: Seat | null,
  ) => {
    if (!currentUserId) return;
    if (seatingLocked) {
      alert('자리 배치가 잠겼습니다. 관리자 안내에 따라 자리를 배정받으세요.');
      setSeatDialog(null);
      return;
    }
    try {
      const { data: fresh } = await supabase.from('seats').select('*').eq('id', seat.id).single();
      if (fresh?.status === 'occupied' && fresh.profile_id !== currentUserId) {
        alert('방금 다른 사람이 이 자리를 등록했습니다.');
        setSeatDialog(null);
        return;
      }
      // 새 자리 먼저 확보 → 성공 후 기존 자리 반납 (순서 역전 방지)
      const { error } = await supabase.from('seats').update({
        profile_id: currentUserId, status: 'occupied', registered_at: new Date().toISOString(),
      }).eq('id', seat.id);
      if (error) {
        alert('자리 등록에 실패했습니다. 다시 시도해 주세요.');
        return;
      }
      // 새 자리 확보 성공 후 기존 자리 반납 (실패해도 새 자리는 유지)
      if (currentUserSeat && currentUserSeat.id !== seat.id) {
        await supabase
          .from('seats')
          .update({ profile_id: null, status: 'empty', registered_at: null })
          .eq('id', currentUserSeat.id)
          .catch(() => null); // 반납 실패는 다음 resync에서 자동 복구
      }
      setSeatDialog(null);
      await loadSeats();
    } catch {
      // 예상치 못한 네트워크/서버 오류
      alert('자리 등록 중 오류가 발생했습니다. 다시 시도해 주세요.');
      setSeatDialog(null);
    }
  };

  return {
    seats, setSeats,
    seatDialog, setSeatDialog,
    loadSeats,
    handleRegisterSeat,
  };
}
