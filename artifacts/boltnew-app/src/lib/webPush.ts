import { fetchAndSetSseToken, getSseToken } from './supabase';
import { ls } from './storage';

export type PushSetupCode =
  | 'ready' | 'unsupported' | 'install-required' | 'permission-required'
  | 'blocked' | 'registering' | 'error';
export type PushSetupStatus = { code: PushSetupCode; message: string };
export const PUSH_STATUS_EVENT = 'binpc2:push-status';

let lastSuccess: { userId: string; endpoint: string; time: number } | null = null;
let inFlight: { userId: string; promise: Promise<PushSetupStatus> } | null = null;

const preferenceKey = (userId: string) => `binpc2-push-opt-in:${userId}`;
/** Existing previously-authorized devices stay opted in; new registrations default OFF. */
export function getPushOptIn(userId: string): boolean {
  if (!userId) return false;
  const stored = ls.getItem(preferenceKey(userId));
  if (stored === '1') return true;
  if (stored === '0') return false;
  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
}

export function setPushOptIn(userId: string, enabled: boolean): void {
  if (userId) ls.setItem(preferenceKey(userId), enabled ? '1' : '0');
}

/** Only call this directly inside a checked opt-in or button click (iOS gesture requirement). */
export function requestPushPermissionFromClick(): Promise<PushSetupStatus> {
  const capability = currentPushStatus();
  if (capability.code !== 'permission-required' && capability.code !== 'registering') {
    return Promise.resolve(publish(capability));
  }
  if (Notification.permission === 'granted') return Promise.resolve(publish(capability));
  const requested = Notification.requestPermission();
  return requested.then(() => publish(currentPushStatus()))
    .catch(() => publish({ code: 'error', message: '알림 허용 요청에 실패했습니다. 앱 설정을 확인해 주세요.' }));
}


export function isStandaloneWebApp(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

export function currentPushStatus(): PushSetupStatus {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { code: 'unsupported', message: '이 브라우저는 휴대폰 푸시 알림을 지원하지 않습니다.' };
  }
  if (!isStandaloneWebApp()) {
    return { code: 'install-required', message: '휴대폰 홈 화면에 BINPC2를 추가한 뒤, 설치된 아이콘으로 열어 주세요.' };
  }
  if (Notification.permission === 'denied') {
    return { code: 'blocked', message: '휴대폰 또는 BINPC2 앱 설정에서 알림 권한을 허용해 주세요.' };
  }
  if (Notification.permission !== 'granted') {
    return { code: 'permission-required', message: '하트·1:1 채팅 알림을 받으려면 아래 버튼을 눌러 허용해 주세요.' };
  }
  return { code: 'registering', message: '알림 권한 허용됨 · 서버 연결을 확인해 주세요.' };
}

function publish(status: PushSetupStatus): PushSetupStatus {
  window.dispatchEvent(new CustomEvent<PushSetupStatus>(PUSH_STATUS_EVENT, { detail: status }));
  return status;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const raw = window.atob((base64String + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameKey(a: ArrayBuffer | null, b: Uint8Array): boolean {
  if (!a) return true; // Safari can omit an existing subscription's applicationServerKey.
  const key = new Uint8Array(a);
  return key.length === b.length && key.every((value, i) => value === b[i]);
}

async function subscribeGranted(userId: string): Promise<PushSetupStatus> {
  try {
    const scope = import.meta.env.BASE_URL as string;
    const swUrl = scope.replace(/\/$/, '') + '/sw.js';
    const reg = await navigator.serviceWorker.register(swUrl, { scope });
    await navigator.serviceWorker.ready;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    let keyRes: Response;
    try {
      keyRes = await fetch('/api/db/push/vapid-key', { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!keyRes.ok) throw new Error(`VAPID_HTTP_${keyRes.status}`);
    const { key } = await keyRes.json() as { key?: string };
    if (!key) {
      return publish({ code: 'error', message: '서버의 휴대폰 알림 설정이 준비되지 않았습니다. 관리자에게 알려 주세요.' });
    }

    const serverKey = urlBase64ToUint8Array(key);
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub.options.applicationServerKey, serverKey)) {
      await sub.unsubscribe(); // The deployed VAPID key changed; old subscription cannot receive pushes.
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: serverKey as unknown as BufferSource,
      });
    }
    if (!sub) throw new Error('NO_SUBSCRIPTION');
    if (!getPushOptIn(userId)) return publish({ code: 'permission-required', message: '알림 받기가 꺼져 있습니다.' });
    if (lastSuccess && lastSuccess.userId === userId && lastSuccess.endpoint === sub.endpoint
      && Date.now() - lastSuccess.time < 3 * 60_000) {
      return publish({ code: 'ready', message: '이 기기의 하트·1:1 채팅 알림이 연결되어 있습니다.' });
    }

    // The old code silently returned when the SSE token had not yet loaded on first app boot.
    if (!getSseToken()) await fetchAndSetSseToken(userId);
    const token = getSseToken();
    if (!token) return publish({ code: 'error', message: '로그인 연결 중입니다. 잠시 뒤 알림 연결을 다시 눌러 주세요.' });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let response: Response;
    try {
      response = await fetch('/api/db/push/subscribe', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'x-sse-token': token },
        body: JSON.stringify({ userId, subscription: sub.toJSON() }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      return publish({
        code: 'error',
        message: response.status === 401
          ? '로그인 인증이 갱신 중입니다. 알림 연결을 다시 눌러 주세요.'
          : `서버 알림 등록에 실패했습니다 (${response.status}). 다시 시도해 주세요.`,
      });
    }
    lastSuccess = { userId, endpoint: sub.endpoint, time: Date.now() };
    return publish({ code: 'ready', message: '이 기기의 하트·1:1 채팅 알림이 연결되어 있습니다.' });
  } catch (error) {
    console.warn('[push] subscribe failed:', (error as Error)?.message ?? 'unknown');
    return publish({ code: 'error', message: '휴대폰 알림 연결에 실패했습니다. 인터넷·알림 권한을 확인한 뒤 다시 시도해 주세요.' });
  }
}

/** Background registration never opens a permission prompt. It is safe on app boot and reconnect. */
export function registerPushSub(userId: string): Promise<PushSetupStatus> {
  if (!userId) return Promise.resolve(currentPushStatus());
  if (!getPushOptIn(userId)) return Promise.resolve({ code: 'permission-required', message: '알림 받기가 꺼져 있습니다.' });
  const capability = currentPushStatus();
  if (capability.code !== 'registering') return Promise.resolve(publish(capability));
  if (inFlight?.userId === userId) return inFlight.promise;
  const promise = subscribeGranted(userId).finally(() => {
    if (inFlight?.promise === promise) inFlight = null;
  });
  inFlight = { userId, promise };
  return promise;
}

/** Must be called synchronously from a real click/tap: iOS requires user activation. */
export function enablePushFromClick(userId: string): Promise<PushSetupStatus> {
  if (!userId) return Promise.resolve(publish({ code: 'error', message: '프로필을 먼저 등록해 주세요.' }));
  setPushOptIn(userId, true);
  // Trigger the permission request before any await (Safari user activation).
  return requestPushPermissionFromClick().then(status =>
    status.code === 'registering' ? registerPushSub(userId) : status,
  );
}

/** Explicit opt-out: unlink server mapping before dropping the browser subscription. */
export async function disablePushForUser(userId: string): Promise<PushSetupStatus> {
  setPushOptIn(userId, false);
  lastSuccess = null;
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager?.getSubscription();
      if (subscription) {
        if (!getSseToken()) await fetchAndSetSseToken(userId);
        const token = getSseToken();
        if (token) {
          const res = await fetch('/api/db/push/unsubscribe', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'x-sse-token': token },
            body: JSON.stringify({ userId, endpoint: subscription.endpoint }),
          });
          if (!res.ok) throw new Error(`UNSUBSCRIBE_HTTP_${res.status}`);
        }
        await subscription.unsubscribe();
      }
    }
    return publish({ code: 'permission-required', message: '하트·1:1 채팅 휴대폰 알림을 껐습니다.' });
  } catch (error) {
    console.warn('[push] unsubscribe failed:', (error as Error)?.message ?? 'unknown');
    // The local preference stays OFF. Any server record is removed as a 404/410 on next send.
    return publish({ code: 'error', message: '서버 연결 문제로 알림 해제가 완전히 끝나지 않았습니다. 다시 꺼 주세요.' });
  }
}
