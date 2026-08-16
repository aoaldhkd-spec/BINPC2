/**
 * useGroupChat — 단체 채팅 상태 관리 훅
 * - 관심사·나이 / 출생연도 두 방은 서버 자동 입장. 2차 클럽·2차 술은 클릭 입장
 * - SSE 단일 연결로 실시간 수신 (supabase.channel → localdb SSE 백엔드)
 * - group_messages: client_id 기반 낙관적 업데이트 + 3회 재시도
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile, GroupChat, GroupMessage, GroupParticipant } from '../types/app';
import { MAX_GROUPS_PER_USER, groupLimitMessage, sortGroupRooms } from '../lib/group-rooms';

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
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const activeGroupIdRef = useRef<string | null>(null);
  activeGroupIdRef.current = activeGroupId;

  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [unreadGroupCounts, setUnreadGroupCounts] = useState<Record<string, number>>({});
  const unreadGroupCountsRef = useRef<Record<string, number>>({});
  unreadGroupCountsRef.current = unreadGroupCounts;
  const [newGroupMsgCount, setNewGroupMsgCount] = useState(0);
  const [joiningGroupId, setJoiningGroupId] = useState<string | null>(null);

  const [myGroupIds, setMyGroupIds] = useState<string[]>([]);
  const myGroupIdsRef = useRef<string[]>([]);
  myGroupIdsRef.current = myGroupIds;

  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;

  const sendingGroupRef = useRef(new Set<string>());
  const loadGenRef = useRef(0);
  // 비활성 그룹 SSE 중복 방지 (재연결 시 동일 메시지 재수신 대비)
  const seenInactiveGroupMsgIds = useRef(new Set<string>());

  // ── 단톡방 목록 로드 (참여 중 + 입장 가능 카탈로그) ─────────────────────────
  const loadGroupChats = useCallback(async (userId: string): Promise<void> => {
    try {
      const [partsRes, groupsRes] = await Promise.all([
        supabase.from('group_participants').select('*').eq('user_id', userId),
        supabase.from('group_chats').select('*'),
      ]);
      const parts = (partsRes.data ?? []) as GroupParticipant[];
      const groupIds = parts.map(p => p.group_id);
      setMyGroupIds(groupIds);
      myGroupIdsRef.current = groupIds;

      const groups = (groupsRes.data ?? []) as GroupChat[];
      if (!groups.length) {
        setGroupChats([]);
        return;
      }

      const latestByGroup = new Map<string, string>();
      if (groupIds.length > 0) {
        const { data: msgs } = await supabase.from('group_messages')
          .select('group_id, content, image_url, created_at')
          .in('group_id', groupIds)
          .order('created_at', { ascending: false })
          .limit(Math.max(groupIds.length * 10, 50));
        if (msgs) {
          for (const m of msgs as { group_id: string; content: string; image_url?: string }[]) {
            if (!latestByGroup.has(m.group_id)) {
              latestByGroup.set(m.group_id, m.image_url ? '📷 사진' : m.content);
            }
          }
        }
      }

      const enriched: GroupChat[] = groups.map(g => ({
        ...g,
        joined: groupIds.includes(g.id),
        lastMessage: latestByGroup.get(g.id) ?? '',
        memberCount: g.memberCount ?? 0,
      }));
      enriched.sort(sortGroupRooms);
      setGroupChats(enriched);
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

  // ── 단톡방 열기 (이미 입장한 방만) ──────────────────────────────────────────
  const openGroupChat = useCallback(async (groupId: string): Promise<void> => {
    if (!myGroupIdsRef.current.includes(groupId)) return;
    setGroupMessages([]);
    setActiveGroupId(groupId);
    activeGroupIdRef.current = groupId;
    // 미읽음 초기화
    const removed = unreadGroupCountsRef.current[groupId] ?? 0;
    setUnreadGroupCounts(prev => { const n = { ...prev }; delete n[groupId]; return n; });
    if (removed > 0) setNewGroupMsgCount(c => Math.max(0, c - removed));
    await loadGroupMessages(groupId).catch(() => {});
  }, [loadGroupMessages]);

  // ── 단톡방 입장 (클릭 전용, 자동 입장 없음) ────────────────────────────────
  const joinGroupChat = useCallback(async (groupId: string): Promise<boolean> => {
    const userId = currentUserIdRef.current;
    if (!userId || !groupId) return false;
    if (myGroupIdsRef.current.includes(groupId)) return true;
    if (myGroupIdsRef.current.length >= MAX_GROUPS_PER_USER) {
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
        const msg = error.code === 'GROUP_LIMIT' || (error.message ?? '').includes('최대 3')
          ? groupLimitMessage()
          : (error.message || '입장에 실패했어요. 잠시 후 다시 시도해 주세요.');
        setBottomNotif({ type: 'error', nickname: msg });
        return false;
      }
      setMyGroupIds(prev => prev.includes(groupId) ? prev : [...prev, groupId]);
      await loadGroupChats(userId);
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
  }, []);

  // ── 단톡방 나가기 (카탈로그에는 남고, 다시 입장 가능) ───────────────────────
  const leaveGroupChat = useCallback(async (groupId: string): Promise<void> => {
    const userId = currentUserIdRef.current;
    if (!userId) return;
    try {
      await supabase
        .from('group_participants')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', userId);
    } catch (e) {
      console.error('[leaveGroupChat] 삭제 오류:', e);
    }
    setMyGroupIds(prev => prev.filter(id => id !== groupId));
    myGroupIdsRef.current = myGroupIdsRef.current.filter(id => id !== groupId);
    if (activeGroupIdRef.current === groupId) {
      setActiveGroupId(null);
      activeGroupIdRef.current = null;
      setGroupMessages([]);
    }
    setUnreadGroupCounts(prev => { const n = { ...prev }; delete n[groupId]; return n; });
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
            setUnreadGroupCounts(prev => ({ ...prev, [m.group_id]: (prev[m.group_id] ?? 0) + 1 }));
            setNewGroupMsgCount(n => n + 1);
            const sender = profilesRef.current.find(p => p.id === m.sender_id);
            setBottomNotif({ type: 'message', nickname: `[단톡] ${sender?.nickname ?? ''}` });
          }
        } catch { /* SSE 파싱 오류 무시 */ }
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'group_participants',
      }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        try {
          const p = payload.new as GroupParticipant;
          if (!p?.group_id) return;
          if (p.user_id === uid) {
            setMyGroupIds(prev => prev.includes(p.group_id) ? prev : [...prev, p.group_id]);
            void loadGroupChats(uid);
            return;
          }
          if (myGroupIdsRef.current.includes(p.group_id)) {
            setGroupChats(prev => prev.map(g =>
              g.id === p.group_id ? { ...g, memberCount: (g.memberCount ?? 0) + 1 } : g
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
      setUnreadGroupCounts({});
      setNewGroupMsgCount(0);
      setJoiningGroupId(null);
    }
  }, [currentUserId, loadGroupChats]);

  return {
    groupChats, setGroupChats,
    activeGroupId, setActiveGroupId, activeGroupIdRef,
    groupMessages, setGroupMessages,
    unreadGroupCounts, setUnreadGroupCounts,
    newGroupMsgCount, setNewGroupMsgCount,
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
