/** Prod /ready — 행사 중 하트·채팅 잠금 여부 */
export async function isFunctionsLocked(apiBase = 'https://binpc2.onrender.com/api/db') {
  const base = apiBase.replace(/\/$/, '');
  const res = await fetch(`${base}/ready`, { signal: AbortSignal.timeout(15_000) });
  const body = await res.json().catch(() => ({}));
  return body?.functions_locked === true || body?.settings?.functions_locked === true;
}

/** /op 응답이 mid-run FUNCTIONS_LOCKED 인지 (endurance·E2E 공용) */
export function isOpFunctionsLocked({ status, json } = {}) {
  return status === 403 && json?.error?.code === 'FUNCTIONS_LOCKED';
}
