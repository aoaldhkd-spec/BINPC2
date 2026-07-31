import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { onSseReconnect } from '../lib/localdb';
import type { Profile, Message, Chat, View } from '../types/app';
import { HeartType } from '../lib/constants';
import { playCuteSound } from '../lib/sounds';

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

  // 내가 직접 연 채팅방 pair 기록 — SSE INSERT 알림 억제용
  const selfInitiatedPairRef = useRef<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [chatList, setChatList] = useState<Chat[]>([]);
  const chatListRef = useRef<Chat[]>([]);
  chatListRef.current = chatList;

  const perChatChannelsRef = useRef<Map<string, ReturnType<typeof supabase.channel>>>(new Map());
  const [unreadChatCounts, setUnreadChatCounts] = useState<Record<string, number>>({});
  const [newMsgCount, setNewMsgCount] = useState(0);

  // ── 채팅방별 메시지 구독 (서버 사이드 필터) ──────────────────────────────────
  useEffect(() => {
    if (!currentUserId || chatList.length === 0) return;
    const channels = perChatChannelsRef.current;
    const currentIds = new Set(chatList.map(c => c.id));

    for (const [cid, ch] of channels) {
      if (!currentIds.has(cid)) {
        supabase.removeChannel(ch);
        channels.delete(cid);
      }
    }

    for (const chat of chatList) {
      if (channels.has(chat.id)) continue;
      const ch = supabase
        .channel(`msgs:${chat.id}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'messages',
          filter: `chat_id=eq.${chat.id}`,
        }, (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          try {
            const m = payload.new as { chat_id: string; sender_id: string; content: string };
            if (m.sender_id === currentUserId) return;
            setChatList(prev => prev.map(c => c.id === m.chat_id ? { ...c, lastMessage: m.content } : c));
            if (chatIdRef.current !== m.chat_id) {
              setUnreadChatCounts(prev => ({ ...prev, [m.chat_id]: (prev[m.chat_id] ?? 0) + 1 }));
              const senderProfile = profilesRef.current.find(p => p.id === m.sender_id);
              setNewMsgCount(n => n + 1);
              setBottomNotif({ type: 'message', nickname: senderProfile?.nickname ?? '' });
              playCuteSound();
            }
          } catch (e) { console.warn('[msgs-ch]', e); }
        })
        .subscribe();
      channels.set(chat.id, ch);
    }

    // ✅ 항상 전체 채널 정리 — currentUserId 값에 관계없이
    // (로그아웃·사용자 변경·언마운트 시 stale 채널이 남아 알림 이중 발화 방지)
    return () => {
      for (const ch of channels.values()) supabase.removeChannel(ch);
      channels.clear();
    };
  }, [chatList, currentUserId]);

  // ── 활성 채팅방 메시지 구독 ─────────────────────────────────────────────────
  // 스탤 로드 방지: 채팅방 전환 시 이전 채팅방 응답이 늦게 돌아와 덮어쓰는 race 차단
  const loadGenRef = useRef(0);
  const loadMessages = useCallback(async (cid: string) => {
    const gen = ++loadGenRef.current;
    const { data } = await supabase.from('messages').select('*').eq('chat_id', cid).order('created_at', { ascending: true });
    if (gen !== loadGenRef.current) return; // 이미 다른 채팅방으로 전환됨 — 결과 버림
    if (data) setMessages(prev => {
      const dbIds = new Set(data.map((m: Message) => m.id));
      // client_id로도 중복 제거: 재시도 성공 시 서버 row가 DB에 있으면 낙관적 메시지 제거
      const dbClientIds = new Set<string>(
        (data as Message[]).flatMap(m => (m.client_id != null ? [m.client_id] : []))
      );
      const optimistic = prev.filter(m =>
        m.id.startsWith('__opt_') &&
        !dbIds.has(m.id) &&
        !dbClientIds.has(m.id.replace('__opt_', ''))
      );
      return [...data, ...optimistic];
    });
  }, []);

  useEffect(() => {
    setMessages([]);
    if (!chatId) return;
    chatIdRef.current = chatId;
    // 채팅방 열 때: unread 카운트 삭제 + 전체 배지(newMsgCount)도 함께 감소
    // setState 중첩 호출 금지: removed를 먼저 읽은 뒤 두 setter 분리 호출
    const removed = unreadChatCounts[chatId] ?? 0;
    setUnreadChatCounts(prev => { const n = { ...prev }; delete n[chatId]; return n; });
    if (removed > 0) setNewMsgCount(c => Math.max(0, c - removed));
    if (currentUserId) {
      supabase.from('chat_reads').upsert({
        id: `${chatId}__${currentUserId}`,
        chat_id: chatId,
        reader_id: currentUserId,
        read_at: new Date().toISOString(),
      }, { onConflict: 'id' }).then(() => {}).catch(() => {});
    }
    const channel = supabase
      .channel(`chat:${chatId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          const newMsg = payload.new as Message;
          setMessages(prev => {
            if (prev.some((m: Message) => m.id === newMsg.id)) return prev;
            // 낙관적 업데이트 교체: client_id로 정확히 매칭 (네트워크 재시도 후에도 유령 메시지 방지)
            // client_id가 없는 경우(레거시): 5초 이내 동일 발신자+내용으로 폴백
            const optIdx = newMsg.client_id
              ? prev.findIndex(m => m.id === `__opt_${newMsg.client_id}`)
              : (() => {
                  const msgTime = new Date(newMsg.created_at).getTime();
                  return prev.findIndex(m =>
                    m.id.startsWith('__opt_') &&
                    m.sender_id === newMsg.sender_id &&
                    m.content === newMsg.content &&
                    Math.abs(new Date(m.created_at).getTime() - msgTime) < 5000
                  );
                })();
            if (optIdx !== -1) {
              const next = [...prev];
              next[optIdx] = newMsg;
              return next;
            }
            return [...prev, newMsg];
          });
        })
      .subscribe();
    loadMessages(chatId);
    return () => {
      supabase.removeChannel(channel);
      // 채팅방을 나갈 때(chatId가 바뀌거나 null로 돌아올 때) read_at 갱신
      // → 채팅방에 열려 있는 동안 도착한 메시지도 읽음 처리됨
      if (currentUserId) {
        supabase.from('chat_reads').upsert({
          id: `${chatId}__${currentUserId}`,
          chat_id: chatId,
          reader_id: currentUserId,
          read_at: new Date().toISOString(),
        }, { onConflict: 'id' }).then(() => {}).catch(() => {});
      }
    };
  }, [chatId, loadMessages, currentUserId]);

  // loadChatList: generation guard — 느린 응답이 현재 userId의 목록을 덮어쓰지 않도록
  // syncUnreadCounts는 아래에서 정의되지만 ref를 통해 참조 — 순환 의존 없이 loadChatList 완료 후 호출
  const syncUnreadCountsRef = useRef<(() => Promise<void>) | null>(null);
  const loadChatListGenRef = useRef(0);
  const loadChatList = useCallback(async (userId: string) => {
    const gen = ++loadChatListGenRef.current;
    const { data } = await supabase.from('chats').select('*')
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .order('created_at', { ascending: false });
    if (gen !== loadChatListGenRef.current) return; // 스탤 응답 버림
    if (!data) return;
    if (data.length === 0) { setChatList([]); void syncUnreadCountsRef.current?.(); return; }
    const chatIds = data.map((c: { id: string }) => c.id);
    const { data: allMsgs } = await supabase.from('messages').select('chat_id, content, created_at')
      .in('chat_id', chatIds).order('created_at', { ascending: false }).limit(Math.max(chatIds.length * 20, 100));
    if (gen !== loadChatListGenRef.current) return; // 두 번째 fetch도 체크
    const latestByChat = new Map<string, { content: string; created_at: string }>();
    if (allMsgs) {
      for (const m of allMsgs as { chat_id: string; content: string; created_at: string }[]) {
        if (!latestByChat.has(m.chat_id)) latestByChat.set(m.chat_id, { content: m.content, created_at: m.created_at });
      }
    }
    const enriched: Chat[] = data.map((c: { id: string; user1_id: string; user2_id: string; created_at: string }) => ({
      ...c,
      lastMessage: latestByChat.get(c.id)?.content || '',
      messageCount: 0,
    }));
    setChatList(enriched);
    // 채팅 목록 로드 완료 후 DB 기반 미읽음 카운트를 즉시 동기화
    // (앱을 완전히 닫았다가 재진입 시 SSE 재연결이 아닌 첫 연결이므로 별도 호출 필요)
    void syncUnreadCountsRef.current?.();
  }, []);

  // openChat: generation guard — 빠른 연속 탭 시 느린 응답이 현재 채팅방을 덮어쓰지 않도록
  const openChatGenRef = useRef(0);
  // Fix #10: 타이머 ref — 연속 openChat 시 stale 타이머가 pair ref를 null로 지우는 race 방지
  const selfInitiatedPairTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openChat = useCallback(async (otherProfile: Profile) => {
    if (!currentUserId) return;
    const gen = ++openChatGenRef.current; // generation 캡처 — 이 호출보다 나중 호출이 오면 버림

    setMessages([]);
    setSelectedProfile(otherProfile);
    chatIdRef.current = null;
    setChatId(null);
    setView('chat');

    const user1Id = currentUserId < otherProfile.id ? currentUserId : otherProfile.id;
    const user2Id = currentUserId < otherProfile.id ? otherProfile.id : currentUserId;

    // SSE INSERT 알림 억제: 내가 연 채팅방 pair를 미리 기록 (DB 응답 전에 SSE가 먼저 올 수 있음)
    if (selfInitiatedPairTimerRef.current !== null) clearTimeout(selfInitiatedPairTimerRef.current);
    selfInitiatedPairRef.current = `${user1Id}:${user2Id}`;
    selfInitiatedPairTimerRef.current = setTimeout(() => {
      selfInitiatedPairRef.current = null;
      selfInitiatedPairTimerRef.current = null;
    }, 5000);

    const { data: existingChat } = await supabase
      .from('chats').select('*').eq('user1_id', user1Id).eq('user2_id', user2Id).maybeSingle();

    if (gen !== openChatGenRef.current) return; // 더 최신 openChat이 호출됨 — 버림

    let resolvedChatId: string | null = null;
    if (existingChat) {
      resolvedChatId = existingChat.id;
    } else {
      const { data: newChat, error: createErr } = await supabase
        .from('chats').insert({ user1_id: user1Id, user2_id: user2Id }).select().single();
      if (gen !== openChatGenRef.current) return; // insert 완료 후에도 체크

      if (newChat) {
        resolvedChatId = newChat.id;
        // ✅ 신규 채팅방을 chatList에 즉시 추가
        // → per-chat SSE 구독이 생성되어 상대가 보낸 메시지의 미읽음 알림이 즉시 동작함
        const newChatEntry: Chat = { ...newChat, lastMessage: '', messageCount: 0 };
        setChatList(prev => {
          if (prev.some(c => c.id === newChat.id)) return prev; // 이미 있으면 무시
          return [newChatEntry, ...prev];
        });
      } else {
        console.error('[openChat] 채팅방 생성 실패:', createErr?.message);
        const { data: retryChat } = await supabase
          .from('chats').select('*').eq('user1_id', user1Id).eq('user2_id', user2Id).maybeSingle();
        if (gen !== openChatGenRef.current) return;
        if (retryChat) {
          resolvedChatId = retryChat.id;
          // 재시도로 찾은 기존 방도 chatList에 없으면 추가
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
      return;
    }

    chatIdRef.current = resolvedChatId;
    setChatId(resolvedChatId);
    setUnreadChatCounts(prev => { const n = { ...prev }; delete n[resolvedChatId!]; return n; });
  }, [currentUserId, setSelectedProfile, setView, setBottomNotif]);

  // ── DB 기반 미읽음 카운트 재동기화 ────────────────────────────────────────────
  // visibilitychange, SSE 재연결, 또는 loadChatList 완료 시 호출 — 누락된 메시지 보정
  const syncUnreadCounts = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const resp = await fetch(`/api/db/unread-counts?userId=${encodeURIComponent(currentUserId)}`);
      if (!resp.ok) return;
      const { data } = await resp.json() as { data: Record<string, number> | null };
      if (!data) return;
      setUnreadChatCounts(prev => {
        const next = { ...data };
        // 현재 열려 있는 채팅방은 이미 읽고 있으므로 0 유지
        if (chatIdRef.current) delete next[chatIdRef.current];
        // prev와 실질적으로 같으면 리렌더 스킵
        const prevKeys = Object.keys(prev);
        const nextKeys = Object.keys(next);
        if (prevKeys.length === nextKeys.length && nextKeys.every(k => prev[k] === next[k])) return prev;
        return next;
      });
      // 알림 배지도 DB 합계로 보정 (현재 열린 채팅방 제외)
      const total = Object.entries(data)
        .filter(([cid]) => cid !== chatIdRef.current)
        .reduce((sum, [, n]) => sum + n, 0);
      setNewMsgCount(total);
    } catch { /* 네트워크 오류 시 무시 — 다음 재연결 때 재시도 */ }
  }, [currentUserId]);

  // syncUnreadCountsRef 업데이트 — loadChatList가 정의 순서와 무관하게 최신 함수를 참조할 수 있도록
  syncUnreadCountsRef.current = syncUnreadCounts;

  // 첫 마운트: currentUserId가 확보된 직후 DB에서 정확한 미읽음 카운트를 즉시 동기화
  // (앱 재시작/새로고침 후 배지가 0으로 뜨는 현상 방지)
  useEffect(() => {
    if (currentUserId) void syncUnreadCounts();
  }, [currentUserId, syncUnreadCounts]);

  // visibilitychange: 포그라운드 복귀 시 즉시 재동기화
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') void syncUnreadCounts();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [syncUnreadCounts]);

  // SSE 재연결: 끊김 복구 직후 누락 카운트 보정
  useEffect(() => {
    return onSseReconnect(() => void syncUnreadCounts());
  }, [syncUnreadCounts]);

  // 전송 중 잠금 — 동기 ref로 이중 클릭/Enter+클릭 동시 전송 방지
  const sendInFlightRef = useRef(false);

  const sendMessage = async (content: string): Promise<void> => {
    // ✅ chatId/currentUserId를 호출 시점에 스냅샷
    // await 완료 후 채팅방이 전환되어도 원래 방의 state만 변경함
    const snapChatId = chatId;
    const snapUserId = currentUserId;
    if (!snapChatId || !snapUserId || !content.trim()) return;
    if (sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    const optimisticId = `__opt_${crypto.randomUUID()}`; // ms 충돌 없는 UUID 사용
    // 에러 시 되돌릴 이전 lastMessage를 미리 기록
    const prevLastMessage = chatListRef.current.find(c => c.id === snapChatId)?.lastMessage ?? '';
    const optimisticMsg = {
      id: optimisticId,
      chat_id: snapChatId,
      sender_id: snapUserId,
      content: content.trim(),
      created_at: new Date().toISOString(),
    } as Message;
    // ✅ 현재 보고 있는 방이 snapChatId인 경우에만 optimistic 메시지 추가
    setMessages(prev => {
      if (chatIdRef.current !== snapChatId) return prev; // 이미 다른 방으로 전환됨
      return [...prev, optimisticMsg];
    });
    setChatList(prev => prev.map(c => c.id === snapChatId ? { ...c, lastMessage: content.trim() } : c));
    try {
      const { error } = await supabase.from('messages').insert({
        chat_id: snapChatId, sender_id: snapUserId, content: content.trim(),
        client_id: optimisticId.replace('__opt_', ''), // UUID — ON CONFLICT DO NOTHING on server
      });
      // 서버가 SSE 인서트 이벤트 시점에 수신자에게 푸시 알림을 자동 발송함
      if (error) {
        setMessages(prev => prev.filter(m => m.id !== optimisticId));
        // 에러 전 상태로 정확히 복원 (낙관적 업데이트 전 lastMessage)
        setChatList(prev => prev.map(c => c.id === snapChatId ? { ...c, lastMessage: prevLastMessage } : c));
        console.error('[sendMessage]', error.message);
        throw error; // ChatScreen에서 입력값 복원용
      }
    } finally {
      sendInFlightRef.current = false; // 성공/실패/예외 모든 경우 잠금 해제
    }
  };

  // sendImage에도 in-flight 잠금 적용 — 연속 탭 시 동일 파일이 두 번 업로드되는 현상 방지
  const sendImageInFlightRef = useRef(false);
  const sendImage = async (file: File): Promise<string | null> => {
    // 진입 시점에 chatId/userId 스냅샷 — 업로드 중 채팅방/사용자 전환 시 고아 파일 방지
    const snapChatId = chatId;
    const snapUserId = currentUserId;
    if (!snapChatId || !snapUserId) return null;
    if (sendImageInFlightRef.current) return '이미 전송 중입니다.';
    sendImageInFlightRef.current = true;
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const clientId = crypto.randomUUID();
      const path = `${snapChatId}/${clientId}.${ext}`;
      const { data, error } = await supabase.storage.from('chat-images').upload(path, file, { contentType: file.type || 'image/jpeg' });
      if (error) return error.message;
      if (!data) return '업로드 실패';
      // 업로드 완료 후 채팅방/사용자가 바뀌었으면 고아 파일 정리 후 중단
      if (chatIdRef.current !== snapChatId || currentUserId !== snapUserId) {
        supabase.storage.from('chat-images').remove([data.path]).catch(() => {});
        return null;
      }
      const { data: { publicUrl } } = supabase.storage.from('chat-images').getPublicUrl(data.path);
      const { error: msgErr } = await supabase.from('messages').insert({
        chat_id: snapChatId, sender_id: snapUserId, content: '', image_url: publicUrl,
        client_id: clientId,
      });
      if (msgErr) {
        supabase.storage.from('chat-images').remove([data.path]).catch(() => {});
        return msgErr.message;
      }
      return null;
    } finally {
      sendImageInFlightRef.current = false;
    }
  };

  // ✅ 서버 삭제 성공 후에만 UI 업데이트 + 실패 시 오류 표시
  const deleteChat = async (chatToDelete: Chat) => {
    if (!confirm('이 채팅방을 삭제하시겠습니까?')) return;
    const { error: msgErr } = await supabase.from('messages').delete().eq('chat_id', chatToDelete.id);
    if (msgErr) { alert('메시지 삭제 실패: ' + msgErr.message); return; }
    const { error: chatErr } = await supabase.from('chats').delete().eq('id', chatToDelete.id);
    if (chatErr) { alert('채팅방 삭제 실패: ' + chatErr.message); return; }
    setChatList(prev => prev.filter(c => c.id !== chatToDelete.id));
  };

  // 전체 채팅 삭제 — Promise.all 병렬화 (직렬 O(n) → 병렬, 스냅샷으로 동시 목록 변경 방지)
  const deleteAllChats = async () => {
    if (chatList.length === 0) return;
    if (!confirm(`채팅 ${chatList.length}개를 모두 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    const snapshot = [...chatList]; // 병렬 실행 중 chatList 변경 방지
    const results = await Promise.all(snapshot.map(async (chat) => {
      const { error: msgErr } = await supabase.from('messages').delete().eq('chat_id', chat.id);
      if (msgErr) return null;
      const { error: chatErr } = await supabase.from('chats').delete().eq('id', chat.id);
      return chatErr ? null : chat.id;
    }));
    const deletedIds = results.filter((id): id is string => id !== null);
    if (deletedIds.length > 0) setChatList(prev => prev.filter(c => !deletedIds.includes(c.id)));
  };

  // ✅ 서버 삭제 성공 후에만 UI에서 제거
  const deleteMessage = async (msgId: string) => {
    const { error } = await supabase.from('messages').delete().eq('id', msgId);
    if (!error) setMessages(prev => prev.filter(m => m.id !== msgId));
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
