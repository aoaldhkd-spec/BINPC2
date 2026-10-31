/** Explicitly opt in to legacy HeartNow, independently of event recruitment. */
export function heartNowPublicAccess() {
  return process.env.HEARTNOW_PUBLIC_ACCESS === '1';
}

export function isHeartNowPublicRequest(method: string, path: string) {
  if (!heartNowPublicAccess()) return false;
  const route = path.toLowerCase().replace(/\/+$/, '');
  if (method === 'GET') return [
    '/api/db/ready', '/api/db/events', '/api/db/unread-counts',
    '/api/db/storage-image', '/api/db/push/vapid-key',
  ].includes(route);
  if (method !== 'POST') return false;
  return [
    '/api/db/halloween-cards', '/api/db/op', '/api/db/by-pin', '/api/db/auth/login', '/api/db/auth/sse-token',
    '/api/db/storage-upload', '/api/db/storage-remove',
    '/api/db/push/subscribe', '/api/db/push/unsubscribe',
    '/api/db/rpc/verify_panel_password',
  ].includes(route);
}
