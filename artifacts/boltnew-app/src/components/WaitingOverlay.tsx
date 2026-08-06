import { useState, useRef, useEffect } from 'react';
import { Users, CheckCircle, Clock, AlertTriangle, ChevronRight, ShieldAlert, X } from 'lucide-react';
import { TutorialModal } from './TutorialModal';
import { useTheme } from '../lib/theme';

export function WaitingOverlay({ sessionActive, onEnter, onRecover }: {
  sessionActive: boolean | null;
  onEnter: () => void;
  onRecover?: (profileId: string) => void;
}) {
  const { theme } = useTheme();
  const isLightTheme = theme === 'y2k' || theme === 'minimal';
  const isActive = sessionActive === true;
  const [showNotice, setShowNotice] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutPage, setTutPage] = useState(0);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [showPinRecovery, setShowPinRecovery] = useState(false);
  const [pinDigits, setPinDigits] = useState<[string,string,string,string]>(['','','','']);
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  // ── 입장대기 전용 배경음악 (전역 bgm과 분리 — 겹치지 않음) ──────────────
  useEffect(() => {
    const audio = new Audio('/bgm-waiting.mp3');
    audio.loop = true;
    audio.volume = 0.5;
    audio.play().catch(() => {
      // autoplay 차단 시 첫 터치/클릭으로 재생
      const tryPlay = () => { audio.play().catch(() => {}); document.removeEventListener('click', tryPlay, true); };
      document.addEventListener('click', tryPlay, { capture: true, once: true });
    });
    return () => { audio.pause(); audio.src = ''; };
  }, []);

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
      const { data, error } = await resp.json() as { data: { id: string; nickname: string } | null; error: { message: string } | null };
      if (error || !data) {
        setPinError('해당 번호로 등록된 프로필이 없어요');
        setPinDigits(['','','','']);
        setTimeout(() => pref0.current?.focus(), 80);
        setPinLoading(false);
        return;
      }
      // onRecover가 있으면 App의 handleProfileRecovery 사용 (올바른 state 업데이트)
      // 없으면 fallback: localStorage 직접 세팅 후 onEnter
      if (onRecover) {
        onRecover(data.id);
      } else {
        localStorage.setItem('matching_user_id', data.id);
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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-teal-500/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-3xl" />
      </div>
      <div className="relative z-10 text-center max-w-sm w-full flex flex-col items-center">
        {/* 로고 + 아이콘 */}
        <div className="relative inline-flex items-center justify-center mb-6">
          <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shadow-2xl shadow-cyan-500/30">
            <Users className="w-14 h-14 text-white" />
          </div>
          <div className={`absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center shadow-lg ${isActive ? 'bg-teal-400' : 'bg-amber-400 animate-bounce'}`}>
            {isActive ? <CheckCircle className="w-4 h-4 text-teal-900" /> : <Clock className="w-4 h-4 text-amber-900" />}
          </div>
        </div>
        {/* 타이틀: 범일NPC 술번개 중앙 */}
        <div className="mb-4 text-center">
          <p className="text-[22px] font-black tracking-[0.25em] uppercase mb-1"
             style={isLightTheme ? { color: '#0f766e' } : {
               background: 'linear-gradient(135deg, #ffffff 0%, #cffafe 45%, #99f6e4 100%)',
               WebkitBackgroundClip: 'text',
               WebkitTextFillColor: 'transparent',
               backgroundClip: 'text',
             }}>
            범일NPC
          </p>
          <h1 className="text-4xl font-black tracking-tight leading-tight"
              style={{ color: isLightTheme ? '#111827' : '#ffffff' }}>술번개 🍻</h1>
        </div>
        {isActive ? (
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-teal-500/20 border border-teal-400/30 rounded-full mb-6">
            <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
            <span className="text-teal-300 text-sm font-semibold">모임이 시작되었습니다!</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-500/20 border border-amber-400/30 rounded-full mb-6">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-amber-300 text-sm font-semibold">모임 대기 중</span>
          </div>
        )}
        <p className="text-slate-300 text-base leading-relaxed mb-8">
          {isActive ? (
            <>모임이 시작되었습니다.<br /><span className="text-teal-400 font-semibold">입장 버튼</span>을 눌러 참여하세요.</>
          ) : (
            <>곧 회식이 시작합니다.<br /><span className="text-slate-400 font-semibold">미리 입장해서 닉네임을 설정하세요.</span></>
          )}
        </p>
        {/* 주의사항 미리보기 배너 */}
        <button
          onClick={() => setShowNotice(true)}
          className="w-full flex items-center gap-3 px-4 py-3 mb-4 rounded-2xl bg-amber-500/15 border border-amber-400/30 hover:bg-amber-500/25 transition-all text-left"
        >
          <div className="w-8 h-8 rounded-full bg-amber-500/30 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-amber-300 text-xs font-bold">입장 전 꼭 읽어주세요!</p>
            <p className="text-amber-400/70 text-[11px] truncate">절전 모드·시크릿 모드 사용 시 앱이 튕길 수 있어요</p>
          </div>
          <ChevronRight className="w-4 h-4 text-amber-400/60 flex-shrink-0" />
        </button>
        <button
          onClick={() => setShowConsentModal(true)}
          disabled={!isActive}
          className="w-full py-4 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 disabled:from-slate-700 disabled:to-slate-600 disabled:cursor-not-allowed text-white font-black text-lg rounded-2xl shadow-2xl shadow-teal-500/30 transition-all active:scale-98 disabled:active:scale-100 mb-3"
        >{isActive ? '입장하기' : '⏳ 회의 시작 전입니다'}</button>
        <button
          onClick={() => { setTutPage(0); setShowTutorial(true); }}
          className="w-full py-3.5 bg-gradient-to-r from-orange-400 to-rose-500 hover:from-orange-300 hover:to-rose-400 text-white font-black text-sm rounded-2xl shadow-lg shadow-orange-500/25 transition-all active:scale-98 mb-3"
        >앱 사용법 보기</button>
        {/* 핀 번호 복구 */}
        <button
          onClick={() => { setShowPinRecovery(true); setPinDigits(['','','','']); setPinError(''); }}
          className="w-full py-2.5 bg-transparent border border-slate-600/60 hover:border-slate-500 text-slate-400 hover:text-slate-300 font-semibold text-xs rounded-2xl transition-all mb-1"
        >🔑 핀 번호로 프로필 복구</button>
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
        {/* 주의사항 전체 모달 */}
        {showNotice && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setShowNotice(false)}>
            <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
              {/* 헤더 */}
              <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-b border-amber-500/20 px-5 py-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/30 flex items-center justify-center">
                  <ShieldAlert className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-white font-black text-base">입장 전 주의사항</h3>
                  <p className="text-amber-400/70 text-xs">앱이 튕기지 않으려면 꼭 확인하세요</p>
                </div>
                <button onClick={() => setShowNotice(false)} className="ml-auto w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
              <div className="px-5 py-5 space-y-4">
                {/* 절전 모드 */}
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-lg">🔋</span>
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm mb-1">절전 모드 해제</p>
                    <p className="text-slate-400 text-xs leading-relaxed">아이폰·안드로이드 절전(저전력) 모드에서는 백그라운드 처리가 제한되어 앱이 갑자기 튕길 수 있습니다. <span className="text-amber-400 font-semibold">설정 → 배터리 → 저전력 모드 OFF</span> 후 사용해 주세요.</p>
                  </div>
                </div>
                {/* 시크릿 모드 */}
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-lg">🕵️</span>
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm mb-1">시크릿·개인정보 보호 모드 사용 금지</p>
                    <p className="text-slate-400 text-xs leading-relaxed">Safari/Chrome 시크릿 모드나 개인정보 보호 브라우저는 <span className="text-amber-400 font-semibold">로컬 저장소가 차단</span>되어 닉네임·프로필이 사라집니다. 일반 브라우저 탭으로 접속해 주세요.</p>
                  </div>
                </div>
                {/* 화면 꺼짐 */}
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-lg">📵</span>
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm mb-1">화면 자동 꺼짐 방지</p>
                    <p className="text-slate-400 text-xs leading-relaxed">자리를 비울 때 화면이 꺼지면 브라우저가 세션을 초기화할 수 있어요. <span className="text-amber-400 font-semibold">화면 자동 잠금 시간을 길게</span> 설정하거나 주기적으로 화면을 깨워주세요.</p>
                  </div>
                </div>
                {/* 북마크 */}
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-xl bg-teal-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-lg">🔖</span>
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm mb-1">URL 북마크 추천</p>
                    <p className="text-slate-400 text-xs leading-relaxed">혹시 앱이 튕겨도 같은 URL로 재접속하면 <span className="text-teal-400 font-semibold">프로필이 자동으로 복구</span>됩니다. 브라우저 주소창에서 이 페이지를 북마크해 두세요.</p>
                  </div>
                </div>
              </div>
              <div className="px-5 pb-5">
                <button
                  onClick={() => setShowNotice(false)}
                  className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-black rounded-2xl shadow-lg shadow-teal-500/25 text-sm"
                >확인했어요!</button>
              </div>
            </div>
          </div>
        )}
        {/* 앱 사용법 튜토리얼 모달 */}
        {showTutorial && (
          <TutorialModal
            page={tutPage}
            onChangePage={setTutPage}
            onClose={() => setShowTutorial(false)}
          />
        )}
        {/* 핀 번호 복구 모달 */}
        {showPinRecovery && (
          <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-6 bg-black/75 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl">
              {/* 헤더 */}
              <div className="bg-gradient-to-r from-slate-800/60 to-slate-700/60 border-b border-slate-600 px-5 py-5 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-600/40 flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">🔑</span>
                </div>
                <h3 className="text-white font-black text-lg">핀 번호로 복구</h3>
                <p className="text-slate-400 text-xs mt-1">내 상태 탭 프로필 카드의 <strong className="text-slate-300">고유번호</strong> 4자리</p>
              </div>
              {/* 입력 */}
              <div className="px-6 py-6 space-y-4">
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
                {pinLoading && (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-teal-400/40 border-t-teal-400 rounded-full animate-spin" />
                    <p className="text-sm text-teal-400 font-semibold">복구 중…</p>
                  </div>
                )}
                {pinError && (
                  <p className="text-red-400 text-xs text-center font-semibold">⚠ {pinError}</p>
                )}
                <button
                  onClick={() => setShowPinRecovery(false)}
                  className="w-full py-3 bg-slate-700/60 hover:bg-slate-700 text-slate-300 font-bold text-sm rounded-2xl transition-all"
                >닫기</button>
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
