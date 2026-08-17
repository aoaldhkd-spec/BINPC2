import { useState } from 'react';
import { AlertTriangle, Eye, EyeOff } from 'lucide-react';
import type { AppSettings } from './shared';

export function CredentialsTab({ settings, onSave, onSaveEntry, onSaveReset, onSaveTest }: {
  settings: AppSettings | null;
  onSave: (phone: string, password: string) => void | Promise<void>;
  onSaveEntry: (entryPassword: string) => void | Promise<void>;
  onSaveReset: (resetPassword: string) => void | Promise<void>;
  onSaveTest: (pw: string) => void | Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<'admin' | 'entry' | 'reset' | 'test'>('admin');
  // Admin tab state
  const [phone, setPhone] = useState(settings?.admin_phone ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [savedAdmin, setSavedAdmin] = useState(false);
  const [errAdmin, setErrAdmin] = useState('');
  // Entry password tab state
  const [entryPw, setEntryPw] = useState('');
  const [entryConfirm, setEntryConfirm] = useState('');
  const [showEntryPw, setShowEntryPw] = useState(false);
  const [savedEntry, setSavedEntry] = useState(false);
  const [errEntry, setErrEntry] = useState('');
  // Reset password tab state
  const [resetPw, setResetPw] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [showResetPw, setShowResetPw] = useState(false);
  const [savedReset, setSavedReset] = useState(false);
  const [errReset, setErrReset] = useState('');
  // Test password tab state
  const [testPw, setTestPw] = useState('');
  const [testConfirm, setTestConfirm] = useState('');
  const [showTestPw, setShowTestPw] = useState(false);
  const [savedTest, setSavedTest] = useState(false);
  const [errTest, setErrTest] = useState('');

  const [savingAdmin, setSavingAdmin] = useState(false);
  const [savingEntry, setSavingEntry] = useState(false);
  const [savingReset, setSavingReset] = useState(false);
  const [savingTest, setSavingTest] = useState(false);

  const formatPhone = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  };

  const handleSaveAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrAdmin('');
    if (password.length < 4) { setErrAdmin('비밀번호는 4자 이상이어야 합니다.'); return; }
    if (password !== confirm) { setErrAdmin('비밀번호 확인이 일치하지 않습니다.'); return; }
    setSavingAdmin(true);
    try {
      await onSave(phone, password);
      setSavedAdmin(true);
      setPassword(''); setConfirm('');
      setTimeout(() => setSavedAdmin(false), 2500);
    } catch (err) {
      setErrAdmin(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSavingAdmin(false);
    }
  };

  const handleSaveEntryPw = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrEntry('');
    if (entryPw.length < 4) { setErrEntry('입장 코드는 4자 이상이어야 합니다.'); return; }
    if (entryPw !== entryConfirm) { setErrEntry('입장 코드 확인이 일치하지 않습니다.'); return; }
    setSavingEntry(true);
    try {
      await onSaveEntry(entryPw);
      setSavedEntry(true);
      setTimeout(() => setSavedEntry(false), 2500);
    } catch (err) {
      setErrEntry(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSavingEntry(false);
    }
  };

  const handleSaveResetPw = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrReset('');
    if (resetPw.length < 4) { setErrReset('비밀번호는 4자 이상이어야 합니다.'); return; }
    if (resetPw !== resetConfirm) { setErrReset('비밀번호 확인이 일치하지 않습니다.'); return; }
    setSavingReset(true);
    try {
      await onSaveReset(resetPw);
      setSavedReset(true);
      setTimeout(() => setSavedReset(false), 2500);
    } catch (err) {
      setErrReset(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSavingReset(false);
    }
  };

  const handleSaveTestPw = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrTest('');
    if (testPw.length < 4) { setErrTest('코드는 4자 이상이어야 합니다.'); return; }
    if (testPw !== testConfirm) { setErrTest('코드 확인이 일치하지 않습니다.'); return; }
    setSavingTest(true);
    try {
      await onSaveTest(testPw);
      setSavedTest(true);
      setTimeout(() => setSavedTest(false), 2500);
    } catch (err) {
      setErrTest(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSavingTest(false);
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-md">
      {/* 탭 선택 */}
      <div className="grid grid-cols-2 gap-2">
        {([
          { id: 'admin' as const, label: '🔑 관리자 설정', desc: '전화번호·비밀번호' },
          { id: 'entry' as const, label: '🚪 입장 코드', desc: '참여자 입장 코드' },
          { id: 'reset' as const, label: '🔄 처음으로', desc: '술번개 재시작 코드' },
          { id: 'test' as const, label: '🧪 테스트 코드', desc: '테스트 전용 접속 코드' },
        ]).map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`rounded-2xl p-3 border-2 text-left transition-all active:scale-[0.98] ${activeTab === t.id ? 'border-slate-700 bg-slate-800 text-white' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`}>
            <p className={`text-xs font-black ${activeTab === t.id ? 'text-white' : 'text-gray-700'}`}>{t.label}</p>
            <p className={`text-[10px] mt-0.5 ${activeTab === t.id ? 'text-slate-300' : 'text-gray-400'}`}>{t.desc}</p>
          </button>
        ))}
      </div>

      {activeTab === 'admin' && (
        <form onSubmit={handleSaveAdmin} className="space-y-4">
          <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 text-xs text-amber-700 leading-relaxed">
            관리자 접속 정보를 변경합니다. 저장이 끝나면 그 비밀번호가 바로 로그인에 쓰입니다. 기억해 두세요.
          </div>
          <p className="text-xs text-gray-500 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
            {settings?.admin_password_set
              ? '관리자 비밀번호: 설정됨'
              : '관리자 비밀번호: 아직 저장되지 않음 (예전에 공개됐던 기본값은 더 이상 통하지 않습니다)'}
          </p>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">관리자 전화번호</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none" required />
            <p className="text-[11px] text-gray-400 mt-1">현재: {settings?.admin_phone ?? '–'}</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">새 관리자 비밀번호</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="새 비밀번호 입력 (4자 이상)"
                className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none" required minLength={4} />
              <button type="button" onClick={() => setShowPw(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">비밀번호 확인</label>
            <input type={showPw ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)}
              placeholder="비밀번호 재입력"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none" required />
          </div>
          {errAdmin && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />{errAdmin}
            </div>
          )}
          <button type="submit" disabled={savingAdmin}
            className={`w-full py-3 font-semibold rounded-xl transition-all disabled:opacity-60 ${savedAdmin ? 'bg-teal-500 text-white' : 'bg-slate-800 text-white hover:bg-slate-700'}`}>
            {savedAdmin ? '✓ 저장 완료!' : savingAdmin ? '저장 중…' : '변경 저장'}
          </button>
        </form>
      )}

      {activeTab === 'entry' && (
        <form onSubmit={handleSaveEntryPw} className="space-y-4">
          <div className="bg-sky-50 rounded-xl p-3 border border-sky-200 text-xs text-sky-700 leading-relaxed">
            참여자가 앱 입장 시 입력해야 하는 코드입니다. 설정하면 코드 없이는 프로필 등록이 불가합니다.
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">현재 입장 코드</label>
            <p className="text-sm font-black text-gray-800 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200 tracking-widest">
              {settings?.entry_password ? settings.entry_password : '(설정 없음 — 누구나 입장 가능)'}
            </p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">새 입장 코드</label>
            <div className="relative">
              <input type={showEntryPw ? 'text' : 'password'} value={entryPw} onChange={(e) => setEntryPw(e.target.value)}
                placeholder="새 입장 코드 입력 (4자 이상)"
                className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none" required minLength={4} />
              <button type="button" onClick={() => setShowEntryPw(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showEntryPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">코드 확인</label>
            <input type={showEntryPw ? 'text' : 'password'} value={entryConfirm} onChange={(e) => setEntryConfirm(e.target.value)}
              placeholder="입장 코드 재입력"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none" required />
          </div>
          {errEntry && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />{errEntry}
            </div>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={savingEntry}
              className={`flex-1 py-3 font-semibold rounded-xl transition-all disabled:opacity-60 ${savedEntry ? 'bg-teal-500 text-white' : 'bg-sky-600 text-white hover:bg-sky-700'}`}>
              {savedEntry ? '✓ 저장 완료!' : savingEntry ? '저장 중…' : '코드 저장'}
            </button>
            {settings?.entry_password && (
              <button type="button"
                onClick={() => { onSaveEntry(''); setSavedEntry(true); setTimeout(() => setSavedEntry(false), 2500); }}
                className="px-4 py-3 font-semibold rounded-xl bg-red-100 text-red-600 hover:bg-red-200 transition-all text-sm">
                해제
              </button>
            )}
          </div>
        </form>
      )}

      {activeTab === 'reset' && (
        <form onSubmit={handleSaveResetPw} className="space-y-4">
          <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 text-xs text-amber-700 leading-relaxed">
            유저가 술번개 로고를 탭하면 뜨는 <strong>처음으로 돌아가기</strong> 비밀번호입니다.<br />
            미설정 시 서버 기본 비밀번호가 사용됩니다.
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">현재 상태</label>
            <p className="text-sm font-black text-gray-800 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
              {settings?.reset_password_set
                ? '설정됨 — 아래에 새 값을 저장하면 바로 적용됩니다'
                : '아직 저장되지 않음 — 예전에 공개됐던 기본값은 더 이상 통하지 않습니다'}
            </p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">새 비밀번호</label>
            <div className="relative">
              <input type={showResetPw ? 'text' : 'password'} value={resetPw} onChange={(e) => setResetPw(e.target.value)}
                placeholder="새 비밀번호 입력 (4자 이상)"
                className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none" required minLength={4} />
              <button type="button" onClick={() => setShowResetPw(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showResetPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">비밀번호 확인</label>
            <input type={showResetPw ? 'text' : 'password'} value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)}
              placeholder="비밀번호 재입력"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none" required />
          </div>
          {errReset && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />{errReset}
            </div>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={savingReset}
              className={`flex-1 py-3 font-semibold rounded-xl transition-all disabled:opacity-60 ${savedReset ? 'bg-teal-500 text-white' : 'bg-amber-500 text-white hover:bg-amber-600'}`}>
              {savedReset ? '✓ 저장 완료!' : savingReset ? '저장 중…' : '비밀번호 저장'}
            </button>
            {settings?.reset_password_set && (
              <button type="button"
                onClick={() => { onSaveReset(''); setSavedReset(true); setTimeout(() => setSavedReset(false), 2500); }}
                className="px-4 py-3 font-semibold rounded-xl bg-red-100 text-red-600 hover:bg-red-200 transition-all text-sm">
                초기화
              </button>
            )}
          </div>
        </form>
      )}

      {activeTab === 'test' && (
        <form onSubmit={handleSaveTestPw} className="space-y-4">
          <div className="bg-violet-50 rounded-xl p-3 border border-violet-200 text-xs text-violet-700 leading-relaxed">
            <strong>테스트 전용 접속 코드</strong>입니다. 이 코드로 접속하면 테스트 대시보드로 이동합니다.<br />
            미설정 시 서버 기본 코드가 사용됩니다.
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">현재 상태</label>
            <p className="text-sm font-black text-gray-800 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
              {settings?.test_password_set
                ? '설정됨 — 아래에 새 값을 저장하면 바로 적용됩니다'
                : '아직 저장되지 않음 — 예전에 공개됐던 기본값은 더 이상 통하지 않습니다'}
            </p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">새 테스트 코드</label>
            <div className="relative">
              <input type={showTestPw ? 'text' : 'password'} value={testPw} onChange={(e) => setTestPw(e.target.value)}
                placeholder="새 테스트 코드 입력 (4자 이상)"
                className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500 outline-none" required minLength={4} />
              <button type="button" onClick={() => setShowTestPw(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showTestPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">코드 확인</label>
            <input type={showTestPw ? 'text' : 'password'} value={testConfirm} onChange={(e) => setTestConfirm(e.target.value)}
              placeholder="테스트 코드 재입력"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500 outline-none" required />
          </div>
          {errTest && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />{errTest}
            </div>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={savingTest}
              className={`flex-1 py-3 font-semibold rounded-xl transition-all disabled:opacity-60 ${savedTest ? 'bg-teal-500 text-white' : 'bg-violet-600 text-white hover:bg-violet-700'}`}>
              {savedTest ? '✓ 저장 완료!' : savingTest ? '저장 중…' : '코드 저장'}
            </button>
            {settings?.test_password_set && (
              <button type="button"
                onClick={() => { onSaveTest(''); setSavedTest(true); setTimeout(() => setSavedTest(false), 2500); }}
                className="px-4 py-3 font-semibold rounded-xl bg-red-100 text-red-600 hover:bg-red-200 transition-all text-sm">
                해제
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

