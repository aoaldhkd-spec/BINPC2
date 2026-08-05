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
      const { data, error } = await supabase.from('likes').select('liked_id, status, heart_type').eq('liker_id', userId);
      if (error) { console.warn('[useHearts] loadLikes error', error.message); return; }
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
      // Fix #9: 두 독립 쿼리를 Promise.all로 병렬 실행 → 레이턴시 ~50% 감소
      const [sharedResult, receivedResult] = await Promise.all([
        supabase.from('contact_shares').select('liker_id').eq('liked_id', userId),
        supabase.from('contact_shares').select('*').eq('liker_id', userId),
      ]);
      if (sharedResult.data) setContactSharedWithIds(new Set(sharedResult.data.map((s: { liker_id: string }) => s.liker_id)));
      if (receivedResult.data) setReceivedContactShares(receivedResult.data as ContactShare[]);
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
    if (likeInFlightRef.current) return;
    if (heartCountByType(heartType) >= 2) return;
    if (sentHeartsPerPerson.get(likeConfirmTarget.id)?.has(heartType)) return;
    likeInFlightRef.current = true;
    // 진입 시점 스냅샷 — await 중 상태 변경으로 stale 클로저 방지
    const targetId = likeConfirmTarget.id;
    const likerId = currentUserId;
    try {
      // Promise.race로 8초 타임아웃 강제 — localdb.ts가 AbortSignal을 지원하지 않으므로 race 패턴 사용
      const insertPromise = supabase.from('likes').insert({ liker_id: likerId, liked_id: targetId, heart_type: heartType });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 8_000)
      );
      const { error } = await Promise.race([insertPromise, timeoutPromise]) as { error: unknown };
      if (!error) {
        setLikedIds((prev) => new Set([...prev, targetId]));
        setSentHeartTypes((prev) => new Map(prev).set(targetId, heartType));
        setSentHeartsPerPerson(prev => {
          const next = new Map(prev);
          const s = new Set(next.get(targetId) ?? []);
          s.add(heartType);
          next.set(targetId, s);
          return next;
        });
      }
      setLikeConfirmTarget(null);
    } catch {
      // 타임아웃 또는 네트워크 오류 — in-flight 잠금만 해제, UI 유지
    } finally {
      likeInFlightRef.current = false;
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
