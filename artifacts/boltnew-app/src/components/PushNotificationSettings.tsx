import { useEffect, useState } from 'react';
import {
  PUSH_STATUS_EVENT, currentPushStatus, disablePushForUser, enablePushFromClick,
  getPushOptIn, registerPushSub, type PushSetupStatus,
} from '../lib/webPush';

/** A compact checkbox in the existing profile settings; no extra onboarding page. */
export function PushNotificationSettings({ userId, enabled, darkMode }: {
  userId: string | null;
  enabled: boolean;
  darkMode: boolean;
}) {
  const [checked, setChecked] = useState(false);
  const [status, setStatus] = useState<PushSetupStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const listener = (event: Event) => setStatus((event as CustomEvent<PushSetupStatus>).detail);
    window.addEventListener(PUSH_STATUS_EVENT, listener);
    setChecked(userId ? getPushOptIn(userId) : false);
    setStatus(currentPushStatus());
    if (enabled && userId && getPushOptIn(userId)) void registerPushSub(userId).then(setStatus);
    return () => window.removeEventListener(PUSH_STATUS_EVENT, listener);
  }, [userId, enabled]);

  const toggle = (value: boolean) => {
    if (!enabled || !userId || busy) return;
    // The checked branch must request permission directly from a real user gesture.
    const pending = value ? enablePushFromClick(userId) : disablePushForUser(userId);
    setBusy(true);
    void pending.then(next => {
      setStatus(next);
      if (value) setChecked(true);
      else if (next.code === 'disabled') setChecked(false);
    }).finally(() => setBusy(false));
  };

  const advice = !enabled
    ? '관리자가 푸시 기능을 꺼 둔 상태예요.'
    : checked && status
      ? status.code === 'ready' ? '✓ 이 기기의 알림 연결 완료'
        : status.message
      : '받는 하트와 1:1 채팅만 알려요. 단체채팅 푸시는 없어요.';

  return (
    <div className={`rounded-xl border px-3 py-3 ${darkMode ? 'border-slate-600 bg-slate-800' : 'border-gray-200 bg-white'}`}>
      <label className={`flex items-center gap-2.5 text-sm font-bold cursor-pointer ${darkMode ? 'text-white' : 'text-gray-800'}`}>
        <input type="checkbox" aria-label="하트·1:1 채팅 알림 받기 (선택)"
          checked={checked} disabled={!enabled || !userId || busy}
          onChange={event => toggle(event.target.checked)}
          className="h-4 w-4 accent-teal-500 shrink-0" />
        <span>🔔 [선택] 하트·1:1 채팅 알림 받기</span>
      </label>
      <p className={`pl-7 mt-1 text-[11px] leading-relaxed ${status?.code === 'error' ? 'text-rose-500' : darkMode ? 'text-slate-300' : 'text-gray-500'}`}
        role="status" aria-live="polite">
        {advice}
      </p>
      {checked && status?.code === 'install-required' && (
        <p className={`pl-7 mt-1 text-[11px] ${darkMode ? 'text-amber-200' : 'text-amber-700'}`}>
          아이폰은 Safari 공유 → 홈 화면에 추가, 설치된 BINPC2 아이콘으로 열어 주세요.
        </p>
      )}
      {checked && enabled && userId && status && (status.code === 'error' || status.code === 'permission-required') && (
        <button type="button" disabled={busy} onClick={() => {
          const pending = enablePushFromClick(userId);
          setBusy(true);
          void pending.then(setStatus).finally(() => setBusy(false));
        }} className="ml-7 mt-2 rounded-lg bg-teal-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50">
          알림 연결 다시 시도
        </button>
      )}
    </div>
  );
}
