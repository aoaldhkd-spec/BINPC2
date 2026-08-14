import { getSseToken } from './supabase';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

export async function registerPushSub(userId: string): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
  try {
    // 알림 권한 확인 / 요청
    if (Notification.permission === 'denied') return;
    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission().catch(() => 'denied' as NotificationPermission);
      if (perm !== 'granted') return;
    }

    const swUrl = (import.meta.env.BASE_URL as string).replace(/\/$/, '') + '/sw.js';
    const reg = await navigator.serviceWorker.register(swUrl, { scope: import.meta.env.BASE_URL as string });
    await navigator.serviceWorker.ready;

    // VAPID 키 취득 (타임아웃 10초)
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    let keyRes: Response | null = null;
    try {
      keyRes = await fetch('/api/db/push/vapid-key', { signal: ctrl.signal }).catch(() => null);
    } finally {
      clearTimeout(timer); // fetch reject/throw 시에도 반드시 타이머 해제
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
    if (!sseToken) {
      console.warn('[push] SSE 토큰 없음 — 구독 등록 건너뜀');
      return;
    }
    await fetch('/api/db/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sse-token': sseToken },
      body: JSON.stringify({ userId, subscription: sub.toJSON() }),
    }).catch(() => null);
  } catch (e) {
    console.warn('[push] 등록 건너뜀:', (e as Error)?.message ?? e);
  }
}
