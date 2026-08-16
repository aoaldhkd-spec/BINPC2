/**
 * useGroupChat — 단체 채팅 상태 관리 훅
 * - 년생 / N대 두 방은 서버 자동 입장. 2차 클럽·2차 술은 클릭 입장·나가기
 * - SSE 단일 연결로 실시간 수신 (supabase.channel → localdb SSE 백엔드)
 * - group_messages: client_id 기반 낙관적 업데이트 + 3회 재시도
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile, GroupChat, GroupMessage, GroupParticipant } from '../types/app';
import {
  MAX_GROUPS_PER_USER,
  catalogGroupRooms,
  countJoinedCatalogRooms,
  countUnreadGroupMessages,
  groupLimitMessage,
  isJoinedGroupId,
  readGroupLastReads,
  resolveCatalogGroupId,
  siblingGroupIds,
  writeGroupLastRead,
} from '../lib/group-rooms';

const MAX_GROUP_MESSAGES = 300;
const MAX_MSG_LEN = 1000; // 메시지 최대 길이 — useChat과 동일 기준

/** group_messages SSE INSERT 수신 시 낙관적 메시지 교체 or 추가 (created_at 정렬 보장) */
function applyGroupInsert(prev: GroupMessage[], newMsg: GroupMessage): GroupMessage[] {
  // client_id 일치 → 낙관적 항목 교체 (정렬은 원래 위치 유지)
  if (newMsg.client_id) {
    const idx = prev.findIndex(m => m.client_id === newMsg.client_id || m.id === newMsg.id);
    if (idx >= 0) {
      const next = [...prev];
      next[idx] = newMsg;
      return next;
    }
  }
  // id 중복 방지
  if (prev.some(m => m.id === newMsg.id)) return prev;
  // created_at 순서 보장 (SSE 순서 보장 안 될 때 대비)
  const next = [...prev, newMsg];
  next.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return next;
}

interface UseGroupChatDeps {
  currentUserId: string | null;
  profilesRef: React.MutableRefObject<Profile[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setBottomNotif: (n: any) => void;
}

export function useGroupChat({ currentUserId, profilesRef, setBottomNotif }: UseGroupChatDeps) {
  const [groupChats, setGroupChats] = useState<GroupChat[]>([]);
  const groupChatsRef = useRef<GroupChat[]>([]);
  groupChatsRef.current = groupChats;
  const rawGroupsRef = useRef<GroupChat[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const activeGroupIdRef = useRef<string | null>(null);
  activeGroupIdRef.current = activeGroupId;

  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [unreadGroupCounts, setUnreadGroupCounts] = useState<Record<string, number>>({});
  const unreadGroupCountsRef = useRef<Record<string, number>>({});
  unreadGroupCountsRef.current = unreadGroupCounts;
  const [joiningGroupId, setJoiningGroupId] = useState<string | null>(null);

  const [myGroupIds, setMyGroupIds] = useState<string[]>([]);
  const myGroupIdsRef = useRef<string[]>([]);
  myGroupIdsRef.current = myGroupIds;
  const [groupParticipants, setGroupParticipants] = useState<GroupParticipant[]>([]);

  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;

  const sendingGroupRef = useRef(new Set<string>());
  const loadGenRef = useRef(0);
  // 비활성 그룹 SSE 중복 방지 (재연결 시 동일 메시지 재수신 대비)
  const seenInactiveGroupMsgIds = useRef(new Set<string>());

  // ── 단톡방 목록 로드 (참여 중 + 입장 가능 카탈로그) ─────────────────────────
  const loadGroupChats = useCallback(async (userId: string): Promise<void> => {
    try {
      // 참가 조회가 N대/년생 방을 만든 뒤에 목록을 읽는다 (병렬이면 빈 카탈로그가 올 수 있음)
      const partsRes = await supabase.from('group_participants').select('*').eq('user_id', userId);
      const groupsRes = await supabase.from('group_chats').select('*');
      const parts = (partsRes.data ?? []) as GroupParticipant[];
      const groupIds = parts.map(p => p.group_id);
      setMyGroupIds(groupIds);
      myGroupIdsRef.current = groupIds;

      const groups = (groupsRes.data ?? []) as GroupChat[];
      if (!groups.length) {
        setGroupChats([]);
        return;
      }
      const me = profilesRef.current.find(p => p.id === userId);
      const myBirthYear = Number(me?.birth_year);

      const latestByGroup = new Map<string, string>();
      const unreadByGroup: Record<string, number> = {};
      const lastReads = readGroupLastReads(userId);
      for (const p of parts) {
        const serverRead = p.last_read_at;
        if (typeof serverRead === 'string' && serverRead && (!lastReads[p.group_id] || serverRead > lastReads[p.group_id])) {
          lastReads[p.group_id] = serverRead;
          writeGroupLastRead(userId, p.group_id, serverRead);
        }
      }
      if (groupIds.length > 0) {
        const { data: msgs } = await supabase.from('group_messages')
          .select('group_id, content, image_url, created_at, sender_id')
          .in('group_id', groupIds)
          .order('created_at', { ascending: false })
          .limit(Math.max(groupIds.length * 40, 200));
        if (msgs) {
          const byGroup = new Map<string, Array<{ group_id: string; content: string; image_url?: string; created_at: string; sender_id: string }>>();
          for (const m of msgs as { group_id: string; content: string; image_url?: string; created_at: string; sender_id: string }[]) {
            if (!latestByGroup.has(m.group_id)) {
              latestByGroup.set(m.group_id, m.image_url ? '📷 사진' : m.content);
            }
            const list = byGroup.get(m.group_id) ?? [];
            list.push(m);
            byGroup.set(m.group_id, list);
          }
          for (const [gid, list] of byGroup) {
            unreadByGroup[gid] = countUnreadGroupMessages(list, {
              myId: userId,
              lastReadAt: lastReads[gid] ?? null,
            });
          }
        }
      }

      const enriched: GroupChat[] = groups.map(g => ({
        ...g,
        joined: groupIds.includes(g.id),
        lastMessage: latestByGroup.get(g.id) ?? '',
        memberCount: g.memberCount ?? 0,
      }));
      rawGroupsRef.current = enriched;
      const catalog = catalogGroupRooms(enriched, {
        myBirthYear: Number.isFinite(myBirthYear) ? myBirthYear : null,
        joinedIds: groupIds,
      });
      const remappedUnread: Record<string, number> = {};
      for (const [gid, n] of Object.entries(unreadByGroup)) {
        if (n <= 0) continue;
        const key = resolveCatalogGroupId(enriched, gid);
        remappedUnread[key] = (remappedUnread[key] ?? 0) + n;
      }
      if (activeGroupIdRef.current) delete remappedUnread[activeGroupIdRef.current];
      setUnreadGroupCounts(remappedUnread);
      setMyGroupIds(groupIds);
      myGroupIdsRef.current = groupIds;
      setGroupChats(catalog);
    } catch (e) {
      console.error('[loadGroupChats] 오류:', e);
    }
  }, []);

  // ── 단톡방 메시지 로드 ───────────────────────────────────────────────────────
  const loadGroupMessages = useCallback(async (groupId: string): Promise<boolean> => {
    const gen = ++loadGenRef.current;
    try {
      const { data, error } = await supabase.from('group_messages').select('*')
        .eq('group_id', groupId).order('created_at', { ascending: true });
      if (gen !== loadGenRef.current) return false;
      if (error) { console.error('[loadGroupMessages] DB 오류:', error.message); return false; }
      if (data) {
        setGroupMessages(prev => {
          const result = [...(data as GroupMessage[])];
          // 낙관적 메시지 중 아직 pending인 것만 유지
          const dbIds = new Set(result.map(m => m.id));
          const dbClientIds = new Set(result.map(m => m.client_id).filter(Boolean));
          const stillPending = prev.filter(
            m => m.id.startsWith('__opt_') && !dbIds.has(m.id) && !dbClientIds.has(m.client_id ?? ''),
          );
          // created_at 기준 정렬 (pending 낙관적 메시지가 DB rows 뒤에 붙을 때 순서 보장)
          const merged = [...result, ...stillPending].sort((a, b) => a.created_at.localeCompare(b.created_at));
          return merged.length > MAX_GROUP_MESSAGES ? merged.slice(-MAX_GROUP_MESSAGES) : merged;
        });
      }
      return true;
    } catch (e) {
      console.error('[loadGroupMessages] 오류:', e);
      return false;
    }
  }, []);

  const loadGroupParticipants = useCallback(async (groupId: string): Promise<void> => {
    try {
      const { data } = await supabase.from('group_participants').select('*').eq('group_id', groupId);
      if (activeGroupIdRef.current !== groupId) return;
      setGroupParticipants((data ?? []) as GroupParticipant[]);
    } catch (e) {
      console.warn('[loadGroupParticipants]', e);
    }
  }, []);

  const markGroupRead = useCallback(async (groupId: string): Promise<void> => {
    const userId = currentUserIdRef.current;
    if (!userId || !groupId) return;
    const at = new Date().toISOString();
    writeGroupLastRead(userId, groupId, at);
    setGroupParticipants(prev => prev.map(p =>
      p.user_id === userId && p.group_id === groupId ? { ...p, last_read_at: at } : p,
    ));
    try {
      await supabase.from('group_participants')
        .update({ last_read_at: at })
        .eq('group_id', groupId)
        .eq('user_id', userId);
    } catch (e) {
      console.warn('[markGroupRead]', e);
    }
  }, []);

  // ── 단톡방 열기 (이미 입장한 방만) ──────────────────────────────────────────
  const openGroupChat = useCallback(async (groupId: string): Promise<void> => {
    if (!isJoinedGroupId(rawGroupsRef.current, myGroupIdsRef.current, groupId)) return;
    const openId = resolveCatalogGroupId(rawGroupsRef.current, groupId) || groupId;
    setGroupMessages([]);
    setGroupParticipants([]);
    setActiveGroupId(openId);
    activeGroupIdRef.current = openId;
    setUnreadGroupCounts(prev => {
      const n = { ...prev };
      delete n[openId];
      delete n[groupId];
      return n;
    });
    if (currentUserIdRef.current) writeGroupLastRead(currentUserIdRef.current, openId);
    await Promise.all([
      loadGroupMessages(openId).catch(() => {}),
      loadGroupParticipants(openId),
    ]);
    void markGroupRead(openId);
  }, [loadGroupMessages, loadGroupParticipants, markGroupRead]);

  // ── 단톡방 입장 (클릭 전용, 자동 입장 없음) ────────────────────────────────
  const joinGroupChat = useCallback(async (groupId: string): Promise<boolean> => {
    const userId = currentUserIdRef.current;
    if (!userId || !groupId) return false;
    if (isJoinedGroupId(rawGroupsRef.current, myGroupIdsRef.current, groupId)) return true;
    const occupied = countJoinedCatalogRooms(rawGroupsRef.current, myGroupIdsRef.current);
    if (occupied >= MAX_GROUPS_PER_USER) {
      setBottomNotif({ type: 'error', nickname: groupLimitMessage() });
      return false;
    }
    setJoiningGroupId(groupId);
    try {
      const { error } = await supabase.from('group_participants').insert({
        group_id: groupId,
        user_id: userId,
      });
      if (error) {
        const msg = error.code === 'GROUP_LIMIT' || (error.message ?? '').includes('최대 4') || (error.message ?? '').includes('최대 3')
          ? groupLimitMessage()
          : (error.message || '입장에 실패했어요. 잠시 후 다시 시도해 주세요.');
        setBottomNotif({ type: 'error', nickname: msg });
        return false;
      }
      setMyGroupIds(prev => {
        const next = prev.includes(groupId) ? prev : [...prev, groupId];
        myGroupIdsRef.current = next;
        return next;
      });
      setGroupChats(prev => {
        const canon = resolveCatalogGroupId(rawGroupsRef.current.length ? rawGroupsRef.current : prev, groupId);
        return prev.map(g => (g.id === groupId || g.id === canon) ? { ...g, joined: true } : g);
      });
      void loadGroupChats(userId);
      return true;
    } catch (e) {
      console.error('[joinGroupChat] 오류:', e);
      setBottomNotif({ type: 'error', nickname: '입장에 실패했어요. 잠시 후 다시 시도해 주세요.' });
      return false;
    } finally {
      setJoiningGroupId(null);
    }
  }, [loadGroupChats, setBottomNotif]);

  // ── 단톡방 닫기 ──────────────────────────────────────────────────────────────
  const closeGroupChat = useCallback((): void => {
    setActiveGroupId(null);
    activeGroupIdRef.current = null;
    setGroupMessages([]);
    setGroupParticipants([]);
  }, []);

  // ── 단톡방 나가기 (카탈로그에는 남고, 다시 입장 가능) ───────────────────────
  const leaveGroupChat = useCallback(async (groupId: string): Promise<void> => {
    const userId = currentUserIdRef.current;
    if (!userId) return;
    const ids = siblingGroupIds(rawGroupsRef.current, groupId);
    try {
      for (const id of ids) {
        await supabase
          .from('group_participants')
          .delete()
          .eq('group_id', id)
          .eq('user_id', userId);
      }
    } catch (e) {
      console.error('[leaveGroupChat] 삭제 오류:', e);
    }
    const idSet = new Set(ids);
    setMyGroupIds(prev => prev.filter(id => !idSet.has(id)));
    myGroupIdsRef.current = myGroupIdsRef.current.filter(id => !idSet.has(id));
    if (activeGroupIdRef.current && idSet.has(activeGroupIdRef.current)) {
      setActiveGroupId(null);
      activeGroupIdRef.current = null;
      setGroupMessages([]);
      setGroupParticipants([]);
    }
    setUnreadGroupCounts(prev => {
      const n = { ...prev };
      for (const id of ids) delete n[id];
      delete n[groupId];
      return n;
    });
    await loadGroupChats(userId);
  }, [loadGroupChats]);

  // ── 메시지 전송 (낙관적 + 3회 재시도) ────────────────────────────────────────
  const sendGroupMessage = useCallback(async (content: string): Promise<void> => {
    const snapGroupId = activeGroupIdRef.current;
    const snapUserId = currentUserIdRef.current;
    if (!snapGroupId || !snapUserId || !content.trim()) return;
    if (content.trim().length > MAX_MSG_LEN) return;
    if (sendingGroupRef.current.has(snapGroupId)) return;
    sendingGroupRef.current.add(snapGroupId);

    const clientId = crypto.randomUUID();
    const optimisticId = `__opt_${clientId}`;
    const trimmed = content.trim();
    const optimistic: GroupMessage = {
      id: optimisticId,
      group_id: snapGroupId,
      sender_id: snapUserId,
      content: trimmed,
      created_at: new Date().toISOString(),
      client_id: clientId,
    };

    setGroupMessages(prev => [...prev, optimistic]);
    setGroupChats(prev => prev.map(g => g.id === snapGroupId ? { ...g, lastMessage: trimmed } : g));

    try {
      let success = false;
      for (let attempt = 0; attempt < 3 && !success; attempt++) {
        if (attempt > 0) {
          await new Promise<void>(r => setTimeout(r, Math.pow(2, attempt - 1) * 1000));
          if (activeGroupIdRef.current !== snapGroupId) return;
        }
        try {
          const { data, error } = await supabase.from('group_messages').insert({
            group_id: snapGroupId,
            sender_id: snapUserId,
            content: trimmed,
            client_id: clientId,
          }).select().single();

          if (!error && data) {
            setGroupMessages(prev => prev.map(m => m.id === optimisticId ? data as GroupMessage : m));
            success = true;
          } else if (error) {
            // 분실 응답 복구: client_id 재조회
            const { data: existing } = await supabase.from('group_messages')
              .select('*').eq('client_id', clientId).maybeSingle();
            if (existing) {
              setGroupMessages(prev => prev.map(m => m.id === optimisticId ? existing as GroupMessage : m));
              success = true;
            }
          }
        } catch {
          // retry
        }
      }
      if (!success) {
        // 3회 실패 → 낙관적 메시지 롤백 + 사용자 알림
        setGroupMessages(prev => prev.filter(m => m.id !== optimisticId));
        setBottomNotif({ type: 'error', nickname: '단톡 전송 실패 — 잠시 후 다시 시도해 주세요' });
      }
    } finally {
      sendingGroupRef.current.delete(snapGroupId);
    }
  }, [setBottomNotif]);

  // ── SSE 구독: group_messages + group_participants ─────────────────────────────
  useEffect(() => {
    if (!currentUserId) return;
    const uid = currentUserId;
    const ch = supabase
      .channel(`group-events-${uid}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'group_messages',
      }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        try {
          const m = payload.new as GroupMessage;
          if (!m?.id || !m.group_id || !m.sender_id) return;
          if (!myGroupIdsRef.current.includes(m.group_id)) return;
          if (activeGroupIdRef.current === m.group_id) {
            setGroupMessages(prev => {
              const next = applyGroupInsert(prev, m);
              return next.length > MAX_GROUP_MESSAGES ? next.slice(-MAX_GROUP_MESSAGES) : next;
            });
            if (m.sender_id !== uid) void markGroupRead(m.group_id);
          } else if (m.sender_id !== uid) {
            // 비활성 그룹 중복 방지 (재연결 시 동일 메시지 재수신 대비)
            if (seenInactiveGroupMsgIds.current.has(m.id)) return;
            seenInactiveGroupMsgIds.current.add(m.id);
            if (seenInactiveGroupMsgIds.current.size > 500) {
              const first = seenInactiveGroupMsgIds.current.values().next().value;
              if (first) seenInactiveGroupMsgIds.current.delete(first);
            }
            setGroupChats(prev => prev.map(g =>
              g.id === m.group_id ? { ...g, lastMessage: m.image_url ? '📷 사진' : m.content } : g
            ));
            const catalogId = resolveCatalogGroupId(rawGroupsRef.current.length ? rawGroupsRef.current : groupChatsRef.current, m.group_id);
            setUnreadGroupCounts(prev => ({ ...prev, [catalogId]: (prev[catalogId] ?? 0) + 1 }));
          }
        } catch { /* SSE 파싱 오류 무시 */ }
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'group_participants',
      }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        try {
          const hasNew = !!(payload.new && (payload.new.id || payload.new.group_id));
          const hasOld = !!(payload.old && (payload.old.id || payload.old.group_id));
          const event = hasNew && hasOld ? 'UPDATE' : hasNew ? 'INSERT' : 'DELETE';
          const incoming = (hasNew ? payload.new : payload.old) as GroupParticipant;
          if (!incoming?.group_id) return;
          if (event === 'INSERT' && incoming.user_id === uid) {
            setMyGroupIds(prev => prev.includes(incoming.group_id) ? prev : [...prev, incoming.group_id]);
            void loadGroupChats(uid);
            return;
          }
          if (event === 'DELETE' && incoming.user_id === uid) {
            setMyGroupIds(prev => prev.filter(id => id !== incoming.group_id));
            myGroupIdsRef.current = myGroupIdsRef.current.filter(id => id !== incoming.group_id);
            void loadGroupChats(uid);
          }
          if (activeGroupIdRef.current === incoming.group_id) {
            setGroupParticipants(prev => {
              if (event === 'DELETE' || !payload.new) {
                return prev.filter(p => p.id !== incoming.id && !(p.user_id === incoming.user_id && p.group_id === incoming.group_id));
              }
              const row = payload.new as GroupParticipant;
              const idx = prev.findIndex(p => p.id === row.id || (p.user_id === row.user_id && p.group_id === row.group_id));
              if (idx < 0) return [...prev, row];
              const next = [...prev];
              next[idx] = { ...next[idx], ...row };
              return next;
            });
          }
          if (event === 'INSERT' && incoming.user_id !== uid && myGroupIdsRef.current.includes(incoming.group_id)) {
            setGroupChats(prev => prev.map(g =>
              g.id === incoming.group_id ? { ...g, memberCount: (g.memberCount ?? 0) + 1 } : g
            ));
          }
          if (event === 'DELETE' && incoming.user_id !== uid && myGroupIdsRef.current.includes(incoming.group_id)) {
            setGroupChats(prev => prev.map(g =>
              g.id === incoming.group_id ? { ...g, memberCount: Math.max(0, (g.memberCount ?? 1) - 1) } : g
            ));
          }
        } catch { /* SSE 파싱 오류 무시 */ }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, loadGroupChats]);

  // ── 로그인 시 단톡방 로드 ─────────────────────────────────────────────────────
  useEffect(() => {
    if (currentUserId) {
      void loadGroupChats(currentUserId);
    } else {
      setGroupChats([]);
      setMyGroupIds([]);
      setActiveGroupId(null);
      setGroupMessages([]);
      setGroupParticipants([]);
      setUnreadGroupCounts({});
      setJoiningGroupId(null);
    }
  }, [currentUserId, loadGroupChats]);

  return {
    groupChats, setGroupChats,
    activeGroupId, setActiveGroupId, activeGroupIdRef,
    groupMessages, setGroupMessages,
    groupParticipants,
    unreadGroupCounts, setUnreadGroupCounts,
    myGroupIds, myGroupIdsRef,
    joiningGroupId,
    loadGroupChats,
    loadGroupMessages,
    openGroupChat,
    joinGroupChat,
    closeGroupChat,
    sendGroupMessage,
    leaveGroupChat,
  };
}
