// Service Worker — 푸시 알림 수신 처리 (견고한 예외처리 포함)

// SW 설치 즉시 활성화 (대기 없이)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
        // 이미 열린 탭이 있으면 포커스
        for (const client of clientList) {
          if ('focus' in client) {
            client.navigate?.(targetUrl).catch?.(() => {});
            return client.focus();
          }
        }
        // 없으면 새 탭 열기
        return self.clients.openWindow(targetUrl);
      })
      .catch((err) => console.warn('[sw] notificationclick error:', err))
  );
});
