// Kept in memory only; credentials and SSE tickets are never persisted here.
let ticket = '';
export function setBossSseTicket(value: string) { ticket = value; }
export function bossSseTicket() { return ticket; }
export async function logoutBossAccess() {
  const response = await fetch('/api/boss-access/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (!response.ok) throw Error('로그아웃을 확인하지 못했습니다. 다시 시도해 주세요.');
  ticket = '';
  window.dispatchEvent(new Event('boss-access-changed'));
}
