/** Prod /ready — 행사 중 하트·채팅 잠금 여부 */
export async function isFunctionsLocked(apiBase = 'https://binpc2.onrender.com/api/db') {
  const base = apiBase.replace(/\/$/, '');
  const res = await fetch(`${base}/ready`, { signal: AbortSignal.timeout(15_000) });
  const body = await res.json().catch(() => ({}));
  return body?.functions_locked === true || body?.settings?.functions_locked === true;
}
