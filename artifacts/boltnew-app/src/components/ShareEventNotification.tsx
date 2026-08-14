import { CheckCircle, X, XCircle } from 'lucide-react';

export type ShareEventNotificationData = {
  type: 'accepted' | 'rejected';
  fromUserId: string;
};

interface ShareEventNotificationProps {
  notification: ShareEventNotificationData;
  nickname: string;
  onClose: () => void;
}

export function ShareEventNotification({
  notification,
  nickname,
  onClose,
}: ShareEventNotificationProps) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[400] w-80 max-w-[90vw]">
      <div className={`rounded-2xl shadow-2xl p-4 border-2 flex items-start gap-3 ${notification.type === 'accepted' ? 'bg-teal-50 border-teal-300' : 'bg-gray-50 border-gray-300'}`}>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${notification.type === 'accepted' ? 'bg-teal-100' : 'bg-gray-200'}`}>
          {notification.type === 'accepted' ? <CheckCircle className="w-5 h-5 text-teal-600" /> : <XCircle className="w-5 h-5 text-gray-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-black ${notification.type === 'accepted' ? 'text-teal-800' : 'text-gray-700'}`}>
            {notification.type === 'accepted' ? '연락처 공유 완료' : '연락처 공유 거부'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {notification.type === 'accepted'
              ? `${nickname}님이 연락처를 공유했습니다. 프로필에서 확인하세요.`
              : `${nickname}님이 연락처 공유를 거부하였습니다.`}
          </p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
