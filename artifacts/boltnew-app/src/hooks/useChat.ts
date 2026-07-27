import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
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

    return () => {
      if (!currentUserId) {
        for (const ch of channels.values()) supabase.removeChannel(ch);
        channels.clear();
      }
    };
  }, [chatList, currentUserId]);

  // ── 활성 채팅방 메시지 구독 ─────────────────────────────────────────────────
  const loadMessages = useCallback(async (cid: string) => {
    const { data } = await supabase.from('messages').select('*').eq('chat_id', cid).order('created_at', { ascending: true });
    if (data) setMessages(prev => {
      const dbIds = new Set(data.map((m: { id: string }) => m.id));
      const optimistic = prev.filter(m => m.id.startsWith('__opt_') && !dbIds.has(m.id));
      return [...data, ...optimistic];
    });
  }, []);

  useEffect(() => {
    setMessages([]);
    if (!chatId) return;
    chatIdRef.current = chatId;
    setUnreadChatCounts(prev => { const n = { ...prev }; delete n[chatId]; return n; });
    if (currentUserId) {
      supabase.from('chat_reads').upsert({
        id: `${chatId}__${currentUserId}`,
        chat_id: chatId,
        reader_id: currentUserId,
        read_at: new Date().toISOString(),
      }, { onConflict: 'id' }).then(() => {});
    }
    const channel = supabase
      .channel(`chat:${chatId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          const newMsg = payload.new as Message;
          setMessages(prev => {
            if (prev.some((m: Message) => m.id === newMsg.id)) return prev;
            // 낙관적 업데이트 교체: 5초 이내 동일 발신자+내용 메시지에만 매칭 (동일 문구 연속 전송 시 잘못된 매칭 방지)
            const msgTime = new Date(newMsg.created_at).getTime();
            const optIdx = prev.findIndex(m =>
              m.id.startsWith('__opt_') &&
              m.sender_id === newMsg.sender_id &&
              m.content === newMsg.content &&
              Math.abs(new Date(m.created_at).getTime() - msgTime) < 5000
            );
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
    return () => { supabase.removeChannel(channel); };
  }, [chatId, loadMessages, currentUserId]);

  const loadChatList = useCallback(async (userId: string) => {
    const { data } = await supabase.from('chats').select('*')
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .order('created_at', { ascending: false });
    if (!data) return;
    if (data.length === 0) { setChatList([]); return; }
    const chatIds = data.map((c: { id: string }) => c.id);
    const { data: allMsgs } = await supabase.from('messages').select('chat_id, content, created_at')
      .in('chat_id', chatIds).order('created_at', { ascending: false }).limit(Math.max(chatIds.length * 20, 100));
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
  }, []);

  const openChat = useCallback(async (otherProfile: Profile) => {
    if (!currentUserId) return;
    setMessages([]);
    setSelectedProfile(otherProfile);
    chatIdRef.current = null;
    setChatId(null);
    setView('chat');

    const user1Id = currentUserId < otherProfile.id ? currentUserId : otherProfile.id;
    const user2Id = currentUserId < otherProfile.id ? otherProfile.id : currentUserId;

    const { data: existingChat } = await supabase
      .from('chats').select('*').eq('user1_id', user1Id).eq('user2_id', user2Id).maybeSingle();

    let resolvedChatId: string | null = null;
    if (existingChat) {
      resolvedChatId = existingChat.id;
    } else {
      const { data: newChat, error: createErr } = await supabase
        .from('chats').insert({ user1_id: user1Id, user2_id: user2Id }).select().single();
      if (newChat) {
        resolvedChatId = newChat.id;
      } else {
        console.error('[openChat] 채팅방 생성 실패:', createErr?.message);
        const { data: retryChat } = await supabase
          .from('chats').select('*').eq('user1_id', user1Id).eq('user2_id', user2Id).maybeSingle();
        if (retryChat) resolvedChatId = retryChat.id;
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

  const sendMessage = async (content: string) => {
    if (!chatId || !currentUserId || !content.trim()) return;
    const optimisticId = `__opt_${Date.now()}`;
    const optimisticMsg = {
      id: optimisticId,
      chat_id: chatId,
      sender_id: currentUserId,
      content: content.trim(),
      created_at: new Date().toISOString(),
    } as Message;
    setMessages(prev => [...prev, optimisticMsg]);
    setChatList(prev => prev.map(c => c.id === chatId ? { ...c, lastMessage: content.trim() } : c));
    const { error } = await supabase.from('messages').insert({
      chat_id: chatId, sender_id: currentUserId, content: content.trim()
    });
    if (error) {
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
      setChatList(prev => prev.map(c => c.id === chatId ? { ...c, lastMessage: c.lastMessage === content.trim() ? '' : c.lastMessage } : c));
      // 실패 시 사용자에게 짧은 피드백 제공
      console.error('[sendMessage]', error.message);
      alert('메시지 전송에 실패했습니다. 다시 시도해 주세요.');
    }
  };

  const sendImage = async (file: File): Promise<string | null> => {
    if (!chatId || !currentUserId) return null;
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${chatId}/${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage.from('chat-images').upload(path, file, { contentType: file.type || 'image/jpeg' });
    if (error) return error.message;
    if (!data) return '업로드 실패';
    const { data: { publicUrl } } = supabase.storage.from('chat-images').getPublicUrl(data.path);
    const { error: msgErr } = await supabase.from('messages').insert({ chat_id: chatId, sender_id: currentUserId, content: '', image_url: publicUrl });
    if (msgErr) return msgErr.message;
    return null;
  };

  const deleteChat = async (chatToDelete: Chat) => {
    if (!confirm('이 채팅방을 삭제하시겠습니까?')) return;
    await supabase.from('messages').delete().eq('chat_id', chatToDelete.id);
    await supabase.from('chats').delete().eq('id', chatToDelete.id);
    setChatList(prev => prev.filter(c => c.id !== chatToDelete.id));
  };

  const deleteAllChats = async () => {
    if (chatList.length === 0) return;
    if (!confirm(`채팅 ${chatList.length}개를 모두 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    for (const chat of chatList) {
      await supabase.from('messages').delete().eq('chat_id', chat.id);
      await supabase.from('chats').delete().eq('id', chat.id);
    }
    setChatList([]);
  };

  const deleteMessage = async (msgId: string) => {
    await supabase.from('messages').delete().eq('id', msgId);
    setMessages(prev => prev.filter(m => m.id !== msgId));
  };

  return {
    chatId, setChatId,
    chatIdRef,
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
