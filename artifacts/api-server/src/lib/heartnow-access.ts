let currentSession:()=>Record<string,unknown>=()=>({});
export function configureHeartNowSession(read:typeof currentSession){currentSession=read;}
/** One-night legacy access follows the existing cycle; recruitment stays protected. */
export function todayHeartNowSession(settings:Record<string,unknown>,now=new Date()){
  const start=Date.parse(String(settings.event_cycle_started_at??''));
  const begins=Date.parse('2026-10-31T17:00:00+09:00'),expires=Date.parse('2026-11-01T17:00:00+09:00');
  return !!settings.event_cycle_archive_id&&settings.event_cycle_reset_complete!==true&&start>=begins&&start<Date.parse('2026-11-01T01:00:00+09:00')&&now.getTime()>=start&&now.getTime()<expires;
}
export function heartNowPublicAccess() {
  const settings=currentSession(),now=new Date();
  // Show the original waiting screen after a completed reset; its existing
  // admission gate still waits for the operator's actual session start.
  const waiting=settings.event_cycle_reset_complete===true&&now.getTime()>=Date.parse('2026-10-31T17:00:00+09:00')&&now.getTime()<Date.parse('2026-11-01T17:00:00+09:00');
  return process.env.HEARTNOW_PUBLIC_ACCESS === '1'||todayHeartNowSession(settings,now)||waiting;
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
