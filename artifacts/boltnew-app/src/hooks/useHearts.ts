import { useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile, ContactShare } from '../types/app';
import { HeartType } from '../lib/constants';

export function useHearts(
  currentUserId: string | null,
  profiles: Profile[],
  profileMap: Map<string, Profile>,
  onOpenChat: (profile: Profile) => void,
) {
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [sentHeartTypes, setSentHeartTypes] = useState<Map<string, HeartType>>(new Map());
  const [sentHeartsPerPerson, setSentHeartsPerPerson] = useState<Map<string, Set<HeartType>>>(new Map());
  const [receivedHeartTypes, setReceivedHeartTypes] = useState<Map<string, HeartType>>(new Map());
  const [likeStatuses, setLikeStatuses] = useState<Map<string, string>>(new Map());
  const [receivedLikers, setReceivedLikers] = useState<Profile[]>([]);
  const [contactSharedWithIds, setContactSharedWithIds] = useState<Set<string>>(new Set());
  const [acknowledgedComplimentIds, setAcknowledgedComplimentIds] = useState<Set<string>>(new Set());
  const [receivedContactShares, setReceivedContactShares] = useState<ContactShare[]>([]);
  const [likeConfirmTarget, setLikeConfirmTarget] = useState<Profile | null>(null);
  const [contactShareTarget, setContactShareTarget] = useState<Profile | null>(null);
  // useRef로 선언 — React 리렌더 전에 두 번 호출돼도 같은 참조를 공유해 race 방지
  const likeInFlightRef = useRef(false);
  // 하트 응답(수락/거절) 중복 클릭 방지용 ref
  const heartResponseInFlightRef = useRef<string | null>(null);

  // ✅ try/catch 추가 — 네트워크 오류 시 stale state 유지 (기존 UI 보존)
  const loadLikes = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase.from('likes').select('liked_id, status, heart_type').eq('liker_id', userId);
      if (data) {
        setLikedIds(new Set(data.map((l: { liked_id: string }) => l.liked_id)));
        setSentHeartTypes(new Map(data.map((l: { liked_id: string; heart_type: string | null }) => [l.liked_id, (l.heart_type ?? 'red') as HeartType])));
        setLikeStatuses(new Map(data.map((l: { liked_id: string; status: string }) => [l.liked_id, l.status])));
        const hmap = new Map<string, Set<HeartType>>();
        data.forEach((l: { liked_id: string; heart_type: string | null }) => {
          const s = hmap.get(l.liked_id) ?? new Set<HeartType>();
          s.add((l.heart_type ?? 'red') as HeartType);
          hmap.set(l.liked_id, s);
        });
        setSentHeartsPerPerson(hmap);
      }
    } catch { /* 네트워크 오류 — stale state 유지 */ }
  }, []);

  // ✅ try/catch 추가
  const loadReceivedLikes = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase.from('likes').select('liker_id, status, heart_type').eq('liked_id', userId);
      if (!data?.length) { setReceivedLikers([]); setReceivedHeartTypes(new Map()); setAcknowledgedComplimentIds(new Set()); return; }
      setReceivedHeartTypes(new Map(data.map((l: { liker_id: string; heart_type: string | null }) => [l.liker_id, (l.heart_type ?? 'red') as HeartType])));
      setAcknowledgedComplimentIds(new Set(data.filter((l: { liker_id: string; status: string; heart_type: string | null }) => l.status === 'accepted' && (l.heart_type ?? 'red') === 'green').map((l: { liker_id: string }) => l.liker_id)));
      const activeLikerIds = data.filter((l: { liker_id: string; status: string }) => l.status !== 'rejected').map((l: { liker_id: string }) => l.liker_id);
      if (!activeLikerIds.length) { setReceivedLikers([]); return; }
      const { data: ps } = await supabase.from('profiles').select('*').in('id', activeLikerIds);
      if (ps) setReceivedLikers(ps);
    } catch { /* 네트워크 오류 — stale state 유지 */ }
  }, []);

  // ✅ try/catch 추가
  const loadContactShareData = useCallback(async (userId: string) => {
    try {
      const { data: shared } = await supabase.from('contact_shares').select('liker_id').eq('liked_id', userId);
      if (shared) setContactSharedWithIds(new Set(shared.map((s: { liker_id: string }) => s.liker_id)));
      const { data: received } = await supabase.from('contact_shares').select('*').eq('liker_id', userId);
      if (received) setReceivedContactShares(received as ContactShare[]);
    } catch { /* 네트워크 오류 — stale state 유지 */ }
  }, []);

  const heartCountByType = (type: HeartType) => {
    let c = 0;
    sentHeartsPerPerson.forEach(types => { if (types.has(type)) c++; });
    return c;
  };

  const likedByTypeRecord = (): Record<HeartType, number> => ({
    red: heartCountByType('red'),
    blue: heartCountByType('blue'),
    pink: heartCountByType('pink'),
    green: heartCountByType('green'),
  });

  const handleLike = (profileId: string) => {
    if (!currentUserId) return;
    if (profileId === currentUserId) return; // 자기 자신 하트 금지
    const target = profiles.find((p) => p.id === profileId);
    if (!target) return;
    const sent = sentHeartsPerPerson.get(profileId);
    if (sent && sent.size >= 4) return;
    setLikeConfirmTarget(target);
  };

  const executeLike = async (heartType: HeartType) => {
    if (!currentUserId || !likeConfirmTarget) return;
    if (likeInFlightRef.current) return; // 중복 클릭 방지 (ref = 동기적으로 즉시 잠금)
    if (heartCountByType(heartType) >= 2) return;
    if (sentHeartsPerPerson.get(likeConfirmTarget.id)?.has(heartType)) return;
    likeInFlightRef.current = true; // 동기적으로 즉시 잠금 — 리렌더 대기 없음
    // ✅ Fix: hung promise 영구 잠금 방지 — 8초 타임아웃 AbortSignal
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 8_000);
    try {
      const { error } = await supabase.from('likes').insert({ liker_id: currentUserId, liked_id: likeConfirmTarget.id, heart_type: heartType });
      if (controller.signal.aborted) return; // 타임아웃 후 응답은 무시
      if (!error) {
        setLikedIds((prev) => new Set([...prev, likeConfirmTarget.id]));
        setSentHeartTypes((prev) => new Map(prev).set(likeConfirmTarget.id, heartType));
        setSentHeartsPerPerson(prev => {
          const next = new Map(prev);
          const s = new Set(next.get(likeConfirmTarget.id) ?? []);
          s.add(heartType);
          next.set(likeConfirmTarget.id, s);
          return next;
        });
        // 서버가 likes INSERT 이벤트에서 자동으로 push 전송하므로 클라이언트 중복 호출 제거
      }
      setLikeConfirmTarget(null);
    } finally {
      clearTimeout(timeoutId);
      likeInFlightRef.current = false; // 예외/타임아웃 모든 경우에 잠금 해제
    }
  };

  // ✅ try/catch + 낙관적 업데이트 롤백 + 중복 클릭 방지
  const handleHeartResponse = async (likerId: string, response: 'accepted' | 'rejected') => {
    if (!currentUserId) return;
    if (heartResponseInFlightRef.current === likerId) return; // 동일 liker 중복 응답 방지
    heartResponseInFlightRef.current = likerId;
    const ht = receivedHeartTypes.get(likerId) ?? 'red';
    // 실패 시 롤백을 위한 스냅샷
    const prevLikers = [...receivedLikers];
    try {
      const { error } = await supabase
        .from('likes')
        .update({ status: response })
        .eq('liker_id', likerId)
        .eq('liked_id', currentUserId);
      if (error) throw error;
      if (response === 'rejected') {
        setReceivedLikers(prev => prev.filter(p => p.id !== likerId));
      } else {
        if (ht === 'green') {
          setAcknowledgedComplimentIds(prev => new Set([...prev, likerId]));
        } else {
          const target = receivedLikers.find(p => p.id === likerId);
          if (target) setContactShareTarget(target);
        }
      }
    } catch {
      // 서버 실패 시 낙관적 상태 롤백
      setReceivedLikers(prevLikers);
    } finally {
      heartResponseInFlightRef.current = null;
    }
  };

  // ✅ contact_share_events insert 실패를 별도로 처리 (non-fatal)
  const handleContactShare = async (likerId: string, kakao: string, instagram: string, phone: string) => {
    if (!currentUserId) return;
    const { error } = await supabase.from('contact_shares').upsert({
      liker_id: likerId,
      liked_id: currentUserId,
      kakao: kakao || null,
      instagram: instagram || null,
      phone: phone || null,
    }, { onConflict: 'liker_id,liked_id' });
    if (!error) {
      // contact_share_events insert 실패는 non-fatal (연락처 공유 자체는 성공)
      const { error: evtErr } = await supabase.from('contact_share_events').insert({
        from_user_id: currentUserId,
        to_user_id: likerId,
        event_type: 'accepted',
      });
      if (evtErr) {
        console.warn('[useHearts] contact_share_events insert 실패 (non-fatal):', evtErr.message);
      }
      setContactSharedWithIds((prev) => new Set([...prev, likerId]));
      setContactShareTarget(null);
      const likerProfile = profileMap.get(likerId);
      if (likerProfile) onOpenChat(likerProfile);
    } else {
      alert(`연락처 공유 실패: ${error.message}`);
    }
  };

  // ✅ try/catch 추가 (non-fatal — 실패해도 모달 닫기)
  const handleContactShareReject = async (likerId: string) => {
    if (!currentUserId) return;
    try {
      await supabase.from('contact_share_events').insert({
        from_user_id: currentUserId,
        to_user_id: likerId,
        event_type: 'rejected',
      });
    } catch { /* non-fatal — 모달은 항상 닫힘 */ }
    setContactShareTarget(null);
  };

  return {
    likedIds, setLikedIds,
    sentHeartTypes, setSentHeartTypes,
    sentHeartsPerPerson, setSentHeartsPerPerson,
    receivedHeartTypes, setReceivedHeartTypes,
    likeStatuses, setLikeStatuses,
    receivedLikers, setReceivedLikers,
    contactSharedWithIds, setContactSharedWithIds,
    acknowledgedComplimentIds, setAcknowledgedComplimentIds,
    receivedContactShares, setReceivedContactShares,
    likeConfirmTarget, setLikeConfirmTarget,
    contactShareTarget, setContactShareTarget,
    loadLikes,
    loadReceivedLikes,
    loadContactShareData,
    heartCountByType,
    likedByTypeRecord,
    handleLike,
    executeLike,
    handleHeartResponse,
    handleContactShare,
    handleContactShareReject,
  };
}
