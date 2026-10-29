// BINPC2 Service Worker — PWA push + HTML network-first
const CACHE_VERSION = 'binpc2-20261029-boss-gate-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin === self.location.origin && request.mode === 'navigate') {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><p>접근 권한 확인을 위해 인터넷 연결 후 다시 열어 주세요.</p>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })));
  }
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data;
  try { data = event.data.json(); } catch { return; }

  const title = String(data.title || '범일NPC 술번개');
  const body = String(data.body || '');
  const tag = String(data.tag || `notification-${Date.now()}`);
  const url = String(data.url || '/');

  event.waitUntil(
    fetch('/api/boss-access', { credentials: 'same-origin', cache: 'no-store' }).then(async response => {
      if (!response.ok) return;
      const access = await response.json();
      if (access.locked !== false) return; // No external test notifications while the full-site lock is on.
      return self.registration.showNotification(title, {
      body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag,
      renotify: true,
      silent: false,
      vibrate: [120, 60, 160],
      data: { url },
      requireInteraction: false,
      actions: [
        { action: 'open', title: '바로 보기' },
        { action: 'dismiss', title: '닫기' },
      ],
    }); }).catch(() => {}),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  // Only local BINPC2 routes may be opened from a push payload.
  const destination = new URL(event.notification.data?.url || '/', self.location.origin);
  const target = destination.origin === self.location.origin
    ? destination.href : new URL('/', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (clients) => {
        const appClient = clients.find((client) => {
          try {
            const url = new URL(client.url);
            return url.origin === self.location.origin
              && !url.pathname.startsWith('/admin') && !url.pathname.startsWith('/test');
          } catch { return false; }
        });
        if (!appClient) return self.clients.openWindow(target);
        try {
          const navigated = await appClient.navigate(target);
          return (navigated || appClient).focus();
        } catch {
          // On mobile platforms where navigate() is not available, open the
          // exact deep link rather than focusing a stale chat screen.
          return self.clients.openWindow(target);
        }
      })
      .catch((err) => console.warn('[sw] notificationclick failed:', err)),
  );
});
