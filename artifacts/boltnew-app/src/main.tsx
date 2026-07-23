import { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import AdminApp from './AdminApp';
import TestDashboard from './TestDashboard';
import { supabase } from './lib/supabase';
import { Shield, AlertTriangle } from 'lucide-react';

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
      .select('admin_password')
      .eq('id', 1)
      .maybeSingle();

    if (fetchErr) { setError(`서버 오류: ${fetchErr.message}`); setLoading(false); return; }
    if (!data)    { setError('설정 데이터를 불러올 수 없습니다.'); setLoading(false); return; }
    if ((data.admin_password ?? '').trim() !== password.trim()) {
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
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
