import { useEffect } from 'react';
import type { HeartType } from '../lib/constants';
import { heartMeta } from '../lib/constants';
import { incomingInterestToast, MUTUAL_HEART_TOAST } from '../lib/heart-toast';
import { SIGNAL_EMOJI } from '../lib/signal-match';

export type BottomNotificationData = {
  type: 'heart' | 'chat' | 'message' | 'contact' | 'system' | 'signal';
  nickname?: string;
  message?: string;
  heartType?: HeartType;
  heartMutual?: boolean;
  signalKind?: 'received' | 'mutual' | 'mission';
  profileId?: string;
};

interface BottomNotificationProps {
  notification: BottomNotificationData;
  onClose: () => void;
  onGoToStatus: () => void;
  onGoToChats: () => void;
  onGoToSignal?: () => void;
  onViewProfile?: () => void;
  onStartChat?: () => void;
}

export function BottomNotification({
  notification,
  onClose,
  onGoToStatus,
  onGoToChats,
  onGoToSignal,
  onViewProfile,
  onStartChat,
}: BottomNotificationProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 5_000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- onClose is an inline setter; restart only when toast content changes
  }, [notification]);

  return (
    <div className="fixed bottom-[calc(0.75rem+var(--participant-tabbar,0px))] left-0 right-0 z-[10050] flex justify-center px-3 min-[360px]:px-4 pointer-events-none">
      <div className={`max-w-full px-3.5 min-[360px]:px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2.5 pointer-events-auto cursor-pointer ${notification.type === 'heart' || notification.type === 'signal' ? 'bg-rose-500' : notification.type === 'contact' ? 'bg-emerald-500' : notification.type === 'system' ? 'bg-amber-600' : 'bg-cyan-600'}`}>
        <span className="text-lg">{notification.type === 'signal' ? SIGNAL_EMOJI : notification.type === 'heart' ? (notification.heartType ? heartMeta(notification.heartType).emoji : '❤️') : notification.type === 'contact' ? '📱' : notification.type === 'system' ? '💛' : '💬'}</span>
        <div className="flex-1 min-w-0">
          {notification.type === 'heart' && (
            <>
              <p className="text-sm font-bold text-white">
                {notification.message
                  ?? `${notification.nickname || '누군가'}님이 ${notification.heartType ? heartMeta(notification.heartType).label : '하트'}를 보냈습니다!`}
              </p>
              {notification.heartMutual && onStartChat ? (
                <button onClick={onStartChat} className="text-xs text-white/90 bg-white/20 px-2 py-0.5 rounded-lg font-semibold mt-0.5">채팅 시작하기</button>
              ) : (
                <button onClick={onGoToStatus} className="text-xs text-white/80 underline">내 상태 탭으로 이동</button>
              )}
            </>
          )}
          {notification.type === 'chat' && (
            <>
              <p className="text-sm font-bold text-white">{notification.message ?? (notification.nickname ? `${notification.nickname}님이 채팅방을 열었어요` : '채팅방을 열었어요')}</p>
              {!notification.message && (
                <button onClick={onGoToChats} className="text-xs text-white/80 underline">채팅 탭으로 이동</button>
              )}
            </>
          )}
          {notification.type === 'message' && (
            <>
              <p className="text-sm font-bold text-white">새로운 채팅이 왔습니다.</p>
              <button onClick={onGoToChats} className="text-xs text-white/90 bg-white/20 px-2 py-0.5 rounded-lg font-semibond mt-0.5">채팅탭</button>
            </>
          )}
          {notification.type === 'contact' && (
            <>
              <p className="text-sm font-bold text-white">{notification.nickname}님이 연락처를 공유했습니다!</p>
              <button onClick={onGoToStatus} className="text-xs text-white/80 underline">내 상태 탭에서 확인</button>
            </>
          )}
          {notification.type === 'system' && (
            <p className="text-sm font-bold text-white">{notification.message ?? '알림'}</p>
          )}
          {notification.type === 'signal' && (
            <>
              <p className="text-sm font-bold text-white">
                {notification.message
                  ?? (notification.signalKind === 'mutual'
                    ? MUTUAL_HEART_TOAST
                    : incomingInterestToast(notification.nickname || '누군가'))}
              </p>
              {notification.signalKind === 'mutual' && onStartChat && (
                <button onClick={onStartChat} className="text-xs text-white/90 bg-white/20 px-2 py-0.5 rounded-lg font-semibold mt-0.5">채팅 시작하기</button>
              )}
              {notification.signalKind === 'received' && onViewProfile && (
                <button onClick={onViewProfile} className="text-xs text-white/90 bg-white/20 px-2 py-0.5 rounded-lg font-semibold mt-0.5">프로필 보기</button>
              )}
              {notification.signalKind === 'mission' && onGoToSignal && (
                <button onClick={onGoToSignal} className="text-xs text-white/90 bg-white/20 px-2 py-0.5 rounded-lg font-semibold mt-0.5">시그널 보기</button>
              )}
            </>
          )}
        </div>
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="touch-target text-white/60 hover:text-white text-lg flex-shrink-0 flex items-center justify-center">×</button>
      </div>
    </div>
  );
}
