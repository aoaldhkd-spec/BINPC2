import { useState, useRef, useEffect } from 'react';
import { Users, CheckCircle, Clock, ShieldAlert } from 'lucide-react';
import { useTheme } from '../lib/theme';

export function WaitingOverlay({ sessionActive, onEnter, onRecover }: {
  sessionActive: boolean | null;
  onEnter: () => void;
  onRecover?: (profileId: string) => void;
}) {
  const { theme } = useTheme();
  const isLightTheme = theme === 'y2k' || theme === 'minimal';
  const isActive = sessionActive === true;
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
      // 최종 성공
      if (onRecover) {
        onRecover(json.data.id!);
      } else {
        localStorage.setItem('matching_user_id', json.data.id!);
        onEnter();
      }
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
      if (onRecover) {
        onRecover(json.data.id);
      } else {
        localStorage.setItem('matching_user_id', json.data.id);
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
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black flex flex-col items-center justify-center px-5 py-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-teal-500/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 text-center max-w-sm w-full flex flex-col items-center">
        {/* 로고 + 아이콘 — 컴팩트 */}
        <div className="relative inline-flex items-center justify-center mb-3">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shadow-2xl shadow-cyan-500/30">
            <Users className="w-10 h-10 text-white" />
          </div>
          <div className={`absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center shadow-lg ${isActive ? 'bg-teal-400' : 'bg-amber-400 animate-bounce'}`}>
            {isActive ? <CheckCircle className="w-3.5 h-3.5 text-teal-900" /> : <Clock className="w-3.5 h-3.5 text-amber-900" />}
          </div>
        </div>
        {/* 타이틀 */}
        <div className="mb-3 text-center">
          <p className="text-[18px] font-black tracking-[0.25em] uppercase mb-0.5"
             style={isLightTheme ? { color: '#0f766e' } : {
               background: 'linear-gradient(135deg, #ffffff 0%, #cffafe 45%, #99f6e4 100%)',
               WebkitBackgroundClip: 'text',
               WebkitTextFillColor: 'transparent',
               backgroundClip: 'text',
             }}>
            범일NPC
          </p>
          <h1 className="text-3xl font-black tracking-tight leading-tight"
              style={{ color: isLightTheme ? '#111827' : '#ffffff' }}>술번개 🍻</h1>
        </div>

        {/* 상태 배지 */}
        {isActive ? (
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-teal-500/20 border border-teal-400/30 rounded-full mb-2">
            <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
            <span className="text-teal-300 text-sm font-semibold">모임이 시작되었습니다!</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-500/20 border border-amber-400/30 rounded-full mb-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-amber-300 text-sm font-semibold">모임 대기 중</span>
          </div>
        )}
        {/* 안내 문구 — 배지와 중복되지 않는 내용만 */}
        <p className="text-slate-300 text-sm leading-relaxed mb-3">
          {isActive ? (
            <><span className="text-teal-400 font-semibold">입장 버튼</span>을 눌러 참여하세요.</>
          ) : (
            <>곧 회식이 시작합니다.<br /><span className="text-slate-400 text-xs">미리 입장해서 닉네임을 설정하세요.</span></>
          )}
        </p>

        {/* 피라미드형 버튼 그룹 */}
        <div className="w-full flex flex-col items-center gap-2 mb-2">
          {/* 1단: 입장하기 — 85% 너비, 원래 높이 */}
          <button
            onClick={() => setShowConsentModal(true)}
            disabled={!isActive}
            className="w-[85%] py-4 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 disabled:from-slate-700 disabled:to-slate-600 disabled:cursor-not-allowed text-white font-black text-lg rounded-2xl shadow-2xl shadow-teal-500/30 transition-all active:scale-98 disabled:active:scale-100"
          >{isActive ? '입장하기' : '⏳ 회의 시작 전입니다'}</button>
          {/* 2단: 프로필 복구 — 65% 너비 */}
          <button
            onClick={() => { setShowPinRecovery(true); setPinDigits(['','','','']); setPinError(''); setPinStep('pin'); }}
            className="w-[65%] py-3.5 bg-gradient-to-r from-orange-400 to-rose-500 hover:from-orange-300 hover:to-rose-400 text-white font-black text-sm rounded-2xl shadow-lg shadow-orange-500/25 transition-all active:scale-98"
          >🔑 프로필 복구</button>
        </div>

        {/* 이미 프로필이 있는 유저 안내 배너 — 복구 버튼 아래 */}
        <div className="w-full rounded-2xl bg-amber-500/15 border border-amber-400/30 px-4 py-3 mb-2">
          <div className="flex items-start gap-2.5">
            <span className="text-lg leading-none mt-0.5 flex-shrink-0">⚠️</span>
            <div className="min-w-0">
              <p className="text-amber-200 font-black text-sm leading-snug">이미 프로필을 만드셨나요?</p>
              <p className="text-amber-300/80 text-xs mt-1 leading-relaxed">
                다시 만들지 마시고 <span className="font-bold text-amber-200">고유번호(PIN)</span>로 입장해주세요.<br />
                고유번호를 모르신다면 <span className="font-bold text-amber-200">관리자에게 문의</span>해주세요.
              </p>
            </div>
          </div>
        </div>

        {/* 입장 전 체크 — 2×2 그리드 */}
        <div className="w-full rounded-2xl bg-amber-500/10 border border-amber-400/25 overflow-hidden">
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
            <ShieldAlert className="w-3 h-3 text-amber-400 flex-shrink-0" />
            <p className="text-amber-200 text-[10px] font-black tracking-widest uppercase">입장 전 체크</p>
          </div>
          <div className="px-2.5 pb-2.5 grid grid-cols-2 gap-1.5">
            {[
              { emoji: '🔋', text: '절전 모드 OFF' },
              { emoji: '🕵️', text: '시크릿 모드 금지' },
              { emoji: '📵', text: '화면 잠금 길게 설정' },
              { emoji: '🔖', text: '고유번호 · 프로필 암기' },
            ].map(item => (
              <div key={item.emoji} className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-black/20">
                <span className="text-sm leading-none flex-shrink-0">{item.emoji}</span>
                <p className="text-amber-100/85 text-[10px] font-semibold leading-tight">{item.text}</p>
              </div>
            ))}
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
                  본 서비스는 원활한 모임 진행만을 위하여 입력되며,{' '}
                  모든 개인 정보는 저장·수집하지 않습니다.{' '}
                  모임 종료 시 즉시 파기합니다.
                </p>
                <p className="text-slate-400 text-xs text-center leading-relaxed break-keep mb-6">
                  동의하지 않을 시 본 모임에 불이익이 있을 수 있습니다.
                </p>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => { setShowConsentModal(false); onEnter(); }}
                    className="w-full py-4 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-white font-black text-base rounded-2xl shadow-lg shadow-teal-500/30 transition-all active:scale-98"
                  >
                    위 내용에 동의합니다
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
                        inputMode="numeric"
                        pattern="\d*"
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
        {/* 테스트/관리자 — 우측 하단 고정 */}
        <div className="fixed bottom-4 right-4 z-40 flex flex-row gap-2 items-end">
          <a href="/test" className="px-3 py-1.5 rounded-lg bg-violet-600/80 hover:bg-violet-500 text-white font-bold text-xs shadow-lg backdrop-blur-sm transition-all border border-violet-500/50 active:scale-95">테스트</a>
          <a href="/admin" className="px-3 py-1.5 rounded-lg bg-slate-700/90 hover:bg-slate-800 text-white font-bold text-xs shadow-lg backdrop-blur-sm transition-all border border-slate-600/50 active:scale-95">관리자</a>
        </div>
      </div>
      <style>{`
        @keyframes dotbounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
