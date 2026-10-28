import { useState, useRef, useEffect } from 'react';
import { Users, CheckCircle, Clock, ShieldAlert, Wine, List, DoorOpen, LockKeyhole } from 'lucide-react';
import { navigateToAppPath, PANEL_PIN_INPUT_PROPS, PIN_DIGIT_INPUT_PROPS, verifyPanelPassword } from '../lib/panel-password';
import { eventCycleAdmissionOpen, eventCycleMilestones } from '../lib/event-cycle-heart';

export function WaitingOverlay({ sessionActive, eventCycleStartedAt, eventCycleResetComplete, onEnter, onRecover }: {
  sessionActive: boolean | null;
  eventCycleStartedAt?: string | null;
  eventCycleResetComplete?: boolean;
  onEnter: () => void;
  onRecover?: (profileId: string, pinCode: string) => void;
}) {
  // Default amber contrast (multi-theme light overrides removed)
  const C = {
    panelTitle: '#fde68a',
    panelBody:  'rgba(252,211,77,0.8)',
    panelHigh:  '#fde68a',
    checkLabel: '#fde68a',
    checkItem:  '#fef3c7',
  } as const;
  // Use a single boundary timer rather than polling: stale session_active
  // must not leave the new-entry button enabled after the exact 01:00 cutoff.
  const [, refreshAdmissionBoundary] = useState(0);
  const closeAt = typeof eventCycleStartedAt === 'string'
    ? eventCycleMilestones(eventCycleStartedAt)?.admissionCloseAt.getTime()
    : undefined;
  useEffect(() => {
    if (closeAt === undefined) return;
    const delay = closeAt - Date.now();
    if (delay <= 0) return;
    const timeout = setTimeout(() => refreshAdmissionBoundary(x => x + 1), delay);
    return () => clearTimeout(timeout);
  }, [closeAt]);
  const isActive = eventCycleAdmissionOpen({
    sessionActive, startedAt: eventCycleStartedAt,
    resetComplete: eventCycleResetComplete, now: new Date(),
  });
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [showPinRecovery, setShowPinRecovery] = useState(false);
  const [pinDigits, setPinDigits] = useState<[string,string,string,string]>(['','','','']);
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  // 2단계 닉네임 확인
  const [pinStep, setPinStep] = useState<'pin' | 'confirm'>('pin');
  const [maskedNickname, setMaskedNickname] = useState('');
  const [nickInput, setNickInput] = useState('');
  const [pendingPin, setPendingPin] = useState('');
  const [testOpen, setTestOpen] = useState(false);
  const [testPw, setTestPw] = useState('');
  const [testErr, setTestErr] = useState('');
  const [testBusy, setTestBusy] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPw, setAdminPw] = useState('');
  const [adminErr, setAdminErr] = useState('');
  const [adminBusy, setAdminBusy] = useState(false);


  // 개별 ref
  const pref0 = useRef<HTMLInputElement>(null);
  const pref1 = useRef<HTMLInputElement>(null);
  const pref2 = useRef<HTMLInputElement>(null);
  const pref3 = useRef<HTMLInputElement>(null);
  const prefs = [pref0, pref1, pref2, pref3] as const;

  useEffect(() => {
    if (showPinRecovery) setTimeout(() => pref0.current?.focus(), 80);
  }, [showPinRecovery]);

  const submitPin = async (code: string) => {
    if (code.length !== 4 || !/^\d{4}$/.test(code)) return;
    setPinLoading(true); setPinError('');
    try {
      const resp = await fetch('/api/db/by-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: code }),
      });
      const json = await resp.json() as {
        data: { step?: string; maskedNickname?: string; id?: string; nickname?: string } | null;
        error: { message: string } | null;
      };
      if (resp.status === 429) {
        setPinError(json.error?.message ?? '시도 횟수 초과. 잠시 후 다시 시도해주세요.');
        setPinLoading(false);
        return;
      }
      if (json.error || !json.data) {
        setPinError(json.error?.message ?? '해당 번호로 등록된 프로필이 없어요');
        setPinDigits(['','','','']);
        setTimeout(() => pref0.current?.focus(), 80);
        setPinLoading(false);
        return;
      }
      // 1단계 완료: 닉네임 확인 단계로 이동
      if (json.data.step === 'confirm') {
        setPendingPin(code);
        setMaskedNickname(json.data.maskedNickname ?? '**');
        setNickInput('');
        setPinStep('confirm');
        setPinLoading(false);
        return;
      }
      // 최종 성공 (구 API 호환)
      const profileId = json.data.id ?? (json.data as { id?: string }).id;
      if (profileId) {
        if (onRecover) onRecover(profileId, code);
        else {
          localStorage.setItem('matching_user_id', profileId);
          onEnter();
        }
      } else {
        setPinError('프로필을 찾을 수 없어요');
      }
      setPinLoading(false);
    } catch {
      setPinError('오류가 발생했어요. 다시 시도해주세요');
      setPinLoading(false);
    }
  };

  const confirmNickname = async () => {
    if (!nickInput.trim()) return;
    setPinLoading(true); setPinError('');
    try {
      const resp = await fetch('/api/db/by-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pendingPin, nickname: nickInput.trim() }),
      });
      const json = await resp.json() as {
        data: { id?: string } | null;
        error: { message: string } | null;
      };
      if (resp.status === 429) {
        setPinError(json.error?.message ?? '시도 횟수 초과. 잠시 후 다시 시도해주세요.');
        setPinLoading(false);
        return;
      }
      if (json.error || !json.data?.id) {
        setPinError(json.error?.message ?? '닉네임이 일치하지 않습니다.');
        setPinLoading(false);
        return;
      }
      const profileId = typeof json.data.id === 'string' ? json.data.id : String((json.data as { id?: string }).id ?? '');
      if (!profileId) {
        setPinError('프로필을 찾을 수 없어요');
        setPinLoading(false);
        return;
      }
      setShowPinRecovery(false);
      setPinStep('pin');
      setPinLoading(false);
      if (onRecover) {
        onRecover(profileId, pendingPin);
      } else {
        localStorage.setItem('matching_user_id', profileId);
        onEnter();
      }
    } catch {
      setPinError('오류가 발생했어요. 다시 시도해주세요');
      setPinLoading(false);
    }
  };

  const handlePinChange = (idx: 0|1|2|3, raw: string) => {
    const d = raw.replace(/\D/g, '').slice(-1);
    setPinError('');
    const next: [string,string,string,string] = [...pinDigits] as [string,string,string,string];
    next[idx] = d;
    setPinDigits(next);
    if (d) {
      if (idx < 3) prefs[idx + 1].current?.focus();
      if (idx === 3) setTimeout(() => submitPin(next.join('')), 60);
    }
  };

  const handlePinKey = (idx: 0|1|2|3, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pinDigits[idx] && idx > 0) prefs[idx - 1].current?.focus();
  };

  const handlePinPaste = (e: React.ClipboardEvent) => {
    const v = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (v.length === 4) {
      setPinDigits(v.split('') as [string,string,string,string]);
      setPinError('');
      setTimeout(() => submitPin(v), 60);
    }
    e.preventDefault();
  };

  const confirmTest = async () => {
    if (testBusy) return;
    setTestBusy(true);
    setTestErr('');
    const result = await verifyPanelPassword('test', testPw);
    setTestBusy(false);
    if (result === 'ok') {
      setTestOpen(false);
      setTestPw('');
      navigateToAppPath('test');
    } else {
      setTestErr(result === 'limited' ? '시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' : '비밀번호가 틀렸습니다');
      setTestPw('');
    }
  };

  const confirmAdmin = async () => {
    if (adminBusy) return;
    setAdminBusy(true);
    setAdminErr('');
    const result = await verifyPanelPassword('admin', adminPw);
    setAdminBusy(false);
    if (result === 'ok') {
      setAdminOpen(false);
      setAdminPw('');
      navigateToAppPath('admin');
    } else {
      setAdminErr(result === 'limited' ? '시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' : '비밀번호가 틀렸습니다');
      setAdminPw('');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black flex flex-col items-center justify-center px-5 py-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-teal-500/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 text-center max-w-sm w-full flex flex-col items-center">
        {/* 로고 → 테스터(/test) / 범일NPC → 관리자 / 술번개 → 게이트 없음 */}
        <button
          type="button"
          data-gate="waiting-logo-tester"
          onClick={() => { setTestPw(''); setTestErr(''); setTestOpen(true); }}
          title="테스터"
          aria-label="테스터"
          className="relative inline-flex items-center justify-center mb-5 active:scale-95 transition-transform"
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shadow-2xl shadow-cyan-500/30">
            <Users className="w-7 h-7 text-white" />
          </div>
          <div className={`absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center shadow-lg ${isActive ? 'bg-teal-400' : 'bg-amber-400'}`}>
            {isActive ? <CheckCircle className="w-3.5 h-3.5 text-teal-900" /> : <Clock className="w-3.5 h-3.5 text-amber-900" />}
          </div>
        </button>
        <div className="mb-3 text-center">
          <button
            type="button"
            data-gate="npc-admin"
            onClick={() => { setAdminPw(''); setAdminErr(''); setAdminOpen(true); }}
            title="관리자"
            className="block mx-auto"
          >
            <p className="text-[12px] font-bold tracking-[0.3em] uppercase mb-2"
               style={{ color: '#cffafe' }}>
              범일NPC
            </p>
          </button>
          <h1
            data-gate="sulbun-none"
            className="text-5xl font-black italic tracking-tight leading-tight"
            style={{ color: '#f6dfab' }}
          >BINPC2</h1>
          <p className="text-sm text-slate-300 mt-3 mb-5 tracking-wide">좋은 사람들과, 특별한 밤</p>
        </div>

        {/* 피라미드형 버튼 그룹 */}
        <div className="w-full flex flex-col items-center gap-2 mb-2">
          <div className="flex flex-col gap-3 w-[88%] mb-1">
            <a href="/events" className="min-h-16 flex gap-3 items-center justify-center rounded-xl border border-pink-300/60 bg-gradient-to-br from-pink-500 to-pink-800 px-4 py-4 text-lg font-bold text-white shadow-lg shadow-pink-900/30 hover:brightness-110 active:scale-[.98] transition-all"><Wine size={24} aria-hidden="true"/>술번개 신청</a>
            <a href="/events/waiting" className="min-h-16 flex gap-3 items-center justify-center rounded-xl border border-blue-300/60 bg-gradient-to-br from-blue-500 to-blue-800 px-4 py-4 text-lg font-bold text-white shadow-lg shadow-blue-900/30 hover:brightness-110 active:scale-[.98] transition-all"><List size={24} aria-hidden="true"/>신청대기방</a>
          </div>
          <button
            onClick={() => setShowConsentModal(true)}
            disabled={!isActive}
            className="w-[88%] min-h-16 flex items-center justify-center gap-3 py-4 border border-amber-200/70 bg-gradient-to-b from-stone-800 to-stone-950 text-amber-100 disabled:border-slate-600 disabled:bg-slate-800 disabled:text-slate-400 disabled:cursor-not-allowed font-black text-lg rounded-xl shadow-lg transition-all active:scale-[.98] disabled:active:scale-100"
          >{isActive ? <DoorOpen size={24} aria-hidden="true"/> : <LockKeyhole size={22} aria-hidden="true"/>}입장하기</button>
          <p role="status" className="text-xs text-slate-400 my-1">{sessionActive === null ? '시작 여부를 확인하고 있습니다…' : isActive ? '입장 버튼을 눌러 참여하세요' : !eventCycleResetComplete && closeAt && Date.now() >= closeAt && Date.now() < closeAt + 16*3600000 ? '신규 입장이 종료되었습니다. 기존 참가자는 프로필을 복구하세요.' : '술번개 시작 후 입장할 수 있습니다'}</p>
          {/* 2단: 프로필 복구 — 65% 너비 */}
          <button
            onClick={() => { setShowPinRecovery(true); setPinDigits(['','','','']); setPinError(''); setPinStep('pin'); }}
            className="w-[88%] py-3.5 mt-3 bg-white/5 border border-white/15 hover:bg-white/10 text-slate-200 font-bold text-sm rounded-xl transition-all active:scale-[.98]"
          >🔑 고유번호로 프로필 복구</button>
        </div>

        {/* 이미 프로필이 있는 유저 안내 배너 — 복구 버튼 아래 */}
        <div className="w-[88%] rounded-xl bg-transparent px-2 py-3 mb-2">
          <div className="flex items-start gap-2.5">

            <div className="min-w-0 text-left">
              <p className="font-black text-sm leading-snug" style={{ color: C.panelTitle }}>이미 프로필을 만드셨나요?</p>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: C.panelBody, wordBreak: 'keep-all' }}>
                <>다시 만들지 마시고 <span className="font-bold" style={{ color: C.panelHigh }}>고유번호(PIN)</span>로 입장해주세요.</>
              </p>
              <p className="text-xs leading-relaxed" style={{ color: C.panelBody, wordBreak: 'keep-all' }}>
                <>고유번호를 모르신다면 <a href="/events#inquiry" className="font-bold underline" style={{ color: C.panelHigh }}>관리자에게 문의</a>해주세요.</>
              </p>
            </div>
          </div>
        </div>

        {/* 개인정보 동의 모달 */}
        {showConsentModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/75 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-700 overflow-hidden shadow-2xl">
              {/* 헤더 */}
              <div className="bg-gradient-to-r from-cyan-500/20 to-teal-500/20 border-b border-cyan-500/20 px-5 py-5 text-center">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 flex items-center justify-center mx-auto mb-3">
                  <ShieldAlert className="w-6 h-6 text-cyan-400" />
                </div>
                <h3 className="text-white font-black text-lg">개인정보 안내</h3>
              </div>
              {/* 본문 */}
              <div className="px-6 py-6">
                <p className="text-white text-[15px] font-bold leading-7 text-center break-keep mb-6">
                  본 서비스는 모임 참여를 위해 프로필과 활동 정보를 처리합니다.{' '}
                  행사 프로필·하트·채팅은 매일 17:00 전체 초기화 시 삭제 대상입니다.{' '}
                  사진 원본·일부 운영기록 및 별도 백업은 별도 보관·삭제 정책을 따릅니다.
                </p>
                <p className="text-slate-400 text-xs text-center leading-relaxed break-keep mb-6">
                  다음 프로필 등록 화면에서 수집·이용 및 참여자 공개 내용을 확인하고 직접 동의 여부를 선택해 주세요.
                </p>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => { setShowConsentModal(false); onEnter(); }}
                    className="w-full py-4 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-white font-black text-base rounded-2xl shadow-lg shadow-teal-500/30 transition-all active:scale-98"
                  >
                    안내 확인 · 프로필 설정
                  </button>
                  <button
                    onClick={() => setShowConsentModal(false)}
                    className="w-full py-3 bg-slate-700/60 hover:bg-slate-700 text-slate-300 font-bold text-sm rounded-2xl transition-all"
                  >
                    닫기
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* 핀 번호 복구 모달 */}
        {showPinRecovery && (
          <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-6 bg-black/75 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl">
              {/* 헤더 */}
              <div className="bg-gradient-to-r from-slate-800/60 to-slate-700/60 border-b border-slate-600 px-5 py-5 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-600/40 flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">{pinStep === 'confirm' ? '🙋' : '🔑'}</span>
                </div>
                <h3 className="text-white font-black text-lg">
                  {pinStep === 'confirm' ? '본인 확인' : '핀 번호로 복구'}
                </h3>
                <p className="text-slate-400 text-xs mt-1">
                  {pinStep === 'confirm'
                    ? <>닉네임 <strong className="text-teal-300">{maskedNickname}</strong> — 정확한 닉네임을 입력해주세요</>
                    : <>내 상태 탭 프로필 카드의 <strong className="text-slate-300">고유번호</strong> 4자리</>}
                </p>
              </div>

              <div className="px-6 py-6 space-y-4">
                {pinStep === 'pin' ? (
                  /* ── 1단계: 핀 입력 ── */
                  <div className="flex gap-3 justify-center" onPaste={handlePinPaste}>
                    {([0,1,2,3] as const).map(idx => (
                      <input
                        key={idx}
                        ref={prefs[idx]}
                        type="text"
                        {...PIN_DIGIT_INPUT_PROPS}
                        maxLength={1}
                        value={pinDigits[idx]}
                        onChange={e => handlePinChange(idx, e.target.value)}
                        onKeyDown={e => handlePinKey(idx, e)}
                        disabled={pinLoading}
                        className={[
                          'w-16 h-16 text-center text-3xl font-black rounded-2xl border-2 outline-none transition-all bg-slate-800',
                          pinError ? 'border-red-500 text-red-400'
                            : pinDigits[idx] ? 'border-teal-500 text-teal-300'
                            : 'border-slate-600 focus:border-teal-500 text-white',
                          'disabled:opacity-40',
                        ].join(' ')}
                      />
                    ))}
                  </div>
                ) : (
                  /* ── 2단계: 닉네임 확인 ── */
                  <div className="space-y-3">
                    <p className="text-slate-400 text-xs text-center">
                      가입 시 설정한 닉네임을 정확히 입력하면 입장할 수 있어요
                    </p>
                    <input
                      type="text"
                      autoFocus
                      placeholder="닉네임 입력"
                      value={nickInput}
                      onChange={e => { setNickInput(e.target.value); setPinError(''); }}
                      onKeyDown={e => e.key === 'Enter' && confirmNickname()}
                      disabled={pinLoading}
                      className="w-full rounded-2xl px-4 py-3 text-center text-white text-lg font-black tracking-wider bg-slate-800 border-2 border-slate-600 focus:border-teal-500 outline-none transition-all disabled:opacity-40"
                    />
                    <button
                      onClick={confirmNickname}
                      disabled={!nickInput.trim() || pinLoading}
                      className="w-full py-3 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-black rounded-2xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {pinLoading ? '확인 중…' : '본인 확인 완료'}
                    </button>
                    <button
                      onClick={() => { setPinStep('pin'); setPinError(''); setNickInput(''); }}
                      className="w-full py-2 text-slate-500 font-semibold text-sm hover:text-slate-300 transition-colors"
                    >← 고유번호 다시 입력</button>
                  </div>
                )}

                {pinLoading && pinStep === 'pin' && (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-teal-400/40 border-t-teal-400 rounded-full animate-spin" />
                    <p className="text-sm text-teal-400 font-semibold">확인 중…</p>
                  </div>
                )}
                {pinError && (
                  <p className="text-red-400 text-xs text-center font-semibold">⚠ {pinError}</p>
                )}
                {pinStep === 'pin' && (
                  <button
                    onClick={() => { setShowPinRecovery(false); setPinStep('pin'); setPinError(''); setPinDigits(['','','','']); }}
                    className="w-full py-3 bg-slate-700/60 hover:bg-slate-700 text-slate-300 font-bold text-sm rounded-2xl transition-all"
                  >닫기</button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {testOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={() => { setTestOpen(false); setTestPw(''); setTestErr(''); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <span className="text-3xl">🧪</span>
              <h3 className="text-gray-900 font-black text-lg mt-2">테스터 확인</h3>
              <p className="text-gray-400 text-xs mt-1">테스터 비밀번호를 입력하세요</p>
            </div>
            <input type="password" {...PANEL_PIN_INPUT_PROPS} value={testPw} onChange={e => { setTestPw(e.target.value); setTestErr(''); }}
              onKeyDown={e => { if (e.key === 'Enter') void confirmTest(); }}
              placeholder="테스터 비밀번호" autoFocus disabled={testBusy}
              className={`w-full border-2 text-center text-lg font-bold rounded-xl px-4 py-3 focus:outline-none ${testErr ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200 focus:border-cyan-500'}`} />
            {testErr && <p className="text-red-500 text-xs text-center font-bold">{testErr}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setTestOpen(false); setTestPw(''); setTestErr(''); }}
                className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-gray-500 text-sm font-semibold">취소</button>
              <button type="button" onClick={() => void confirmTest()} disabled={testBusy}
                className="flex-1 py-2.5 rounded-xl bg-cyan-500 text-white text-sm font-bold disabled:opacity-60">{testBusy ? '확인 중…' : '확인'}</button>
            </div>
          </div>
        </div>
      )}

      {adminOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={() => { setAdminOpen(false); setAdminPw(''); setAdminErr(''); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <span className="text-3xl">🔐</span>
              <h3 className="text-gray-900 font-black text-lg mt-2">관리자 확인</h3>
              <p className="text-gray-400 text-xs mt-1">관리자 비밀번호만 입력하세요 (고유번호 아님)</p>
            </div>
            <input type="password" {...PANEL_PIN_INPUT_PROPS} value={adminPw} onChange={e => { setAdminPw(e.target.value); setAdminErr(''); }}
              onKeyDown={e => { if (e.key === 'Enter') void confirmAdmin(); }}
              placeholder="관리자 비밀번호" autoFocus disabled={adminBusy}
              className={`w-full border-2 text-center text-lg font-bold rounded-xl px-4 py-3 focus:outline-none ${adminErr ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200 focus:border-cyan-500'}`} />
            {adminErr && <p className="text-red-500 text-xs text-center font-bold">{adminErr}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setAdminOpen(false); setAdminPw(''); setAdminErr(''); }}
                className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-gray-500 text-sm font-semibold">취소</button>
              <button type="button" onClick={() => void confirmAdmin()} disabled={adminBusy}
                className="flex-1 py-2.5 rounded-xl bg-cyan-500 text-white text-sm font-bold disabled:opacity-60">{adminBusy ? '확인 중…' : '확인'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes dotbounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
