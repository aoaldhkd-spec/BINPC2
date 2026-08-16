/**
 * TutorialVideo — 참여자가 모를 만한 숨겨진 기능 위주 커서 애니메이션 튜토리얼
 * 제외: 하트 보내기, 채팅 기본, 운세
 * 포함: PIN 입장 → 아바타 변경 → 프로필 등록 → 채팅 이모지/스티커 → 사진/빠른메시지 → 스와이프/길게누르기 → 받은/보낸 하트
 */
import { useState, useEffect, useRef, useCallback, type ReactElement } from 'react';
import { SkipBack, SkipForward, Play, Pause } from 'lucide-react';

// ── 커서 — RAF lerp (CSS transition 사용 안 함: 목표가 바뀔 때 커서가 튀는 문제 완전 해결) ──
function Cursor({ x, y, clicking }: { x: number; y: number; clicking: boolean }) {
  const elRef   = useRef<HTMLDivElement>(null);
  const posRef  = useRef({ x, y });          // 현재 실제 위치
  const tgtRef  = useRef({ x, y });          // 목표 위치
  const rafRef  = useRef<number | null>(null);

  // 목표가 바뀌면 RAF 루프 시작
  useEffect(() => {
    tgtRef.current = { x, y };

    const tick = () => {
      const { x: cx, y: cy } = posRef.current;
      const { x: tx, y: ty } = tgtRef.current;
      const dx = tx - cx;
      const dy = ty - cy;
      // lerp 계수 0.14 → 60fps 기준 약 480ms 안에 1px 이하로 수렴
      const nx = cx + dx * 0.14;
      const ny = cy + dy * 0.14;
      posRef.current = { x: nx, y: ny };
      if (elRef.current) {
        elRef.current.style.left = `${nx}px`;
        elRef.current.style.top  = `${ny}px`;
      }
      if (Math.abs(dx) > 0.15 || Math.abs(dy) > 0.15) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [x, y]);

  // 언마운트 시 RAF 정리
  useEffect(() => () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); }, []);

  return (
    <div
      ref={elRef}
      className="absolute pointer-events-none z-50"
      style={{ left: posRef.current.x, top: posRef.current.y, transform: 'translate(-3px, -3px)' }}
    >
      {clicking && (
        <div className="absolute -inset-4 rounded-full bg-teal-400/30 animate-ping" />
      )}
      <svg width="22" height="28" viewBox="0 0 22 28" fill="none"
        className={`drop-shadow-lg transition-transform duration-150 ${clicking ? 'scale-90' : 'scale-100'}`}>
        <path d="M2 2L2 20L6 16L9 23L12 22L9 15L14 15L2 2Z" fill="white" stroke="#1e293b" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ── 하이라이트 링 ─────────────────────────────────────────────────────────────
function Ring({ on, color = 'ring-teal-400' }: { on: boolean; color?: string }) {
  if (!on) return null;
  return <div className={`absolute inset-0 pointer-events-none ring-2 ring-offset-1 ring-offset-slate-900 ${color} rounded-[inherit] transition-all duration-300`} />;
}

// ── 말풍선 힌트 ───────────────────────────────────────────────────────────────
function Tip({ text, show, dir = 'bottom' }: { text: string; show: boolean; dir?: 'top' | 'bottom' | 'left' | 'right' }) {
  if (!show) return null;
  const pos = {
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }[dir];
  return (
    <div className={`absolute ${pos} z-40 bg-teal-500 text-white text-[9px] font-black px-2 py-1 rounded-lg break-keep [word-break:keep-all] text-pretty max-w-[9.5rem] leading-tight text-center shadow-lg animate-in fade-in duration-200`}>
      {text}
    </div>
  );
}

// ── 앱 탭바 (현재 라이브: 참여자 | 시그널 | 통계 | 랭킹) ─────────────────────
function Tabs({ active, hl }: { active: string; hl?: string }) {
  const row1 = [
    { id: 'profiles', e: '👥', l: '참여자' },
    { id: 'signal', e: '💕', l: '시그널' },
    { id: 'stats', e: '📊', l: '통계' },
    { id: 'ranking', e: '🏆', l: '랭킹' },
  ];
  return (
    <div className="border-t border-slate-700 bg-slate-900 px-0.5 pt-0.5 pb-1">
      <div className="flex">
        {row1.map(t => (
          <div key={t.id} className={`relative flex-1 flex flex-col items-center py-1 rounded-lg ${active === t.id ? 'bg-cyan-500/20' : ''}`}>
            <Ring on={hl === t.id} />
            <span className="text-[13px] leading-none">{t.e}</span>
            <span className={`text-[7px] font-bold mt-0.5 ${active === t.id ? 'text-cyan-400' : 'text-slate-500'}`}>{t.l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MyFab({ hl }: { hl?: boolean }) {
  return (
    <div className={`absolute right-2 bottom-10 z-30 w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-black tracking-widest text-white shadow-lg ${hl ? 'bg-cyan-400 ring-2 ring-cyan-200' : 'bg-cyan-500'}`}>
      <Ring on={!!hl} color="ring-cyan-300" />
      MY
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Scene 1: PIN 입장
// ══════════════════════════════════════════════════════════════════════════════
function S1({ step }: { step: number }) {
  const [dots, setDots] = useState<number[]>([]);
  const [entered, setEntered] = useState(false);
  const [pressed, setPressed] = useState<string | null>(null);
  const pressedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // 이전 타이머 취소 — step 변경 시 stale setPressed 방지
    if (pressedTimerRef.current) clearTimeout(pressedTimerRef.current);
    if (step === 2) { setDots([1]); setPressed('1'); pressedTimerRef.current = setTimeout(() => setPressed(null), 200); }
    if (step === 3) { setDots([1,2]); setPressed('5'); pressedTimerRef.current = setTimeout(() => setPressed(null), 200); }
    if (step === 4) { setDots([1,2,3]); setPressed('2'); pressedTimerRef.current = setTimeout(() => setPressed(null), 200); }
    if (step === 5) { setDots([1,2,3,4]); setPressed('8'); pressedTimerRef.current = setTimeout(() => setPressed(null), 200); }
    if (step >= 6) { setEntered(true); }
    return () => { if (pressedTimerRef.current) clearTimeout(pressedTimerRef.current); };
  }, [step]);

  const nums = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  return (
    <div className="h-full flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-slate-800 gap-4 px-4">
      {!entered ? (
        <>
          <div className="text-center">
            <div className="text-4xl mb-1.5">🥂</div>
            <p className="text-white font-black text-sm">2026 회식 매칭</p>
            <p className="text-slate-400 text-[10px] mt-0.5">입장 핀번호 4자리를 입력하세요</p>
          </div>
          {/* 도트 */}
          <div className="flex gap-4">
            {[0,1,2,3].map(i => (
              <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${i < dots.length ? 'bg-teal-400 border-teal-400' : 'border-slate-500 bg-transparent'}`} />
            ))}
          </div>
          {/* 키패드 */}
          <div className="grid grid-cols-3 gap-2 w-full max-w-[200px]">
            {nums.map((n, i) => (
              <div key={i} className={`relative h-11 rounded-2xl flex items-center justify-center text-base font-black transition-all duration-100 ${n === '' ? '' : pressed === n ? 'bg-teal-500 text-white scale-95' : 'bg-slate-700 text-white active:scale-95'}`}>
                {step === 2 && n === '1' && <Ring on color="ring-teal-400" />}
                {step === 3 && n === '5' && <Ring on color="ring-teal-400" />}
                {step === 4 && n === '2' && <Ring on color="ring-teal-400" />}
                {step === 5 && n === '8' && <Ring on color="ring-teal-400" />}
                {n}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="text-5xl mb-3">🎉</div>
          <p className="text-white font-black text-base">입장 완료!</p>
          <p className="text-slate-400 text-[11px] mt-1">닉네임을 탭해서 내 방으로</p>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Scene 2: 아바타 변경
// ══════════════════════════════════════════════════════════════════════════════
function S2({ step }: { step: number }) {
  const [showPicker, setShowPicker] = useState(false);
  const [selected, setSelected] = useState('🐶');
  useEffect(() => {
    if (step >= 2) setShowPicker(true);
    if (step >= 4) setSelected('🦊');
  }, [step]);

  const animals = ['🐶','🐱','🐼','🦊','🦁','🐻','🐨','🐸','🦋','🐯','🦄','🐙'];
  return (
    <div className="h-full flex flex-col bg-slate-900">
      <div className="flex-1 overflow-hidden flex flex-col px-3 pt-3 gap-2">
        {/* 내 프로필 카드 */}
        <div className={`relative bg-slate-800 border rounded-2xl p-3 flex items-center gap-3 transition-all ${step === 1 ? 'border-teal-500' : 'border-slate-700'}`}>
          <Ring on={step === 1} />
          <Tip text="탭하면 아바타 변경!" show={step === 1} dir="bottom" />
          <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-3xl cursor-pointer flex-shrink-0">
            {selected}
            {step === 1 && <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-teal-500 rounded-full flex items-center justify-center text-[8px] text-white font-black">✏️</div>}
          </div>
          <div className="flex-1">
            <p className="text-white font-black text-sm">내 프로필</p>
            <p className="text-slate-400 text-[10px]">MY → 내 설정 → 아바타 클릭</p>
          </div>
        </div>

        {/* 아바타 선택 피커 */}
        {showPicker && (
          <div className="bg-slate-800 border border-teal-500/60 rounded-2xl p-3 animate-in slide-in-from-top-2 duration-300">
            <p className="text-teal-300 text-[10px] font-black mb-2">🐾 아바타 선택</p>
            <div className="grid grid-cols-6 gap-1.5">
              {animals.map(a => (
                <div key={a} className={`relative h-9 w-9 rounded-xl flex items-center justify-center text-xl transition-all duration-200 ${a === selected ? 'bg-teal-500/30 ring-2 ring-teal-400 scale-110' : 'bg-slate-700'} ${step === 3 && a === '🦊' ? 'animate-bounce' : ''}`}>
                  <Ring on={step === 3 && a === '🦊'} color="ring-orange-400" />
                  {a}
                </div>
              ))}
            </div>
            {step >= 4 && (
              <div className="mt-2 text-center text-teal-300 text-[10px] font-bold animate-in fade-in duration-300">
                ✅ 여우로 변경 완료!
              </div>
            )}
          </div>
        )}
      </div>
      <MyFab hl={step === 0} />
      <Tabs active="profiles" />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Scene 3: 내설정 — 한마디→전광판, 이상형·특징 칩 (포지션/MBTI 칩 없음)
// ══════════════════════════════════════════════════════════════════════════════
function S3({ step }: { step: number }) {
  const status = step >= 2 ? '퇴근 후 맥주 한잔 같이해요 🍺' : '';
  const showTicker = step >= 4;
  const showIdeal = step >= 6;
  const showFeat = step >= 8;
  const idealOn = step >= 7;
  const featOn = step >= 9;
  return (
    <div className="h-full flex flex-col bg-slate-900 overflow-hidden relative">
      <div className="flex-1 px-2.5 pt-2 space-y-1.5 overflow-hidden">
        <p className="text-slate-400 text-[9px] font-bold">MY → 내 설정</p>

        {!showTicker && (
          <div className={`relative bg-slate-800 border rounded-xl p-2 transition-all duration-300 ${step <= 3 ? 'border-cyan-400/70' : 'border-slate-700'}`}>
            <Ring on={step <= 1} color="ring-cyan-400" />
            <Tip text="한마디 = 카드 위 전광판!" show={step === 1} dir="bottom" />
            <p className="text-white text-[10px] font-black">💬 오늘의 한마디</p>
            <div className={`mt-1.5 rounded-lg px-2 py-1.5 text-[10px] font-bold border ${status ? 'border-cyan-400 text-cyan-100 bg-slate-700' : 'border-slate-600 text-slate-500'}`}>
              {status || '예: 퇴근 후 맥주 한잔 같이해요 🍺'}
            </div>
            {step >= 3 && <p className="text-cyan-400 text-[8px] mt-1 font-bold">저장 → 전광판에 바로 뜸</p>}
          </div>
        )}

        {showTicker && !showIdeal && (
          <div className="relative w-[7.2rem] mx-auto rounded-xl overflow-hidden border border-slate-600 bg-slate-800 animate-in fade-in duration-300">
            <div className="relative h-24 bg-gradient-to-br from-teal-700 to-slate-800">
              <div
                className="absolute top-0 inset-x-0 z-10 flex items-center min-h-[16px] px-1.5"
                style={{ background: 'linear-gradient(90deg,rgba(15,23,42,0.88),rgba(17,94,89,0.88))', borderBottom: '1px solid rgba(45,212,191,0.4)' }}
              >
                <span className="text-[8px] font-extrabold text-teal-100 whitespace-nowrap" style={{ animation: 'ticker-flash 2.2s ease-in-out infinite' }}>
                  {status}
                </span>
              </div>
              <div className="absolute bottom-0 inset-x-0 bg-white/95 px-1.5 py-0.5 flex items-center">
                <span className="text-[9px] font-black text-gray-950">하늘다람쥐</span>
                <span className="ml-auto text-[8px] font-bold text-gray-600">28</span>
              </div>
            </div>
            <div className="bg-white px-1.5 py-1 flex gap-1">
              <div className="flex-1 py-0.5 rounded border border-rose-200 text-center text-[8px] font-bold text-rose-500">하트</div>
              <div className="flex-1 py-0.5 rounded border border-sky-200 text-center text-[8px] font-bold text-sky-500">채팅</div>
            </div>
            <Tip text="이게 전광판!" show={step === 4 || step === 5} dir="bottom" />
          </div>
        )}

        {showIdeal && (
          <div className={`relative bg-slate-800 border rounded-xl p-2 transition-all duration-300 ${step < 8 ? 'border-rose-400/70' : 'border-slate-700'}`}>
            <Ring on={step === 6} color="ring-rose-400" />
            <Tip text="이상형 칩 — 포지션/MBTI 없음" show={step === 6} dir="bottom" />
            <p className="text-white text-[10px] font-black">💘 이상형</p>
            <p className="text-[8px] text-slate-500 font-bold mt-1">성격 💫 · 술 🍺 · 텐션 🎢 · 흡연 🚭</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {['다정한', '한두잔', '텐션맞춤', '비흡연'].map((tag, i) => (
                <span key={tag} className={`px-1.5 py-0.5 rounded-full text-[8px] font-bold border ${idealOn && i < 2 ? 'text-white border-transparent' : 'text-slate-400 border-slate-600'}`}
                  style={idealOn && i < 2 ? { background: 'linear-gradient(135deg,#e11d48,#be185d)' } : {}}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {showFeat && (
          <div className="relative bg-slate-800 border border-violet-400/70 rounded-xl p-2 animate-in fade-in duration-300">
            <Ring on={step >= 8} color="ring-violet-400" />
            <p className="text-white text-[10px] font-black">🌟 나의 특징</p>
            <p className="text-[8px] text-slate-500 font-bold mt-1">같은 칩. 포지션은 닉네임 설정</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {['시크한', '술조금', '텐션중', '비흡연'].map((tag, i) => (
                <span key={tag} className={`px-1.5 py-0.5 rounded-full text-[8px] font-bold border ${featOn && i < 2 ? 'text-white border-transparent' : 'text-slate-400 border-slate-600'}`}
                  style={featOn && i < 2 ? { background: 'linear-gradient(135deg,#7c3aed,#6d28d9)' } : {}}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      <MyFab hl={step === 0} />
      <Tabs active="profiles" />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Scene 4: 채팅 이모지 & 스티커 (숨겨진 기능)
// ══════════════════════════════════════════════════════════════════════════════
function S4({ step }: { step: number }) {
  const [showEmoji, setShowEmoji] = useState(false);
  const [showSticker, setShowSticker] = useState(false);
  const [pickedEmoji, setPickedEmoji] = useState('');
  useEffect(() => {
    if (step >= 1) setShowEmoji(true);
    if (step === 3) { setShowEmoji(false); setShowSticker(true); }
    if (step === 2) setPickedEmoji('😍');
  }, [step]);
  const emojis = ['😀','😂','🥰','😍','🤩','😎','🥳','😜','❤️','💕','💖','🔥','✨','🎉','👍','🙏'];
  const stickers = ['🎊','🌟','💎','🎵','🌈','🦋','🍀','⚡','🎯','🎸','🌙','🏆'];
  return (
    <div className="h-full flex flex-col bg-slate-900">
      {/* 메시지 영역 */}
      <div className="flex-1 px-3 py-2 flex flex-col gap-1.5 overflow-hidden">
        <div className="flex justify-start"><span className="bg-slate-700 text-slate-200 text-[11px] px-3 py-1.5 rounded-2xl">오늘 재밌었어요!</span></div>
        <div className="flex justify-end"><span className="bg-teal-500 text-white text-[11px] px-3 py-1.5 rounded-2xl">저도요 😊</span></div>
        {pickedEmoji && <div className="flex justify-end animate-in fade-in duration-200"><span className="bg-teal-500 text-white text-[11px] px-3 py-1.5 rounded-2xl">{pickedEmoji}</span></div>}
      </div>

      {/* 이모지 팔레트 */}
      {showEmoji && !showSticker && (
        <div className="bg-slate-800 border-t border-slate-700 p-2 animate-in slide-in-from-bottom-2 duration-300">
          <p className="text-slate-400 text-[9px] font-bold mb-1.5">😊 이모지 — 입력줄 + 옆 😊</p>
          <div className="grid grid-cols-8 gap-1">
            {emojis.map((e, i) => (
              <div key={e} className={`relative h-8 w-8 rounded-xl flex items-center justify-center text-xl transition-all duration-200 ${step === 2 && i === 3 ? 'bg-teal-500/30 ring-2 ring-teal-400 scale-110' : 'bg-slate-700'}`}>
                <Ring on={step === 2 && i === 3} />
                {e}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 스티커 팔레트 */}
      {showSticker && (
        <div className="bg-slate-800 border-t border-slate-700 p-2 animate-in slide-in-from-bottom-2 duration-300">
          <p className="text-slate-400 text-[9px] font-bold mb-1.5">🎨 스티커 — + 누른 다음 🎨</p>
          <div className="grid grid-cols-6 gap-1">
            {stickers.map((s, i) => (
              <div key={s} className={`relative h-10 w-10 rounded-xl flex items-center justify-center text-2xl transition-all ${step === 4 && i === 0 ? 'bg-teal-500/30 ring-2 ring-teal-400 scale-110' : 'bg-slate-700'}`}>
                <Ring on={step === 4 && i === 0} />
                {s}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 입력창 */}
      {!showEmoji && !showSticker && (
        <div className="px-3 pb-3">
          <div className="flex items-center gap-1.5 bg-slate-700 rounded-2xl px-2 py-2">
            <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-sm text-slate-300">+</div>
            <div className={`relative w-7 h-7 rounded-full flex items-center justify-center text-base transition-all ${step === 1 ? 'bg-teal-500/30 ring-2 ring-teal-400' : 'bg-slate-600'}`}>
              <Ring on={step === 0} />
              <Tip text="😊 이모지" show={step === 0} dir="top" />
              😊
            </div>
            <span className="flex-1 text-slate-500 text-[11px]">메시지 입력…</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Scene 5: 사진 전송 & 빠른 메시지
// ══════════════════════════════════════════════════════════════════════════════
function S5({ step }: { step: number }) {
  const [showQuick, setShowQuick] = useState(false);
  const [showUploading, setShowUploading] = useState(false);
  const [imgSent, setImgSent] = useState(false);
  useEffect(() => {
    if (step === 1) setShowUploading(true);
    if (step >= 2) { setShowUploading(false); setImgSent(true); }
    if (step >= 4) setShowQuick(true);
  }, [step]);
  const quickMsgs = ['오늘 즐거웠어요 ☺️','술 한 잔 더 할래요? 🍺','번호 교환해요! 📱','이따가 연락해요 ☎️','카카오 아이디 알려줘도 돼요? 🐣'];
  return (
    <div className="h-full flex flex-col bg-slate-900">
      <div className="flex-1 px-3 py-2 space-y-1.5 overflow-hidden">
        <div className="flex justify-start"><span className="bg-slate-700 text-slate-200 text-[11px] px-3 py-1.5 rounded-2xl">사진 있어요?</span></div>
        {showUploading && (
          <div className="flex justify-end">
            <div className="bg-teal-500/50 rounded-2xl p-2 w-28 h-20 flex items-center justify-center animate-pulse">
              <span className="text-white text-[10px] font-bold">업로드 중…</span>
            </div>
          </div>
        )}
        {imgSent && (
          <div className="flex justify-end animate-in fade-in duration-300">
            <div className="bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl p-2 w-28 h-20 flex items-center justify-center">
              <span className="text-4xl">🌅</span>
            </div>
          </div>
        )}
        {step >= 5 && (
          <div className="flex justify-end animate-in fade-in duration-200">
            <span className="bg-teal-500 text-white text-[11px] px-3 py-1.5 rounded-2xl">번호 교환해요! 📱</span>
          </div>
        )}
      </div>

      {/* 빠른 메시지 목록 */}
      {showQuick && (
        <div className="bg-slate-800 border-t border-slate-700 p-2 animate-in slide-in-from-bottom-2 duration-300">
          <p className="text-slate-400 text-[9px] font-bold mb-1.5">⚡ 빠른 메시지 — ⚡ 버튼 탭</p>
          <div className="space-y-1">
            {quickMsgs.map((q, i) => (
              <div key={q} className={`relative px-3 py-1.5 rounded-xl text-[10px] font-semibold transition-all ${step === 5 && i === 2 ? 'bg-teal-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
                <Ring on={step === 4 && i === 2} color="ring-teal-400" />
                {q}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 입력창 */}
      {!showQuick && (
        <div className="px-3 pb-3">
          <div className="flex items-center gap-2 bg-slate-700 rounded-2xl px-2 py-2">
            <div className="relative w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-base">😊</div>
            <span className="flex-1 text-slate-500 text-[11px]">메시지…</span>
            <div className={`relative w-7 h-7 rounded-full flex items-center justify-center text-base transition-all ${step === 0 || step === 1 ? 'bg-teal-500/30 ring-2 ring-teal-400' : 'bg-slate-600'}`}>
              <Ring on={step === 0} />
              <Tip text="📷 사진 전송!" show={step === 0} dir="top" />
              📷
            </div>
            <div className="relative w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-base">
              <Ring on={step === 3} color="ring-amber-400" />
              <Tip text="⚡ 빠른 메시지!" show={step === 3} dir="top" />
              ⚡
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Scene 6: 스와이프 답장 & 길게누르기 메뉴
// ══════════════════════════════════════════════════════════════════════════════
function S6({ step }: { step: number }) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [showReply, setShowReply] = useState(false);
  const [showCtx, setShowCtx] = useState(false);
  useEffect(() => {
    if (step === 1) setSwipeOffset(50);
    if (step === 2) { setSwipeOffset(0); setShowReply(true); }
    if (step >= 4) setShowCtx(true);
  }, [step]);
  return (
    <div className="h-full flex flex-col bg-slate-900 relative">
      <div className="flex-1 px-3 py-2 space-y-2 overflow-hidden">
        {/* 받은 메시지 (스와이프 대상) */}
        <div className="flex justify-start">
          <div className={`relative transition-all duration-300`} style={{ transform: `translateX(${swipeOffset}px)` }}>
            <span className="bg-slate-700 text-slate-200 text-[11px] px-3 py-1.5 rounded-2xl inline-block">오늘 같은 자리라 반가웠어요!</span>
            <Ring on={step === 1} color="ring-cyan-400" />
            {step === 1 && <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 text-[9px] text-cyan-400 font-black whitespace-nowrap">← 스와이프</div>}
          </div>
        </div>

        {/* 답장 미리보기 */}
        {showReply && (
          <div className="bg-teal-900/40 border-l-2 border-teal-400 rounded-xl px-3 py-1.5 animate-in fade-in duration-300">
            <p className="text-teal-300 text-[8px] font-black">답장 중:</p>
            <p className="text-slate-300 text-[10px]">오늘 같은 자리라 반가웠어요!</p>
          </div>
        )}
        {showReply && (
          <div className="flex justify-end animate-in fade-in duration-300">
            <span className="bg-teal-500 text-white text-[11px] px-3 py-1.5 rounded-2xl">저도요! 연락해요 😊</span>
          </div>
        )}

        {/* 내 메시지 (길게누르기 대상) */}
        <div className="flex justify-end">
          <div className="relative">
            <span className={`bg-teal-500 text-white text-[11px] px-3 py-1.5 rounded-2xl inline-block transition-all ${step === 3 ? 'ring-2 ring-white/60 scale-[1.03]' : ''}`}>내일 또 봬요!</span>
            <Ring on={step === 3} color="ring-white/60" />
            {step === 3 && <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 text-[9px] text-amber-400 font-black whitespace-nowrap">길게 누르기 →</div>}
          </div>
        </div>
      </div>

      {/* 컨텍스트 메뉴 */}
      {showCtx && (
        <div className="absolute bottom-16 right-4 bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
          {['복사 📋','답장 ↩️','삭제 🗑️'].map((item, i) => (
            <div key={item} className={`px-5 py-2.5 text-[11px] font-bold border-b last:border-0 border-slate-700 transition-all ${step === 4 && i === 2 ? 'bg-red-500/20 text-red-400' : 'text-slate-200'}`}>
              {item}
            </div>
          ))}
        </div>
      )}

      <div className="px-3 pb-3">
        <div className="flex items-center gap-2 bg-slate-700 rounded-2xl px-3 py-2">
          <span className="flex-1 text-slate-500 text-[11px]">메시지…</span>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Scene 7: 받은 하트 & 보낸 하트 확인
// ══════════════════════════════════════════════════════════════════════════════
function S7({ step }: { step: number }) {
  const scrollRef  = useRef<HTMLDivElement>(null);
  const sentRef    = useRef<HTMLDivElement>(null);

  const received = [
    { name: '하늘다람쥐', emoji: '🐿️', heartEmoji: '💕', label: '설렘', color: 'text-pink-400', bg: 'bg-pink-900/20' },
    { name: '은빛고양이', emoji: '🐱', heartEmoji: '💚', label: '칭찬', color: 'text-emerald-400', bg: 'bg-emerald-900/20' },
  ];
  const sent = [
    { name: '황금여우', emoji: '🦊', heartEmoji: '❤️', label: '로맨틱', color: 'text-red-400', status: '대기 중' },
  ];

  // step >= 5 : 수락 완료 / step >= 6 : 보낸 하트 섹션 스크롤 진입
  const accepted = step >= 5;

  useEffect(() => {
    if (step >= 6 && sentRef.current && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [step]);

  return (
    <div className="h-full flex flex-col bg-slate-900">
      {/* overflow-y-auto + scroll-smooth — 보낸 하트 섹션이 잘리지 않도록 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 pt-2 pb-1 space-y-2"
        style={{ scrollBehavior: 'smooth' }}>

        <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider">내 상태 탭에서 확인</p>

        {/* ── 받은 하트 ── */}
        <div className={`relative rounded-2xl p-2 border transition-all duration-300
          ${step >= 1 ? 'border-pink-500/50 bg-slate-800' : 'border-slate-700 bg-slate-800'}`}>
          <Ring on={step === 1 || step === 2} color="ring-pink-400" />
          <Tip text="받은 하트 목록!" show={step === 1} dir="right" />
          <p className="text-[9px] font-black text-slate-400 mb-1.5">💌 받은 하트</p>
          <div className="space-y-1">
            {received.map((r, i) => (
              <div key={r.name}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-xl transition-all duration-300
                  ${step >= 3 && i === 0 ? `ring-1 ring-pink-400 ${r.bg}` : 'bg-slate-700/60'}`}>
                <div className="w-6 h-6 rounded-lg bg-slate-600 flex items-center justify-center text-xs flex-shrink-0">{r.emoji}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-[9px] font-bold leading-tight">{r.name}</p>
                  <p className={`text-[8px] ${r.color}`}>{r.heartEmoji} {r.label} 하트</p>
                </div>
                {/* 수락 버튼 — step 3~4 */}
                {i === 0 && step >= 3 && !accepted && (
                  <div className="flex gap-1 flex-shrink-0">
                    <span className="px-1.5 py-0.5 bg-slate-600 text-slate-200 text-[7px] font-bold rounded-md">거절</span>
                    <span className="px-1.5 py-0.5 bg-rose-500 text-white text-[7px] font-bold rounded-md animate-pulse">수락</span>
                  </div>
                )}
                {/* 수락 완료 — step >= 5 */}
                {i === 0 && accepted && (
                  <span className="text-[8px] text-teal-400 font-bold flex-shrink-0 animate-in fade-in duration-300">공유 ✓</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── 보낸 하트 ── */}
        <div ref={sentRef}
          className={`relative rounded-2xl p-2 border transition-all duration-500
            ${step >= 6 ? 'border-amber-500/60 bg-slate-800' : 'border-slate-700 bg-slate-800'}`}>
          <Ring on={step >= 6} color="ring-amber-400" />
          <Tip text="보낸 하트도 여기서!" show={step === 6} dir="right" />
          <p className="text-[9px] font-black text-slate-400 mb-1.5">💘 보낸 하트</p>
          {sent.map(s => (
            <div key={s.name}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-xl transition-all duration-300
                ${step >= 6 ? 'bg-amber-900/20' : 'bg-slate-700/60'}`}>
              <div className="w-6 h-6 rounded-lg bg-slate-600 flex items-center justify-center text-xs flex-shrink-0">{s.emoji}</div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-[9px] font-bold leading-tight">{s.name}</p>
                <p className={`text-[8px] ${s.color}`}>{s.heartEmoji} {s.label} 하트</p>
              </div>
              <span className={`text-[7px] font-bold flex-shrink-0 px-1.5 py-0.5 rounded-md transition-all duration-300
                ${step >= 6 ? 'bg-amber-500/20 text-amber-400' : 'text-slate-500'}`}>{s.status}</span>
            </div>
          ))}
        </div>
      </div>
      <MyFab hl={step === 0} />
      <Tabs active="profiles" />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Scene 8: 시그널 카드 — 왼쪽 패스 / 오른쪽 시그널
// ══════════════════════════════════════════════════════════════════════════════
function S8({ step }: { step: number }) {
  const offset = step === 2 ? -56 : step === 4 ? 64 : 0;
  return (
    <div className="h-full flex flex-col bg-slate-900 px-3 pt-2 pb-1">
      <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1.5">시그널 탭 · 틴더처럼</p>
      <div className={`flex justify-between text-[8px] font-black mb-1.5 ${step >= 1 ? 'text-rose-200' : 'text-slate-500'}`}>
        <span>왼쪽 = 패스(별로)</span>
        <span>오른쪽 = 시그널 보내기</span>
      </div>
      <div className="relative flex-1 min-h-0">
        <div
          className="absolute inset-x-2 top-0 rounded-2xl overflow-hidden border border-rose-400/40 bg-slate-800 shadow-lg transition-transform duration-300"
          style={{ transform: `translateX(${offset}px) rotate(${offset / 18}deg)` }}
        >
          <div className="h-28 bg-gradient-to-br from-rose-400 to-fuchsia-600 flex items-center justify-center text-3xl">🦊</div>
          <div className="px-2 py-1.5">
            <p className="text-white text-[11px] font-black">황금여우 <span className="text-[9px] font-semibold text-white/70">28세</span></p>
            <p className="text-[8px] text-rose-200 font-bold mt-0.5">← 패스(별로) · 시그널 보내기 →</p>
          </div>
          <Ring on={step === 1 || step === 2 || step === 4} color="ring-rose-400" />
        </div>
        {step === 2 && (
          <div className="absolute left-1 top-10 text-[10px] font-black text-slate-200">← 패스</div>
        )}
        {step === 4 && (
          <div className="absolute right-1 top-10 text-[10px] font-black text-rose-300">시그널 →</div>
        )}
      </div>
      <Tabs active="signal" />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 장면 정의
// ══════════════════════════════════════════════════════════════════════════════
interface Step { cx: number; cy: number; click?: boolean; dur: number; }
interface SceneDef {
  title: string; sub: string;
  steps: Step[];
  render: (s: number) => ReactElement;
}

const SCENES: SceneDef[] = [
  {
    title: '핀번호로 입장하기', sub: '4자리 핀번호를 키패드에 입력하세요',
    steps: [
      { cx: 124, cy: 200, dur: 1000 },
      { cx: 67,  cy: 168, click: false, dur: 900 },  // 1 버튼으로 이동
      { cx: 67,  cy: 168, click: true,  dur: 700 },  // 1 클릭
      { cx: 124, cy: 210, click: false, dur: 800 },  // 5로 이동
      { cx: 124, cy: 210, click: true,  dur: 700 },
      { cx: 67,  cy: 210, click: false, dur: 800 },  // 2로 이동
      { cx: 67,  cy: 210, click: true,  dur: 700 },
      { cx: 181, cy: 210, click: false, dur: 800 },  // 8로 이동
      { cx: 181, cy: 210, click: true,  dur: 700 },
      { cx: 124, cy: 200, click: false, dur: 1500 }, // 완료 대기
    ],
    render: s => <S1 step={s} />,
  },
  {
    title: '아바타(동물) 변경하기', sub: 'MY → 내 설정 → 아바타를 눌러 동물 선택',
    steps: [
      { cx: 210, cy: 210, dur: 1000 },              // MY 버튼
      { cx: 210, cy: 210, click: true,  dur: 800 },
      { cx: 50,  cy: 85,  dur: 1100 },              // 아바타 탭으로 이동
      { cx: 50,  cy: 85,  click: true,  dur: 800 },
      { cx: 148, cy: 158, dur: 1200 },              // 여우로 이동
      { cx: 148, cy: 158, click: true,  dur: 800 },
      { cx: 124, cy: 200, dur: 2000 },              // 결과 감상
    ],
    render: s => <S2 step={s} />,
  },
  {
    title: '한마디는 전광판, 칩은 시그널', sub: 'MY → 내 설정에서 한마디 쓰면 카드 위에 뜸',
    steps: [
      { cx: 210, cy: 210, dur: 900 },               // MY
      { cx: 124, cy: 70,  dur: 1000 },              // 한마디 섹션
      { cx: 124, cy: 95,  click: true,  dur: 800 },  // 입력
      { cx: 124, cy: 118, click: true,  dur: 800 },  // 저장
      { cx: 124, cy: 120, dur: 1200 },              // 전광판 카드
      { cx: 124, cy: 80,  dur: 1100 },              // 전광판 가리킴
      { cx: 124, cy: 70,  dur: 1000 },              // 이상형
      { cx: 70,  cy: 110, click: true,  dur: 800 },  // 칩
      { cx: 124, cy: 150, dur: 1000 },              // 특징
      { cx: 70,  cy: 185, click: true,  dur: 900 },
      { cx: 124, cy: 140, dur: 1600 },
    ],
    render: s => <S3 step={s} />,
  },
  {
    title: '이모지랑 스티커는 따로', sub: '입력줄 😊 는 이모지 · + 다음 🎨 는 스티커',
    steps: [
      { cx: 45,  cy: 250, dur: 1000 },              // 😊 버튼 가리킴
      { cx: 45,  cy: 250, click: true,  dur: 800 },
      { cx: 83,  cy: 238, dur: 1100 },              // 이모지 피커에서 😍
      { cx: 83,  cy: 238, click: true,  dur: 800 },
      { cx: 45,  cy: 250, dur: 1000 },              // 다시 버튼
      { cx: 80,  cy: 250, dur: 900 },               // 스티커 버튼
      { cx: 80,  cy: 250, click: true,  dur: 800 },
      { cx: 35,  cy: 224, dur: 1000 },              // 스티커 선택
      { cx: 35,  cy: 224, click: true,  dur: 800 },
      { cx: 124, cy: 140, dur: 1400 },
    ],
    render: s => <S4 step={s} />,
  },
  {
    title: '사진 전송 & 빠른 메시지', sub: '📷로 사진 · ⚡로 자주 쓰는 문장 전송',
    steps: [
      { cx: 200, cy: 250, dur: 1000 },              // 📷 버튼
      { cx: 200, cy: 250, click: true,  dur: 800 },
      { cx: 124, cy: 150, dur: 1100 },              // 사진 전송됨
      { cx: 124, cy: 150, dur: 1400 },              // 감상
      { cx: 215, cy: 250, dur: 1000 },              // ⚡ 버튼
      { cx: 215, cy: 250, click: true,  dur: 800 },
      { cx: 124, cy: 215, dur: 1000 },              // 빠른메시지로 이동
      { cx: 124, cy: 215, click: true,  dur: 800 },
      { cx: 124, cy: 140, dur: 1600 },
    ],
    render: s => <S5 step={s} />,
  },
  {
    title: '스와이프 답장 & 길게누르기', sub: '메시지 옆으로 밀면 답장 · 길게 누르면 메뉴',
    steps: [
      { cx: 80,  cy: 90,  dur: 1000 },
      { cx: 150, cy: 90,  dur: 1000 },              // 스와이프
      { cx: 80,  cy: 90,  dur: 900 },
      { cx: 124, cy: 170, dur: 1400 },              // 답장 완성 감상
      { cx: 180, cy: 130, dur: 1100 },              // 내 메시지로 이동
      { cx: 180, cy: 130, click: true,  dur: 1400 }, // 길게누르기
      { cx: 200, cy: 200, dur: 1000 },              // 삭제 메뉴로 이동
      { cx: 200, cy: 210, click: true,  dur: 800 },
      { cx: 124, cy: 160, dur: 1400 },
    ],
    render: s => <S6 step={s} />,
  },
  {
    title: '받은 하트 & 보낸 하트 확인', sub: 'MY → 내 상태에서 하트 주고받은 내역 확인',
    steps: [
      { cx: 210, cy: 210, dur: 1100 },              // MY
      { cx: 210, cy: 210, click: true,  dur: 900 },
      // step 2 — 받은 하트 섹션으로 커서 이동 (Ring on)
      { cx: 124, cy: 95,  dur: 1100 },
      // step 3 — 첫 번째 항목 강조 + 수락/거절 버튼 등장
      { cx: 124, cy: 115, dur: 1100 },
      // step 4 — 수락 버튼 위로 커서 이동
      { cx: 196, cy: 115, dur: 1000 },
      // step 5 — 수락 클릭 → accepted=true, 연락처 공유 ✓
      { cx: 196, cy: 115, click: true,  dur: 1000 },
      // step 6 — 보낸 하트 섹션으로 이동 (amber highlight + 스크롤)
      { cx: 124, cy: 210, dur: 1200 },
      // step 7 — 보낸 하트 감상
      { cx: 124, cy: 225, dur: 2200 },
    ],
    render: s => <S7 step={s} />,
  },
  {
    title: '시그널은 밀어보세요', sub: '왼쪽 = 패스(별로) · 오른쪽 = 시그널 보내기',
    steps: [
      { cx: 90,  cy: 70,  dur: 1100 },
      { cx: 70,  cy: 130, dur: 1100 },
      { cx: 40,  cy: 130, dur: 1000 },
      { cx: 180, cy: 130, dur: 1100 },
      { cx: 210, cy: 130, dur: 1000 },
      { cx: 124, cy: 150, dur: 1800 },
    ],
    render: s => <S8 step={s} />,
  },
];

// ══════════════════════════════════════════════════════════════════════════════
// 메인 플레이어
// ══════════════════════════════════════════════════════════════════════════════
export function TutorialVideo({
  onClose,
  embedded = false,
  compact = false,
  fill = false,
  sceneIndices,
}: {
  onClose: () => void;
  embedded?: boolean;
  compact?: boolean;
  fill?: boolean;
  sceneIndices?: number[];
}) {
  const playlist = (sceneIndices?.length ? sceneIndices : SCENES.map((_, i) => i))
    .filter((i) => i >= 0 && i < SCENES.length);
  const [playIdx, setPlayIdx] = useState(0);
  const sceneIdx = playlist[Math.min(playIdx, playlist.length - 1)] ?? 0;
  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scene = SCENES[sceneIdx];
  const step = scene.steps[Math.min(stepIdx, scene.steps.length - 1)];

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const goPlay = useCallback((nextPlay: number) => {
    clearTimer();
    setPlayIdx(Math.max(0, Math.min(playlist.length - 1, nextPlay)));
    setStepIdx(0);
  }, [clearTimer, playlist.length]);

  // 스텝 자동 전진 — playing 상태일 때만
  useEffect(() => {
    if (!playing) return;
    const s = scene.steps[stepIdx] ?? scene.steps[scene.steps.length - 1];
    timerRef.current = setTimeout(() => {
      if (stepIdx < scene.steps.length - 1) {
        setStepIdx(p => p + 1);
      } else if (playIdx < playlist.length - 1) {
        goPlay(playIdx + 1);
      } else {
        goPlay(0);
      }
    }, s.dur);
    return clearTimer;
  }, [playing, stepIdx, playIdx, scene, playlist.length, clearTimer, goPlay]);

  // 언마운트 시 타이머 정리
  useEffect(() => clearTimer, [clearTimer]);

  const progress = (() => {
    const total = scene.steps.reduce((a, s) => a + s.dur, 0);
    let done = 0;
    for (let i = 0; i < stepIdx; i++) done += scene.steps[i].dur;
    return Math.min(100, (done / total) * 100);
  })();

  const DESIGN_H = 248;
  const COMPACT_STAGE_H = 128;
  const scaleStage = compact || fill;
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageH, setStageH] = useState(compact ? COMPACT_STAGE_H : DESIGN_H);
  useEffect(() => {
    if (!scaleStage) return;
    const el = stageRef.current;
    if (!el) return;
    const sync = () => setStageH(el.clientHeight || (compact ? COMPACT_STAGE_H : DESIGN_H));
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scaleStage, compact]);
  const sceneScale = scaleStage ? Math.min(1, stageH / DESIGN_H) : 1;
  const sceneH = embedded ? 220 : 280;
  const clock = (() => {
    const total = scene.steps.reduce((a, s) => a + s.dur, 0);
    const sec = Math.round((progress / 100) * (total / 1000));
    return `0:${String(Math.min(59, sec)).padStart(2, '0')}`;
  })();
  const player = (
    <div className={`relative w-full min-h-0 overflow-hidden bg-black flex flex-col ${
      embedded
        ? `${compact && !fill ? '' : 'h-full '} ${compact ? 'rounded-[1.05rem] border-2' : 'rounded-[1.35rem] border-[3px]'} border-zinc-800 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]`
        : 'max-w-xs rounded-[1.75rem] shadow-2xl border-[3px] border-zinc-800'
    }`}>
      <div className={`flex items-center gap-1 flex-shrink-0 ${compact ? 'px-1.5 pt-0.5 pb-0' : 'px-3 pt-2.5 pb-1.5'}`}>
        <span className={`relative flex flex-shrink-0 ${compact ? 'h-1.5 w-1.5' : 'h-2 w-2'}`}>
          <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-60" />
          <span className={`relative rounded-full bg-red-500 ${compact ? 'h-1.5 w-1.5' : 'h-2 w-2'}`} />
        </span>
        <span className={`${compact ? 'text-[8px]' : 'text-[9px]'} text-red-400 font-black tracking-wider`}>REC</span>
        <p className={`flex-1 min-w-0 text-center text-white font-bold truncate ${compact ? 'text-[9px]' : 'text-[12px]'}`}>{scene.title}</p>
        <span className={`${compact ? 'text-[8px]' : 'text-[9px]'} text-zinc-400 font-mono tabular-nums`}>{clock}</span>
        {!embedded && (
          <button onClick={onClose}
            className="w-6 h-6 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-300 text-[10px] flex-shrink-0">
            ✕
          </button>
        )}
      </div>
      <p className={`text-zinc-500 text-center leading-tight flex-shrink-0 truncate px-1.5 break-keep ${compact ? 'text-[7px] pb-0' : 'text-[9px] pb-1.5'}`}>{scene.sub}</p>

      <div
        ref={stageRef}
        className={`overflow-hidden bg-slate-900 relative ${
          compact ? 'mx-1 rounded-lg' : 'mx-2 mb-1 rounded-2xl'
        } ${fill ? 'flex-1 min-h-0' : 'flex-shrink-0'}`}
        style={fill ? undefined : compact ? { height: COMPACT_STAGE_H } : { height: sceneH }}
      >
        <div
          key={sceneIdx}
          className="w-full animate-in fade-in duration-300 relative"
          style={scaleStage ? {
            height: DESIGN_H,
            transform: `scale(${sceneScale})`,
            transformOrigin: 'top center',
          } : { height: '100%' }}
        >
          {scene.render(stepIdx)}
          <Cursor x={step.cx} y={step.cy} clicking={step.click ?? false} />
        </div>
      </div>

      <div className={`flex-shrink-0 ${compact ? 'px-1.5 pt-0.5 pb-0.5' : 'px-3 pt-2 pb-3'}`}>
        <div className={`flex items-center gap-1.5 ${compact ? 'mb-0.5' : 'mb-1.5'}`}>
          <span className="text-[8px] text-zinc-500 font-mono w-6">{clock}</span>
          <div className="flex-1 flex gap-0.5">
            {playlist.map((sceneNo, i) => (
              <button key={sceneNo} onClick={() => goPlay(i)} className="flex-1 h-1 rounded-full overflow-hidden bg-zinc-700">
                <div className="h-full bg-white transition-all duration-100"
                  style={{ width: i < playIdx ? '100%' : i === playIdx ? `${progress}%` : '0%' }} />
              </button>
            ))}
          </div>
          <span className="text-[8px] text-zinc-500 font-mono w-6 text-right">{playIdx + 1}/{playlist.length}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => goPlay(playIdx - 1)} disabled={playIdx === 0}
            className={`${compact ? 'w-6 h-6' : 'w-8 h-8'} rounded-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 flex items-center justify-center transition-all`}>
            <SkipBack className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} text-zinc-200`} />
          </button>
          <button onClick={() => setPlaying(p => !p)}
            className={`flex-1 flex items-center justify-center gap-1 rounded-full bg-white text-black font-black transition-all active:scale-95 ${compact ? 'py-0 text-[9px]' : 'py-2 text-[12px] gap-2'}`}>
            {playing ? <Pause className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} /> : <Play className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />}
            {playing ? '일시정지' : '재생'}
          </button>
          <button
            onClick={() => playIdx === playlist.length - 1 ? (embedded ? goPlay(0) : onClose()) : goPlay(playIdx + 1)}
            className={`${compact ? 'w-6 h-6' : 'w-8 h-8'} rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-all`}>
            <SkipForward className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} text-zinc-200`} />
          </button>
        </div>
      </div>
    </div>
  );

  if (embedded) return player;

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center sm:items-center p-4 bg-black/85 backdrop-blur-sm"
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}>{player}</div>
    </div>
  );
}
