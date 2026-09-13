/**
 * GroupChatScreen ???듯듃???⑦넚諛??붾㈃
 * - 1:1 ChatScreen怨?媛숈? visualViewport / safe-area / ?섎떒 ?ㅽ겕濡?
 * - ??硫붿떆吏: ?꾩쭅 ???쎌? ?ㅻⅨ 硫ㅻ쾭 ??(移댁뭅?ㅼ떇, 1??媛먯냼)
 * - functionsLocked ???뚮쭔 ?낅젰 鍮꾪솢??
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, Send, LogOut } from 'lucide-react';
import { AppErrorBoundary } from './AppErrorBoundary';
import type { GroupChat, GroupMessage, GroupParticipant, Profile } from '../types/app';
import { groupRoomVisual, unreadMemberCount } from '../lib/group-rooms';
import { GroupRoomIcon } from './GroupRoomIcon';

import { genAvatar } from '../lib/profile';
import { NavLayer } from '../hooks/useParticipantNav';
import { withChatImageAuth } from '../lib/localdb';

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
    const savedInput = input;
    setInput('');
    setSending(true);
    try {
      await onSendMessage(text);
    } catch (e) {
      console.error('[GroupChatScreen] ?꾩넚 ?ㅻ쪟:', e);
      setInput(savedInput);
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
    <AppErrorBoundary screenName="?⑥껜 梨꾪똿" onReset={onBack}>
      <div
        className={`fixed left-0 right-0 min-w-0 flex flex-col z-[9999] ${darkMode ? 'bg-slate-900' : 'bg-gray-100'}`}
        style={{
          ...vpStyle,
          paddingTop: 'env(safe-area-inset-top)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        <NavLayer id="group-leave" open={showLeaveConfirm} onClose={() => setShowLeaveConfirm(false)} />
        <div className={`flex items-center gap-3 px-4 py-3 border-b flex-shrink-0 ${
          darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'
        }`}>
          <button
            type="button"
            onClick={onBack}
            className={`touch-target rounded-full transition-colors flex items-center justify-center ${
              darkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-100'
            }`}
          >
            <ArrowLeft className={`w-5 h-5 ${darkMode ? 'text-white' : 'text-gray-700'}`} />
          </button>
          <div className="flex-1 min-w-0">
            <p className={`font-black text-sm truncate flex items-center gap-1.5 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              <GroupRoomIcon group={group} size={visual.glyph === 'club' ? 20 : 18} />
              <span className="truncate">{group.name}</span>
            </p>
            <p className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
              {group.memberCount ?? participants.length ?? 0}紐?李몄뿬 以?
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
              title="?⑦넚諛??섍?湲?
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>

        {showLeaveConfirm && (
          <div className="safe-overlay fixed inset-0 z-[80] flex items-center justify-center bg-black/50">
            <div className={`mx-6 rounded-2xl p-5 shadow-2xl w-full max-w-xs ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
              <p className={`font-black text-base mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>?⑦넚諛??섍?湲?/p>
              <p className={`text-sm mb-4 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>??諛⑹뿉???섍컩?덈떎. ?섏쨷???ㅼ떆 ?낆옣?????덉뼱??</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowLeaveConfirm(false)}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold ${darkMode ? 'bg-slate-700 text-white' : 'bg-gray-100 text-gray-700'}`}
                >痍⑥냼</button>
                <button
                  type="button"
                  disabled={leaving}
                  onClick={async () => {
                    if (!onLeave) return;
                    setLeaving(true);
                    try { await onLeave(); } finally { setLeaving(false); setShowLeaveConfirm(false); }
                  }}
                  className="flex-1 py-2 rounded-xl text-sm font-bold bg-red-500 text-white disabled:opacity-50"
                >?섍?湲?/button>
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
              <span className="text-5xl opacity-30">?뮠</span>
              <p className={`text-sm ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                泥?硫붿떆吏濡???붾? ?쒖옉??蹂댁꽭??
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
                      {sender?.nickname ?? '(?????놁쓬)'}
                    </span>
                  )}

                  {msg.image_url && !isOptimistic ? (
                    <img
                      src={withChatImageAuth(msg.image_url)}
                      alt="?ъ쭊"
                      className="rounded-2xl max-w-full object-cover"
                      style={{ maxHeight: 240 }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed break-words whitespace-pre-wrap ${
                      isMe
                        ? 'bg-teal-700 text-white'
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
              placeholder={composerLocked ? '?됱궗 以묒뿉???⑦넚???ъ슜?????놁뼱?? : '硫붿떆吏瑜??낅젰?섏꽭?붴?(Enter ?꾩넚)'}
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
              className="touch-target flex items-center justify-center rounded-full bg-teal-700 hover:bg-teal-600 disabled:opacity-40 active:scale-95 transition-all flex-shrink-0"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        </footer>
      </div>
    </AppErrorBoundary>
  );
}

