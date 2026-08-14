import { lazy, useState, type FormEvent } from 'react';
import { AlertTriangle, Shield } from 'lucide-react';
import { supabase } from '../lib/supabase';

const TestDashboard = lazy(() => import('../TestDashboard'));
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
  const [authed, setAuthed] = useState(loadTestSession);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    const trimmedPassword = password.trim();
    const { data, error: verifyError } = await supabase.rpc('test_verify_password', {
      p_test_password: trimmedPassword,
    });

    if (verifyError || typeof data !== 'string' || !data) {
      setError(verifyError?.message ?? '비밀번호가 올바르지 않습니다.');
      setLoading(false);
      return;
    }

    localStorage.setItem(TEST_SESSION_KEY, JSON.stringify({ authedAt: Date.now() }));
    localStorage.setItem(TEST_PASSWORD_KEY, trimmedPassword);
    localStorage.setItem(TEST_TOKEN_KEY, data);
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
              onChange={event => setPassword(event.target.value)}
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
