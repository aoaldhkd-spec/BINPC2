import { useState, useCallback } from 'react';
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
  const [likeInFlight, setLikeInFlight] = useState(false);

  const loadLikes = useCallback(async (userId: string) => {
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
  }, []);

  const loadReceivedLikes = useCallback(async (userId: string) => {
    const { data } = await supabase.from('likes').select('liker_id, status, heart_type').eq('liked_id', userId);
    if (!data?.length) { setReceivedLikers([]); setReceivedHeartTypes(new Map()); setAcknowledgedComplimentIds(new Set()); return; }
    setReceivedHeartTypes(new Map(data.map((l: { liker_id: string; heart_type: string | null }) => [l.liker_id, (l.heart_type ?? 'red') as HeartType])));
    setAcknowledgedComplimentIds(new Set(data.filter((l: { liker_id: string; status: string; heart_type: string | null }) => l.status === 'accepted' && (l.heart_type ?? 'red') === 'green').map((l: { liker_id: string }) => l.liker_id)));
    const activeLikerIds = data.filter((l: { liker_id: string; status: string }) => l.status !== 'rejected').map((l: { liker_id: string }) => l.liker_id);
    if (!activeLikerIds.length) { setReceivedLikers([]); return; }
    const { data: ps } = await supabase.from('profiles').select('*').in('id', activeLikerIds);
    if (ps) setReceivedLikers(ps);
  }, []);

  const loadContactShareData = useCallback(async (userId: string) => {
    const { data: shared } = await supabase.from('contact_shares').select('liker_id').eq('liked_id', userId);
    if (shared) setContactSharedWithIds(new Set(shared.map((s: { liker_id: string }) => s.liker_id)));
    const { data: received } = await supabase.from('contact_shares').select('*').eq('liker_id', userId);
    if (received) setReceivedContactShares(received as ContactShare[]);
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
    if (likeInFlight) return; // 중복 클릭 방지
    if (heartCountByType(heartType) >= 2) return;
    if (sentHeartsPerPerson.get(likeConfirmTarget.id)?.has(heartType)) return;
    setLikeInFlight(true);
    const { error } = await supabase.from('likes').insert({ liker_id: currentUserId, liked_id: likeConfirmTarget.id, heart_type: heartType });
    setLikeInFlight(false);
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
    }
    setLikeConfirmTarget(null);
  };

  const handleHeartResponse = async (likerId: string, response: 'accepted' | 'rejected') => {
    if (!currentUserId) return;
    const ht = receivedHeartTypes.get(likerId) ?? 'red';
    await supabase.from('likes').update({ status: response }).eq('liker_id', likerId).eq('liked_id', currentUserId);
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
  };

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
      await supabase.from('contact_share_events').insert({
        from_user_id: currentUserId,
        to_user_id: likerId,
        event_type: 'accepted',
      });
      setContactSharedWithIds((prev) => new Set([...prev, likerId]));
      setContactShareTarget(null);
      const likerProfile = profileMap.get(likerId);
      if (likerProfile) onOpenChat(likerProfile);
    } else {
      alert(`연락처 공유 실패: ${error.message}`);
    }
  };

  const handleContactShareReject = async (likerId: string) => {
    if (!currentUserId) return;
    await supabase.from('contact_share_events').insert({
      from_user_id: currentUserId,
      to_user_id: likerId,
      event_type: 'rejected',
    });
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
