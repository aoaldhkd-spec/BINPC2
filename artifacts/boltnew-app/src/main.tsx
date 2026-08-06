import { StrictMode, useState, useEffect, Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// ─── 개발 URL → 배포 URL 자동 리다이렉트 ────────────────────────────────────
// VITE_CANONICAL_URL이 dev 환경에만 설정됨.
// 워크스페이스 미리보기(.replit.dev)로 접속하면 배포 URL로 즉시 이동.
// 배포 환경에서는 이 변수가 비어있어 아무 동작도 하지 않음.
{
  const canonical = (import.meta.env.VITE_CANONICAL_URL as string | undefined)?.trim();
  if (canonical) {
    try {
      const targetHost = new URL(canonical).hostname;
      if (window.location.hostname !== targetHost) {
        // 현재 경로·쿼리·해시를 유지하면서 canonical 도메인으로 이동
        const dest = canonical.replace(/\/$/, '') +
          window.location.pathname +
          window.location.search +
          window.location.hash;
        window.location.replace(dest);
        // 리다이렉트 중에는 앱을 렌더하지 않음 — throw로 이후 코드 중단
        throw new Error('Redirecting to canonical URL');
      }
    } catch (e) {
      // "Redirecting" 오류는 정상 흐름이므로 재throw, 그 외엔 무시하고 계속
      if (e instanceof Error && e.message === 'Redirecting to canonical URL') throw e;
    }
  }
}
import AdminApp from './AdminApp';
import TestDashboard from './TestDashboard';
import { supabase } from './lib/supabase';
import { Shield, AlertTriangle } from 'lucide-react';
import { ThemeProvider } from './lib/theme';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { BgmButton } from './components/BgmButton';

// ─── 전역 에러 바운더리 ───────────────────────────────────────────────────────
class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; info: string }> {
  state = { error: null as Error | null, info: '' };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: { componentStack: string }) {
    // ⚠️ setState 금지: componentDidCatch에서 setState 호출 → 무한 루프
    // getDerivedStateFromError에서 error를 이미 받았으므로 로그만 남김
    console.error('[AppErrorBoundary]', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-6 text-center gap-4">
          <span className="text-5xl">⚡</span>
          <div>
            <p className="text-white font-black text-lg mb-1">앱에서 오류가 발생했습니다</p>
            <p className="text-slate-400 text-sm">잠시 후 다시 시도해 주세요</p>
          </div>
          <button
            onClick={() => { this.setState({ error: null, info: '' }); window.location.reload(); }}
            className="px-6 py-3 bg-teal-500 hover:bg-teal-400 text-white font-black rounded-2xl transition-all"
          >
            새로고침
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── 세션 캐시 키 ─────────────────────────────────────────────────────────────
const TEST_SESSION_KEY = 'test_session_v1';

function loadTestSession(): boolean {
  try {
    const raw = localStorage.getItem(TEST_SESSION_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw) as { authedAt: number };
    if (Date.now() - s.authedAt > 86400000 * 30) {
      localStorage.removeItem(TEST_SESSION_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ─── 테스트 대시보드 게이트 ──────────────────────────────────────────────────
function TestGate() {
  const [authed, setAuthed] = useState(() => loadTestSession());
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { data, error: fetchErr } = await supabase
      .from('app_settings')
      .select('admin_password, test_password')
      .eq('id', 1)
      .maybeSingle();

    if (fetchErr) { setError(`서버 오류: ${fetchErr.message}`); setLoading(false); return; }
    if (!data)    { setError('설정 데이터를 불러올 수 없습니다.'); setLoading(false); return; }
    // test_password 설정된 경우 우선, 없으면 기본값 116606
    const correctPw = ((data as { test_password?: string | null }).test_password ?? '').trim() || '116606';
    if (correctPw !== password.trim()) {
      setError('비밀번호가 올바르지 않습니다.');
      setLoading(false);
      return;
    }
    localStorage.setItem(TEST_SESSION_KEY, JSON.stringify({ authedAt: Date.now() }));
    setAuthed(true);
    setLoading(false);
  };

  if (authed) return <TestDashboard />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-slate-700 to-slate-900 px-8 py-7 text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-3">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">테스트 대시보드</h1>
          <p className="text-slate-300 text-sm mt-1">접근 제한 페이지입니다</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="비밀번호 입력"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-slate-500 focus:border-transparent outline-none transition-all text-gray-800"
              required
              autoFocus
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

// ─── 라우팅 ───────────────────────────────────────────────────────────────────
function Root() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const normalized = path.replace(new RegExp(`^${base}`), '') || '/';

  if (normalized.startsWith('/admin')) return <AdminApp />;
  if (normalized.startsWith('/test'))  return <TestGate />;
  return <AppErrorBoundary><App /></AppErrorBoundary>;
}

// HMR 환경에서 createRoot()를 같은 컨테이너에 두 번 호출하면 "Maximum update depth" 오류가 발생.
// 이미 생성된 root를 재사용하여 이중 마운트 방지.
const rootEl = document.getElementById('root')!;
const existingRoot = (rootEl as unknown as { __reactRoot?: ReturnType<typeof createRoot> }).__reactRoot;
const appRoot = existingRoot ?? createRoot(rootEl);
if (!existingRoot) {
  (rootEl as unknown as { __reactRoot: ReturnType<typeof createRoot> }).__reactRoot = appRoot;
}
appRoot.render(
  <StrictMode>
    <ThemeProvider>
      <Root />
      <ThemeSwitcher />
      <BgmButton />
    </ThemeProvider>
  </StrictMode>,
);
