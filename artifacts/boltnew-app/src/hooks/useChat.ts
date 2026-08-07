/**
 * useChat — 1:1 채팅 상태 관리 훅
 *
 * 구조적 안전 장치:
 * 1. sendMessage/sendImage: chatIdRef·currentUserIdRef(항상 최신 ref)를 스냅샷해 stale closure 완전 차단
 * 2. 전송 잠금: boolean → Set<chatId> 로 교체 — 채팅방별 독립 잠금 (A 전송 중에도 B 전송 가능)
 * 3. 자동 재시도: 네트워크 오류 시 지수 백오프(1s→2s→4s)로 최대 3회 재시도, 낙관적 메시지 유지
 * 4. 미읽음 뱃지: unreadChatCountsRef(ref)로 항상 최신값 보장
 * 5. 채널 누수: per-chat 채널은 chatIdsKey·currentUserId 변화 시 cleanup이 항상 실행됨
 * 6. 폴링 중첩 방지: 이전 폴링이 완료되기 전 다음 폴링 실행 차단
 * 7. 메시지 배열 상한: MAX_MESSAGES 초과 시 가장 오래된 것부터 제거 (메모리 누수 방지)
 * 8. SSE 페이로드 검증: 필수 필드 없는 이벤트 즉시 차단
 */

const MAX_MESSAGES = 500; // 채팅방당 최대 메시지 보유 수 (메모리 누수 방지)

// 오프라인 큐 항목 타입 — 모듈 레벨 선언으로 HMR 호환성 유지
// userId: 큐에 쌓일 당시 로그인 유저 — flush 시 다른 유저로 전환됐으면 해당 항목 폐기
interface PendingMsg { chatId: string; content: string; clientId: string; optimisticId: string; userId: string }

import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { onSseReconnect, getSseToken } from '../lib/localdb';
import type { Profile, Message, Chat, View } from '../types/app';
import { HeartType } from '../lib/constants';
import { applySseInsert, applyLoadMessages } from '../lib/chat-reducers';

interface UseChatDeps {
  currentUserId: string | null;
  profilesRef: React.MutableRefObject<Profile[]>;
  setSelectedProfile: (p: Profile | null) => void;
  setView: (v: View) => void;
  setBottomNotif: (n: { type: 'heart' | 'chat' | 'message' | 'contact'; nickname: string; heartType?: HeartType } | null) => void;
}

export function useChat({
  currentUserId,
  profilesRef,
  setSelectedProfile,
  setView,
  setBottomNotif,
}: UseChatDeps) {
  const [chatId, setChatId] = useState<string | null>(null);
  const chatIdRef = useRef<string | null>(null);
  chatIdRef.current = chatId;

  // currentUserId를 ref로 캡처 — sendMessage/sendImage가 항상 최신값을 읽음 (stale closure 차단)
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;

  // 내가 직접 연 채팅방 pair 기록 — SSE INSERT 알림 억제용
  const selfInitiatedPairRef = useRef<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [chatList, setChatList] = useState<Chat[]>([]);
  const chatListRef = useRef<Chat[]>([]);
  chatListRef.current = chatList;

  const perChatChannelsRef = useRef<Map<string, ReturnType<typeof supabase.channel>>>(new Map());
  const [unreadChatCounts, setUnreadChatCounts] = useState<Record<string, number>>({});
  // ref 사본: async 컨텍스트에서 stale closure 없이 최신값 읽기
  const unreadChatCountsRef = useRef<Record<string, number>>({});
  unreadChatCountsRef.current = unreadChatCounts;

  const [newMsgCount, setNewMsgCount] = useState(0);

  // ── 낙관적 읽음 보호: 최근 30초 내에 읽은 채팅방 추적 ────────────────────────
  // syncUnreadCounts가 서버 응답으로 전체 상태를 덮어쓸 때,
  // upsert 응답이 아직 서버에 도달하지 않은 채팅방을 다시 unread로 표시하는 것을 방지.
  const recentlyReadRef = useRef<Map<string, number>>(new Map());

  // ── 채팅방별 메시지 구독 (서버 사이드 필터) ──────────────────────────────────
  // chatIdsKey: chatList의 ID 목록만 직렬화 — lastMessage 변경 시 채널 재생성 방지
  const chatIdsKey = chatList.map(c => c.id).join(',');

  // [버그3 수정] 기존 코드: cleanup이 chatIdsKey 변경 시마다 모든 채널을 끊고 재구독해 메시지 수신 갭 발생
  // 수정 후: userId 변경/언마운트 시만 전체 정리, chatIdsKey 변경 시는 선택적 추가/제거만 수행
  useEffect(() => {
    // userId 변경 또는 언마운트 시 전체 채널 정리
    return () => {
      for (const ch of perChatChannelsRef.current.values()) supabase.removeChannel(ch);
      perChatChannelsRef.current.clear();
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId || chatListRef.current.length === 0) return;
    const channels = perChatChannelsRef.current;
    const currentIds = new Set(chatListRef.current.map(c => c.id));

    // 삭제된 채팅방 채널만 선택적으로 제거 — 기존 채널은 건드리지 않음
    for (const [cid, ch] of [...channels]) {
      if (!currentIds.has(cid)) {
        supabase.removeChannel(ch);
        channels.delete(cid);
      }
    }

    // 새 채팅방 채널 추가 (이미 구독 중인 채팅방은 skip — 재구독 갭 제거)
    for (const chat of chatListRef.current) {
      if (channels.has(chat.id)) continue;
      const chatId_ = chat.id;
      const ch = supabase
        .channel(`msgs:${chatId_}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'messages',
          filter: `chat_id=eq.${chatId_}`,
        }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          try {
            const m = payload.new as { chat_id: string; sender_id: string; content: string; image_url?: string };
            // [안전장치 8] SSE 페이로드 필수 필드 검증 — 잘못된 데이터 즉시 차단
            if (!m || typeof m.sender_id !== 'string' || !m.sender_id ||
                typeof m.chat_id !== 'string' || !m.chat_id) return;
            // 내 메시지는 HTTP 응답 + optimistic UI에서 이미 처리 — 여기서 중복 금지
            if (m.sender_id === currentUserId) return;
            const preview = m.image_url ? '📷 사진' : m.content;
            setChatList(prev => prev.map(c => c.id === m.chat_id ? { ...c, lastMessage: preview } : c));
            // 현재 열린 채팅방이면 미읽음 증가 없이 lastMessage만 업데이트
            if (chatIdRef.current !== m.chat_id) {
              setUnreadChatCounts(prev => ({ ...prev, [m.chat_id]: (prev[m.chat_id] ?? 0) + 1 }));
              const senderProfile = profilesRef.current.find(p => p.id === m.sender_id);
              setNewMsgCount(n => n + 1);
              setBottomNotif({ type: 'message', nickname: senderProfile?.nickname ?? '' });
            }
          } catch (e) { console.warn('[msgs-ch]', e); }
        })
        .subscribe();
      channels.set(chatId_, ch);
    }
    // cleanup 없음 — 전체 정리는 위 userId effect가 담당, 선택적 제거는 이 effect 본문에서 처리
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatIdsKey, currentUserId]);

  // ── 활성 채팅방 메시지 로드 ───────────────────────────────────────────────────
  const loadGenRef = useRef(0);
  const loadMessages = useCallback(async (cid: string): Promise<boolean> => {
    const gen = ++loadGenRef.current;
    try {
      const { data, error } = await supabase.from('messages').select('*').eq('chat_id', cid).order('created_at', { ascending: true });
      if (gen !== loadGenRef.current) return false; // stale 응답 버림
      if (error) { console.error('[loadMessages] DB 오류:', error.message); return false; }
      if (data) setMessages(prev => {
        const result = applyLoadMessages(prev, data as Message[]);
        // [안전장치 7] 메시지 배열 상한 — 오래된 메시지부터 제거해 메모리 누수 방지
        return result.length > MAX_MESSAGES ? result.slice(-MAX_MESSAGES) : result;
      });
      return true;
    } catch (err) {
      console.error('[loadMessages] 네트워크 오류:', err);
      return false;
    }
  }, []);

  // ── 채팅방 진입/전환 ─────────────────────────────────────────────────────────
  useEffect(() => {
    setMessages([]);
    if (!chatId) return;
    chatIdRef.current = chatId;

    // 채팅방 열 때: unread 카운트 낙관적 삭제 + 전체 배지 감소
    // upsert 실패 시 뱃지 복원 (catch) — 서버 상태와 UI 불일치 방지
    const removed = unreadChatCountsRef.current[chatId] ?? 0;
    setUnreadChatCounts(prev => { const n = { ...prev }; delete n[chatId]; return n; });
    if (removed > 0) setNewMsgCount(c => Math.max(0, c - removed));
    // 낙관적 읽음 보호: 30초간 syncUnreadCounts가 이 채팅방을 unread로 복원하지 않도록
    recentlyReadRef.current.set(chatId, Date.now());

    if (currentUserId) {
      supabase.from('chat_reads').upsert({
        id: `${chatId}__${currentUserId}`,
        chat_id: chatId,
        reader_id: currentUserId,
        read_at: new Date().toISOString(),
      }, { onConflict: 'id' }).then(() => {}).catch(() => {
        // upsert 실패: 낙관적으로 지운 뱃지를 복원해 서버 상태와 일치시킴
        if (removed > 0) {
          setUnreadChatCounts(prev => ({ ...prev, [chatId]: removed }));
          setNewMsgCount(c => c + removed);
        }
      });
    }

    const channel = supabase
      .channel(`chat:${chatId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          // [안전장치 8] SSE 페이로드 필수 필드 검증 — null/undefined/wrong-type 즉시 차단
          const raw = payload.new;
          if (!raw || typeof raw.id !== 'string' || !raw.id || typeof raw.sender_id !== 'string') return;
          // chatId guard: 채팅방 전환 중 stale 콜백이 다른 채팅방 메시지를 삽입하는 것을 차단
          if (chatIdRef.current !== chatId) return;
          const newMsg = raw as unknown as Message;
          setMessages(prev => {
            const next = applySseInsert(prev, newMsg);
            return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
          });
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          const deleted = payload.old as { id?: string };
          if (deleted.id && typeof deleted.id === 'string') setMessages(prev => prev.filter(m => m.id !== deleted.id));
        })
      .subscribe();

    loadMessages(chatId);

    // SSE 불안정 시 폴링 폴백 — 3초마다 확인 (applyLoadMessages가 dedup 처리)
    // 3회 연속 실패 시 20초 쿨다운 후 자동 재개 (영구 중단 → 일시 정지)
    // [안전장치 6] isPolling 플래그로 이전 폴링이 완료되기 전 중복 실행 차단
    let pollFailCount = 0;
    let isPolling = false;
    let pollPausedUntil = 0; // 이 시각(ms) 전에는 폴링 skip — 일시 정지 구현
    const pollInterval = setInterval(async () => {
      if (chatIdRef.current !== chatId) return;
      if (Date.now() < pollPausedUntil) return; // 쿨다운 중 — 대기
      if (isPolling) return; // 이전 폴링이 아직 실행 중 — skip (간격 중첩 방지)
      isPolling = true;
      try {
        const ok = await loadMessages(chatId);
        if (ok) {
          pollFailCount = 0;
          pollPausedUntil = 0;
        } else if (++pollFailCount >= 3) {
          // 3회 연속 실패 → 20초 쿨다운 후 재시도 (서버 과부하 방지 + 복구 보장)
          pollPausedUntil = Date.now() + 20_000;
          pollFailCount = 0;
        }
      } finally {
        isPolling = false;
      }
    }, 3_000);

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
      if (currentUserId) {
        supabase.from('chat_reads').upsert({
          id: `${chatId}__${currentUserId}`,
          chat_id: chatId,
          reader_id: currentUserId,
          read_at: new Date().toISOString(),
        }, { onConflict: 'id' }).then(() => {}).catch(() => {});
      }
    };
  }, [chatId, loadMessages, currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 채팅 목록 로드 ────────────────────────────────────────────────────────────
  const syncUnreadCountsRef = useRef<(() => Promise<void>) | null>(null);
  const loadChatListGenRef = useRef(0);
  const loadChatList = useCallback(async (userId: string) => {
    const gen = ++loadChatListGenRef.current;
    try {
      const { data } = await supabase.from('chats').select('*')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .order('created_at', { ascending: false });
      if (gen !== loadChatListGenRef.current) return;
      if (!data) return;
      if (data.length === 0) { setChatList([]); void syncUnreadCountsRef.current?.(); return; }

      const chatIds = data.map((c: { id: string }) => c.id);
      const { data: allMsgs } = await supabase.from('messages').select('chat_id, content, image_url, created_at')
        .in('chat_id', chatIds).order('created_at', { ascending: false }).limit(Math.max(chatIds.length * 20, 100));
      if (gen !== loadChatListGenRef.current) return;

      const latestByChat = new Map<string, { content: string; image_url?: string; created_at: string }>();
      if (allMsgs) {
        for (const m of allMsgs as { chat_id: string; content: string; image_url?: string; created_at: string }[]) {
          if (!latestByChat.has(m.chat_id)) latestByChat.set(m.chat_id, { content: m.content, image_url: m.image_url, created_at: m.created_at });
        }
      }

      const enriched: Chat[] = data.map((c: { id: string; user1_id: string; user2_id: string; created_at: string }) => {
        const latest = latestByChat.get(c.id);
        return { ...c, lastMessage: latest?.image_url ? '📷 사진' : (latest?.content ?? ''), messageCount: 0 };
      });
      setChatList(enriched);
      void syncUnreadCountsRef.current?.();
    } catch (err) {
      console.error('[loadChatList] 오류:', err);
    }
  }, []);

  // ── 채팅방 열기 ──────────────────────────────────────────────────────────────
  const openChatGenRef = useRef(0);
  const selfInitiatedPairTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // [버그4 수정] selfInitiatedPairTimerRef 언마운트 시 정리 (선언 이후에 배치 — TDZ 방지)
  useEffect(() => {
    return () => {
      if (selfInitiatedPairTimerRef.current !== null) {
        clearTimeout(selfInitiatedPairTimerRef.current);
        selfInitiatedPairTimerRef.current = null;
      }
    };
  }, []);

  // [버그2 수정] 상대가 나에게 새 채팅방을 만들면 chatList를 즉시 갱신 (loadChatList 선언 이후에 배치)
  // Supabase realtime: chats 테이블 INSERT를 user1_id / user2_id 각각으로 감시
  // 새 채팅 감지 → loadChatList → chatIdsKey 변경 → perChatChannels effect가 새 채팅방 채널 자동 구독
  useEffect(() => {
    if (!currentUserId) return;
    const uid = currentUserId;

    const handleNewChat = (payload: { new: Record<string, unknown> }) => {
      const uidNow = currentUserIdRef.current;
      if (!uidNow) return;
      // 내가 직접 openChat()으로 만든 채팅방은 이미 목록에 있으므로 중복 알림 방지
      const newRow = payload.new as { user1_id?: string; user2_id?: string };
      const pair = `${newRow.user1_id}:${newRow.user2_id}`;
      if (selfInitiatedPairRef.current === pair) return;
      // 상대방이 만든 새 채팅방 → 목록 갱신 + 알림
      void loadChatList(uidNow);
      const otherId = newRow.user1_id === uidNow ? newRow.user2_id : newRow.user1_id;
      const otherProfile = profilesRef.current.find(p => p.id === otherId);
      if (otherProfile) {
        setBottomNotif({ type: 'chat', nickname: otherProfile.nickname });
      }
    };

    const ch1 = supabase
      .channel(`new-chats-u1-${uid}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chats',
        filter: `user1_id=eq.${uid}`,
      }, handleNewChat)
      .subscribe();

    const ch2 = supabase
      .channel(`new-chats-u2-${uid}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chats',
        filter: `user2_id=eq.${uid}`,
      }, handleNewChat)
      .subscribe();

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, loadChatList]);
  const openChat = useCallback(async (otherProfile: Profile) => {
    if (!currentUserId) return;
    const gen = ++openChatGenRef.current;

    setMessages([]);
    setSelectedProfile(otherProfile);
    chatIdRef.current = null;
    setChatId(null);
    setView('chat');

    const user1Id = currentUserId < otherProfile.id ? currentUserId : otherProfile.id;
    const user2Id = currentUserId < otherProfile.id ? otherProfile.id : currentUserId;

    if (selfInitiatedPairTimerRef.current !== null) clearTimeout(selfInitiatedPairTimerRef.current);
    selfInitiatedPairRef.current = `${user1Id}:${user2Id}`;
    selfInitiatedPairTimerRef.current = setTimeout(() => {
      selfInitiatedPairRef.current = null;
      selfInitiatedPairTimerRef.current = null;
    }, 5000);

    try {
      const { data: existingChat } = await supabase
        .from('chats').select('*').eq('user1_id', user1Id).eq('user2_id', user2Id).maybeSingle();
      if (gen !== openChatGenRef.current) return;

      let resolvedChatId: string | null = null;
      if (existingChat) {
        resolvedChatId = existingChat.id;
      } else {
        const { data: newChat, error: createErr } = await supabase
          .from('chats').insert({ user1_id: user1Id, user2_id: user2Id }).select().single();
        if (gen !== openChatGenRef.current) return;

        if (newChat) {
          resolvedChatId = newChat.id;
          const newChatEntry: Chat = { ...newChat, lastMessage: '', messageCount: 0 };
          setChatList(prev => {
            if (prev.some(c => c.id === newChat.id)) return prev;
            return [newChatEntry, ...prev];
          });
        } else {
          console.error('[openChat] 채팅방 생성 실패:', createErr?.message);
          // DB unique constraint 충돌 등으로 insert 실패 시 재조회
          const { data: retryChat } = await supabase
            .from('chats').select('*').eq('user1_id', user1Id).eq('user2_id', user2Id).maybeSingle();
          if (gen !== openChatGenRef.current) return;
          if (retryChat) {
            resolvedChatId = retryChat.id;
            const retryChatEntry: Chat = { ...retryChat, lastMessage: '', messageCount: 0 };
            setChatList(prev => {
              if (prev.some(c => c.id === retryChat.id)) return prev;
              return [retryChatEntry, ...prev];
            });
          }
        }
      }

      if (!resolvedChatId) {
        console.error('[openChat] 채팅방 ID 결정 불가 — 메인으로 복귀');
        setView('main');
        setBottomNotif({ type: 'chat', nickname: '채팅방을 열 수 없습니다. 잠시 후 다시 시도해주세요.' });
        setTimeout(() => setBottomNotif(null), 3000);
        return;
      }

      chatIdRef.current = resolvedChatId;
      // unreadChatCountsRef.current は毎レンダーで更新されるため、ここで読めば最新値を取得できる.
      // setChatId → effect の前に setUnreadChatCounts を呼ぶと effect 内で removed=0 になるため
      // ここで count を読んでから両方まとめてクリアする (effect は no-op になるが二重減算は発生しない).
      const countToRemove = unreadChatCountsRef.current[resolvedChatId!] ?? 0;
      setChatId(resolvedChatId);
      setUnreadChatCounts(prev => { const n = { ...prev }; delete n[resolvedChatId!]; return n; });
      if (countToRemove > 0) setNewMsgCount(c => Math.max(0, c - countToRemove));
    } catch (err) {
      console.error('[openChat] 예외:', err);
      if (gen === openChatGenRef.current) {
        setView('main');
        setBottomNotif({ type: 'chat', nickname: '채팅방 연결 중 오류가 발생했습니다.' });
        setTimeout(() => setBottomNotif(null), 3000);
      }
    }
  }, [currentUserId, setSelectedProfile, setView, setBottomNotif]);

  // ── 미읽음 재동기화 ──────────────────────────────────────────────────────────
  const syncUnreadCounts = useCallback(async () => {
    if (!currentUserIdRef.current) return;
    try {
      const token = getSseToken();
      const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
      const resp = await fetch(`/api/db/unread-counts?userId=${encodeURIComponent(currentUserIdRef.current)}${tokenParam}`);
      if (!resp.ok) return;
      const { data } = await resp.json() as { data: Record<string, number> | null };
      if (!data) return;
      setUnreadChatCounts(prev => {
        const next = { ...data };
        // 현재 열려 있는 채팅방은 항상 unread 제외
        if (chatIdRef.current) delete next[chatIdRef.current];
        // 낙관적 읽음 보호: 30초 이내에 읽은 채팅방은 서버가 아직 반영 못해도 읽음 유지
        const now = Date.now();
        for (const [cid, ts] of recentlyReadRef.current) {
          if (now - ts < 30_000) {
            delete next[cid];
          } else {
            recentlyReadRef.current.delete(cid); // 만료된 항목 정리
          }
        }
        const prevKeys = Object.keys(prev);
        const nextKeys = Object.keys(next);
        if (prevKeys.length === nextKeys.length && nextKeys.every(k => prev[k] === next[k])) return prev;
        return next;
      });
      const now = Date.now();
      const total = Object.entries(data)
        .filter(([cid]) => {
          if (cid === chatIdRef.current) return false;
          const readTs = recentlyReadRef.current.get(cid);
          if (readTs && now - readTs < 30_000) return false;
          return true;
        })
        .reduce((sum, [, n]) => sum + n, 0);
      setNewMsgCount(total);
    } catch { /* 네트워크 오류 무시 — 다음 재연결 때 재시도 */ }
  }, []); // currentUserIdRef/chatIdRef는 항상 최신 ref라 deps 불필요

  syncUnreadCountsRef.current = syncUnreadCounts;

  useEffect(() => {
    if (currentUserId) void syncUnreadCounts();
  }, [currentUserId, syncUnreadCounts]);

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') {
        void syncUnreadCounts();
        // 탭 복귀 시 active 채팅방 메시지도 즉시 당겨옴 (SSE가 끊긴 사이 누락된 메시지 복구)
        const activeChatId = chatIdRef.current;
        if (activeChatId) void loadMessages(activeChatId);
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [syncUnreadCounts, loadMessages]);

  // ── 15초 주기 동기화 — SSE 드롭 시 메시지·미읽음·채팅 목록 복구 ──────────────
  // active 채팅방 메시지도 함께 리로드해 SSE 끊김 기간 동안 누락된 메시지를 채움
  // (SSE 재연결 핸들러와 이중화 → 어느 쪽이든 먼저 복구되면 즉시 반영)
  useEffect(() => {
    if (!currentUserId) return;
    const uid = currentUserId;
    const id = setInterval(() => {
      void syncUnreadCounts();
      void loadChatList(uid);
      // active 채팅방이 열려 있으면 메시지도 동기화 (폴링 일시정지 중 gap 메우기)
      const activeChatId = chatIdRef.current;
      if (activeChatId) void loadMessages(activeChatId);
    }, 15_000);
    return () => clearInterval(id);
  }, [currentUserId, syncUnreadCounts, loadChatList, loadMessages]);

  // ── 오프라인 메시지 큐 ─────────────────────────────────────────────────────────
  // 3회 재시도 모두 실패(네트워크 완전 단절) 시 메시지를 여기에 보관.
  // SSE 재연결 시 큐를 자동으로 플러시하여 메시지 유실 방지.
  const pendingQueueRef = useRef<PendingMsg[]>([]);
  const isFlushingRef = useRef(false);

  const flushPendingQueue = useCallback(async () => {
    if (isFlushingRef.current || pendingQueueRef.current.length === 0) return;
    isFlushingRef.current = true;
    const queue = [...pendingQueueRef.current];
    for (const item of queue) {
      // 유저 전환 시 이전 유저 큐 항목 폐기 — 엉뚱한 sender로 전송 차단
      if (item.userId !== currentUserIdRef.current) {
        pendingQueueRef.current = pendingQueueRef.current.filter(q => q.clientId !== item.clientId);
        setMessages(prev => prev.filter(m => m.id !== item.optimisticId));
        continue;
      }
      try {
        const { data: insertedMsg, error } = await supabase.from('messages').insert({
          chat_id: item.chatId,
          sender_id: item.userId,
          content: item.content,
          client_id: item.clientId,
        }).select().single();
        if (!error && insertedMsg) {
          // 성공: 낙관적 메시지를 실제 메시지로 교체
          setMessages(prev => prev.map(m => m.id === item.optimisticId ? insertedMsg as Message : m));
          pendingQueueRef.current = pendingQueueRef.current.filter(q => q.clientId !== item.clientId);
        } else if (error) {
          // client_id로 이미 저장됐는지 확인 (이전 시도 응답 분실)
          const { data: existing } = await supabase.from('messages').select('*').eq('client_id', item.clientId).maybeSingle();
          if (existing) {
            setMessages(prev => prev.map(m => m.id === item.optimisticId ? existing as Message : m));
            pendingQueueRef.current = pendingQueueRef.current.filter(q => q.clientId !== item.clientId);
          }
          // 실패해도 break 하지 않음 — 다음 항목 계속 시도 (한 항목 실패가 전체 큐를 막지 않음)
        }
      } catch {
        // 네트워크 오류 — 이 항목은 다음 재연결 때 재시도, 나머지는 계속 처리
        continue;
      }
    }
    isFlushingRef.current = false;
  }, []);

  useEffect(() => {
    return onSseReconnect(() => {
      void syncUnreadCounts();
      const uid = currentUserIdRef.current;
      if (uid) void loadChatList(uid);
      const activeChatId = chatIdRef.current;
      if (activeChatId) void loadMessages(activeChatId);
      // 오프라인 큐 플러시 — 재연결 직후 대기 중인 메시지 전송
      void flushPendingQueue();
    });
  }, [syncUnreadCounts, loadChatList, loadMessages, flushPendingQueue]);

  // 브라우저 네트워크 복구 이벤트 — SSE 재연결과 별개로 큐를 즉시 플러시
  // (WiFi → LTE 전환 등 SSE가 아직 안 붙었어도 HTTP는 먼저 복구되는 경우 대응)
  useEffect(() => {
    const onOnline = () => void flushPendingQueue();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [flushPendingQueue]);

  // ── 전송 잠금: boolean → Set<chatId> ─────────────────────────────────────────
  // 채팅방별 독립 잠금 — 채팅방 A 전송 중에도 채팅방 B 전송 가능
  const sendingChatIdsRef = useRef(new Set<string>());
  // 이미지 업로드도 채팅방별 독립 잠금
  const uploadingChatIdsRef = useRef(new Set<string>());

  // ── 메시지 전송 ───────────────────────────────────────────────────────────────
  // [안전장치 3] 자동 재시도: 네트워크 오류 시 낙관적 메시지를 화면에 유지한 채
  //   지수 백오프(1s → 2s → 4s)로 최대 3회 재시도. 모두 실패 시에만 롤백.
  //   client_id(UUID)를 재시도에도 동일하게 유지 → DB ON CONFLICT 로 idempotent.
  //   응답 분실(first attempt 성공+응답 누락) 시: insert error + client_id 재조회로 복구.
  const sendMessage = useCallback(async (content: string): Promise<void> => {
    const snapChatId = chatIdRef.current;
    const snapUserId = currentUserIdRef.current;
    if (!snapChatId || !snapUserId || !content.trim()) return;
    if (sendingChatIdsRef.current.has(snapChatId)) return;
    sendingChatIdsRef.current.add(snapChatId);

    const clientUUID = crypto.randomUUID(); // 재시도 전체에서 동일 UUID 사용 (idempotency)
    const optimisticId = `__opt_${clientUUID}`;
    const prevLastMessage = chatListRef.current.find(c => c.id === snapChatId)?.lastMessage ?? '';
    const trimmed = content.trim();
    const optimisticMsg: Message = {
      id: optimisticId,
      chat_id: snapChatId,
      sender_id: snapUserId,
      content: trimmed,
      created_at: new Date().toISOString(),
    } as Message;

    setMessages(prev => {
      if (chatIdRef.current !== snapChatId) return prev;
      return [...prev, optimisticMsg];
    });
    setChatList(prev => prev.map(c => c.id === snapChatId ? { ...c, lastMessage: trimmed } : c));

    const rollback = () => {
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
      setChatList(prev => prev.map(c =>
        c.id === snapChatId && c.lastMessage === trimmed ? { ...c, lastMessage: prevLastMessage } : c
      ));
    };

    const MAX_RETRIES = 3;
    let lastErr: unknown;

    try {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        // 재시도 시 지수 백오프 — 1s, 2s, 4s
        if (attempt > 0) {
          await new Promise<void>(r => setTimeout(r, Math.pow(2, attempt - 1) * 1000));
          // 대기 중 채팅방이 바뀌면 중단 (낙관적 메시지는 그대로 — 폴링이 reconcile)
          if (chatIdRef.current !== snapChatId) return;
        }

        try {
          const { data: insertedMsg, error } = await supabase.from('messages').insert({
            chat_id: snapChatId,
            sender_id: snapUserId,
            content: trimmed,
            client_id: clientUUID,
          }).select().single();

          if (!error && insertedMsg) {
            // 성공: optimistic → 실제 DB 행으로 즉시 교체
            if (chatIdRef.current === snapChatId) {
              setMessages(prev => prev.map(m => m.id === optimisticId ? insertedMsg as Message : m));
            }
            return;
          }

          // Insert 실패했지만 이전 시도의 응답이 분실된 경우를 처리:
          // 같은 client_id로 DB를 조회해 이미 저장된 행이 있으면 교체 후 성공
          if (error) {
            const { data: existing } = await supabase.from('messages').select('*').eq('client_id', clientUUID).maybeSingle();
            if (existing && chatIdRef.current === snapChatId) {
              setMessages(prev => prev.map(m => m.id === optimisticId ? existing as Message : m));
              return; // 분실 복구 성공
            }
            lastErr = error;
          }
        } catch (err) {
          lastErr = err;
          if (chatIdRef.current !== snapChatId) return; // 방 변경 시 조용히 중단
        }
      }

      // 모든 재시도 실패 → 롤백 대신 오프라인 큐에 보관 (재연결 시 자동 전송)
      // 낙관적 메시지는 화면에 유지 — 사용자가 메시지를 다시 입력할 필요 없음
      console.warn('[sendMessage] 3회 재시도 실패 — 오프라인 큐에 보관, 재연결 시 자동 전송:', lastErr);
      // 큐 크기 상한 50개 — 무한 증가 방지 (가장 오래된 항목부터 제거)
      if (pendingQueueRef.current.length >= 50) pendingQueueRef.current.shift();
      pendingQueueRef.current.push({ chatId: snapChatId, content: trimmed, clientId: clientUUID, optimisticId, userId: snapUserId });
    } finally {
      sendingChatIdsRef.current.delete(snapChatId);
    }
  }, []); // chatIdRef/currentUserIdRef/chatListRef는 항상 최신 ref — deps 불필요

  // ── 이미지 전송 ───────────────────────────────────────────────────────────────
  const sendImage = useCallback(async (file: File): Promise<string | null> => {
    const snapChatId = chatIdRef.current;
    const snapUserId = currentUserIdRef.current;
    if (!snapChatId || !snapUserId) return null;
    if (uploadingChatIdsRef.current.has(snapChatId)) return '이미 전송 중입니다.';
    uploadingChatIdsRef.current.add(snapChatId);

    const clientId = crypto.randomUUID();
    const prevLastMessage = chatListRef.current.find(c => c.id === snapChatId)?.lastMessage ?? '';
    const localBlobUrl = URL.createObjectURL(file);
    const optimisticId = `__opt_${clientId}`;
    const optimisticMsg: Message = {
      id: optimisticId, chat_id: snapChatId, sender_id: snapUserId,
      content: '', image_url: localBlobUrl, created_at: new Date().toISOString(),
      client_id: clientId,
    } as Message;

    setMessages(prev => {
      if (chatIdRef.current !== snapChatId) return prev;
      const next = [...prev, optimisticMsg];
      return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
    });
    setChatList(prev => prev.map(c => c.id === snapChatId ? { ...c, lastMessage: '📷 사진' } : c));

    const rollback = () => {
      URL.revokeObjectURL(localBlobUrl);
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
      // 낙관적으로 설정한 값인 경우에만 복원
      setChatList(prev => prev.map(c =>
        c.id === snapChatId && c.lastMessage === '📷 사진'
          ? { ...c, lastMessage: prevLastMessage }
          : c
      ));
    };

    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${snapChatId}/${clientId}.${ext}`;
      const { data, error } = await supabase.storage.from('chat-images').upload(path, file, { contentType: file.type || 'image/jpeg' });
      if (error) { rollback(); return error.message; }
      if (!data) { rollback(); return '업로드 실패'; }

      // 업로드 완료 후 채팅방/사용자가 바뀌었으면 고아 파일 정리 후 중단
      if (chatIdRef.current !== snapChatId || currentUserIdRef.current !== snapUserId) {
        supabase.storage.from('chat-images').remove([data.path]).catch(() => {});
        rollback();
        return null;
      }

      const { data: { publicUrl } } = supabase.storage.from('chat-images').getPublicUrl(data.path);
      // .select().single() — HTTP 응답으로 실제 DB 행을 직접 수신해 optimistic 즉시 교체
      const { data: insertedMsg, error: msgErr } = await supabase.from('messages').insert({
        chat_id: snapChatId, sender_id: snapUserId, content: '', image_url: publicUrl,
        client_id: clientId,
      }).select().single();
      if (msgErr) {
        supabase.storage.from('chat-images').remove([data.path]).catch(() => {});
        rollback();
        return msgErr.message;
      }
      // 성공: optimistic(blob URL) → 실제 DB 행(CDN URL)으로 즉시 교체
      URL.revokeObjectURL(localBlobUrl);
      if (insertedMsg && chatIdRef.current === snapChatId) {
        setMessages(prev => prev.map(m => m.id === optimisticId ? insertedMsg as Message : m));
      }
      return null;
    } catch (err) {
      console.error('[sendImage] 네트워크 예외:', err);
      rollback();
      return '네트워크 오류가 발생했습니다.';
    } finally {
      uploadingChatIdsRef.current.delete(snapChatId);
    }
  }, []); // chatIdRef/currentUserIdRef/chatListRef는 항상 최신 ref — deps 불필요

  // ── 채팅 삭제 ────────────────────────────────────────────────────────────────
  const deleteChat = async (chatToDelete: Chat) => {
    if (!confirm('이 채팅방을 삭제하시겠습니까?')) return;
    try {
      const { error: msgErr } = await supabase.from('messages').delete().eq('chat_id', chatToDelete.id);
      if (msgErr) { alert('메시지 삭제 실패: ' + msgErr.message); return; }
      const { error: chatErr } = await supabase.from('chats').delete().eq('id', chatToDelete.id);
      if (chatErr) { alert('채팅방 삭제 실패: ' + chatErr.message); return; }
      setChatList(prev => prev.filter(c => c.id !== chatToDelete.id));
    } catch (ex) {
      console.error('[useChat] deleteChat 네트워크 오류:', ex);
      alert('네트워크 오류로 삭제에 실패했습니다. 다시 시도해 주세요.');
    }
  };

  const deleteAllChats = async () => {
    if (chatList.length === 0) return;
    if (!confirm(`채팅 ${chatList.length}개를 모두 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    const snapshot = [...chatList];
    try {
      const results = await Promise.all(snapshot.map(async (chat) => {
        try {
          const { error: msgErr } = await supabase.from('messages').delete().eq('chat_id', chat.id);
          if (msgErr) return null;
          const { error: chatErr } = await supabase.from('chats').delete().eq('id', chat.id);
          return chatErr ? null : chat.id;
        } catch { return null; }
      }));
      const deletedIds = results.filter((id): id is string => id !== null);
      if (deletedIds.length > 0) setChatList(prev => prev.filter(c => !deletedIds.includes(c.id)));
    } catch (ex) {
      console.error('[useChat] deleteAllChats 네트워크 오류:', ex);
      alert('네트워크 오류로 일부 채팅 삭제에 실패했습니다.');
    }
  };

  const deleteMessage = async (msgId: string) => {
    try {
      const { error } = await supabase.from('messages').delete().eq('id', msgId);
      if (!error) setMessages(prev => prev.filter(m => m.id !== msgId));
      else console.warn('[useChat] deleteMessage 오류:', error.message);
    } catch (ex) {
      console.error('[useChat] deleteMessage 네트워크 오류:', ex);
    }
  };

  return {
    chatId, setChatId,
    chatIdRef,
    selfInitiatedPairRef,
    messages, setMessages,
    chatList, setChatList,
    chatListRef,
    unreadChatCounts, setUnreadChatCounts,
    newMsgCount, setNewMsgCount,
    loadChatList,
    loadMessages,
    openChat,
    sendMessage,
    sendImage,
    deleteChat,
    deleteAllChats,
    deleteMessage,
  };
}
