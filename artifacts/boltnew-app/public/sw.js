// Service Worker — 푸시 알림 + HTML 캐시 무효화
const CACHE_VERSION = 'binpc2-20260814q';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)),
    )).then(() => self.clients.claim()),
  );
});

// HTML 요청은 항상 네트워크 우선 — 재배포 후 구버전 HTML이 캐시되는 문제 방지
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 같은 오리진의 HTML 네비게이션 요청만 인터셉트
  if (
    url.origin === self.location.origin &&
    request.mode === 'navigate'
  ) {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(() =>
        // 오프라인이면 캐시 폴백 (없으면 브라우저 기본 처리)
        caches.match(request)
      )
    );
  }
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try { data = event.data.json(); } catch { return; }

  const title  = String(data.title  || '범일NPC 술번개');
  const body   = String(data.body   || '');
  const tag    = String(data.tag    || 'notification');
  const url    = String(data.url    || '/');

  const options = {
    body,
    icon:    '/favicon.svg',
    badge:   '/favicon.svg',
    tag,
    renotify: true,
    data:    { url },
    vibrate: [100, 50, 100],
    requireInteraction: false,
    actions: [
      { action: 'open',    title: '이동하기 →' },
      { action: 'dismiss', title: '닫기' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
      .catch((err) => console.warn('[sw] showNotification failed:', err))
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.navigate?.(targetUrl).catch?.(() => {});
            return client.focus();
          }
        }
        return self.clients.openWindow(targetUrl);
      })
      .catch((err) => console.warn('[sw] notificationclick error:', err))
  );
});
