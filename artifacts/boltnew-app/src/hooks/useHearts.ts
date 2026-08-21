import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile, ContactShare } from '../types/app';
import { HeartType } from '../lib/constants';
import { countTodayInterestMission, isInterestHeart, type LikeRowForMission } from '../lib/signal-match';
import {
  mergeMapAfterSnapshot,
  mergeRowsAfterSnapshot,
  mergeSetAfterSnapshot,
} from '../lib/realtime-merge';
import { diag } from '../lib/diag';

export function useHearts(
  currentUserId: string | null,
  profiles: Profile[],
  _profileMap: Map<string, Profile>,
  _onOpenChat: (profile: Profile) => void,
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
  const [outgoingLikeRows, setOutgoingLikeRows] = useState<LikeRowForMission[]>([]);
  const likedIdsRef = useRef(likedIds);
  const sentHeartTypesRef = useRef(sentHeartTypes);
  const sentHeartsPerPersonRef = useRef(sentHeartsPerPerson);
  const likeStatusesRef = useRef(likeStatuses);
  const outgoingLikeRowsRef = useRef(outgoingLikeRows);
  const receivedHeartTypesRef = useRef(receivedHeartTypes);
  const acknowledgedComplimentIdsRef = useRef(acknowledgedComplimentIds);
  const receivedLikersRef = useRef(receivedLikers);
  const contactSharedWithIdsRef = useRef(contactSharedWithIds);
  const receivedContactSharesRef = useRef(receivedContactShares);
  likedIdsRef.current = likedIds;
  sentHeartTypesRef.current = sentHeartTypes;
  sentHeartsPerPersonRef.current = sentHeartsPerPerson;
  likeStatusesRef.current = likeStatuses;
  outgoingLikeRowsRef.current = outgoingLikeRows;
  receivedHeartTypesRef.current = receivedHeartTypes;
  acknowledgedComplimentIdsRef.current = acknowledgedComplimentIds;
  receivedLikersRef.current = receivedLikers;
  contactSharedWithIdsRef.current = contactSharedWithIds;
  receivedContactSharesRef.current = receivedContactShares;
  // useRef로 선언 — React 리렌더 전에 두 번 호출돼도 같은 참조를 공유해 race 방지
  const likeInFlightRef = useRef(false);
  // 하트 응답(수락/거절) 중복 클릭 방지용 ref
  const heartResponseInFlightRef = useRef<string | null>(null);
  const contactShareInFlightRef = useRef(false);

  /** 같은 사람이 칭찬+호감을 보내면 호감을 남긴다. last-wins면 수락/채팅 언락이 사라짐. */
  const preferReceivedHeartType = (existing: HeartType | undefined, incoming: HeartType): HeartType => {
    if (isInterestHeart(incoming)) return incoming;
    if (existing && isInterestHeart(existing)) return existing;
    return incoming;
  };
  // 하트 전송 실패 메시지 — 호출 측에서 BottomNotif 등으로 표시
  const [likeError, setLikeError] = useState<string | null>(null);
  // 세대 카운터 — 계정 전환 중 in-flight 응답이 새 사용자 state를 덮어쓰는 race 방지
  const loadLikesGenRef = useRef(0);
  const loadReceivedLikesGenRef = useRef(0);
  const loadContactShareGenRef = useRef(0);

  // 계정 전환(또는 로그아웃) 시 즉시 이전 사용자 하트 state를 초기화하고
  // 세대 카운터를 올려 in-flight 요청이 새 사용자 state를 덮어쓰지 못하게 한다.
  useEffect(() => {
    loadLikesGenRef.current += 1;
    loadReceivedLikesGenRef.current += 1;
    loadContactShareGenRef.current += 1;
    setLikedIds(new Set());
    setSentHeartTypes(new Map());
    setSentHeartsPerPerson(new Map());
    setLikeStatuses(new Map());
    setReceivedHeartTypes(new Map());
    setReceivedLikers([]);
    setAcknowledgedComplimentIds(new Set());
    setContactSharedWithIds(new Set());
    setReceivedContactShares([]);
    setLikeConfirmTarget(null);
    setContactShareTarget(null);
    setOutgoingLikeRows([]);
  }, [currentUserId]);

  // ✅ try/catch + 세대 카운터 — 계정 전환 중 in-flight 응답이 새 사용자 state를 덮어쓰는 race 방지
  const loadLikes = useCallback(async (userId: string) => {
    const gen = ++loadLikesGenRef.current;
    const atStart = {
      likedIds: new Set(likedIdsRef.current),
      sentHeartTypes: new Map(sentHeartTypesRef.current),
      sentHeartsPerPerson: new Map(sentHeartsPerPersonRef.current),
      likeStatuses: new Map(likeStatusesRef.current),
      outgoingLikeRows: [...outgoingLikeRowsRef.current],
    };
    try {
      const { data, error } = await supabase.from('likes').select('id, liked_id, status, heart_type, created_at').eq('liker_id', userId);
      if (gen !== loadLikesGenRef.current) return; // 계정이 바뀐 경우 stale 응답 폐기
      if (error) { console.warn('[useHearts] loadLikes error', error.message); return; }
      if (data) {
        const fetchedLikedIds = new Set<string>(data.map((l: { liked_id: string }) => l.liked_id));
        const fetchedHeartTypes = new Map<string, HeartType>();
        const fetchedStatuses = new Map<string, string>();
        for (const l of data as Array<{ liked_id: string; heart_type: string | null; status: string }>) {
          const ht = (l.heart_type ?? 'red') as HeartType;
          fetchedHeartTypes.set(l.liked_id, preferReceivedHeartType(fetchedHeartTypes.get(l.liked_id), ht));
          const prevStatus = fetchedStatuses.get(l.liked_id);
          if (l.status === 'accepted' || prevStatus === 'accepted') fetchedStatuses.set(l.liked_id, 'accepted');
          else if (l.status === 'pending' || prevStatus === 'pending') fetchedStatuses.set(l.liked_id, 'pending');
          else fetchedStatuses.set(l.liked_id, l.status);
        }
        setLikedIds(current => mergeSetAfterSnapshot(fetchedLikedIds, atStart.likedIds, current));
        setSentHeartTypes(current => mergeMapAfterSnapshot(fetchedHeartTypes, atStart.sentHeartTypes, current));
        setLikeStatuses(current => mergeMapAfterSnapshot(fetchedStatuses, atStart.likeStatuses, current));
        const hmap = new Map<string, Set<HeartType>>();
        data.forEach((l: { liked_id: string; heart_type: string | null }) => {
          const s = hmap.get(l.liked_id) ?? new Set<HeartType>();
          s.add((l.heart_type ?? 'red') as HeartType);
          hmap.set(l.liked_id, s);
        });
        setSentHeartsPerPerson(current => mergeMapAfterSnapshot(hmap, atStart.sentHeartsPerPerson, current));
        const fetchedRows = data.map((l: { liked_id: string; heart_type: string | null; created_at?: string | null }) => ({
          liked_id: l.liked_id,
          heart_type: l.heart_type ?? 'red',
          created_at: l.created_at ?? null,
        }));
        setOutgoingLikeRows(current => mergeRowsAfterSnapshot(
          fetchedRows,
          atStart.outgoingLikeRows,
          current,
          row => `${row.liked_id}:${row.heart_type}`,
        ));
        const last = data[data.length - 1] as { id?: string; created_at?: string | null } | undefined;
        diag('debug', 'hearts', 'state-merge', {
          corr: last?.id ?? `likes:${userId}:${gen}`,
          data: { rowId: last?.id ?? null, createdAt: last?.created_at ?? null, source: 'fetch', count: data.length },
        });
      }
    } catch { /* 네트워크 오류 — stale state 유지 */ }
  }, []);

  // ✅ try/catch + 세대 카운터 — 계정 전환 중 in-flight 응답이 새 사용자 state를 덮어쓰는 race 방지
  const loadReceivedLikes = useCallback(async (userId: string) => {
    const gen = ++loadReceivedLikesGenRef.current;
    const atStart = {
      heartTypes: new Map(receivedHeartTypesRef.current),
      acknowledged: new Set(acknowledgedComplimentIdsRef.current),
      likers: [...receivedLikersRef.current],
    };
    try {
      const { data } = await supabase.from('likes').select('id, liker_id, status, heart_type, created_at').eq('liked_id', userId);
      if (gen !== loadReceivedLikesGenRef.current) return; // 계정이 바뀐 경우 stale 응답 폐기
      const rows = data ?? [];
      const fetchedHeartTypes = new Map<string, HeartType>();
      for (const l of rows as Array<{ liker_id: string; heart_type: string | null }>) {
        const ht = (l.heart_type ?? 'red') as HeartType;
        fetchedHeartTypes.set(l.liker_id, preferReceivedHeartType(fetchedHeartTypes.get(l.liker_id), ht));
      }
      const fetchedAcknowledged = new Set<string>(rows.filter((l: { liker_id: string; status: string; heart_type: string | null }) => l.status === 'accepted' && (l.heart_type ?? 'red') === 'green').map((l: { liker_id: string }) => l.liker_id));
      setReceivedHeartTypes(current => mergeMapAfterSnapshot(fetchedHeartTypes, atStart.heartTypes, current));
      setAcknowledgedComplimentIds(current => mergeSetAfterSnapshot(fetchedAcknowledged, atStart.acknowledged, current));
      if (!rows.length) {
        setReceivedLikers(current => mergeRowsAfterSnapshot([], atStart.likers, current, profile => profile.id));
        return;
      }
      const activeLikerIds = rows.filter((l: { liker_id: string; status: string }) => l.status !== 'rejected').map((l: { liker_id: string }) => l.liker_id);
      if (!activeLikerIds.length) {
        setReceivedLikers(current => mergeRowsAfterSnapshot([], atStart.likers, current, profile => profile.id));
        return;
      }
      const { data: ps } = await supabase.from('profiles').select('*').in('id', activeLikerIds);
      if (gen !== loadReceivedLikesGenRef.current) return; // 두 번째 await 후에도 재확인
      if (ps) setReceivedLikers(current => mergeRowsAfterSnapshot(ps, atStart.likers, current, profile => profile.id));
      const last = rows[rows.length - 1] as { id?: string; created_at?: string | null } | undefined;
      diag('debug', 'hearts', 'state-merge', {
        corr: last?.id ?? `received-likes:${userId}:${gen}`,
        data: { rowId: last?.id ?? null, createdAt: last?.created_at ?? null, source: 'fetch', count: rows.length },
      });
    } catch { /* 네트워크 오류 — stale state 유지 */ }
  }, []);

  // ✅ try/catch 추가
  const loadContactShareData = useCallback(async (userId: string) => {
    const gen = ++loadContactShareGenRef.current;
    const atStart = {
      sharedWithIds: new Set(contactSharedWithIdsRef.current),
      receivedShares: [...receivedContactSharesRef.current],
    };
    try {
      // Fix #9: 두 독립 쿼리를 Promise.all로 병렬 실행 → 레이턴시 ~50% 감소
      const [sharedResult, receivedResult] = await Promise.all([
        supabase.from('contact_shares').select('liker_id').eq('liked_id', userId),
        supabase.from('contact_shares').select('*').eq('liker_id', userId),
      ]);
      if (gen !== loadContactShareGenRef.current) return;
      if (sharedResult.data) {
        const fetched = new Set<string>(sharedResult.data.map((s: { liker_id: string }) => s.liker_id));
        setContactSharedWithIds(current => mergeSetAfterSnapshot(fetched, atStart.sharedWithIds, current));
      }
      if (receivedResult.data) {
        const fetched = receivedResult.data as ContactShare[];
        setReceivedContactShares(current => mergeRowsAfterSnapshot(
          fetched,
          atStart.receivedShares,
          current,
          share => share.id ?? `${share.liker_id}:${share.liked_id}`,
        ));
        const last = fetched[fetched.length - 1];
        diag('debug', 'contact', 'state-merge', {
          corr: last?.id ?? `contact:${userId}:${gen}`,
          data: { rowId: last?.id ?? null, createdAt: last?.created_at ?? null, source: 'fetch', count: fetched.length },
        });
      }
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

  const handleLike = (profileId: string, hint?: Profile) => {
    if (!currentUserId) return;
    if (profileId === currentUserId) return; // 자기 자신 하트 금지
    const target = profiles.find((p) => p.id === profileId) ?? _profileMap.get(profileId) ?? hint;
    if (!target) return;
    const sent = sentHeartsPerPerson.get(profileId);
    if (sent && sent.size >= 4) return;
    setLikeConfirmTarget(target);
  };

  const executeLike = async (heartType: HeartType): Promise<boolean> => {
    if (!currentUserId || !likeConfirmTarget) return false;
    if (likeInFlightRef.current) return false;
    if (heartCountByType(heartType) >= 2) {
      setLikeError('같은 종류의 하트는 최대 2명에게만 보낼 수 있습니다.');
      setLikeConfirmTarget(null);
      return false;
    }
    if (sentHeartsPerPerson.get(likeConfirmTarget.id)?.has(heartType)) {
      setLikeError('이미 보낸 하트입니다.');
      setLikeConfirmTarget(null);
      return false;
    }
    likeInFlightRef.current = true;
    // 진입 시점 스냅샷 — await 중 상태 변경으로 stale 클로저 방지
    const targetId = likeConfirmTarget.id;
    const likerId = currentUserId;
    try {
      // localdb apiFetch가 15s 타임아웃 + 429/502/503 재시도를 담당. 짧은 race는
      // NAT 429 재시도 중 거짓 실패를 만들고, 서버 insert는 계속 진행된다.
      const { error } = await supabase.from('likes').insert({ liker_id: likerId, liked_id: targetId, heart_type: heartType }) as { error: unknown };
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
        setLikeStatuses(prev => {
          if (prev.has(targetId)) return prev;
          return new Map(prev).set(targetId, 'pending');
        });
        setOutgoingLikeRows(prev => {
          if (prev.some(r => r.liked_id === targetId && (r.heart_type ?? 'red') === heartType)) return prev;
          return [...prev, { liked_id: targetId, heart_type: heartType, created_at: new Date().toISOString() }];
        });
        setLikeConfirmTarget(null);
        return true;
      } else {
        const errObj = (typeof error === 'object' && error !== null) ? error as { message?: unknown; code?: unknown } : null;
        const errMsg = errObj?.message != null ? String(errObj.message) : String(error);
        const errCode = errObj?.code != null ? String(errObj.code) : '';
        const isHeartLimit = errCode === 'HEART_LIMIT' || errMsg.includes('최대 2명');
        const isRateLimit = errCode === 'RATE_LIMIT' || errMsg.includes('429') || errMsg.includes('rate') || errMsg.includes('too many');
        setLikeError(isHeartLimit
          ? '같은 종류의 하트는 최대 2명에게만 보낼 수 있습니다.'
          : isRateLimit
            ? '하트를 너무 많이 보냈습니다. 잠시 후 다시 시도해 주세요. 💔'
            : '하트 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        setLikeConfirmTarget(null);
        void loadLikes(likerId);
        return false;
      }
    } catch {
      // 네트워크 오류 — 사용자에게 명시적으로 알림
      // 서버는 성공했을 수 있으므로 보낸 하트 목록만 재동기화해 상태 불일치 방지
      setLikeError('연결이 불안정합니다. 잠시 후 다시 시도해 주세요.');
      setLikeConfirmTarget(null);
      void loadLikes(likerId);
      return false;
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
      // 서버 실패 시 낙관적 상태 롤백 + 사용자 알림
      setReceivedLikers(prevLikers);
      setLikeError('하트 응답에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      heartResponseInFlightRef.current = null;
    }
  };

  // ✅ contact_share_events insert 실패를 별도로 처리 (non-fatal)
  const handleContactShare = async (likerId: string, kakao: string, instagram: string, phone: string) => {
    if (!currentUserId) return;
    if (contactShareInFlightRef.current) return;
    contactShareInFlightRef.current = true;
    try {
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
        // 하트 수락과 1:1 채팅 개설은 분리됨 — 채팅은 사용자가 직접 채팅탭에서 시작
      } else {
        setLikeError(`연락처 공유 실패: ${error.message}`);
      }
    } catch (e) {
      console.error('[useHearts] handleContactShare 오류:', e);
      setLikeError('연락처 공유 중 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      contactShareInFlightRef.current = false;
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

  const noteOutgoingLike = useCallback((row: LikeRowForMission) => {
    if (!row.liked_id) return;
    setOutgoingLikeRows(prev => {
      const ht = row.heart_type ?? 'red';
      if (prev.some(r => r.liked_id === row.liked_id && (r.heart_type ?? 'red') === ht)) return prev;
      return [...prev, { liked_id: row.liked_id, heart_type: ht, created_at: row.created_at ?? new Date().toISOString() }];
    });
  }, []);

  const signalMissionCount = useMemo(
    () => countTodayInterestMission(outgoingLikeRows),
    [outgoingLikeRows],
  );

  return {
    likedIds, setLikedIds,
    sentHeartTypes, setSentHeartTypes,
    sentHeartsPerPerson, setSentHeartsPerPerson,
    receivedHeartTypes, setReceivedHeartTypes,
    likeStatuses, setLikeStatuses,
    receivedLikers, setReceivedLikers,
    contactSharedWithIds, setContactSharedWithIds,
    acknowledgedComplimentIds, setAcknowledgedComplimentIds,
    likeError, setLikeError,
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
    signalMissionCount,
    noteOutgoingLike,
  };
}
