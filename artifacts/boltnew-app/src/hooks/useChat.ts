/**
 * useChat — 1:1 채팅 상태 관리 훅
 *
 * 구조적 안전 장치:
 * 1. sendMessage/sendImage: chatIdRef·currentUserIdRef(항상 최신 ref)를 스냅샷해 stale closure 완전 차단
 * 2. 전송 잠금: boolean → Set<chatId> 로 교체 — 채팅방별 독립 잠금 (A 전송 중에도 B 전송 가능)
 * 3. 자동 재시도: 네트워크 오류 시 지수 백오프(1s→2s→4s)로 최대 4회 재시도, 낙관적 메시지 유지
 * 4. 미읽음 뱃지: unreadChatCountsRef(ref)로 항상 최신값 보장
 * 5. 채널 누수: per-chat 채널은 chatIdsKey·currentUserId 변화 시 cleanup이 항상 실행됨
 * 6. 폴링 중첩 방지: 이전 폴링이 완료되기 전 다음 폴링 실행 차단
 * 7. 메시지 배열 상한: MAX_MESSAGES 초과 시 가장 오래된 것부터 제거 (메모리 누수 방지)
 * 8. SSE 페이로드 검증: 필수 필드 없는 이벤트 즉시 차단
 * 9. 내구성 큐: 오프라인 큐를 localStorage에 영속화 — 새로고침 후에도 미전송 메시지 복구 [Part1-Fix3]
 */

const MAX_MESSAGES = 500; // 채팅방당 최대 메시지 보유 수 (메모리 누수 방지)
const MAX_CACHED_CHAT_ROOMS = 8; // 최근 방만 메모리에 유지해 계정 장시간 사용 시 증가 방지

// 오프라인 큐 항목 타입 — 모듈 레벨 선언으로 HMR 호환성 유지
// userId: 큐에 쌓일 당시 로그인 유저 — flush 시 다른 유저로 전환됐으면 해당 항목 폐기
interface PendingMsg { chatId: string; content: string; clientId: string; optimisticId: string; userId: string }

// [Part1-Fix3] 내구성 큐 — localStorage 영속화 헬퍼
const PENDING_QUEUE_KEY = 'chat_pending_queue_v1';
function _savePendingQueue(queue: PendingMsg[]): void {
  try { localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(queue)); } catch { /* 스토리지 쓰기 실패 무시 */ }
}
function _loadPendingQueue(): PendingMsg[] {
  try {
    const raw = localStorage.getItem(PENDING_QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 최대 50개 + 필수 필드 유효성 확인 후 복원
    return (parsed as PendingMsg[]).filter(
      (m) => m && typeof m.chatId === 'string' && typeof m.content === 'string' &&
             typeof m.clientId === 'string' && typeof m.optimisticId === 'string' && typeof m.userId === 'string'
    ).slice(-50);
  } catch { return []; }
}

import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { onSseReconnect, getSseToken, isSseHealthy } from '../lib/localdb';
import type { Profile, Message, Chat, View } from '../types/app';
import { HeartType } from '../lib/constants';
import { applySseInsert, applySseToRoomCaches, applyLoadMessages, messageBelongsToChat } from '../lib/chat-reducers';
import { chatPairKey, dedupeChatList, pickCanonicalChat } from '../lib/chat-pair';
import { buildChatIdAliasMap, incrementUnreadForIncoming, isIncomingChatToastTarget, remapUnreadToCanonical, clearUnreadForChat } from '../lib/chat-unread';
import { diag } from '../lib/diag';

interface UseChatDeps {
  currentUserId: string | null;
  profilesRef: React.MutableRefObject<Profile[]>;
  setSelectedProfile: (p: Profile | null) => void;
  setView: (v: View) => void;
  setBottomNotif: (n: { type: 'heart' | 'chat' | 'message' | 'contact'; nickname: string; heartType?: HeartType; message?: string } | null) => void;
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
  // 서버가 canonical 로 재매핑한 옛 sibling chat_id 도 열린 방으로 인정
  const roomChatIdsRef = useRef<Set<string>>(new Set());
  const activePairKeyRef = useRef<string | null>(null);
  const activePartnerIdRef = useRef<string | null>(null);
  const partnerOpenToastAtRef = useRef<Map<string, number>>(new Map());

  const rememberPartnerToast = (pairKey: string) => {
    const map = partnerOpenToastAtRef.current;
    const now = Date.now();
    for (const [k, t] of map) if (now - t > 10 * 60_000) map.delete(k);
    map.set(pairKey, now);
    while (map.size > 200) {
      const oldest = map.keys().next().value;
      if (oldest === undefined) break;
      map.delete(oldest);
    }
  };
  const rememberRoomChatId = (id: string | null | undefined) => {
    if (id) roomChatIdsRef.current.add(id);
  };
  const isActiveRoomChat = (id: string | null | undefined) => {
    if (!id) return false;
    return chatIdRef.current === id || roomChatIdsRef.current.has(id);
  };

  const [messages, setMessages] = useState<Message[]>([]);
  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;
  const messageCacheRef = useRef<Map<string, Message[]>>(new Map());
  const cacheRoomMessages = useCallback((id: string, rows: Message[]) => {
    const cache = messageCacheRef.current;
    cache.delete(id);
    cache.set(id, rows.slice(-MAX_MESSAGES));
    while (cache.size > MAX_CACHED_CHAT_ROOMS) {
      const oldestId = cache.keys().next().value as string | undefined;
      if (!oldestId) break;
      cache.delete(oldestId);
    }
  }, []);
  const [chatList, setChatList] = useState<Chat[]>([]);
  const chatListRef = useRef<Chat[]>([]);
  chatListRef.current = chatList;
  const siblingToCanonicalRef = useRef<Map<string, string>>(new Map());
  const deletedMessageIdsRef = useRef<Set<string>>(new Set());
  const cacheRealtimeMessage = useCallback((message: Message, activeRoomId?: string | null) => {
    const roomIds = new Set<string>([message.chat_id]);
    const canonicalId = siblingToCanonicalRef.current.get(message.chat_id);
    if (canonicalId) roomIds.add(canonicalId);
    if (activeRoomId) roomIds.add(activeRoomId);
    const nextCache = applySseToRoomCaches(messageCacheRef.current, message, roomIds);
    for (const roomId of roomIds) {
      const rows = nextCache.get(roomId);
      if (rows) cacheRoomMessages(roomId, rows);
    }
  }, [cacheRoomMessages]);
  const removeCachedMessage = useCallback((messageId: string) => {
    for (const [roomId, cached] of messageCacheRef.current) {
      const next = cached.filter(message => message.id !== messageId);
      if (next.length !== cached.length) cacheRoomMessages(roomId, next);
    }
  }, [cacheRoomMessages]);

  const [unreadChatCounts, setUnreadChatCounts] = useState<Record<string, number>>({});
  // ref 사본: async 컨텍스트에서 stale closure 없이 최신값 읽기
  const unreadChatCountsRef = useRef<Record<string, number>>({});
  unreadChatCountsRef.current = unreadChatCounts;

  // ── 낙관적 읽음 보호: 최근 30초 내에 읽은 채팅방 추적 ────────────────────────
  // syncUnreadCounts가 서버 응답으로 전체 상태를 덮어쓸 때,
  // upsert 응답이 아직 서버에 도달하지 않은 채팅방을 다시 unread로 표시하는 것을 방지.
  const recentlyReadRef = useRef<Map<string, number>>(new Map());
  // generation counter: 동시 sync 요청 중 구식 응답이 최신 상태를 덮어쓰는 것을 방지
  const syncGenRef = useRef(0);
  // [Fix-E] 비활성 채팅 미읽음 중복 카운트 방지 — SSE/폴링 중복 이벤트로 인한 overcount 차단
  const seenUnreadMsgIdsRef = useRef(new Set<string>());

  useEffect(() => {
    messageCacheRef.current.clear();
    deletedMessageIdsRef.current.clear();
    seenUnreadMsgIdsRef.current.clear();
  }, [currentUserId]);

  // ── 단일 통합 SSE 채널: messages + chats 처리 ────────────────────────────────
  // 이전: chat별 perChatChannels(N채널) + chat:${chatId}(활성채팅) + new-chats(2채널) = 최대 N+3개 채널
  // 이후: user-events-${uid} 1개 채널이 모든 messages/chats INSERT/DELETE 처리
  // SSE 서버가 userId 기반으로 라우팅하므로 클라이언트는 자신에게 속한 이벤트만 수신
  useEffect(() => {
    if (!currentUserId) return;
    const uid = currentUserId;
    const ch = supabase
      .channel(`user-events-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          try {
            const raw = payload.new;
            if (!raw || typeof raw.id !== 'string' || !raw.id || typeof raw.sender_id !== 'string') return;
            const newMsg = raw as unknown as Message;
            // chat_id 없는 이벤트·타방 메시지는 활성 1:1 목록에 절대 넣지 않음
            if (typeof newMsg.chat_id !== 'string' || !newMsg.chat_id) return;
            deletedMessageIdsRef.current.delete(newMsg.id);
            const fromActivePartner = !!(
              chatIdRef.current &&
              activePartnerIdRef.current &&
              newMsg.sender_id === activePartnerIdRef.current
            );
            const isForActiveRoom = isActiveRoomChat(newMsg.chat_id) || fromActivePartner;
            // 토스트와 본문은 같은 change 이벤트에서 파생한다. 비활성/열리는 중인
            // 방도 캐시에 먼저 반영해 알림 후 입장했을 때 즉시 본문이 보이게 한다.
            cacheRealtimeMessage(newMsg, isForActiveRoom ? chatIdRef.current : null);
            if (isForActiveRoom) {
              rememberRoomChatId(newMsg.chat_id);
              // 활성 채팅방: 메시지 목록에 추가 (client_id 기반 dedup)
              setMessages(prev => {
                const activeCid = chatIdRef.current;
                const aliases = roomChatIdsRef.current;
                const next = applySseInsert(prev, newMsg, activeCid, aliases);
                const safe = activeCid
                  ? next.filter(m => messageBelongsToChat(m, activeCid, aliases))
                  : next;
                const visible = safe.length > MAX_MESSAGES ? safe.slice(-MAX_MESSAGES) : safe;
                diag('debug', 'chat', 'state-merge', {
                  corr: newMsg.id,
                  data: {
                    messageId: newMsg.id,
                    roomId: activeCid ?? newMsg.chat_id,
                    createdAt: newMsg.created_at,
                    source: 'sse',
                    count: visible.length,
                  },
                });
                return visible;
              });
              // [Fix-H] 활성 채팅방에 상대방 메시지 도착 시 즉시 서버 읽음 표시
              // 채팅방을 열 때뿐 아니라 새 메시지가 오는 순간에도 read_at 갱신 → 다른 기기 뱃지 즉시 해소
              if (newMsg.sender_id !== uid && currentUserIdRef.current) {
                const readerId = currentUserIdRef.current;
                const activeChatId = chatIdRef.current;
                if (activeChatId) {
                  supabase.from('chat_reads').upsert({
                    id: `${activeChatId}__${readerId}`,
                    chat_id: activeChatId,
                    reader_id: readerId,
                    read_at: new Date().toISOString(),
                  }, { onConflict: 'id' }).then(() => {}).catch(() => {});
                }
              }
            } else if (newMsg.sender_id !== uid) {
              // [Fix-E] 중복 이벤트 방지 — 이미 카운트한 메시지 ID는 skip
              if (seenUnreadMsgIdsRef.current.has(newMsg.id)) return;
              seenUnreadMsgIdsRef.current.add(newMsg.id);
              // 무한 증가 방지: 최근 500개만 보유
              if (seenUnreadMsgIdsRef.current.size > 500) {
                const arr = [...seenUnreadMsgIdsRef.current];
                seenUnreadMsgIdsRef.current = new Set(arr.slice(-300));
              }
              // 비활성 채팅방의 상대 메시지: preview 갱신 + 최상단으로 이동 + 미읽음 증가
              const preview = newMsg.image_url ? '📷 사진' : newMsg.content;
              if (typeof newMsg.chat_id === 'string') {
                const listId = siblingToCanonicalRef.current.get(newMsg.chat_id) ?? newMsg.chat_id;
                // [Fix-I] 최신 메시지 도착 시 해당 채팅을 목록 최상단으로 이동
                setChatList(prev => {
                  const idx = prev.findIndex(c => c.id === newMsg.chat_id || c.id === listId);
                  if (idx === -1) {
                    void loadChatList(uid);
                    return prev;
                  }
                  const updated = { ...prev[idx], lastMessage: preview };
                  const next = [...prev];
                  next.splice(idx, 1);
                  return [updated, ...next];
                });
                setUnreadChatCounts(prev => incrementUnreadForIncoming(prev, newMsg.chat_id!, siblingToCanonicalRef.current));
              }
              const senderProfile = profilesRef.current.find(p => p.id === newMsg.sender_id);
              if (isIncomingChatToastTarget(uid, newMsg.sender_id, false)) {
                setBottomNotif({ type: 'message', nickname: senderProfile?.nickname ?? '' });
              }
            }
          } catch (e) { console.warn('[user-events/msg-insert]', e); }
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          try {
            const deleted = payload.old as { id?: string; chat_id?: string };
            if (!deleted.id || typeof deleted.id !== 'string') return;
            deletedMessageIdsRef.current.add(deleted.id);
            if (deletedMessageIdsRef.current.size > 500) {
              const oldest = deletedMessageIdsRef.current.values().next().value as string | undefined;
              if (oldest) deletedMessageIdsRef.current.delete(oldest);
            }
            removeCachedMessage(deleted.id);
            if (isActiveRoomChat(deleted.chat_id)) {
              setMessages(prev => prev.filter(m => m.id !== deleted.id));
            }
          } catch (e) { console.warn('[user-events/msg-delete]', e); }
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats' },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          try {
            if (!payload?.new || typeof payload.new !== 'object') return;
            const c = payload.new as { user1_id?: string; user2_id?: string; id?: string; created_at?: string };
            if (!c.id || (c.user1_id !== uid && c.user2_id !== uid)) return;
            const newChat: Chat = {
              id: c.id, user1_id: c.user1_id ?? '', user2_id: c.user2_id ?? '',
              created_at: c.created_at ?? new Date().toISOString(), lastMessage: '', messageCount: 0,
            };
            setChatList(prev => {
              const pairKey = chatPairKey(c.user1_id ?? '', c.user2_id ?? '');
              if (prev.some(x => x.id === c.id)) return prev;
              if (prev.some(x => chatPairKey(x.user1_id, x.user2_id) === pairKey)) return prev;
              const next = [newChat, ...prev];
              chatListRef.current = next;
              return next;
            });
            const pairKey = chatPairKey(c.user1_id ?? '', c.user2_id ?? '');
            if (selfInitiatedPairRef.current !== pairKey) {
              const otherId = c.user1_id === uid ? c.user2_id : c.user1_id;
              const otherProfile = profilesRef.current.find(p => p.id === otherId);
              setBottomNotif({ type: 'chat', nickname: otherProfile?.nickname ?? '' });
              rememberPartnerToast(pairKey);
            }
            void loadChatList(uid);
          } catch (e) { console.warn('[user-events/chat-insert]', e); }
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reads' },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          try {
            const row = payload.new as { reader_id?: string; chat_id?: string; read_at?: string };
            if (!row?.reader_id || row.reader_id === uid) return;
            if (!row.chat_id || !row.read_at) return;
            // 내가 그 방 안에 있으면 말풍선 '1' 처리만 — 토스트 없음
            if (isActiveRoomChat(row.chat_id)) return;
            const chat = chatListRef.current.find(c => c.id === row.chat_id);
            if (!chat) return;
            const pairKey = chatPairKey(chat.user1_id, chat.user2_id);
            if (selfInitiatedPairRef.current === pairKey) return;
            const last = partnerOpenToastAtRef.current.get(pairKey) ?? 0;
            if (Date.now() - last < 90_000) return;
            rememberPartnerToast(pairKey);
            const otherId = chat.user1_id === uid ? chat.user2_id : chat.user1_id;
            const otherProfile = profilesRef.current.find(p => p.id === otherId);
            setBottomNotif({ type: 'chat', nickname: otherProfile?.nickname ?? '' });
          } catch (e) { console.warn('[user-events/chat-reads]', e); }
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chats' },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          try {
            const c = payload.old as { id?: string };
            if (!c.id) return;
            setChatList(prev => {
              const next = prev.filter(x => x.id !== c.id);
              chatListRef.current = next;
              return next;
            });
          } catch (e) { console.warn('[user-events/chat-delete]', e); }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // loadChatList is declared later and reached only from the async listener;
  // including it here would read the const during its temporal dead zone.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, cacheRealtimeMessage, removeCachedMessage, profilesRef, setBottomNotif]);

  // ── 활성 채팅방 메시지 로드 ───────────────────────────────────────────────────
  const loadGenRef = useRef(0);
  const loadMessages = useCallback(async (cid: string): Promise<boolean> => {
    const gen = ++loadGenRef.current;
    const aliasesAtRequestStart = new Set(roomChatIdsRef.current);
    aliasesAtRequestStart.add(cid);
    const rowsAtRequestStart = [
      ...(messageCacheRef.current.get(cid) ?? []),
      ...messagesRef.current.filter(message => messageBelongsToChat(message, cid, aliasesAtRequestStart)),
    ];
    const idsAtRequestStart = new Set(rowsAtRequestStart.map(message => message.id));
    diag('debug', 'chat', 'fetch-start', {
      corr: `room:${cid}:${gen}`,
      data: { roomId: cid, requestVersion: gen, count: idsAtRequestStart.size },
    });
    try {
      const queryIds = [...new Set([
        cid,
        ...roomChatIdsRef.current,
        ...[...siblingToCanonicalRef.current.entries()]
          .filter(([alias, canon]) => alias === cid || canon === cid)
          .flatMap(([alias, canon]) => [alias, canon]),
      ].filter(Boolean))];
      const q = queryIds.length <= 1
        ? supabase.from('messages').select('*').eq('chat_id', cid)
        : supabase.from('messages').select('*').in('chat_id', queryIds);
      const { data, error } = await q.order('created_at', { ascending: true });
      if (gen !== loadGenRef.current) {
        diag('debug', 'chat', 'fetch-stale-discard', {
          corr: `room:${cid}:${gen}`,
          data: { roomId: cid, requestVersion: gen },
        });
        return false;
      }
      if (error) { console.error('[loadMessages] DB 오류:', error.message); return false; }
      if (data) setMessages(prev => {
        const result = applyLoadMessages(prev, data as Message[], {
          idsAtRequestStart,
          deletedIds: deletedMessageIdsRef.current,
        });
        rememberRoomChatId(cid);
        for (const m of data as Message[]) rememberRoomChatId(m.chat_id);
        const aliases = roomChatIdsRef.current;
        // [Fix-1] 쿼리 결과 chat_id 재검증 — 빈 chat_id·타방·단톡 메시지 원천 차단
        // 서버 sibling merge 가 canonical id 로 바꿔 돌려줘도 열린 방 별칭이면 유지
        const filtered = result.filter(m => messageBelongsToChat(m, cid, aliases));
        const visible = filtered.length > MAX_MESSAGES ? filtered.slice(-MAX_MESSAGES) : filtered;
        cacheRoomMessages(cid, visible);
        if (
          visible.length === prev.length
          && visible.every((m, i) => m.id === prev[i].id && m.content === prev[i].content)
        ) {
          return prev;
        }
        const last = visible[visible.length - 1];
        diag('debug', 'chat', 'state-merge', {
          corr: last?.id ?? `room:${cid}:${gen}`,
          data: {
            messageId: last?.id ?? null,
            roomId: cid,
            createdAt: last?.created_at ?? null,
            source: 'fetch',
            count: visible.length,
          },
        });
        return visible;
      });
      return true;
    } catch (err) {
      console.error('[loadMessages] 네트워크 오류:', err);
      return false;
    }
  }, [cacheRoomMessages]);

  // ── 채팅방 진입/전환 ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chatId) {
      ++loadGenRef.current; // 닫힌 뒤 도착한 이전 방 응답이 화면을 되살리지 않게 무효화
      setMessages([]);
      roomChatIdsRef.current = new Set();
      activePairKeyRef.current = null;
      activePartnerIdRef.current = null;
      return;
    }
    // 서버 동기화가 끝나기 전 최근 내용을 먼저 보여 전환 시 빈 화면을 없앤다.
    setMessages(messageCacheRef.current.get(chatId) ?? []);
    chatIdRef.current = chatId;
    rememberRoomChatId(chatId);
    const recentlyRead = recentlyReadRef.current;

    // 채팅방 열 때: unread 카운트 낙관적 삭제 + 전체 배지 감소
    // upsert 실패 시 뱃지 복원 (catch) — 서버 상태와 UI 불일치 방지
    setUnreadChatCounts(prev => clearUnreadForChat(prev, chatId, siblingToCanonicalRef.current));
    // 낙관적 읽음 보호: upsert 완료 전 syncUnreadCounts 가 이 방을 unread 로 되돌리지 않게
    recentlyRead.set(chatId, Date.now());

    if (currentUserId) {
      supabase.from('chat_reads').upsert({
        id: `${chatId}__${currentUserId}`,
        chat_id: chatId,
        reader_id: currentUserId,
        read_at: new Date().toISOString(),
      }, { onConflict: 'id' }).then(() => {
        recentlyRead.delete(chatId);
      }).catch(() => {
        // upsert 실패: 맹목적 restore 대신 syncUnreadCounts로 서버 상태에서 재동기화
        // 이유: restore 사이에 다른 채팅방 오픈/sync가 발생했을 수 있어 stale count를 더하면 배지가 틀려짐
        syncUnreadCountsRef.current?.().catch(() => {});
      });
    }

    // 통합 SSE 채널(user-events-${uid})이 messages INSERT/DELETE를 담당
    // 여기서는 채팅방 전환 시 메시지 로드만 수행
    loadMessages(chatId);

    // SSE 가 살아 있으면 INSERT 는 실시간으로 온다. 12초 전체 리로드는 채팅이 끊기므로
    // 끊김 복구용으로만 남긴다 (삭제하지 않음).
    let pollFailCount = 0;
    let isPolling = false;
    let pollPausedUntil = 0;
    let lastTick = 0;
    const pollInterval = setInterval(async () => {
      if (chatIdRef.current !== chatId) return;
      if (Date.now() < pollPausedUntil) return;
      if (isPolling) return;
      if (isSseHealthy()) return;
      const intervalMs = 3_000;
      if (Date.now() - lastTick < intervalMs - 50) return;
      lastTick = Date.now();
      isPolling = true;
      try {
        const ok = await loadMessages(chatId);
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

    return () => {
      cacheRoomMessages(chatId, messagesRef.current);
      clearInterval(pollInterval);
      if (currentUserId) {
        supabase.from('chat_reads').upsert({
          id: `${chatId}__${currentUserId}`,
          chat_id: chatId,
          reader_id: currentUserId,
          read_at: new Date().toISOString(),
        }, { onConflict: 'id' }).then(() => {
          recentlyRead.delete(chatId);
        }).catch(() => {});
      }
    };
  }, [chatId, loadMessages, currentUserId, cacheRoomMessages]);

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

      const msgCountByChat = new Map<string, number>();
      const latestByChat = new Map<string, { content: string; image_url?: string; created_at: string }>();
      if (allMsgs) {
        for (const m of allMsgs as { chat_id: string; content: string; image_url?: string; created_at: string }[]) {
          msgCountByChat.set(m.chat_id, (msgCountByChat.get(m.chat_id) ?? 0) + 1);
          if (!latestByChat.has(m.chat_id)) latestByChat.set(m.chat_id, { content: m.content, image_url: m.image_url, created_at: m.created_at });
        }
      }

      const rawChats = data as { id: string; user1_id: string; user2_id: string; created_at: string }[];
      siblingToCanonicalRef.current = buildChatIdAliasMap(rawChats);
      const deduped = dedupeChatList(
        rawChats,
        msgCountByChat,
      );

      const enriched: Chat[] = deduped.map((c) => {
        const pk = chatPairKey(c.user1_id, c.user2_id);
        const siblings = (data as { id: string; user1_id: string; user2_id: string; created_at: string }[])
          .filter(x => chatPairKey(x.user1_id, x.user2_id) === pk);
        let bestLatest = latestByChat.get(c.id);
        for (const s of siblings) {
          const lat = latestByChat.get(s.id);
          if (lat && (!bestLatest || lat.created_at > bestLatest.created_at)) bestLatest = lat;
        }
        const totalMsgs = siblings.reduce((sum, s) => sum + (msgCountByChat.get(s.id) ?? 0), 0);
        return { ...c, lastMessage: bestLatest?.image_url ? '📷 사진' : (bestLatest?.content ?? ''), messageCount: totalMsgs };
      });
      setChatList(prev => {
        if (
          prev.length === enriched.length
          && prev.every((c, i) =>
            c.id === enriched[i].id
            && c.lastMessage === enriched[i].lastMessage
            && c.messageCount === enriched[i].messageCount
          )
        ) {
          return prev;
        }
        return enriched;
      });
      void syncUnreadCountsRef.current?.();
    } catch (err) {
      console.error('[loadChatList] 오류:', err);
    }
  }, []);

  // 열린 방이 서버 canonical 로 합쳐졌으면 sibling id 를 별칭으로 유지 (setChatId 하면 메시지 클리어됨)
  useEffect(() => {
    const pair = activePairKeyRef.current;
    const cid = chatIdRef.current;
    if (!pair || !cid) return;
    const matches = chatList.filter(c => chatPairKey(c.user1_id, c.user2_id) === pair);
    const canonical = pickCanonicalChat(matches)?.id;
    if (!canonical) return;
    rememberRoomChatId(cid);
    rememberRoomChatId(canonical);
  }, [chatList]);

  // ── 채팅방 열기 ──────────────────────────────────────────────────────────────
  const openChatGenRef = useRef(0);
  const openChatInflightRef = useRef<Map<string, Promise<string | null>>>(new Map());
  const selfInitiatedPairTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Fix #10: openChat 내 에러 알림 setTimeout — 언마운트 시 미취소로 stale setState 발생 방지
  const openChatNotifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // [버그4 수정] selfInitiatedPairTimerRef + openChatNotifTimerRef 언마운트 시 정리 (TDZ 방지)
  useEffect(() => {
    return () => {
      if (selfInitiatedPairTimerRef.current !== null) {
        clearTimeout(selfInitiatedPairTimerRef.current);
        selfInitiatedPairTimerRef.current = null;
      }
      if (openChatNotifTimerRef.current !== null) {
        clearTimeout(openChatNotifTimerRef.current);
        openChatNotifTimerRef.current = null;
      }
    };
  }, []);

  // [버그2 수정] new-chats 별도 채널 제거
  // → user-events-${uid} 통합 채널의 chats INSERT/DELETE 핸들러가 동일 역할 수행
  const openChat = useCallback(async (otherProfile: Profile) => {
    if (!currentUserId) return;
    const gen = ++openChatGenRef.current;

    const user1Id = currentUserId < otherProfile.id ? currentUserId : otherProfile.id;
    const user2Id = currentUserId < otherProfile.id ? otherProfile.id : currentUserId;
    const pairKey = chatPairKey(user1Id, user2Id);
    activePairKeyRef.current = pairKey;
    activePartnerIdRef.current = otherProfile.id;
    const cachedMatches = chatListRef.current.filter(
      c => chatPairKey(c.user1_id, c.user2_id) === pairKey,
    );
    const cachedId = pickCanonicalChat(cachedMatches)?.id ?? null;

    setSelectedProfile(otherProfile);
    if (cachedId) {
      // 목록에 이미 있는 방은 서버 왕복 전에 바로 열어 화면 넘김 지연을 없앤다.
      chatIdRef.current = cachedId;
      rememberRoomChatId(cachedId);
      setChatId(cachedId);
      setUnreadChatCounts(prev => clearUnreadForChat(prev, cachedId, siblingToCanonicalRef.current));
    } else {
      chatIdRef.current = null;
      setChatId(null);
    }
    setView('chat');

    if (selfInitiatedPairTimerRef.current !== null) clearTimeout(selfInitiatedPairTimerRef.current);
    selfInitiatedPairRef.current = chatPairKey(user1Id, user2Id);
    selfInitiatedPairTimerRef.current = setTimeout(() => {
      selfInitiatedPairRef.current = null;
      selfInitiatedPairTimerRef.current = null;
    }, 5000);

    try {
      const inflight = openChatInflightRef.current.get(pairKey);
      if (inflight) {
        const waitedId = await inflight;
        if (gen !== openChatGenRef.current) return;
        if (waitedId) {
          chatIdRef.current = waitedId;
          setChatId(waitedId);
          return;
        }
      }

      const doOpen = async (): Promise<string | null> => {
        const { data: pairChats, error: listErr } = await supabase
          .from('chats').select('*')
          .or(`user1_id.eq.${user1Id},user2_id.eq.${user1Id}`);
        if (listErr) console.error('[openChat] 조회 오류:', listErr.message);

        let resolvedChatId: string | null = null;
        const existingList = ((pairChats ?? []) as Chat[]).filter(
          c => chatPairKey(c.user1_id, c.user2_id) === pairKey,
        );
        if (existingList.length > 0) {
          resolvedChatId = pickCanonicalChat(existingList)?.id ?? existingList[0].id;
        } else {
          const { data: newChat, error: createErr } = await supabase
            .from('chats').insert({ user1_id: user1Id, user2_id: user2Id }).select().single();
          if (newChat) {
            resolvedChatId = newChat.id;
            const newChatEntry: Chat = { ...newChat, lastMessage: '', messageCount: 0 };
            setChatList(prev => {
              const pk = chatPairKey(user1Id, user2Id);
              if (prev.some(c => chatPairKey(c.user1_id, c.user2_id) === pk)) return prev;
              if (prev.some(c => c.id === newChat.id)) return prev;
              return [newChatEntry, ...prev];
            });
          } else {
            const errMsg = typeof createErr === 'object' && createErr !== null && 'message' in createErr
              ? String((createErr as { message: unknown }).message)
              : String(createErr ?? 'unknown');
            console.error('[openChat] 채팅방 생성 실패:', errMsg);
            const { data: retryChats } = await supabase
              .from('chats').select('*')
              .or(`user1_id.eq.${user1Id},user2_id.eq.${user1Id}`);
            const retryList = ((retryChats ?? []) as Chat[]).filter(
              c => chatPairKey(c.user1_id, c.user2_id) === pairKey,
            );
            if (retryList.length > 0) {
              resolvedChatId = pickCanonicalChat(retryList)?.id ?? retryList[0].id;
            }
          }
        }
        return resolvedChatId;
      };

      const openPromise = doOpen();
      openChatInflightRef.current.set(pairKey, openPromise);
      let resolvedChatId: string | null;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      try {
        const timeoutPromise = new Promise<null>((resolve) => {
          timeoutId = setTimeout(() => resolve(null), 12_000);
        });
        resolvedChatId = await Promise.race([openPromise, timeoutPromise]);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        if (openChatInflightRef.current.get(pairKey) === openPromise) {
          openChatInflightRef.current.delete(pairKey);
        }
      }
      if (gen !== openChatGenRef.current) return;

      if (!resolvedChatId) {
        if (cachedId) return;
        openChatGenRef.current += 1;
        console.error('[openChat] 채팅방 ID 결정 불가 — 메인으로 복귀');
        chatIdRef.current = null;
        setChatId(null);
        setView('main');
        setBottomNotif({ type: 'chat', nickname: '', message: '채팅방을 열 수 없습니다. 잠시 후 다시 시도해주세요.' });
        if (openChatNotifTimerRef.current) clearTimeout(openChatNotifTimerRef.current);
        openChatNotifTimerRef.current = setTimeout(() => { openChatNotifTimerRef.current = null; setBottomNotif(null); }, 3000);
        return;
      }

      chatIdRef.current = resolvedChatId;
      rememberRoomChatId(resolvedChatId);
      // unreadChatCountsRef.current は毎レンダーで更新されるため、ここで読めば最新値を取得できる.
      // setChatId → effect の前に setUnreadChatCounts を呼ぶと effect 内で removed=0 になるため
      // ここで count を読んでから両方まとめてクリアする (effect は no-op になるが二重減算は発生しない).
      if (resolvedChatId !== cachedId) {
        setChatId(resolvedChatId);
        setUnreadChatCounts(prev => clearUnreadForChat(prev, resolvedChatId, siblingToCanonicalRef.current));
      }
    } catch (err) {
      console.error('[openChat] 예외:', err);
      if (gen === openChatGenRef.current) {
        chatIdRef.current = null;
        setChatId(null);
        setView('main');
        setBottomNotif({ type: 'chat', nickname: '', message: '채팅방 연결 중 오류가 발생했습니다.' });
        if (openChatNotifTimerRef.current) clearTimeout(openChatNotifTimerRef.current);
        openChatNotifTimerRef.current = setTimeout(() => { openChatNotifTimerRef.current = null; setBottomNotif(null); }, 3000);
      }
    }
  }, [currentUserId, setSelectedProfile, setView, setBottomNotif]);

  // ── 미읽음 재동기화 ──────────────────────────────────────────────────────────
  const syncUnreadCounts = useCallback(async () => {
    if (!currentUserIdRef.current) return;
    // /unread-counts 는 유효한 SSE 토큰을 요구한다. 토큰이 아직 없거나 만료됐으면
    // 요청해봐야 401 + 서버 [SECURITY] 경고 로그만 남는다. 아래 15초 주기 동기화와
    // SSE 재연결 콜백이 토큰 도착 후 다시 부르므로 여기서는 조용히 건너뛴다.
    const token = getSseToken();
    if (!token) return;
    const gen = ++syncGenRef.current; // 이 요청의 고유 세대 번호
    try {
      const tokenParam = `&token=${encodeURIComponent(token)}`;
      const resp = await fetch(`/api/db/unread-counts?userId=${encodeURIComponent(currentUserIdRef.current)}${tokenParam}`);
      if (!resp.ok) return;
      if (gen !== syncGenRef.current) return; // 더 최신 요청이 이미 진행 중 → 이 응답은 버림
      const { data } = await resp.json() as { data: Record<string, number> | null };
      if (!data) return;
      if (gen !== syncGenRef.current) return; // JSON 파싱 사이에 더 최신 요청이 시작됐으면 버림
      setUnreadChatCounts(prev => {
        const alias = siblingToCanonicalRef.current;
        let next = remapUnreadToCanonical(data, alias);
        const active = chatIdRef.current;
        if (active) next = clearUnreadForChat(next, active, alias);
        for (const aliasId of roomChatIdsRef.current) {
          next = clearUnreadForChat(next, aliasId, alias);
        }
        const now = Date.now();
        for (const [cid, ts] of recentlyReadRef.current) {
          if (now - ts < 30_000) next = clearUnreadForChat(next, cid, alias);
          else recentlyReadRef.current.delete(cid);
        }
        const prevKeys = Object.keys(prev);
        const nextKeys = Object.keys(next);
        if (prevKeys.length === nextKeys.length && nextKeys.every(k => prev[k] === next[k])) return prev;
        return next;
      });
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
        const uid = currentUserIdRef.current;
        if (uid) void loadChatList(uid);
        // 탭 복귀 시 active 채팅방 메시지도 즉시 당겨옴 (SSE가 끊긴 사이 누락된 메시지 복구)
        const activeChatId = chatIdRef.current;
        if (activeChatId) void loadMessages(activeChatId);
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [syncUnreadCounts, loadMessages, loadChatList]);

  // ── 15초 주기 동기화 — SSE 드롭 시 메시지·미읽음·채팅 목록 복구 ──────────────
  // active 채팅방 메시지도 함께 리로드해 SSE 끊김 기간 동안 누락된 메시지를 채움
  // (SSE 재연결 핸들러와 이중화 → 어느 쪽이든 먼저 복구되면 즉시 반영)
  useEffect(() => {
    if (!currentUserId) return;
    const uid = currentUserId;
    const id = setInterval(() => {
      // SSE 가 살아 있으면 INSERT/unread 는 실시간으로 온다. 15초 전체 리로드는
      // 끊김 복구용으로 남긴다 (삭제하지 않음). 150명×5시간이면 /op 폭주가 된다.
      if (isSseHealthy()) return;
      void syncUnreadCounts();
      void loadChatList(uid);
      const activeChatId = chatIdRef.current;
      if (activeChatId) void loadMessages(activeChatId);
    }, 15_000);
    return () => clearInterval(id);
  }, [currentUserId, syncUnreadCounts, loadChatList, loadMessages]);

  // ── 오프라인 메시지 큐 ─────────────────────────────────────────────────────────
  // 4회 재시도 모두 실패(네트워크 완전 단절) 시 메시지를 여기에 보관.
  // SSE 재연결 시 큐를 자동으로 플러시하여 메시지 유실 방지.
  // [Part1-Fix3] localStorage 영속화 — 새로고침 후에도 미전송 메시지 복구
  const pendingQueueRef = useRef<PendingMsg[]>(_loadPendingQueue());
  const isFlushingRef = useRef(false);

  useEffect(() => {
    pendingQueueRef.current = pendingQueueRef.current.filter(q => !currentUserId || q.userId === currentUserId);
    _savePendingQueue(pendingQueueRef.current);
  }, [currentUserId]);

  const flushPendingQueue = useCallback(async () => {
    if (isFlushingRef.current || pendingQueueRef.current.length === 0) return;
    isFlushingRef.current = true;
    try {
      const queue = [...pendingQueueRef.current];
      for (const item of queue) {
        // 유저 전환 시 이전 유저 큐 항목 폐기 — 엉뚱한 sender로 전송 차단
        if (item.userId !== currentUserIdRef.current) {
          pendingQueueRef.current = pendingQueueRef.current.filter(q => q.clientId !== item.clientId);
          setMessages(prev => prev.filter(m => m.id !== item.optimisticId));
          continue;
        }
        try {
          // 항목별 8초 타임아웃 — 단일 insert가 영원히 hang되면 전체 큐가 멈추는 현상 방지
          const insertPromise = supabase.from('messages').insert({
            chat_id: item.chatId,
            sender_id: item.userId,
            content: item.content,
            client_id: item.clientId,
          }).select().single();
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('queue-item-timeout')), 8_000)
          );
          const { data: insertedMsg, error } = await Promise.race([insertPromise, timeoutPromise]);
          if (!error && insertedMsg) {
            // 성공: 낙관적 메시지를 실제 메시지로 교체
            setMessages(prev => prev.map(m => m.id === item.optimisticId ? insertedMsg as Message : m));
            pendingQueueRef.current = pendingQueueRef.current.filter(q => q.clientId !== item.clientId);
            _savePendingQueue(pendingQueueRef.current); // [Part1-Fix3] localStorage 동기화
          } else if (error) {
            // client_id로 이미 저장됐는지 확인 (이전 시도 응답 분실)
            const { data: existing } = await supabase.from('messages').select('*').eq('chat_id', item.chatId).eq('client_id', item.clientId).maybeSingle();
            if (existing) {
              setMessages(prev => prev.map(m => m.id === item.optimisticId ? existing as Message : m));
              pendingQueueRef.current = pendingQueueRef.current.filter(q => q.clientId !== item.clientId);
              _savePendingQueue(pendingQueueRef.current); // [Part1-Fix3] localStorage 동기화
            }
            // 실패해도 break 하지 않음 — 다음 항목 계속 시도 (한 항목 실패가 전체 큐를 막지 않음)
          }
        } catch {
          // 네트워크 오류 또는 타임아웃 — 이 항목은 다음 재연결 때 재시도, 나머지는 계속 처리
          continue;
        }
      }
    } finally {
      // 예외가 발생해도 반드시 해제 — 영구 잠금 방지
      isFlushingRef.current = false;
    }
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
  const MAX_MSG_LEN = 1000; // 메시지 최대 길이 (서버·UI 공통 기준)

  const sendMessage = useCallback(async (content: string): Promise<void> => {
    const snapChatId = chatIdRef.current;
    const snapUserId = currentUserIdRef.current;
    if (!snapChatId || !snapUserId || !content.trim()) return;
    if (content.trim().length > MAX_MSG_LEN) return;
    if (sendingChatIdsRef.current.has(snapChatId)) return;
    sendingChatIdsRef.current.add(snapChatId);

    const clientUUID = crypto.randomUUID(); // 재시도 전체에서 동일 UUID 사용 (idempotency)
    const optimisticId = `__opt_${clientUUID}`;
    const trimmed = content.trim();
    const optimisticMsg: Message = {
      id: optimisticId,
      chat_id: snapChatId,
      sender_id: snapUserId,
      content: trimmed,
      created_at: new Date().toISOString(),
      client_id: clientUUID,
    } as Message;

    setMessages(prev => {
      if (!isActiveRoomChat(snapChatId)) return prev;
      return [...prev, optimisticMsg];
    });
    setChatList(prev => prev.map(c => c.id === snapChatId ? { ...c, lastMessage: trimmed } : c));

    const MAX_RETRIES = 4; // [Part1-Fix2] 4회 시도 → 실제 지수백오프 1s→2s→4s 3단계 적용
    let lastErr: unknown;

    try {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        // 재시도 시 지수 백오프 — attempt=1:1s, attempt=2:2s, attempt=3:4s
        if (attempt > 0) {
          await new Promise<void>(r => setTimeout(r, Math.pow(2, attempt - 1) * 1000));
          // 대기 중 채팅방이 바뀌면 중단 (낙관적 메시지는 그대로 — 폴링이 reconcile)
          if (!isActiveRoomChat(snapChatId)) return;
        }

        try {
          const { data: insertedMsg, error } = await supabase.from('messages').insert({
            chat_id: snapChatId,
            sender_id: snapUserId,
            content: trimmed,
            client_id: clientUUID,
          }).select().single();

          if (!error && insertedMsg) {
            const saved = insertedMsg as Message;
            rememberRoomChatId(snapChatId);
            rememberRoomChatId(saved.chat_id);
            if (isActiveRoomChat(snapChatId) || isActiveRoomChat(saved.chat_id)) {
              setMessages(prev => {
                const next = prev.map(m => m.id === optimisticId ? saved : m);
                return next.filter(m => messageBelongsToChat(m, snapChatId, roomChatIdsRef.current));
              });
            }
            return;
          }

          // Insert 실패했지만 이전 시도의 응답이 분실된 경우를 처리:
          // 같은 client_id로 DB를 조회해 이미 저장된 행이 있으면 교체 후 성공
          if (error) {
            const { data: existing } = await supabase.from('messages').select('*').eq('chat_id', snapChatId).eq('client_id', clientUUID).maybeSingle();
            if (existing && (isActiveRoomChat(snapChatId) || isActiveRoomChat((existing as Message).chat_id))) {
              const saved = existing as Message;
              rememberRoomChatId(saved.chat_id);
              setMessages(prev => {
                const next = prev.map(m => m.id === optimisticId ? saved : m);
                return next.filter(m => messageBelongsToChat(m, snapChatId, roomChatIdsRef.current));
              });
              return; // 분실 복구 성공
            }
            lastErr = error;
          }
        } catch (err) {
          lastErr = err;
          if (!isActiveRoomChat(snapChatId)) return; // 방 변경 시 조용히 중단
        }
      }

      // 모든 재시도 실패 → 롤백 대신 오프라인 큐에 보관 (재연결 시 자동 전송)
      // 낙관적 메시지는 화면에 유지 — 사용자가 메시지를 다시 입력할 필요 없음
      console.warn('[sendMessage] 4회 재시도 실패 — 오프라인 큐에 보관, 재연결 시 자동 전송:', lastErr);
      // 큐 크기 상한 50개 — 무한 증가 방지 (가장 오래된 항목부터 제거)
      if (pendingQueueRef.current.length >= 50) pendingQueueRef.current.shift();
      pendingQueueRef.current.push({ chatId: snapChatId, content: trimmed, clientId: clientUUID, optimisticId, userId: snapUserId });
      _savePendingQueue(pendingQueueRef.current); // [Part1-Fix3] localStorage 영속화 — 새로고침 후에도 복구
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
      if (!isActiveRoomChat(snapChatId)) return prev;
      const next = [...prev, optimisticMsg];
      return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
    });
    setChatList(prev => prev.map(c => c.id === snapChatId ? { ...c, lastMessage: '📷 사진' } : c));

    const rollback = () => {
      URL.revokeObjectURL(localBlobUrl); // blob URL must not remain after swap/rollback — 5h leak
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
      const path = `${snapChatId}/${snapUserId}/${clientId}.${ext}`;
      const { data, error } = await supabase.storage.from('chat-images').upload(path, file, { contentType: file.type || 'image/jpeg' });
      if (error) { rollback(); return error.message; }
      if (!data) { rollback(); return '업로드 실패'; }

      // 업로드 완료 후 채팅방/사용자가 바뀌었으면 고아 파일 정리 후 중단
      if (!isActiveRoomChat(snapChatId) || currentUserIdRef.current !== snapUserId) {
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
      URL.revokeObjectURL(localBlobUrl); // blob URL must not remain after swap/rollback — 5h leak
      if (insertedMsg && isActiveRoomChat(snapChatId)) {
        const saved = insertedMsg as Message;
        rememberRoomChatId(saved.chat_id);
        setMessages(prev => {
          const next = prev.map(m => m.id === optimisticId ? saved : m);
          return next.filter(m => messageBelongsToChat(m, snapChatId, roomChatIdsRef.current));
        });
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
      messageCacheRef.current.delete(chatToDelete.id);
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
      if (deletedIds.length > 0) {
        for (const id of deletedIds) messageCacheRef.current.delete(id);
        setChatList(prev => prev.filter(c => !deletedIds.includes(c.id)));
      }
    } catch (ex) {
      console.error('[useChat] deleteAllChats 네트워크 오류:', ex);
      alert('네트워크 오류로 일부 채팅 삭제에 실패했습니다.');
    }
  };

  const deleteMessage = async (msgId: string) => {
    try {
      const { error } = await supabase.from('messages').delete().eq('id', msgId);
      if (!error) {
        deletedMessageIdsRef.current.add(msgId);
        removeCachedMessage(msgId);
        setMessages(prev => prev.filter(m => m.id !== msgId));
      } else console.warn('[useChat] deleteMessage 오류:', error.message);
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
