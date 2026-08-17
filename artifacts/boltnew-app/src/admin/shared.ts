import { type Dispatch, type SetStateAction } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';
export type { GroupChat, GroupMessage, GroupParticipant, SignalSend } from '../types/app';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type AppSettings = Database['public']['Tables']['app_settings']['Row'] & {
  admin_password_set?: boolean;
  test_password_set?: boolean;
  reset_password_set?: boolean;
};
export type SessionHistory = Database['public']['Tables']['session_history']['Row'];
export type Like = Database['public']['Tables']['likes']['Row'];
export type Chat = Database['public']['Tables']['chats']['Row'];
export type Message = Database['public']['Tables']['messages']['Row'];
export type AnonymousReport = Database['public']['Tables']['anonymous_reports']['Row'];

export const ADMIN_SESSION_KEY = 'admin_session_v1';
export const ADMIN_TOKEN_KEY = 'admin_token_v1';
export const ADMIN_PW_KEY = 'admin_pw_v1';
export const MAX_ADMIN_MESSAGES = 5_000;
export const MAX_ADMIN_GROUP_MESSAGES = 1_000;
export const MAX_ADMIN_GROUP_PARTICIPANTS = 2_000;
export const MAX_ADMIN_SIGNAL_SENDS = 1_000;

export function withAdminImageToken(url: string): string {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  if (!token || !url.startsWith('/api/db/storage-image')) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}adminToken=${encodeURIComponent(token)}`;
}

// ─── api-server 직접 호출 헬퍼 ───────────────────────────────────────────────
// Supabase 직접 업데이트는 api-server 인메모리 스토어를 갱신하지 않음 →
// 회식시작·잠금제어·전체초기화 등 유저에게 즉시 반영돼야 하는 작업은
// Supabase 업데이트 후 api-server RPC도 함께 호출해야 함.
export const ADMIN_API = '/api/db';

export interface AdminSession { phone: string; authedAt: number; }

export function setAdminToken(token: string | null) {
  if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
  else localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export function loadAdminSession(): AdminSession | null {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AdminSession;
    if (Date.now() - s.authedAt > 86400000 * 30) { localStorage.removeItem(ADMIN_SESSION_KEY); return null; }
    return s;
  } catch { return null; }
}

export function getAdminPassword(): string {
  return localStorage.getItem(ADMIN_PW_KEY) ?? '';
}

/** 저장된 비밀번호로 adminToken 재발급 — redeploy·비밀번호 변경 후 RPC 403 방지 */
export async function refreshAdminToken(): Promise<boolean> {
  const password = getAdminPassword();
  const session = loadAdminSession();
  if (!password || !session) return false;
  try {
    const { data, error } = await supabase.rpc('admin_create_session', {
      p_phone: session.phone,
      p_admin_password: password,
    });
    if (!error && typeof data === 'string' && data) {
      setAdminToken(data);
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

export async function adminApiRpc(name: string, args: Record<string, unknown>): Promise<void> {
  let tokenRefreshed = false;
  let lastErr: Error | null = null;
  // 설정 저장은 체감 지연이 치명적 — 짧은 재시도. 대형 리셋만 여유 있게.
  const maxAttempts = name === 'admin_update_settings' || name === 'admin_toggle_session' ? 3 : 5;
  const baseDelay = name === 'admin_update_settings' || name === 'admin_toggle_session' ? 400 : 1200;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
    const password = getAdminPassword() || String(args.p_admin_password ?? '');
    try {
      const res = await fetch(`${ADMIN_API}/rpc/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...args, adminToken: token, p_admin_password: password }),
        signal: AbortSignal.timeout(12_000),
      });
      if (res.status === 503 && attempt < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, baseDelay * (attempt + 1)));
        continue;
      }
      if (res.status === 403) {
        if (!tokenRefreshed && await refreshAdminToken()) {
          tokenRefreshed = true;
          continue;
        }
        throw new Error('관리자 세션이 만료되었습니다. 로그아웃 후 다시 로그인해 주세요.');
      }
      if (!res.ok) throw new Error(`api-server RPC ${name} 오류: HTTP ${res.status}`);
      const json = (await res.json()) as { data: unknown; error: { message: string } | null };
      if (json.error) throw new Error(json.error.message);
      return;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      const retryable = /503|fetch|network|abort|timeout/i.test(lastErr.message);
      if (retryable && attempt < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, baseDelay * (attempt + 1)));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr ?? new Error(`api-server RPC ${name} failed`);
}

/** 설정 패치 — RPC 단일 경로 (이중 쓰기/전체 SELECT 제거 → 저장 체감 지연 해소) */
export async function patchAdminSettings(
  payload: Record<string, unknown>,
  setSettings: Dispatch<SetStateAction<AppSettings | null>>,
): Promise<void> {
  setSettings(prev => {
    if (!prev) return prev;
    const next = { ...prev, ...payload, updated_at: new Date().toISOString() } as AppSettings;
    if (typeof payload.admin_password === 'string' && payload.admin_password.trim()) next.admin_password_set = true;
    if (typeof payload.test_password === 'string' && payload.test_password.trim()) next.test_password_set = true;
    if (typeof payload.reset_password === 'string' && payload.reset_password.trim()) next.reset_password_set = true;
    delete (next as { admin_password?: string }).admin_password;
    delete (next as { test_password?: string }).test_password;
    delete (next as { reset_password?: string }).reset_password;
    return next;
  });
  await adminApiRpc('admin_update_settings', { p_payload: payload });
  if (typeof payload.admin_password === 'string' && payload.admin_password.trim()) {
    localStorage.setItem(ADMIN_PW_KEY, payload.admin_password);
    await refreshAdminToken();
  }
}

/** api-server /op SELECT — 인메모리 데이터 직접 조회 (Supabase KV가 아닌 api-server 스토어) */
export async function adminApiSelect<T>(
  table: string,
  orderBy?: Array<{ column: string; ascending: boolean }>,
  limit?: number,
): Promise<{ data: T[] | null }> {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
  const body: Record<string, unknown> = { table, op: 'select', adminToken: token };
  if (orderBy) body.orders = orderBy.map(({ column, ascending }) => ({ col: column, asc: ascending }));
  if (limit != null) body.limit = limit;
  try {
    const res = await fetch(`${ADMIN_API}/op`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { data: null };
    const json = await res.json() as { data: T[] | null; error: unknown };
    return { data: json.data ?? [] };
  } catch {
    return { data: null };
  }
}

/** api-server /op 호출 — INSERT/UPDATE/DELETE를 인메모리 + SSE broadcast + 영속화 */
export async function adminApiOp(
  table: string,
  op: 'insert' | 'update' | 'delete',
  payload: Record<string, unknown>,
  filters?: Array<{ col: string; type: string; value: unknown }>,
): Promise<void> {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
  const body: Record<string, unknown> = { table, op, payload, adminToken: token };
  if (filters) body.filters = filters;
  const res = await fetch(`${ADMIN_API}/op`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`api-server /op ${op}:${table} 오류: HTTP ${res.status}`);
  const json = (await res.json()) as { data: unknown; error: { message: string } | null };
  if (json.error) throw new Error(json.error.message);
}

// Local mock: admin client is the same as the regular client
export const adminSupabase = supabase;

export interface DbHealthData {
  persistErrors: number;
  recentErrors: { table: string; time: number; msg: string }[];
  inMemory: { messages: number; likes: number };
  db: { messages: number; likes: number };
  sseConnections: number;
  pinPool: { remaining: number; total: number };
  alarms: string[];
  ok: boolean;
  checkedAt: string;
}
