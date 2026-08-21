/**
 * useGroupChat — 단체 채팅 상태 관리 훅
 * - 년생 / N대 두 방은 서버 자동 입장. 2차 클럽·2차 술은 클릭 입장·나가기
 * - SSE 단일 연결로 실시간 수신 (supabase.channel → localdb SSE 백엔드)
 * - group_messages: client_id 기반 낙관적 업데이트 + 3회 재시도
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { onSseReconnect, isSseHealthy } from '../lib/localdb';
import type { Profile, GroupChat, GroupMessage, GroupParticipant } from '../types/app';
import type { BottomNotificationData } from '../components/BottomNotification';
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
import { isBlockedOpError, BLOCKED_SEND_TOAST } from '../lib/functions-lock';
import {
  filterGroupPendingQueueForUser,
  loadGroupPendingQueue,
  saveGroupPendingQueue,
  type PendingGroupMsg,
} from '../lib/group-pending-queue';

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
  setBottomNotif: React.Dispatch<React.SetStateAction<BottomNotificationData | null>>;
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
  const recentlyLeftRef = useRef(new Set<string>());
  /** 낙관적 입장 중 — SSE INSERT 시 중복 loadGroupChats 방지 */
  const pendingJoinRef = useRef(new Set<string>());
  const loadGroupChatsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const participantsCacheRef = useRef(new Map<string, { at: number; rows: GroupParticipant[] }>());
  const PARTICIPANTS_CACHE_MS = 30_000;
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
      const left = recentlyLeftRef.current;
      const visibleIds = groupIds.filter(id => !left.has(id));
      setMyGroupIds(visibleIds);
      myGroupIdsRef.current = visibleIds;

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
        joined: visibleIds.includes(g.id),
        lastMessage: latestByGroup.get(g.id) ?? '',
        memberCount: g.memberCount ?? 0,
      }));
      rawGroupsRef.current = enriched;
      const catalog = catalogGroupRooms(enriched, {
        myBirthYear: Number.isFinite(myBirthYear) ? myBirthYear : null,
        joinedIds: visibleIds,
      });
      const remappedUnread: Record<string, number> = {};
      for (const [gid, n] of Object.entries(unreadByGroup)) {
        if (n <= 0) continue;
        const key = resolveCatalogGroupId(enriched, gid);
        remappedUnread[key] = (remappedUnread[key] ?? 0) + n;
      }
      const active = activeGroupIdRef.current;
      if (active) {
        const remappedActive = resolveCatalogGroupId(enriched, active);
        if (remappedActive && remappedActive !== active) {
          setActiveGroupId(remappedActive);
          activeGroupIdRef.current = remappedActive;
        }
        delete remappedUnread[activeGroupIdRef.current ?? active];
        delete remappedUnread[active];
      }
      setUnreadGroupCounts(remappedUnread);
      setMyGroupIds(visibleIds);
      myGroupIdsRef.current = visibleIds;
      setGroupChats(catalog);
    } catch (e) {
      console.error('[loadGroupChats] 오류:', e);
    }
  }, [profilesRef]);

  /** 입장 직후·SSE와 겹치는 전체 카탈로그 reload를 한 번으로 묶는다 */
  const scheduleLoadGroupChats = useCallback((userId: string, delayMs = 2000) => {
    if (loadGroupChatsTimerRef.current) clearTimeout(loadGroupChatsTimerRef.current);
    loadGroupChatsTimerRef.current = setTimeout(() => {
      loadGroupChatsTimerRef.current = null;
      void loadGroupChats(userId);
    }, delayMs);
  }, [loadGroupChats]);

  // ── 오프라인 단톡 메시지 큐 (1:1 chat-pending-queue 패턴) ─────────────────────
  const pendingQueueRef = useRef<PendingGroupMsg[]>(loadGroupPendingQueue());
  const isFlushingRef = useRef(false);

  useEffect(() => {
    pendingQueueRef.current = filterGroupPendingQueueForUser(pendingQueueRef.current, currentUserId);
    saveGroupPendingQueue(pendingQueueRef.current);
  }, [currentUserId]);

  // ── 단톡방 메시지 로드 ───────────────────────────────────────────────────────
  const loadGroupMessages = useCallback(async (groupId: string): Promise<boolean> => {
    const gen = ++loadGenRef.current;
    try {
      const queryIds = [...new Set([
        ...siblingGroupIds(rawGroupsRef.current, groupId),
        resolveCatalogGroupId(rawGroupsRef.current, groupId),
        groupId,
      ].filter(Boolean))];
      const { data, error } = await supabase.from('group_messages').select('*')
        .in('group_id', queryIds).order('created_at', { ascending: true });
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

  const loadGroupParticipants = useCallback(async (groupId: string, opts?: { refresh?: boolean }): Promise<void> => {
    const openId = resolveCatalogGroupId(rawGroupsRef.current, groupId) || groupId;
    const cached = participantsCacheRef.current.get(openId);
    if (!opts?.refresh && cached && Date.now() - cached.at < PARTICIPANTS_CACHE_MS) {
      const active = activeGroupIdRef.current;
      if (active === openId || active === groupId) setGroupParticipants(cached.rows);
      return;
    }
    try {
      const queryIds = [...new Set([
        ...siblingGroupIds(rawGroupsRef.current, groupId),
        openId,
        groupId,
      ].filter(Boolean))];
      const { data } = await supabase.from('group_participants').select('*').in('group_id', queryIds);
      const active = activeGroupIdRef.current;
      if (active !== groupId && active !== openId && !queryIds.includes(active ?? '')) return;
      const rows = (data ?? []) as GroupParticipant[];
      const byUser = new Map<string, GroupParticipant>();
      for (const p of rows) {
        const existing = byUser.get(p.user_id);
        if (!existing || (p.last_read_at && (!existing.last_read_at || p.last_read_at > existing.last_read_at))) {
          byUser.set(p.user_id, { ...p, group_id: openId });
        }
      }
      const merged = [...byUser.values()];
      participantsCacheRef.current.set(openId, { at: Date.now(), rows: merged });
      setGroupParticipants(merged);
    } catch (e) {
      console.warn('[loadGroupParticipants]', e);
    }
  }, []);

  const isActiveGroupRoom = useCallback((groupId: string): boolean => {
    const active = activeGroupIdRef.current;
    if (!active || !groupId) return false;
    const rooms = rawGroupsRef.current.length ? rawGroupsRef.current : groupChatsRef.current;
    const catalogId = resolveCatalogGroupId(rooms, groupId);
    const sibs = siblingGroupIds(rooms, groupId);
    return active === groupId || active === catalogId || sibs.includes(active);
  }, []);

  const flushPendingGroupQueue = useCallback(async () => {
    if (isFlushingRef.current || pendingQueueRef.current.length === 0) return;
    isFlushingRef.current = true;
    try {
      const queue = [...pendingQueueRef.current];
      for (const item of queue) {
        if (item.userId !== currentUserIdRef.current) {
          pendingQueueRef.current = pendingQueueRef.current.filter(q => q.clientId !== item.clientId);
          setGroupMessages(prev => prev.filter(m => m.id !== item.optimisticId));
          continue;
        }
        try {
          const insertPromise = supabase.from('group_messages').insert({
            group_id: item.groupId,
            sender_id: item.userId,
            content: item.content,
            client_id: item.clientId,
          }).select().single();
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('group-queue-item-timeout')), 8_000)
          );
          const { data: insertedMsg, error } = await Promise.race([insertPromise, timeoutPromise]);
          if (!error && insertedMsg) {
            const saved = insertedMsg as GroupMessage;
            if (isActiveGroupRoom(item.groupId)) {
              setGroupMessages(prev => prev.map(m => m.id === item.optimisticId ? saved : m));
            }
            pendingQueueRef.current = pendingQueueRef.current.filter(q => q.clientId !== item.clientId);
            saveGroupPendingQueue(pendingQueueRef.current);
          } else if (error) {
            if (isBlockedOpError(error)) {
              pendingQueueRef.current = pendingQueueRef.current.filter(q => q.clientId !== item.clientId);
              saveGroupPendingQueue(pendingQueueRef.current);
              setGroupMessages(prev => prev.filter(m => m.id !== item.optimisticId));
              setBottomNotif({ type: 'system', message: BLOCKED_SEND_TOAST });
              continue;
            }
            const { data: existing } = await supabase.from('group_messages')
              .select('*').eq('client_id', item.clientId).maybeSingle();
            if (existing) {
              const saved = existing as GroupMessage;
              if (isActiveGroupRoom(item.groupId)) {
                setGroupMessages(prev => prev.map(m => m.id === item.optimisticId ? saved : m));
              }
              pendingQueueRef.current = pendingQueueRef.current.filter(q => q.clientId !== item.clientId);
              saveGroupPendingQueue(pendingQueueRef.current);
            }
          }
        } catch {
          continue;
        }
      }
    } finally {
      isFlushingRef.current = false;
    }
  }, [isActiveGroupRoom, setBottomNotif]);

  const resyncGroupState = useCallback(async (): Promise<void> => {
    const uid = currentUserIdRef.current;
    if (!uid) return;
    await loadGroupChats(uid);
    const active = activeGroupIdRef.current;
    if (!active) return;
    await Promise.all([
      loadGroupMessages(active).catch(() => false),
      loadGroupParticipants(active).catch(() => {}),
    ]);
  }, [loadGroupChats, loadGroupMessages, loadGroupParticipants]);

  const markGroupRead = useCallback(async (groupId: string): Promise<void> => {
    const userId = currentUserIdRef.current;
    if (!userId || !groupId) return;
    const at = new Date().toISOString();
    const allIds = siblingGroupIds(rawGroupsRef.current, groupId);
    for (const id of allIds) writeGroupLastRead(userId, id, at);
    setGroupParticipants(prev => prev.map(p =>
      p.user_id === userId && allIds.includes(p.group_id) ? { ...p, last_read_at: at } : p,
    ));
    try {
      await Promise.all(allIds.map(id => supabase.from('group_participants')
        .update({ last_read_at: at })
        .eq('group_id', id)
        .eq('user_id', userId)));
    } catch (e) {
      console.warn('[markGroupRead]', e);
    }
  }, []);

  // ── 단톡방 열기 (이미 입장한 방만) ──────────────────────────────────────────
  const openGroupChat = useCallback(async (groupId: string): Promise<void> => {
    if (!isJoinedGroupId(rawGroupsRef.current, myGroupIdsRef.current, groupId)) return;
    const openId = resolveCatalogGroupId(rawGroupsRef.current, groupId) || groupId;
    const switching = activeGroupIdRef.current !== openId;
    setActiveGroupId(openId);
    activeGroupIdRef.current = openId;
    setUnreadGroupCounts(prev => {
      const n = { ...prev };
      delete n[openId];
      delete n[groupId];
      return n;
    });
    if (switching) {
      setGroupMessages([]);
      const cached = participantsCacheRef.current.get(openId);
      setGroupParticipants(cached?.rows ?? []);
    }
    if (currentUserIdRef.current) writeGroupLastRead(currentUserIdRef.current, openId);
    void Promise.all([
      loadGroupMessages(openId).catch(() => false),
      loadGroupParticipants(openId),
    ]).then(() => { void markGroupRead(openId); });
  }, [loadGroupMessages, loadGroupParticipants, markGroupRead]);

  // ── 단톡방 입장 (클릭 전용, 자동 입장 없음) ────────────────────────────────
  const joinGroupChat = useCallback(async (groupId: string): Promise<boolean> => {
    const userId = currentUserIdRef.current;
    if (!userId || !groupId) return false;
    if (isJoinedGroupId(rawGroupsRef.current, myGroupIdsRef.current, groupId)) return true;
    const occupied = countJoinedCatalogRooms(rawGroupsRef.current, myGroupIdsRef.current);
    if (occupied >= MAX_GROUPS_PER_USER) {
      setBottomNotif({ type: 'system', message: groupLimitMessage() });
      return false;
    }

    const prevMyGroupIds = [...myGroupIdsRef.current];
    const prevGroupChats = groupChatsRef.current;
    const prevRawGroups = [...rawGroupsRef.current];
    const rooms = rawGroupsRef.current.length ? rawGroupsRef.current : groupChatsRef.current;
    const canon = resolveCatalogGroupId(rooms, groupId) || groupId;

    pendingJoinRef.current.add(groupId);
    recentlyLeftRef.current.delete(groupId);
    for (const id of siblingGroupIds(rooms, groupId)) recentlyLeftRef.current.delete(id);

    const nextMyGroupIds = prevMyGroupIds.includes(groupId) ? prevMyGroupIds : [...prevMyGroupIds, groupId];
    myGroupIdsRef.current = nextMyGroupIds;
    setMyGroupIds(nextMyGroupIds);
    setGroupChats(prev => prev.map(g =>
      (g.id === groupId || g.id === canon)
        ? { ...g, joined: true, memberCount: (g.memberCount ?? 0) + (g.joined ? 0 : 1) }
        : g,
    ));
    if (rawGroupsRef.current.length) {
      rawGroupsRef.current = rawGroupsRef.current.map(g =>
        (g.id === groupId || g.id === canon)
          ? { ...g, joined: true, memberCount: (g.memberCount ?? 0) + (g.joined ? 0 : 1) }
          : g,
      );
    }

    setJoiningGroupId(groupId);
    try {
      const { error } = await supabase.from('group_participants').insert({
        group_id: groupId,
        user_id: userId,
      });
      if (error) {
        myGroupIdsRef.current = prevMyGroupIds;
        setMyGroupIds(prevMyGroupIds);
        setGroupChats(prevGroupChats);
        rawGroupsRef.current = prevRawGroups;
        const msg = error.code === 'GROUP_LIMIT' || (error.message ?? '').includes('최대 4') || (error.message ?? '').includes('최대 3')
          ? groupLimitMessage()
          : (error.message || '입장에 실패했어요. 잠시 후 다시 시도해 주세요.');
        setBottomNotif({ type: 'system', message: msg });
        return false;
      }
      scheduleLoadGroupChats(userId);
      return true;
    } catch (e) {
      myGroupIdsRef.current = prevMyGroupIds;
      setMyGroupIds(prevMyGroupIds);
      setGroupChats(prevGroupChats);
      rawGroupsRef.current = prevRawGroups;
      console.error('[joinGroupChat] 오류:', e);
      setBottomNotif({ type: 'system', message: '입장에 실패했어요. 잠시 후 다시 시도해 주세요.' });
      return false;
    } finally {
      pendingJoinRef.current.delete(groupId);
      setJoiningGroupId(null);
    }
  }, [scheduleLoadGroupChats, setBottomNotif]);

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
    if (!userId || !groupId) return;
    const raw = rawGroupsRef.current;
    const ids = siblingGroupIds(raw, groupId);
    const catalogId = resolveCatalogGroupId(raw, groupId) || groupId;
    const idSet = new Set(ids);
    idSet.add(groupId);
    idSet.add(catalogId);

    const isLeavingId = (id: string) =>
      idSet.has(id) || resolveCatalogGroupId(raw, id) === catalogId || siblingGroupIds(raw, groupId).includes(id);

    for (const id of idSet) recentlyLeftRef.current.add(id);
    for (const id of idSet) {
      participantsCacheRef.current.delete(id);
      participantsCacheRef.current.delete(resolveCatalogGroupId(raw, id) || id);
    }
    window.setTimeout(() => {
      for (const id of idSet) recentlyLeftRef.current.delete(id);
    }, 15_000);

    setMyGroupIds(prev => {
      const next = prev.filter(id => !isLeavingId(id));
      myGroupIdsRef.current = next;
      return next;
    });
    setGroupChats(prev => prev.map(g => (isLeavingId(g.id) ? { ...g, joined: false } : g)));
    if (rawGroupsRef.current.length) {
      rawGroupsRef.current = rawGroupsRef.current.map(g => (isLeavingId(g.id) ? { ...g, joined: false } : g));
    }
    const active = activeGroupIdRef.current;
    if (active && isLeavingId(active)) {
      setActiveGroupId(null);
      activeGroupIdRef.current = null;
      setGroupMessages([]);
      setGroupParticipants([]);
    }
    setUnreadGroupCounts(prev => {
      const n = { ...prev };
      for (const id of idSet) delete n[id];
      delete n[groupId];
      delete n[catalogId];
      return n;
    });

    try {
      for (const id of idSet) {
        const { error } = await supabase
          .from('group_participants')
          .delete()
          .eq('group_id', id)
          .eq('user_id', userId);
        if (error) console.error('[leaveGroupChat] 삭제 오류:', error.message);
      }
    } catch (e) {
      console.error('[leaveGroupChat] 삭제 오류:', e);
    }
    await loadGroupChats(userId);
  }, [loadGroupChats]);

  // ── 메시지 전송 (낙관적 + 4회 재시도, 실패 시 오프라인 큐) ───────────────────
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
    const prevLastMessage = groupChatsRef.current.find(g => g.id === snapGroupId)?.lastMessage ?? '';
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

    const MAX_RETRIES = 4;
    let lastErr: unknown;

    try {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
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
            return;
          }
          if (error) {
            if (isBlockedOpError(error)) {
              setGroupMessages(prev => prev.filter(m => m.id !== optimisticId));
              setGroupChats(prev => prev.map(g =>
                g.id === snapGroupId && g.lastMessage === trimmed
                  ? { ...g, lastMessage: prevLastMessage }
                  : g
              ));
              setBottomNotif({ type: 'system', message: BLOCKED_SEND_TOAST });
              return;
            }
            const { data: existing } = await supabase.from('group_messages')
              .select('*').eq('client_id', clientId).maybeSingle();
            if (existing) {
              setGroupMessages(prev => prev.map(m => m.id === optimisticId ? existing as GroupMessage : m));
              return;
            }
            lastErr = error;
          }
        } catch (err) {
          lastErr = err;
          if (activeGroupIdRef.current !== snapGroupId) return;
        }
      }

      console.warn('[sendGroupMessage] 4회 재시도 실패 — 오프라인 큐에 보관, 재연결 시 자동 전송:', lastErr);
      if (pendingQueueRef.current.length >= 50) pendingQueueRef.current.shift();
      pendingQueueRef.current.push({
        groupId: snapGroupId, content: trimmed, clientId, optimisticId, userId: snapUserId,
      });
      saveGroupPendingQueue(pendingQueueRef.current);
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
          const rooms = rawGroupsRef.current.length ? rawGroupsRef.current : groupChatsRef.current;
          const catalogId = resolveCatalogGroupId(rooms, m.group_id);
          const sibs = siblingGroupIds(rooms, m.group_id);
          if (!sibs.some(id => myGroupIdsRef.current.includes(id)) && !myGroupIdsRef.current.includes(m.group_id)) return;
          const active = activeGroupIdRef.current;
          const inActive = !!active && (active === m.group_id || active === catalogId || sibs.includes(active));
          if (inActive) {
            setGroupMessages(prev => {
              const next = applyGroupInsert(prev, m);
              return next.length > MAX_GROUP_MESSAGES ? next.slice(-MAX_GROUP_MESSAGES) : next;
            });
            if (m.sender_id !== uid) void markGroupRead(active || m.group_id);
          } else if (m.sender_id !== uid) {
            // 비활성 그룹 중복 방지 (재연결 시 동일 메시지 재수신 대비)
            if (seenInactiveGroupMsgIds.current.has(m.id)) return;
            seenInactiveGroupMsgIds.current.add(m.id);
            if (seenInactiveGroupMsgIds.current.size > 500) {
              const first = seenInactiveGroupMsgIds.current.values().next().value;
              if (first) seenInactiveGroupMsgIds.current.delete(first);
            }
            setGroupChats(prev => prev.map(g =>
              (g.id === catalogId || g.id === m.group_id) ? { ...g, lastMessage: m.image_url ? '📷 사진' : m.content } : g
            ));
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
            if (recentlyLeftRef.current.has(incoming.group_id)) return;
            setMyGroupIds(prev => prev.includes(incoming.group_id) ? prev : [...prev, incoming.group_id]);
            if (pendingJoinRef.current.has(incoming.group_id)) return;
            scheduleLoadGroupChats(uid);
            return;
          }
          if (event === 'DELETE' && incoming.user_id === uid) {
            setMyGroupIds(prev => prev.filter(id => id !== incoming.group_id));
            myGroupIdsRef.current = myGroupIdsRef.current.filter(id => id !== incoming.group_id);
            void loadGroupChats(uid);
          }
          if (isActiveGroupRoom(incoming.group_id)) {
            const openId = activeGroupIdRef.current ?? incoming.group_id;
            participantsCacheRef.current.delete(openId);
            participantsCacheRef.current.delete(incoming.group_id);
            setGroupParticipants(prev => {
              if (event === 'DELETE' || !payload.new) {
                return prev.filter(p => p.id !== incoming.id && !(p.user_id === incoming.user_id && p.group_id === incoming.group_id));
              }
              const row = { ...(payload.new as GroupParticipant), group_id: openId };
              const idx = prev.findIndex(p => p.id === row.id || p.user_id === row.user_id);
              if (idx < 0) return [...prev, row];
              const next = [...prev];
              next[idx] = { ...next[idx], ...row };
              return next;
            });
          }
          if (event === 'INSERT' && incoming.user_id !== uid && myGroupIdsRef.current.includes(incoming.group_id)) {
            const rooms = rawGroupsRef.current.length ? rawGroupsRef.current : groupChatsRef.current;
            const catalogId = resolveCatalogGroupId(rooms, incoming.group_id);
            setGroupChats(prev => prev.map(g =>
              (g.id === incoming.group_id || g.id === catalogId) ? { ...g, memberCount: (g.memberCount ?? 0) + 1 } : g
            ));
          }
          if (event === 'DELETE' && incoming.user_id !== uid && myGroupIdsRef.current.includes(incoming.group_id)) {
            const rooms = rawGroupsRef.current.length ? rawGroupsRef.current : groupChatsRef.current;
            const catalogId = resolveCatalogGroupId(rooms, incoming.group_id);
            setGroupChats(prev => prev.map(g =>
              (g.id === incoming.group_id || g.id === catalogId) ? { ...g, memberCount: Math.max(0, (g.memberCount ?? 1) - 1) } : g
            ));
          }
        } catch { /* SSE 파싱 오류 무시 */ }
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'group_chats',
      }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        try {
          const oldId = String((payload.old as { id?: string } | undefined)?.id ?? '');
          const newId = String((payload.new as { id?: string } | undefined)?.id ?? '');
          const mergedInto = String((payload.new as { merged_into?: string } | undefined)?.merged_into ?? '');
          const gone = oldId && !newId;
          if (!gone && !mergedInto) return;
          const leftover = oldId || newId;
          const rooms = rawGroupsRef.current;
          const canon = mergedInto || resolveCatalogGroupId(rooms, leftover);
          const active = activeGroupIdRef.current;
          if (active && leftover && (active === leftover || siblingGroupIds(rooms, leftover).includes(active))) {
            if (canon && canon !== active) {
              setActiveGroupId(canon);
              activeGroupIdRef.current = canon;
              void loadGroupMessages(canon);
              void loadGroupParticipants(canon);
            }
          }
          if (currentUserIdRef.current) void loadGroupChats(currentUserIdRef.current);
        } catch { /* ignore */ }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, loadGroupChats, scheduleLoadGroupChats]);

  // ── SSE 재연결 / 탭 복귀 / 끊김 시 단톡 목록·메시지 resync + 오프라인 큐 플러시 ─
  useEffect(() => {
    return onSseReconnect(() => {
      void resyncGroupState();
      void flushPendingGroupQueue();
    });
  }, [resyncGroupState, flushPendingGroupQueue]);

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') {
        void resyncGroupState();
        void flushPendingGroupQueue();
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [resyncGroupState, flushPendingGroupQueue]);

  useEffect(() => {
    const onOnline = () => void flushPendingGroupQueue();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [flushPendingGroupQueue]);

  useEffect(() => {
    if (!currentUserId) return;
    const id = setInterval(() => {
      if (isSseHealthy()) return;
      void resyncGroupState();
    }, 15_000);
    return () => clearInterval(id);
  }, [currentUserId, resyncGroupState]);

  useEffect(() => {
    const gid = activeGroupId;
    if (!gid) return;
    let pollFailCount = 0;
    let isPolling = false;
    let pollPausedUntil = 0;
    let lastTick = 0;
    const pollInterval = setInterval(async () => {
      if (activeGroupIdRef.current !== gid) return;
      if (Date.now() < pollPausedUntil) return;
      if (isPolling) return;
      if (isSseHealthy()) return;
      const intervalMs = 3_000;
      if (Date.now() - lastTick < intervalMs - 50) return;
      lastTick = Date.now();
      isPolling = true;
      try {
        const ok = await loadGroupMessages(gid);
        if (ok) {
          pollFailCount = 0;
          pollPausedUntil = 0;
        } else if (++pollFailCount >= 3) {
          pollPausedUntil = Date.now() + 20_000;
          pollFailCount = 0;
        }
      } finally {
        isPolling = false;
      }
    }, 1_000);
    return () => clearInterval(pollInterval);
  }, [activeGroupId, loadGroupMessages]);

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
