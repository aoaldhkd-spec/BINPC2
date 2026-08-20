import { supabase } from './supabase';

export async function verifyPanelPassword(
  kind: 'reset' | 'admin' | 'test',
  password: string,
): Promise<'ok' | 'bad' | 'limited'> {
  try {
    const { data, error } = await supabase.rpc('verify_panel_password', {
      p_kind: kind,
      p_password: password,
    });
    const msg = String((error as { message?: string } | null)?.message ?? '');
    if (/429|너무 많|RATE_LIMIT/i.test(msg)) return 'limited';
    if (error) return 'bad';
    return (data as { ok?: boolean } | null)?.ok ? 'ok' : 'bad';
  } catch {
    return 'bad';
  }
}

export function navigateToAppPath(path: 'admin' | 'test'): void {
  const base = import.meta.env.BASE_URL;
  window.history.pushState({}, '', `${base}${path}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export const ADMIN_FIXED_NICKNAME = '범일NPC';
