import { lazy, Suspense, useState, useEffect, useRef, type FormEvent } from 'react';
import { AlertTriangle, Shield } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PANEL_PIN_INPUT_PROPS } from '../lib/panel-password';
import { mapPanelLoginError, readSubmittedPassword } from '../admin/admin-login';

const loadTestDashboard = () => import('../TestDashboard');
const TestDashboard = lazy(loadTestDashboard);
const TEST_SESSION_KEY = 'test_session_v1';
const TEST_PASSWORD_KEY = 'test_pw_v1';
const TEST_TOKEN_KEY = 'test_token_v1';
const TEST_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function loadTestSession(): boolean {
  try {
    const raw = localStorage.getItem(TEST_SESSION_KEY);
    if (!raw) return false;
    const session = JSON.parse(raw) as { authedAt: number };
    if (Date.now() - session.authedAt <= TEST_SESSION_MAX_AGE_MS) return true;
    localStorage.removeItem(TEST_SESSION_KEY);
  } catch {
    localStorage.removeItem(TEST_SESSION_KEY);
  }
  return false;
}

export function TestGate() {
  const [authed, setAuthed] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function verifySession() {
      const token = localStorage.getItem(TEST_TOKEN_KEY);
      const hasSession = loadTestSession();
      if (!hasSession || !token) {
        localStorage.removeItem(TEST_SESSION_KEY);
        localStorage.removeItem(TEST_TOKEN_KEY);
        if (!cancelled) { setAuthed(false); setCheckingSession(false); }
        return;
      }
      // 세션 검증과 대시보드 청크 다운로드를 병렬 처리해 재진입 대기를 줄인다.
      void loadTestDashboard();
      try {
        const res = await fetch('/api/db/op', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'app_settings', op: 'select', testToken: token }),
        });
        const json = await res.json() as { data: unknown; error: unknown };
        if (!cancelled) {
          if (res.ok && json.data && !json.error) setAuthed(true);
          else {
            localStorage.removeItem(TEST_SESSION_KEY);
            localStorage.removeItem(TEST_TOKEN_KEY);
            localStorage.removeItem(TEST_PASSWORD_KEY);
            setAuthed(false);
          }
          setCheckingSession(false);
        }
      } catch {
        if (!cancelled) {
          localStorage.removeItem(TEST_SESSION_KEY);
          localStorage.removeItem(TEST_TOKEN_KEY);
          setAuthed(false);
          setCheckingSession(false);
        }
      }
    }
    void verifySession();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    // 비밀번호 확인 왕복 중 대시보드를 미리 받아 성공 직후 바로 전환한다.
    void loadTestDashboard();

    const trimmedPassword = readSubmittedPassword(passwordRef.current, password);
    let token: string | null = null;
    let verifyError: { message?: string } | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await supabase.rpc('test_verify_password', {
        p_test_password: trimmedPassword,
      });
      if (!error && typeof data === 'string' && data) {
        token = data;
        break;
      }
      verifyError = error as { message?: string } | null;
      const msg = String(verifyError?.message ?? '');
      const retryable = (msg.includes('503') || msg.includes('HTTP') || msg.includes('fetch')
        || msg.includes('abort') || msg.includes('network') || msg.includes('Max retries')
        || msg.includes('initializing'))
        && !/429|RATE_LIMIT|너무 많/i.test(msg);
      if (!retryable || attempt === 4) break;
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }

    if (!token) {
      const msg = String(verifyError?.message ?? '');
      setError(mapPanelLoginError(msg, trimmedPassword));
      setLoading(false);
      return;
    }

    localStorage.setItem(TEST_SESSION_KEY, JSON.stringify({ authedAt: Date.now() }));
    localStorage.setItem(TEST_PASSWORD_KEY, trimmedPassword);
    localStorage.setItem(TEST_TOKEN_KEY, token);
    setAuthed(true);
    setLoading(false);
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-white/20 border-t-white animate-spin" />
      </div>
    );
  }

  if (authed) {
    return (
      <Suspense fallback={
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full border-4 border-white/20 border-t-white animate-spin" />
        </div>
      }>
        <TestDashboard />
      </Suspense>
    );
  }

  return (
    <div className="mobile-page-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-3 min-[360px]:p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-slate-700 to-slate-900 px-5 min-[360px]:px-8 py-6 min-[360px]:py-7 text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-3">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">테스트 대시보드</h1>
          <p className="text-slate-300 text-sm mt-1">접근 제한 페이지입니다</p>
        </div>
        <form onSubmit={handleSubmit} className="p-4 min-[360px]:p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">비밀번호</label>
            <input
              ref={passwordRef}
              type="password"
              {...PANEL_PIN_INPUT_PROPS}
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="비밀번호 입력"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none transition-all text-gray-800 [scroll-margin:0]"
              required
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-700 disabled:opacity-50 transition-all"
          >
            {loading ? '확인 중...' : '입장'}
          </button>
          <a href="/" className="block text-center text-xs text-gray-400 hover:text-gray-600 transition-colors">
            ← 메인으로 돌아가기
          </a>
        </form>
      </div>
    </div>
  );
}
