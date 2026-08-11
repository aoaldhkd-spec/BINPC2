/**
 * useGroupChat — 단체 채팅(자동 매칭 단톡방) 상태 관리 훅
 * - 관심사/나이대 기반 자동 배정 그룹 채팅
 * - SSE 단일 연결로 실시간 수신 (supabase.channel → localdb SSE 백엔드)
 * - group_messages: client_id 기반 낙관적 업데이트 + 3회 재시도
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile, GroupChat, GroupMessage, GroupParticipant } from '../types/app';

const MAX_GROUP_MESSAGES = 300;

/** group_messages SSE INSERT 수신 시 낙관적 메시지 교체 or 추가 */
function applyGroupInsert(prev: GroupMessage[], newMsg: GroupMessage): GroupMessage[] {
  // client_id 일치 → 낙관적 항목 교체
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
  return [...prev, newMsg];
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

  const [myGroupIds, setMyGroupIds] = useState<string[]>([]);
  const myGroupIdsRef = useRef<string[]>([]);
  myGroupIdsRef.current = myGroupIds;

  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;

  const sendingGroupRef = useRef(new Set<string>());
  const loadGenRef = useRef(0);

  // ── 단톡방 목록 로드 ─────────────────────────────────────────────────────────
  const loadGroupChats = useCallback(async (userId: string): Promise<void> => {
    try {
      // 1. 내 참여 목록
      const { data: parts } = await supabase.from('group_participants').select('*').eq('user_id', userId);
      if (!parts || (parts as GroupParticipant[]).length === 0) {
        setGroupChats([]);
        setMyGroupIds([]);
        return;
      }
      const groupIds = (parts as GroupParticipant[]).map(p => p.group_id);
      setMyGroupIds(groupIds);
      myGroupIdsRef.current = groupIds;

      // 2. 그룹 정보
      const { data: groups } = await supabase.from('group_chats').select('*').in('id', groupIds);
      if (!groups) return;

      // 3. 최근 메시지 미리보기
      const { data: msgs } = await supabase.from('group_messages')
        .select('group_id, content, image_url, created_at')
        .in('group_id', groupIds)
        .order('created_at', { ascending: false })
        .limit(Math.max(groupIds.length * 10, 50));

      const latestByGroup = new Map<string, string>();
      if (msgs) {
        for (const m of msgs as { group_id: string; content: string; image_url?: string }[]) {
          if (!latestByGroup.has(m.group_id)) {
            latestByGroup.set(m.group_id, m.image_url ? '📷 사진' : m.content);
          }
        }
      }

      // 4. 참여자 수
      const { data: allParts } = await supabase.from('group_participants')
        .select('group_id')
        .in('group_id', groupIds);
      const memberCount = new Map<string, number>();
      if (allParts) {
        for (const p of allParts as { group_id: string }[]) {
          memberCount.set(p.group_id, (memberCount.get(p.group_id) ?? 0) + 1);
        }
      }

      const enriched: GroupChat[] = (groups as GroupChat[]).map(g => ({
        ...g,
        lastMessage: latestByGroup.get(g.id) ?? '',
        memberCount: memberCount.get(g.id) ?? 0,
      }));
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
          const merged = [...result, ...stillPending];
          return merged.length > MAX_GROUP_MESSAGES ? merged.slice(-MAX_GROUP_MESSAGES) : merged;
        });
      }
      return true;
    } catch (e) {
      console.error('[loadGroupMessages] 오류:', e);
      return false;
    }
  }, []);

  // ── 단톡방 열기 ──────────────────────────────────────────────────────────────
  const openGroupChat = useCallback(async (groupId: string): Promise<void> => {
    setGroupMessages([]);
    setActiveGroupId(groupId);
    activeGroupIdRef.current = groupId;
    // 미읽음 초기화
    const removed = unreadGroupCountsRef.current[groupId] ?? 0;
    setUnreadGroupCounts(prev => { const n = { ...prev }; delete n[groupId]; return n; });
    if (removed > 0) setNewGroupMsgCount(c => Math.max(0, c - removed));
    await loadGroupMessages(groupId).catch(console.error);
  }, [loadGroupMessages]);

  // ── 단톡방 닫기 ──────────────────────────────────────────────────────────────
  const closeGroupChat = useCallback((): void => {
    setActiveGroupId(null);
    activeGroupIdRef.current = null;
    setGroupMessages([]);
  }, []);

  // ── 단톡방 나가기 (영구 퇴장) ────────────────────────────────────────────────
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
    // 로컬 상태 업데이트 (서버 응답과 무관하게 즉시 반영)
    setMyGroupIds(prev => prev.filter(id => id !== groupId));
    setGroupChats(prev => prev.filter(g => g.id !== groupId));
    if (activeGroupIdRef.current === groupId) {
      setActiveGroupId(null);
      activeGroupIdRef.current = null;
      setGroupMessages([]);
    }
    setUnreadGroupCounts(prev => { const n = { ...prev }; delete n[groupId]; return n; });
  }, []);

  // ── 메시지 전송 (낙관적 + 3회 재시도) ────────────────────────────────────────
  const sendGroupMessage = useCallback(async (content: string): Promise<void> => {
    const snapGroupId = activeGroupIdRef.current;
    const snapUserId = currentUserIdRef.current;
    if (!snapGroupId || !snapUserId || !content.trim()) return;
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
        // 3회 실패 → 낙관적 메시지 롤백
        setGroupMessages(prev => prev.filter(m => m.id !== optimisticId));
      }
    } finally {
      sendingGroupRef.current.delete(snapGroupId);
    }
  }, []);

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
            setGroupChats(prev => prev.map(g =>
              g.id === m.group_id ? { ...g, lastMessage: m.image_url ? '📷 사진' : m.content } : g
            ));
            setUnreadGroupCounts(prev => ({ ...prev, [m.group_id]: (prev[m.group_id] ?? 0) + 1 }));
            setNewGroupMsgCount(n => n + 1);
            const sender = profilesRef.current.find(p => p.id === m.sender_id);
            setBottomNotif({ type: 'message', nickname: `[단톡] ${sender?.nickname ?? ''}` });
          }
        } catch (e) { console.warn('[group-ch/msg-insert]', e); }
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'group_participants',
      }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
        try {
          const p = payload.new as GroupParticipant;
          if (!p?.group_id || p.user_id !== uid) return;
          setMyGroupIds(prev => prev.includes(p.group_id) ? prev : [...prev, p.group_id]);
          void loadGroupChats(uid);
        } catch (e) { console.warn('[group-ch/participant]', e); }
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
    }
  }, [currentUserId, loadGroupChats]);

  return {
    groupChats, setGroupChats,
    activeGroupId, setActiveGroupId, activeGroupIdRef,
    groupMessages, setGroupMessages,
    unreadGroupCounts, setUnreadGroupCounts,
    newGroupMsgCount, setNewGroupMsgCount,
    myGroupIds, myGroupIdsRef,
    loadGroupChats,
    loadGroupMessages,
    openGroupChat,
    closeGroupChat,
    sendGroupMessage,
    leaveGroupChat,
  };
}
