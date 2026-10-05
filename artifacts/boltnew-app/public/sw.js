// BINPC2 Service Worker — PWA push + HTML network-first
const CACHE_VERSION = 'binpc2-20261005-pwa-push-v1';

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
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => caches.match(request)));
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
    self.registration.showNotification(title, {
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
    }).catch((err) => console.warn('[sw] showNotification failed:', err)),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((client) => {
          try { return new URL(client.url).origin === self.location.origin; } catch { return false; }
        });
        if (existing) {
          return existing.navigate(target).then(() => existing.focus());
        }
        return self.clients.openWindow(target);
      })
      .catch((err) => console.warn('[sw] notificationclick failed:', err)),
  );
});
