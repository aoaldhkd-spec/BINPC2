import { fetchAndSetSseToken, getSseToken } from './supabase';
import { ls } from './storage';

export type PushSetupCode = 'ready' | 'disabled' | 'unsupported' | 'install-required' | 'permission-required'
  | 'blocked' | 'registering' | 'error';
export type PushSetupStatus = { code: PushSetupCode; message: string };
export const PUSH_STATUS_EVENT = 'binpc2:push-status';

const preferenceKey = (userId: string) => `binpc2-push-opt-in:${userId}`;
let inFlight: { userId: string; promise: Promise<PushSetupStatus> } | null = null;
let lastSuccess: { userId: string; endpoint: string; time: number } | null = null;

/** A new participant must explicitly opt in. Honor previously granted permissions for existing users. */
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

export function isStandaloneWebApp(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true;
}

export function currentPushStatus(): PushSetupStatus {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { code: 'unsupported', message: '이 기기/브라우저는 푸시 알림을 지원하지 않아요.' };
  }
  // Apple mobile Web Push needs Home Screen installation. Android Chromium also
  // supports browser notification prompts; installation remains preferable.
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios && !isStandaloneWebApp()) {
    return { code: 'install-required', message: '아이폰은 Safari 공유 → 홈 화면에 추가 후, BINPC2 아이콘으로 열어 알림을 허용해 주세요.' };
  }
  if (Notification.permission === 'denied') {
    return { code: 'blocked', message: '휴대폰의 BINPC2 알림 권한이 차단됐어요. 휴대폰 앱/사이트 설정에서 허용해 주세요.' };
  }
  if (Notification.permission !== 'granted') {
    return { code: 'permission-required', message: '하트·1:1 채팅 알림을 받으려면 휴대폰 알림을 허용해 주세요.' };
  }
  return { code: 'registering', message: '알림 권한 허용됨 · 서버 연결 확인 중' };
}

function publish(status: PushSetupStatus): PushSetupStatus {
  window.dispatchEvent(new CustomEvent<PushSetupStatus>(PUSH_STATUS_EVENT, { detail: status }));
  return status;
}

/** Must run synchronously from a real profile-checkbox tap/click on iOS. */
export function requestPushPermissionFromClick(): Promise<PushSetupStatus> {
  const capability = currentPushStatus();
  if (capability.code !== 'permission-required' && capability.code !== 'registering') {
    return Promise.resolve(publish(capability));
  }
  const pending = Notification.permission === 'default'
    ? Notification.requestPermission()
    : Promise.resolve(Notification.permission);
  return pending.then(permission => {
    if (permission !== 'granted') return publish(currentPushStatus());
    return publish({ code: 'registering', message: '알림 권한을 허용했어요. 프로필 등록 뒤 자동 연결됩니다.' });
  }).catch(() => publish({ code: 'error', message: '알림 권한 요청에 실패했어요. 휴대폰 알림 설정을 확인해 주세요.' }));
}

function urlBase64ToUint8Array(key: string): Uint8Array {
  const padding = '='.repeat((4 - key.length % 4) % 4);
  const value = window.atob((key + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(value, ch => ch.charCodeAt(0));
}

async function subscribeGranted(userId: string): Promise<PushSetupStatus> {
  try {
    const scope = String(import.meta.env.BASE_URL || '/');
    const swUrl = scope.replace(/\/$/, '') + '/sw.js';
    const reg = await navigator.serviceWorker.register(swUrl, { scope });
    await navigator.serviceWorker.ready;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    let keyRes: Response;
    try {
      keyRes = await fetch('/api/db/push/vapid-key', { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!keyRes.ok) throw new Error(`VAPID HTTP ${keyRes.status}`);
    const { key } = await keyRes.json() as { key?: string };
    if (!key) return publish({ code: 'error', message: '서버 알림 키가 설정되지 않았습니다. 관리자에게 알려 주세요.' });

    const expectedKey = urlBase64ToUint8Array(key);
    let sub = await reg.pushManager.getSubscription();
    if (sub?.options.applicationServerKey) {
      const oldKey = new Uint8Array(sub.options.applicationServerKey);
      if (oldKey.length !== expectedKey.length || oldKey.some((value, index) => value !== expectedKey[index])) {
        await sub.unsubscribe();
        sub = null;
      }
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: expectedKey as unknown as BufferSource,
      });
    }
    if (!sub) throw new Error('NO_SUBSCRIPTION');
    if (lastSuccess?.userId === userId && lastSuccess.endpoint === sub.endpoint
      && Date.now() - lastSuccess.time < 3 * 60000) {
      return publish({ code: 'ready', message: '🔔 이 기기의 하트·1:1 채팅 알림이 연결돼 있어요.' });
    }

    // A newly registered participant may not have an SSE token yet.
    if (!getSseToken()) await fetchAndSetSseToken(userId);
    const token = getSseToken();
    if (!token) return publish({ code: 'error', message: '로그인 연결 중이에요. 잠시 후 알림 등록을 다시 시도해 주세요.' });

    const post = new AbortController();
    const postTimer = setTimeout(() => post.abort(), 10000);
    let response: Response;
    try {
      response = await fetch('/api/db/push/subscribe', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'x-sse-token': token },
        body: JSON.stringify({ userId, subscription: sub.toJSON() }),
        signal: post.signal,
      });
    } finally {
      clearTimeout(postTimer);
    }
    if (!response.ok) return publish({
      code: 'error',
      message: response.status === 401
        ? '로그인 인증이 갱신 중이에요. 다시 연결해 주세요.'
        : `서버 알림 등록 실패 (${response.status}). 다시 시도해 주세요.`,
    });
    lastSuccess = { userId, endpoint: sub.endpoint, time: Date.now() };
    return publish({ code: 'ready', message: '🔔 이 기기의 하트·1:1 채팅 알림이 연결돼 있어요.' });
  } catch (error) {
    console.warn('[push] subscribe failed:', error instanceof Error ? error.message : 'unknown');
    return publish({ code: 'error', message: '휴대폰 알림 연결 실패. 인터넷·앱 권한을 확인하고 다시 시도해 주세요.' });
  }
}

/** Background registration never requests permission. Reconnect only when already granted. */
export function registerPushSub(userId: string): Promise<PushSetupStatus> {
  if (!userId) return Promise.resolve(currentPushStatus());
  if (!getPushOptIn(userId)) return Promise.resolve(currentPushStatus());
  const capability = currentPushStatus();
  if (capability.code !== 'registering') return Promise.resolve(publish(capability));
  if (inFlight?.userId === userId) return inFlight.promise;
  // Prevent account-switch races from subscribing the same endpoint for two users.
  if (inFlight) return inFlight.promise.then(() => registerPushSub(userId));
  const promise = subscribeGranted(userId).finally(() => {
    if (inFlight?.promise === promise) inFlight = null;
  });
  inFlight = { userId, promise };
  return promise;
}

/** Existing users can retry in Settings without a separate onboarding step. */
export function enablePushFromClick(userId: string): Promise<PushSetupStatus> {
  if (!userId) return Promise.resolve(publish({ code: 'error', message: '프로필을 먼저 등록해 주세요.' }));
  setPushOptIn(userId, true);
  const status = requestPushPermissionFromClick(); // Synchronous call preserves user gesture
  return status.then(result => result.code === 'registering' ? registerPushSub(userId) : result);
}

/** Disabling alerts removes this user's endpoint from the server before reporting success. */
export async function disablePushForUser(userId: string): Promise<PushSetupStatus> {
  if (!userId) return publish({ code: 'error', message: '프로필을 확인할 수 없어요.' });
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushOptIn(userId, false);
      return publish({ code: 'disabled', message: '이 기기의 알림을 끈 상태예요.' });
    }
    const scope = String(import.meta.env.BASE_URL || '/');
    const reg = await navigator.serviceWorker.getRegistration(scope);
    const subscription = await reg?.pushManager.getSubscription();
    if (subscription) {
      if (!getSseToken()) await fetchAndSetSseToken(userId);
      const token = getSseToken();
      if (!token) throw new Error('SSE_TOKEN_NOT_READY');
      const response = await fetch('/api/db/push/unsubscribe', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'x-sse-token': token },
        body: JSON.stringify({ userId, endpoint: subscription.endpoint }),
      });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
    }
    // Keep the browser endpoint for other profiles on a shared device.
    setPushOptIn(userId, false);
    if (lastSuccess?.userId === userId) lastSuccess = null;
    return publish({ code: 'disabled', message: '이 기기의 하트·1:1 채팅 알림을 껐어요.' });
  } catch (error) {
    console.warn('[push] unsubscribe failed:', error instanceof Error ? error.message : 'unknown');
    return publish({ code: 'error', message: '알림 끄기를 서버에 반영하지 못했어요. 다시 시도해 주세요.' });
  }
}
