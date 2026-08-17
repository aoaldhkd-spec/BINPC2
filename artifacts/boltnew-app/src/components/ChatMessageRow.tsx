import type { CSSProperties, MouseEvent, TouchEvent } from 'react';
import { StickerSVG, STICKER_LABELS, STICKER_COUNT } from '../stickers';
import type { Message } from '../types/app';
import {
  parseContactCard,
  parseInfoAckData,
  parseInfoReqType,
  type InfoRequestType,
} from '../lib/chat-message-format';

export type ChatMessageMeta = {
  time: string;
  isCard: boolean;
  isSticker: boolean;
  stickerIdx: number;
  isReply: boolean;
  replyData: { quote: string; text: string } | null;
  isInfoReqMsg: boolean;
  isInfoAckMsg: boolean;
  isInfoDeclineMsg: boolean;
};

type ChatMessageRowProps = {
  msg: Message;
  currentUserId: string;
  meta: ChatMessageMeta;
  reaction?: string;
  swipeOffsetX: number;
  isSwiping: boolean;
  myUnread: boolean;
  ackedReqTypes: Set<string>;
  declinedReqTypes: Set<string>;
  onMsgTouchStart: (e: TouchEvent<HTMLDivElement>, msg: Message) => void;
  onMsgTouchMove: (e: TouchEvent<HTMLDivElement>, msg: Message) => void;
  onMsgTouchEnd: (e: TouchEvent<HTMLDivElement>, msg: Message) => void;
  onMsgMouseDown: (e: MouseEvent<HTMLDivElement>, msg: Message) => void;
  onContextMenu: (e: MouseEvent<HTMLDivElement>, msg: Message) => void;
  onTap: (msg: Message) => void;
  onAcceptInfoReq: (reqType: InfoRequestType) => void;
  onDeclineInfoReq: (reqType: InfoRequestType) => void;
  onOpenImage: (url: string) => void;
  onClearReaction: (msgId: string) => void;
};

export function ChatMessageRow({
  msg,
  currentUserId,
  meta,
  reaction,
  swipeOffsetX,
  isSwiping,
  myUnread,
  ackedReqTypes,
  declinedReqTypes,
  onMsgTouchStart,
  onMsgTouchMove,
  onMsgTouchEnd,
  onMsgMouseDown,
  onContextMenu,
  onTap,
  onAcceptInfoReq,
  onDeclineInfoReq,
  onOpenImage,
  onClearReaction,
}: ChatMessageRowProps) {
  const isMe = msg.sender_id === currentUserId;
  const {
    time, isCard, isSticker, stickerIdx, isReply, replyData,
    isInfoReqMsg, isInfoAckMsg, isInfoDeclineMsg,
  } = meta;
  const arrowVisible = isSwiping && Math.abs(swipeOffsetX) > 15;
  const arrowOpacity = Math.min(Math.abs(swipeOffsetX) / 55, 1);

  return (
    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} relative`}>
      {arrowVisible && (
        <div className="absolute inset-y-0 flex items-center pointer-events-none z-10"
          style={{ [swipeOffsetX > 0 ? 'left' : 'right']: 0, opacity: arrowOpacity }}>
          <span className="text-2xl select-none">↩️</span>
        </div>
      )}
      <div
        className={`flex items-end gap-1 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
        data-msg-id={msg.id}
        style={{
          transform: `translateX(${swipeOffsetX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.2s ease-out',
          touchAction: 'pan-y',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        } as CSSProperties}
        onTouchStart={(e) => onMsgTouchStart(e, msg)}
        onTouchMove={(e) => onMsgTouchMove(e, msg)}
        onTouchEnd={(e) => onMsgTouchEnd(e, msg)}
        onTouchCancel={(e) => onMsgTouchEnd(e, msg)}
        onMouseDown={(e) => onMsgMouseDown(e, msg)}
        onContextMenu={(e) => onContextMenu(e, msg)}
        onClick={() => onTap(msg)}>

        {isSticker && stickerIdx >= 0 && stickerIdx < STICKER_COUNT ? (
          <div className="flex flex-col items-center select-none">
            <StickerSVG idx={stickerIdx} size={160} />
            <span className="text-[10px] text-gray-400 mt-0.5">{STICKER_LABELS[stickerIdx]}</span>
          </div>
        ) : (
        <div className={`max-w-[72%] rounded-2xl overflow-hidden chat-bubble ${isMe ? 'chat-bubble-me bg-cyan-500 text-white rounded-br-md' : 'chat-bubble-other bg-white text-gray-900 rounded-bl-md shadow-sm'}`}>
          {isCard ? (
            <div className="px-4 py-3">
              <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isMe ? 'text-cyan-100' : 'text-cyan-600'}`}>📱 연락처</p>
              {parseContactCard(msg.content!).map((line, i) => {
                const val = line.split(': ').slice(1).join(': ');
                return (
                  <div key={line || String(i)} className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold flex-1">{line}</p>
                    <button onClick={() => navigator.clipboard?.writeText(val)}
                      className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold transition-all ${isMe ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                      복사
                    </button>
                  </div>
                );
              })}
            </div>
          ) : isReply && replyData ? (
            <div className="pt-2 pb-0 px-0">
              <div className={`mx-2 mb-1 rounded-xl px-3 py-1.5 text-[11px] leading-snug border-l-[3px] ${isMe ? 'bg-white/15 border-white/50 text-white/80' : 'bg-gray-100 border-cyan-400 text-gray-500'}`}>
                {replyData.quote}
              </div>
              <p className="px-4 pb-2 text-sm leading-relaxed">{replyData.text}</p>
            </div>
          ) : isInfoReqMsg ? (() => {
            const reqType = parseInfoReqType(msg.content!);
            const alreadyAcked    = ackedReqTypes.has(reqType);
            const alreadyDeclined = declinedReqTypes.has(reqType);
            const responded = alreadyAcked || alreadyDeclined;
            return (
              <div className="px-4 py-3 space-y-2">
                <p className={`text-[10px] font-black uppercase tracking-wide ${isMe ? 'text-cyan-100' : 'text-amber-600'}`}>
                  {reqType === 'birthday' ? '🎂 생일 요청' : '📱 전화번호 요청'}
                </p>
                <p className="text-xs leading-relaxed">
                  {isMe
                    ? (reqType === 'birthday' ? '생일을 알려달라고 요청했어요' : '전화번호를 알려달라고 요청했어요')
                    : (reqType === 'birthday' ? '상대방이 생일을 알고 싶어해요' : '상대방이 전화번호를 알고 싶어해요')}
                </p>
                {!isMe && !responded && (
                  <div className="flex gap-2 pt-0.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); onAcceptInfoReq(reqType); }}
                      className="flex-1 py-1.5 bg-cyan-500 text-white rounded-xl text-xs font-bold hover:bg-cyan-600 active:scale-95 transition-all">
                      ✓ 수락
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeclineInfoReq(reqType); }}
                      className="flex-1 py-1.5 bg-gray-200 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-300 active:scale-95 transition-all">
                      ✕ 거절
                    </button>
                  </div>
                )}
                {!isMe && alreadyAcked    && <p className="text-[10px] text-cyan-400 font-bold">✓ 수락했습니다</p>}
                {!isMe && alreadyDeclined && <p className="text-[10px] text-gray-400">거절했습니다</p>}
                {isMe  && alreadyAcked    && <p className="text-[10px] text-cyan-400 font-bold">✓ 상대방이 수락했어요</p>}
                {isMe  && alreadyDeclined && <p className="text-[10px] text-gray-400">상대방이 거절했어요</p>}
                {isMe  && !responded      && <p className="text-[10px] text-gray-400 italic">답변 대기 중…</p>}
              </div>
            );
          })() : isInfoAckMsg ? (() => {
            const { type, value } = parseInfoAckData(msg.content!);
            return (
              <div className="px-4 py-3 space-y-1.5">
                <p className={`text-[10px] font-black uppercase tracking-widest ${isMe ? 'text-cyan-100' : 'text-cyan-600'}`}>
                  {type === 'birthday' ? '🎂 생일 공유' : '📱 전화번호 공유'}
                </p>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold flex-1">{value}</p>
                  <button
                    onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(value); }}
                    className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold transition-all ${isMe ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    복사
                  </button>
                </div>
              </div>
            );
          })() : isInfoDeclineMsg ? (
            <div className="px-4 py-3">
              <p className="text-xs text-center opacity-60">
                {isMe
                  ? (parseInfoReqType(msg.content!) === 'birthday' ? '생일 공유를 거절했습니다' : '전화번호 공유를 거절했습니다')
                  : (parseInfoReqType(msg.content!) === 'birthday' ? '상대방이 생일 공유를 거절했어요' : '상대방이 전화번호 공유를 거절했어요')}
              </p>
            </div>
          ) : msg.image_url ? (
            <img
              src={msg.image_url} alt="이미지"
              loading="lazy"
              className="max-w-[240px] w-full object-contain cursor-pointer active:opacity-80"
              onClick={(e) => { e.stopPropagation(); onOpenImage(msg.image_url!); }} />
          ) : (
            <p className="px-4 py-2 text-sm leading-relaxed">{msg.content}</p>
          )}
        </div>
        )}
        <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} self-end mb-0.5 shrink-0`}>
          {isMe && myUnread && (
            <span className="text-[11px] font-black text-yellow-400 leading-none mb-0.5">1</span>
          )}
          <span className="text-[10px] text-gray-400 whitespace-nowrap">{time}</span>
        </div>
      </div>
      {reaction && (
        <button
          onClick={() => onClearReaction(msg.id)}
          className={`mt-0.5 text-base px-2 py-0.5 rounded-full border shadow-sm bg-white transition-all active:scale-95 ${isMe ? 'mr-8' : 'ml-8'}`}>
          {reaction}
        </button>
      )}
    </div>
  );
}

export default ChatMessageRow;
