import { useState, useEffect, useRef } from 'react';
import { Shield, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PANEL_PIN_INPUT_PROPS } from '../lib/panel-password';
import { setAdminToken, ADMIN_PW_KEY, ADMIN_SESSION_KEY } from './shared';
import {
  mapPanelLoginError,
  readSubmittedPassword,
  TEST_ADMIN_HINT,
} from './admin-login';

function resetLoginViewport(shell?: HTMLElement | null) {
  try {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    shell?.scrollTo(0, 0);
  } catch { /* ignore */ }
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

export function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const passwordRef = useRef<HTMLInputElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from('app_settings').select('admin_phone').eq('id', 1).maybeSingle()
      .then(({ data }: { data: { admin_phone?: string } | null }) => {
        if (data?.admin_phone) setPhone(data.admin_phone);
      })
      .catch(() => {});
  }, []);

  const formatPhone = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  };

  const fillTestAdmin = () => {
    setError('');
    setPassword('');
    setHint(TEST_ADMIN_HINT);
    resetLoginViewport(shellRef.current);
    requestAnimationFrame(() => {
      passwordRef.current?.focus({ preventScroll: true });
      resetLoginViewport(shellRef.current);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const submittedPassword = readSubmittedPassword(passwordRef.current, password);
    setPassword(submittedPassword);
    setHint('');
    setError('');
    if (!submittedPassword) {
      setError('비밀번호를 입력해 주세요.');
      return;
    }
    setLoading(true);
    try {
      let token: string | null = null;
      let lastErr: { message?: string } | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data, error: rpcErr } = await supabase.rpc('admin_create_session', { p_phone: phone, p_admin_password: submittedPassword });
        if (!rpcErr && typeof data === 'string' && data) {
          token = data;
          break;
        }
        lastErr = rpcErr as { message?: string } | null;
        const msg = String(lastErr?.message ?? '');
        const retryable = (msg.includes('503') || msg.includes('HTTP') || msg.includes('fetch')
          || msg.includes('abort') || msg.includes('network') || msg.includes('Max retries')
          || msg.includes('initializing'))
          && !/429|RATE_LIMIT|너무 많/i.test(msg);
        if (!retryable || attempt === 4) break;
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
      }
      if (!token) {
        setError(mapPanelLoginError(String(lastErr?.message ?? ''), submittedPassword));
        setLoading(false);
        resetLoginViewport(shellRef.current);
        return;
      }
      setAdminToken(token ?? null);
      localStorage.setItem(ADMIN_PW_KEY, submittedPassword);
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({ phone, authedAt: Date.now() }));
      onLogin();
    } catch {
      setError('서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
    setLoading(false);
  };

  return (
    <div
      ref={shellRef}
      className="mobile-page-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-3 min-[360px]:p-4"
    >
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-slate-700 to-slate-900 px-5 min-[360px]:px-8 py-6 min-[360px]:py-7 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-3">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-xl font-bold text-white">관리자 로그인</h1>
            <p className="text-slate-300 text-sm mt-1">관리자 전용 페이지입니다</p>
          </div>
          <form onSubmit={handleSubmit} className="p-4 min-[360px]:p-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">전화번호</label>
              <input type="tel" name="admin-phone" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))}
                placeholder="010-0000-0000" autoComplete="username" inputMode="tel"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none transition-all text-gray-800 [scroll-margin:0]" required />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">비밀번호</label>
              <input ref={passwordRef} type="password" name="admin-password" {...PANEL_PIN_INPUT_PROPS} value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호 입력"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none transition-all text-gray-800 [scroll-margin:0]" required />
            </div>
            {hint && !error && (
              <p className="text-xs text-slate-600 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 leading-relaxed">
                {hint}
              </p>
            )}
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}
            <button type="submit" disabled={loading}
              className="w-full py-3 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-700 disabled:opacity-50 transition-all">
              {loading ? '확인 중...' : '로그인'}
            </button>
            <button
              type="button"
              onClick={fillTestAdmin}
              className="w-full py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all"
            >
              테스트 관리자
            </button>
            <a href="/"
              className="w-full py-2.5 flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all">
              ← 입장 대기 화면으로
            </a>
          </form>
        </div>
      </div>
    </div>
  );
}
