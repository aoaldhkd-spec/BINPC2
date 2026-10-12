import { useEffect, useState } from 'react';
import {
  PUSH_STATUS_EVENT, currentPushStatus, enablePushFromClick, disablePushForUser,
  getPushOptIn, registerPushSub, type PushSetupStatus,
} from '../lib/webPush';

/** One optional row in the existing profile settings — no separate permission panel. */
export function PushNotificationSettings({ userId, enabled, darkMode }: {
  userId: string | null;
  enabled: boolean;
  darkMode: boolean;
}) {
  const [checked, setChecked] = useState(false);
  const [status, setStatus] = useState<PushSetupStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const update = (event: Event) => setStatus((event as CustomEvent<PushSetupStatus>).detail);
    window.addEventListener(PUSH_STATUS_EVENT, update);
    setChecked(userId ? getPushOptIn(userId) : false);
    setStatus(currentPushStatus());
    if (enabled && userId && getPushOptIn(userId)) void registerPushSub(userId).then(setStatus);
    return () => window.removeEventListener(PUSH_STATUS_EVENT, update);
  }, [userId, enabled]);

  const onChange = (value: boolean) => {
    if (!enabled || !userId || busy) return;
    // Do not claim an opt-out worked until the server confirms removal.
    // The enable branch calls the permission API synchronously in this gesture.
    const promise = value ? enablePushFromClick(userId) : disablePushForUser(userId);
    setBusy(true);
    void promise.then(next => {
      setStatus(next);
      if (value) setChecked(true);
      else if (next.code === 'disabled') setChecked(false);
    }).finally(() => setBusy(false));
  };

  return (
    <div className={`flex flex-col gap-1.5 rounded-xl border px-3 py-3 ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'}`}>
      <label className={`flex items-center gap-2.5 cursor-pointer text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
        <input type="checkbox" aria-label="하트·1:1 채팅 알림 받기 (선택)"
          checked={checked} disabled={!enabled || !userId || busy}
          onChange={e => onChange(e.target.checked)}
          className="h-4 w-4 accent-teal-500 shrink-0" />
        <span>🔔 [선택] 하트·1:1 채팅 알림 받기</span>
      </label>
      <p className={`text-[11px] pl-7 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
        하트와 1:1 채팅을 받았을 때만 알려요. 단체채팅 알림은 보내지 않아요.
      </p>
      {checked && status && status.code !== 'ready' && (
        <p role="status" aria-live="polite" className={`text-[11px] pl-7 ${status.code === 'error' ? 'text-rose-500' : darkMode ? 'text-amber-200' : 'text-amber-700'}`}>
          {status.message}
          {status.code === 'install-required' && ' 아이폰은 Safari 공유 → 홈 화면에 추가, 안드로이드는 Chrome 앱 설치 후 아이콘으로 열어 주세요.'}
        </p>
      )}
      {checked && enabled && userId && status?.code === 'permission-required' && (
        <button type="button" disabled={busy}
          onClick={() => {
            // iOS permission prompt must run directly from this button click.
            const promise = enablePushFromClick(userId);
            setBusy(true);
            void promise.then(setStatus).finally(() => setBusy(false));
          }}
          className="ml-7 self-start rounded-lg bg-teal-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50">
          알림 권한 허용
        </button>
      )}
      {checked && status?.code === 'ready' && <p role="status" className="text-[11px] pl-7 text-teal-500">✓ 이 기기의 알림 연결 완료</p>}
      {!enabled && <p role="status" className="text-[11px] pl-7 text-amber-600">관리자가 알림 기능을 꺼 놓았습니다.</p>}
    </div>
  );
}
