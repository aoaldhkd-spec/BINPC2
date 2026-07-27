// Service Worker — 푸시 알림 수신 처리
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data;
  try { data = event.data.json(); } catch { return; }

  const options = {
    body: data.body || '',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: data.tag || 'notification',
    data: { url: data.url || '/' },
    vibrate: [100, 50, 100],
    requireInteraction: false,
    // 알림에 "이동하기" 버튼 추가
    actions: [
      { action: 'open', title: '이동하기 →' },
      { action: 'dismiss', title: '닫기' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || '범일NPC 술번개', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // '닫기' 버튼을 누른 경우 앱 전환 없이 닫기만
  if (event.action === 'dismiss') return;

  // '이동하기' 버튼 또는 알림 본문 클릭 → 앱으로 포커스/이동
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) return client.focus();
        }
        if (clients.openWindow) {
          return clients.openWindow(event.notification.data?.url || '/');
        }
      })
  );
});
