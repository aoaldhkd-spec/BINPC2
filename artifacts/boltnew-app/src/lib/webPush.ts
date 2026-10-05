import { getSseToken } from './supabase';

let armedPermissionHandler: ((event: PointerEvent) => void) | null = null;

function isStandaloneWebApp(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

async function subscribeGranted(userId: string): Promise<void> {
  const swUrl = (import.meta.env.BASE_URL as string).replace(/\/$/, '') + '/sw.js';
  const reg = await navigator.serviceWorker.register(swUrl, { scope: import.meta.env.BASE_URL as string });
  await navigator.serviceWorker.ready;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  let keyRes: Response | null = null;
  try {
    keyRes = await fetch('/api/db/push/vapid-key', { signal: ctrl.signal }).catch(() => null);
  } finally {
    clearTimeout(timer);
  }
  if (!keyRes?.ok) return;
  const { key } = await keyRes.json() as { key?: string };
  if (!key) return;

  let sub = await reg.pushManager.getSubscription().catch(() => null);
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as unknown as ArrayBuffer,
    }).catch(() => null);
  }
  if (!sub) return;

  const sseToken = getSseToken();
  if (!sseToken) return;
  await fetch('/api/db/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sse-token': sseToken },
    body: JSON.stringify({ userId, subscription: sub.toJSON() }),
  }).catch(() => null);
}

function armPermissionOnNextTap(userId: string): void {
  if (armedPermissionHandler) {
    window.removeEventListener('pointerup', armedPermissionHandler, true);
    armedPermissionHandler = null;
  }
  const handler = () => {
    window.removeEventListener('pointerup', handler, true);
    if (armedPermissionHandler === handler) armedPermissionHandler = null;
    void Notification.requestPermission()
      .then(permission => permission === 'granted' ? subscribeGranted(userId) : undefined)
      .catch(() => {});
  };
  armedPermissionHandler = handler;
  window.addEventListener('pointerup', handler, { capture: true, once: true });
}

export async function registerPushSub(userId: string): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
  // User requested BINPC2 app-style notifications, not browser-tab/Chrome-branded push.
  // Only subscribe when launched as an installed PWA/home-screen web app.
  if (!isStandaloneWebApp()) return;
  try {
    if (Notification.permission === 'denied') return;
    if (Notification.permission === 'default') {
      // iPhone installed web apps and some browsers require a direct user gesture.
      armPermissionOnNextTap(userId);
      return;
    }
    await subscribeGranted(userId);
  } catch (e) {
    console.warn('[push] 등록 건너뜀:', (e as Error)?.message ?? e);
  }
}
