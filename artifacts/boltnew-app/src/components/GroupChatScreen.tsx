/**
 * GroupChatScreen — 옵트인 단톡방 화면
 * - 1:1 ChatScreen과 같은 visualViewport / safe-area / 하단 스크롤
 * - 내 메시지: 아직 안 읽은 다른 멤버 수 (카카오식, 1씩 감소)
 * - functionsLocked 일 때만 입력 비활성
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, Send, LogOut } from 'lucide-react';
import { AppErrorBoundary } from './AppErrorBoundary';
import type { GroupChat, GroupMessage, GroupParticipant, Profile } from '../types/app';
import { groupRoomVisual, unreadMemberCount } from '../lib/group-rooms';

import { genAvatar } from '../lib/profile';

const getAvatarSrc = (photoUrl: string | null | undefined, nick: string): string => {
  if (!photoUrl) return genAvatar(nick);
  if (photoUrl.includes('dicebear')) return genAvatar(nick);
  if (photoUrl.startsWith('data:image/svg')) return genAvatar(nick);
  return photoUrl;
};

interface GroupChatScreenProps {
  group: GroupChat | null;
  messages: GroupMessage[];
  participants?: GroupParticipant[];
  currentUserId: string | null;
  profileMap: Map<string, Profile>;
  darkMode: boolean;
  functionsLocked?: boolean;
  onBack: () => void;
  onSendMessage: (content: string) => Promise<void>;
  onLeave?: () => Promise<void>;
}

export function GroupChatScreen({
  group,
  messages,
  participants = [],
  currentUserId,
  profileMap,
  darkMode,
  functionsLocked = false,
  onBack,
  onSendMessage,
  onLeave,
}: GroupChatScreenProps) {
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [vpStyle, setVpStyle] = useState<React.CSSProperties>({ top: 0, height: '100dvh' });

  useEffect(() => {
    const vv = window.visualViewport;
    const apply = (top: number, height: number) => setVpStyle({ top, height });
    if (!vv) { apply(0, window.innerHeight); return; }
    const update = () => apply(vv.offsetTop, vv.height);
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); };
  }, []);

  useEffect(() => {
    document.body.dataset.view = 'chat';
    return () => { delete document.body.dataset.view; };
  }, []);

  useEffect(() => {
    try { endRef.current?.scrollIntoView({ behavior: 'smooth' }); } catch { /* ignore */ }
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending || functionsLocked || text.length > 1000) return;
    setInput('');
    setSending(true);
    try {
      await onSendMessage(text);
    } catch (e) {
      console.error('[GroupChatScreen] 전송 오류:', e);
    } finally {
      setSending(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [input, sending, functionsLocked, onSendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }, [handleSend]);

  if (!group) return null;

  const visual = groupRoomVisual(group);
  const composerLocked = !!functionsLocked;

  return (
    <AppErrorBoundary screenName="단체 채팅" onReset={onBack}>
      <div
        className={`fixed left-0 right-0 flex flex-col z-[9999] ${darkMode ? 'bg-slate-900' : 'bg-gray-100'}`}
        style={{ ...vpStyle, paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className={`flex items-center gap-3 px-4 py-3 border-b flex-shrink-0 ${
          darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
        }`}>
          <button
            type="button"
            onClick={onBack}
            className={`p-1.5 rounded-full transition-colors ${
              darkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-100'
            }`}
          >
            <ArrowLeft className={`w-5 h-5 ${darkMode ? 'text-white' : 'text-gray-700'}`} />
          </button>
          <div className="flex-1 min-w-0">
            <p className={`font-black text-sm truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {visual.emoji} {group.name}
            </p>
            <p className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
              {group.memberCount ?? participants.length ?? 0}명 참여 중
            </p>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
            darkMode ? 'bg-teal-500/20 text-teal-400' : 'bg-teal-50 text-teal-600'
          }`}>
            {visual.label}
          </span>
          {onLeave && (
            <button
              type="button"
              onClick={() => setShowLeaveConfirm(true)}
              className={`p-1.5 rounded-full transition-colors flex-shrink-0 ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-gray-100 text-gray-400'}`}
              title="단톡방 나가기"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>

        {showLeaveConfirm && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50">
            <div className={`mx-6 rounded-2xl p-5 shadow-2xl w-full max-w-xs ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
              <p className={`font-black text-base mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>단톡방 나가기</p>
              <p className={`text-sm mb-4 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>이 방에서 나갑니다. 나중에 다시 입장할 수 있어요.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowLeaveConfirm(false)}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold ${darkMode ? 'bg-slate-700 text-white' : 'bg-gray-100 text-gray-700'}`}
                >취소</button>
                <button
                  type="button"
                  disabled={leaving}
                  onClick={async () => {
                    if (!onLeave) return;
                    setLeaving(true);
                    try { await onLeave(); } finally { setLeaving(false); setShowLeaveConfirm(false); }
                  }}
                  className="flex-1 py-2 rounded-xl text-sm font-bold bg-red-500 text-white disabled:opacity-50"
                >나가기</button>
              </div>
            </div>
          </div>
        )}

        <main
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-2"
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (!target.closest('button, a, textarea, input, [role="button"]')) {
              textareaRef.current?.blur();
            }
          }}
        >
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 select-none">
              <span className="text-5xl opacity-30">💬</span>
              <p className={`text-sm ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                첫 메시지로 대화를 시작해 보세요!
              </p>
            </div>
          )}
          {messages.map((msg) => {
            const isMe = msg.sender_id === currentUserId;
            const sender = profileMap.get(msg.sender_id);
            const isOptimistic = msg.id.startsWith('__opt_');
            const unreadN = isMe && currentUserId ? unreadMemberCount(msg, participants, currentUserId) : 0;
            return (
              <div key={msg.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                {!isMe && (
                  <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 mt-5 bg-gray-200">
                    {sender ? (
                      <img
                        src={getAvatarSrc(sender.photo_url, sender.nickname)}
                        alt={sender.nickname}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = genAvatar(sender.nickname);
                        }}
                      />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center text-[10px] ${
                        darkMode ? 'bg-slate-700 text-slate-400' : 'bg-gray-200 text-gray-400'
                      }`}>
                        ?
                      </div>
                    )}
                  </div>
                )}

                <div className={`flex flex-col gap-0.5 max-w-[72%] ${isMe ? 'items-end' : 'items-start'}`}>
                  {!isMe && (
                    <span className={`text-[10px] font-bold px-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                      {sender?.nickname ?? '(알 수 없음)'}
                    </span>
                  )}

                  {msg.image_url && !isOptimistic ? (
                    <img
                      src={msg.image_url}
                      alt="사진"
                      className="rounded-2xl max-w-full object-cover"
                      style={{ maxHeight: 240 }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed break-words whitespace-pre-wrap ${
                      isMe
                        ? darkMode
                          ? 'bg-teal-600 text-white'
                          : 'bg-teal-500 text-white'
                        : darkMode
                          ? 'bg-slate-700 text-white'
                          : 'bg-white text-gray-900 shadow-sm'
                    } ${isOptimistic ? 'opacity-60' : ''}`}>
                      {msg.content}
                    </div>
                  )}

                  <div className={`flex items-center gap-1 px-1 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                    {isMe && unreadN > 0 && (
                      <span className="text-[11px] font-black text-yellow-400 leading-none">{unreadN}</span>
                    )}
                    <span className={`text-[9px] ${darkMode ? 'text-slate-600' : 'text-gray-300'}`}>
                      {new Date(msg.created_at).toLocaleTimeString('ko-KR', {
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </main>

        <footer className={`px-4 py-3 border-t flex-shrink-0 ${
          darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
        }`} style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => { if (!composerLocked && e.target.value.length <= 1000) setInput(e.target.value); }}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                setTimeout(() => {
                  endRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
                }, 350);
              }}
              placeholder={composerLocked ? '행사 중에는 단톡을 사용할 수 없어요' : '메시지를 입력하세요… (Enter 전송)'}
              rows={1}
              disabled={composerLocked}
              readOnly={composerLocked}
              style={{ resize: 'none' }}
              className={`flex-1 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:opacity-60 ${
                darkMode
                  ? 'bg-slate-700 text-white placeholder-slate-400'
                  : 'bg-gray-100 text-gray-900 placeholder-gray-400'
              }`}
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={composerLocked || !input.trim() || sending}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-teal-500 hover:bg-teal-600 disabled:opacity-40 active:scale-95 transition-all flex-shrink-0"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        </footer>
      </div>
    </AppErrorBoundary>
  );
}
