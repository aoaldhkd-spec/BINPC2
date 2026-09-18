/**
 * TutorialVideo — 2026.09 UI redesign (obviously new chrome + filled scenes)
 * Phone-bezel player · LIVE badge · participants/hearts/chat mocks with no empty gaps.
 * S1 입장코드 → S2 아바타 → S3 한마디/칩 → S4 이모지·스티커 → S5 사진·빠른메시지
 * → S6 스와이프·길게누르기 → S7 받은 하트 → S8 하트 보내기 → S9 무지개하트
 */
import { useState, useEffect, useLayoutEffect, useRef, useCallback, type ReactElement, type ReactNode, type PointerEvent, type MouseEvent } from 'react';
import { SkipBack, SkipForward, Play, Pause } from 'lucide-react';

// ── 커서 — RAF lerp (느리게 수렴 → 끊김·점프 완화) ───────────────────────────
function Cursor({ x, y, clicking }: { x: number; y: number; clicking: boolean }) {
  const elRef   = useRef<HTMLDivElement>(null);
  const posRef  = useRef({ x, y });
  const tgtRef  = useRef({ x, y });
  const rafRef  = useRef<number | null>(null);

  useEffect(() => {
    tgtRef.current = { x, y };

    const tick = () => {
      const { x: cx, y: cy } = posRef.current;
      const { x: tx, y: ty } = tgtRef.current;
      const dx = tx - cx;
      const dy = ty - cy;
      // 0.10 → 약 650ms에 수렴 (이전 0.14보다 부드러움)
      const nx = cx + dx * 0.10;
      const ny = cy + dy * 0.10;
      posRef.current = { x: nx, y: ny };
      if (elRef.current) {
        elRef.current.style.left = `${nx}px`;
        elRef.current.style.top  = `${ny}px`;
      }
      if (Math.abs(dx) > 0.12 || Math.abs(dy) > 0.12) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [x, y]);

  useEffect(() => () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); }, []);

  return (
    <div
      ref={elRef}
      className="absolute pointer-events-none z-50"
      style={{ left: posRef.current.x, top: posRef.current.y, transform: 'translate(-3px, -3px)' }}
    >
      {clicking && (
        <div className="absolute -inset-4 rounded-full bg-cyan-400/30 animate-ping" />
      )}
      <svg width="22" height="28" viewBox="0 0 22 28" fill="none"
        className={`drop-shadow-lg transition-transform duration-200 ${clicking ? 'scale-90' : 'scale-100'}`}>
        <path d="M2 2L2 20L6 16L9 23L12 22L9 15L14 15L2 2Z" fill="white" stroke="#1e293b" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function Ring({ on, color = 'ring-cyan-400' }: { on: boolean; color?: string }) {
  if (!on) return null;
  return <div className={`absolute inset-0 pointer-events-none ring-2 ring-offset-1 ring-offset-slate-900 ${color} rounded-[inherit] transition-all duration-500`} />;
}

function Tip({ text, show, dir = 'bottom' }: { text: string; show: boolean; dir?: 'top' | 'bottom' | 'left' | 'right' }) {
  if (!show) return null;
  const pos = {
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }[dir];
  return (
    <div className={`absolute ${pos} z-40 bg-cyan-500 text-white text-[9px] font-black px-2 py-1 rounded-lg break-keep [word-break:keep-all] text-pretty max-w-[9.5rem] leading-tight text-center shadow-lg animate-in fade-in duration-300`}>
      {text}
    </div>
  );
}

/** 하단 탭 — 라이브 MainScreen: 참여자 | 하트, 채팅 | 통계 | 랭킹 | 설정 */
function Tabs({ active, hl }: { active: string; hl?: string }) {
  const row = [
    { id: 'profiles', e: '👥', l: '참여자' },
    { id: 'my', e: '💝', l: '하트, 채팅' },
    { id: 'stats', e: '📊', l: '통계' },
    { id: 'ranking', e: '🏆', l: '랭킹' },
    { id: 'settings', e: '⚙️', l: '설정' },
  ];
  return (
    <div className="border-t border-cyan-500/30 bg-gradient-to-t from-slate-950 via-slate-900 to-slate-900/95 px-0.5 pt-0.5 pb-1 shadow-[0_-6px_16px_rgba(34,211,238,0.12)]">
      <div className="flex gap-0.5">
        {row.map(t => {
          const on = active === t.id;
          return (
            <div
              key={t.id}
              className={`relative flex-1 flex flex-col items-center py-1 rounded-xl border transition-all duration-300 ${
                on
                  ? 'border-cyan-400/70 bg-cyan-500/20 shadow-[inset_0_0_12px_rgba(34,211,238,0.25)]'
                  : 'border-transparent bg-slate-800/40'
              }`}
            >
              <Ring on={hl === t.id} />
              <span className="text-[13px] leading-none drop-shadow">{t.e}</span>
              <span className={`text-[6.5px] font-black mt-0.5 tracking-tight ${on ? 'text-cyan-300' : 'text-slate-500'}`}>{t.l}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 홈 헤더 하트 — 라이브: 무지개 2×2 + 호감·친구·뜨밤·칭찬 2×2 */
function HeartHeader({ unlocked, rainbowLeft = 4 }: { unlocked: boolean; rainbowLeft?: number }) {
  const colors = [
    { key: 'red', e: '❤️' },
    { key: 'pink', e: '💗' },
    { key: 'blue', e: '💙' },
    { key: 'green', e: '💚' },
  ];
  return (
    <div className={`relative flex items-center justify-between gap-1 px-2 py-1.5 border-b overflow-hidden ${
      unlocked
        ? 'border-cyan-400/50 bg-gradient-to-r from-slate-950 via-cyan-950/40 to-slate-950'
        : 'border-amber-500/40 bg-gradient-to-r from-slate-950 via-amber-950/35 to-slate-950'
    }`}>
      {!unlocked && (
        <span className="absolute inset-0 bg-[repeating-linear-gradient(-45deg,transparent,transparent_6px,rgba(245,158,11,0.07)_6px,rgba(245,158,11,0.07)_12px)] pointer-events-none" />
      )}
      <div className="min-w-0 relative">
        <p className="text-[8px] font-black text-white tracking-tight truncate">🍻 범일NPC</p>
        <p className={`text-[6px] font-black truncate ${unlocked ? 'text-cyan-300' : 'text-amber-300'}`}>
          {unlocked ? '✅ 하트 해금' : '🔒 다음 해금까지 12:30'}
        </p>
      </div>
      <div className="relative flex items-center gap-1 flex-shrink-0">
        <div className={`grid grid-cols-2 grid-rows-2 w-8 h-8 rounded-md overflow-hidden ${
          unlocked ? 'bg-fuchsia-900/60 text-fuchsia-100' : 'bg-slate-700 text-slate-300'
        }`}>
          <span aria-hidden className="col-span-2 flex items-center justify-center text-[10px] leading-none">{unlocked ? '🌈' : '🔒🌈'}</span>
          <span className="col-span-2 flex items-center justify-center text-[8px] font-black tabular-nums leading-none">{rainbowLeft}</span>
        </div>
        <div className="grid grid-cols-2 grid-rows-2 gap-px w-8 h-8">
          {colors.map((h) => (
            <span
              key={h.key}
              className={`flex items-center justify-center rounded-[3px] text-[8px] leading-none ${
                unlocked ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-400 grayscale opacity-70'
              }`}
            >
              {h.e}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 채팅 입력행 — 라이브 ChatScreen: [+] [😊] [입력] [➤] */
function ChatComposer({
  highlight,
  moreOpen,
  tip,
}: {
  highlight?: 'plus' | 'smile' | 'send' | null;
  moreOpen?: boolean;
  tip?: string;
}) {
  return (
    <div className="bg-white border-t border-gray-200 shrink-0">
      <div className="px-2 py-1.5 flex items-end gap-1.5">
        <div className={`relative w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold transition-all duration-300 ${
          moreOpen || highlight === 'plus' ? 'bg-gray-200 text-gray-600' : 'text-gray-400'
        }`}>
          <Ring on={highlight === 'plus'} color="ring-cyan-400" />
          {highlight === 'plus' && tip && <Tip text={tip} show dir="top" />}
          {moreOpen ? '✕' : '+'}
        </div>
        <div className={`relative w-7 h-7 rounded-full flex items-center justify-center text-sm transition-all duration-300 ${
          highlight === 'smile' ? 'bg-cyan-50 text-cyan-500' : 'text-gray-400'
        }`}>
          <Ring on={highlight === 'smile'} color="ring-cyan-400" />
          {highlight === 'smile' && tip && <Tip text={tip} show dir="top" />}
          😊
        </div>
        <div className="flex-1 min-h-[28px] rounded-2xl border border-gray-300 bg-white px-2 py-1 flex items-center">
          <span className="text-[10px] text-gray-400">메시지를 입력하세요...</span>
        </div>
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] text-white transition-all duration-300 ${
          highlight === 'send' ? 'bg-cyan-600 scale-105' : 'bg-cyan-500'
        }`}>➤</div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Scene 1: 입장 코드 (EntryGateScreen)
// ══════════════════════════════════════════════════════════════════════════════
function S1({ step }: { step: number }) {
  const typed = step >= 2 ? (step >= 3 ? '••••' : '••') : '';
  const verifying = step >= 5;
  const done = step >= 6;
  return (
    <div className="h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-3 gap-2">
      {!done ? (
        <>
          <div className="text-center space-y-0.5">
            <div className="text-3xl drop-shadow">🍻</div>
            <p className="text-white font-black text-sm tracking-tight">범일NPC 술번개</p>
            <p className="text-slate-400 text-[9px]">참여하려면 입장 코드를 입력하세요</p>
          </div>
          <div className={`w-full max-w-[210px] rounded-2xl border border-slate-700/60 bg-slate-800/70 p-2.5 space-y-2 transition-all duration-500 ${verifying ? 'opacity-80' : ''}`}>
            <div className={`relative rounded-xl border-2 px-2 py-2 text-center transition-all duration-300 ${
              step >= 1 && step < 4 ? 'border-cyan-500 bg-slate-700/60' : 'border-slate-600 bg-slate-700/40'
            }`}>
              <Ring on={step === 1} color="ring-cyan-400" />
              <Tip text="입장 코드 입력" show={step === 1} dir="bottom" />
              <span className={`text-sm font-black tracking-[0.28em] ${typed ? 'text-white' : 'text-slate-500'}`}>
                {typed || '••••'}
              </span>
            </div>
            <div className={`relative w-full py-2 rounded-xl text-center text-[11px] font-black text-white transition-all duration-300 ${
              verifying ? 'bg-cyan-700/60' : step >= 4 ? 'bg-cyan-600 scale-[1.02]' : 'bg-cyan-600'
            }`}>
              <Ring on={step === 4} color="ring-cyan-300" />
              <Tip text="입장하기" show={step === 4} dir="top" />
              {verifying ? '입장 중…' : '입장하기 →'}
            </div>
          </div>
        </>
      ) : (
        <div className="text-center animate-in fade-in zoom-in-95 duration-700">
          <div className="text-4xl mb-2">🎉</div>
          <p className="text-white font-black text-sm">입장 완료!</p>
          <p className="text-slate-400 text-[10px] mt-1">프로필을 만들고 시작해 보세요</p>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Scene 2: 사진 · 아바타 (카탈로그)
// ══════════════════════════════════════════════════════════════════════════════
function S2({ step }: { step: number }) {
  const showPicker = step >= 2;
  const selected = step >= 4 ? 2 : 0;
  const cats = ['✨ 인물', '🎤 케이팝', '🍔 음식'];
  const avatars = [
    { bg: 'from-pink-400 to-rose-500', label: '핑크' },
    { bg: 'from-teal-400 to-cyan-500', label: '민트' },
    { bg: 'from-violet-400 to-purple-600', label: '퍼플' },
    { bg: 'from-orange-300 to-amber-500', label: '코럴' },
    { bg: 'from-slate-600 to-slate-800', label: '시크' },
  ];
  return (
    <div className="h-full flex flex-col bg-slate-900">
      <div className="flex-1 overflow-hidden flex flex-col px-2.5 pt-2 gap-1.5">
        <p className="text-slate-400 text-[8px] font-bold">설정 탭 → 사진 · 아바타</p>
        <div className={`relative rounded-xl border p-2 transition-all duration-500 ${step === 1 ? 'border-cyan-400 bg-slate-800' : 'border-slate-700 bg-slate-800/80'}`}>
          <Ring on={step === 1} />
          <Tip text="사진 · 아바타 열기" show={step === 1} dir="bottom" />
          <div className="flex items-center gap-2">
            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${avatars[selected].bg} flex items-center justify-center text-[10px] font-black text-white shadow-inner`}>
              {avatars[selected].label}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-[10px] font-black">📷 사진 · 아바타</p>
              <p className="text-slate-400 text-[8px]">업로드 또는 기본 아바타</p>
            </div>
          </div>
        </div>

        {showPicker && (
          <div className="bg-slate-800 border border-cyan-500/50 rounded-xl p-2 animate-in fade-in slide-in-from-top-2 duration-500">
            <div className="flex gap-1 mb-1.5">
              {cats.map((c, i) => (
                <span key={c} className={`px-1.5 py-0.5 rounded-full text-[7px] font-bold border transition-all duration-300 ${
                  i === 0 ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200' : 'border-slate-600 text-slate-500'
                }`}>{c}</span>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-1">
              {avatars.map((a, i) => (
                <div
                  key={a.label}
                  className={`relative h-9 rounded-lg bg-gradient-to-br ${a.bg} flex items-center justify-center text-[7px] font-black text-white transition-all duration-400 ${
                    selected === i ? 'ring-2 ring-cyan-300 scale-105' : 'opacity-80'
                  } ${step === 3 && i === 2 ? 'animate-pulse' : ''}`}
                >
                  <Ring on={step === 3 && i === 2} color="ring-violet-300" />
                  {a.label}
                </div>
              ))}
            </div>
            <div className="mt-1.5 h-7 rounded-lg border border-dashed border-slate-500 flex items-center justify-center text-[8px] text-slate-400 font-bold">
              + 내 사진 업로드
            </div>
            {step >= 4 && (
              <p className="mt-1.5 text-center text-cyan-300 text-[9px] font-bold animate-in fade-in duration-500">
                ✅ 퍼플 쿨가이로 변경!
              </p>
            )}
          </div>
        )}
      </div>
      <Tabs active="settings" hl={step === 0 ? 'settings' : undefined} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Scene 3: 한마디 전광판 · 이상형/특징 칩
// ══════════════════════════════════════════════════════════════════════════════
function S3({ step }: { step: number }) {
  const status = step >= 2 ? '인연 만들고 싶어요 ✨' : '';
  const showTicker = step >= 4;
  const showIdeal = step >= 6;
  const showFeat = step >= 8;
  const idealOn = step >= 7;
  const featOn = step >= 9;
  return (
    <div className="h-full flex flex-col bg-slate-900 overflow-hidden relative">
      <div className="flex-1 px-2.5 pt-2 space-y-1.5 overflow-hidden">
        <p className="text-slate-400 text-[8px] font-bold">설정 탭 · 프로필 편집</p>

        {!showTicker && (
          <div className={`relative bg-slate-800 border rounded-xl p-2 transition-all duration-500 ${step <= 3 ? 'border-cyan-400/70' : 'border-slate-700'}`}>
            <Ring on={step <= 1} color="ring-cyan-400" />
            <Tip text="한마디 = 전광판!" show={step === 1} dir="bottom" />
            <p className="text-white text-[10px] font-black">💬 오늘의 한마디</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {['오늘 처음 왔어요!', '인연 만들고 싶어요 ✨', '2차 클럽?'].map((q, i) => (
                <span key={q} className={`px-1.5 py-0.5 rounded-full text-[7px] font-bold border transition-all duration-300 ${
                  status && i === 1 ? 'bg-cyan-500 text-white border-transparent' : 'border-slate-600 text-slate-400'
                }`}>{q}</span>
              ))}
            </div>
            <div className={`mt-1.5 rounded-lg px-2 py-1 text-[9px] font-bold border transition-all duration-300 ${
              status ? 'border-cyan-400 text-cyan-100 bg-slate-700' : 'border-slate-600 text-slate-500'
            }`}>
              {status || '빠른 선택 또는 직접 입력'}
            </div>
            {step >= 3 && <p className="text-cyan-400 text-[8px] mt-1 font-bold animate-in fade-in duration-400">저장 → 카드 위 전광판</p>}
          </div>
        )}

        {showTicker && !showIdeal && (
          <div className="relative w-[7.4rem] mx-auto rounded-xl overflow-hidden border border-slate-600 bg-slate-800 animate-in fade-in duration-500">
            <div className="relative h-24 bg-gradient-to-br from-teal-700 to-slate-800">
              <div
                className="absolute top-0 inset-x-0 z-10 flex items-center min-h-[16px] px-1.5"
                style={{ background: 'linear-gradient(90deg,rgba(15,23,42,0.88),rgba(17,94,89,0.88))', borderBottom: '1px solid rgba(45,212,191,0.4)' }}
              >
                <span className="text-[7px] font-extrabold text-teal-100 whitespace-nowrap">{status}</span>
              </div>
              <div className="absolute bottom-0 inset-x-0 bg-white/95 px-1.5 py-0.5">
                <div className="flex items-center">
                  <span className="text-[9px] font-black text-gray-950">하늘다람쥐</span>
                  <span className="ml-auto text-[8px] font-bold text-gray-600">28</span>
                </div>
                <p className="text-[6px] text-gray-500 font-bold truncate">ENFP · #맥주 #클럽</p>
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
          <div className={`relative bg-slate-800 border rounded-xl p-2 transition-all duration-500 ${step < 8 ? 'border-rose-400/70' : 'border-slate-700'}`}>
            <Ring on={step === 6} color="ring-rose-400" />
            <Tip text="이상형 칩 선택" show={step === 6} dir="bottom" />
            <p className="text-white text-[10px] font-black">💘 이상형</p>
            <p className="text-[7px] text-slate-500 font-bold mt-0.5">얼굴 · 체형 · 매력 · 재능 · 라이프 · 성격</p>
            <div className="grid grid-cols-2 gap-1 mt-1">
              {['여우상 🦊', '키큰 📏', '다정한 💕', '유머있는 😂'].map((tag, i) => (
                <span key={tag} className={`px-1.5 py-1 rounded-lg text-[8px] font-bold border text-center transition-all duration-400 ${
                  idealOn && i < 2 ? 'text-white border-transparent' : 'text-slate-400 border-slate-600'
                }`}
                  style={idealOn && i < 2 ? { background: 'linear-gradient(135deg,#e11d48,#be185d)' } : {}}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {showFeat && (
          <div className="relative bg-slate-800 border border-violet-400/70 rounded-xl p-2 animate-in fade-in duration-500">
            <Ring on={step >= 8} color="ring-violet-400" />
            <p className="text-white text-[10px] font-black">🌟 나의 특징</p>
            <p className="text-[7px] text-slate-500 font-bold mt-0.5">같은 칩 · 프로필 카드에 표시</p>
            <div className="grid grid-cols-2 gap-1 mt-1">
              {['시크한 😎', '슬림 🦴', '리드하는 👑', '다정한 💕'].map((tag, i) => (
                <span key={tag} className={`px-1.5 py-1 rounded-lg text-[8px] font-bold border text-center transition-all duration-400 ${
                  featOn && i < 2 ? 'text-white border-transparent' : 'text-slate-400 border-slate-600'
                }`}
                  style={featOn && i < 2 ? { background: 'linear-gradient(135deg,#7c3aed,#6d28d9)' } : {}}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      <Tabs active="settings" hl={step === 0 ? 'settings' : undefined} />
    </div>
  );
}


/** ChatWallpaper — 라이브 ChatScreen과 같은 흰 헤더·회색 본문. */
function ChatWallpaper({ children }: { children: ReactNode }) {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-100">
      <header className="bg-white shadow-sm shrink-0 z-10">
        <div className="px-2 pt-1.5 pb-0.5 flex items-center gap-1.5">
          <span className="text-gray-700 text-[12px] leading-none">←</span>
          <span className="w-6 h-6 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 ring-1 ring-gray-200 shrink-0" />
          <p className="font-semibold text-gray-900 text-[11px] truncate flex-1">하늘다람쥐</p>
        </div>
        <div className="px-2 pb-1 flex items-center gap-1 overflow-hidden">
          <span className="px-1.5 py-0.5 bg-amber-50 text-amber-600 text-[7px] font-bold rounded-lg border border-amber-200">📅 사주</span>
          <span className="px-1.5 py-0.5 bg-violet-50 text-violet-600 text-[7px] font-bold rounded-lg border border-violet-200">🔮 궁합</span>
          <span className="px-1.5 py-0.5 bg-cyan-50 text-cyan-600 text-[7px] font-bold rounded-lg border border-cyan-200">📱 공유</span>
        </div>
      </header>
      <div className="relative flex-1 min-h-0 flex flex-col">{children}</div>
    </div>
  );
}

function ChatBubble({ mine, children }: { mine?: boolean; children: ReactNode }) {
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <span className={`max-w-[72%] text-[10px] px-2.5 py-1.5 ${
        mine ? 'bg-cyan-500 text-white rounded-2xl rounded-br-md' : 'bg-white text-gray-900 rounded-2xl rounded-bl-md shadow-sm'
      }`}>{children}</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Scene 4: 이모지 & 스티커 (라이트 채팅 UI)
// ══════════════════════════════════════════════════════════════════════════════
function S4({ step }: { step: number }) {
  const showEmoji = step >= 1 && step < 4;
  const showMore = step === 4;
  const showSticker = step >= 5;
  const pickedEmoji = step >= 2 ? '😍' : '';
  const emojis = ['😀', '😂', '🥰', '😍', '🤩', '😎', '🥳', '😜'];
  const stickers = ['🎊', '🌟', '💎', '🎵', '🌈', '🦋'];
  return (
    <ChatWallpaper>
      <div className="flex-1 px-3 py-2 flex flex-col gap-1 overflow-hidden justify-end">
        <ChatBubble>오늘 재밌었어요!</ChatBubble>
        <ChatBubble>이모지·스티커 써봐요 ✨</ChatBubble>
        <ChatBubble mine>저도요 😊</ChatBubble>
        {pickedEmoji && (
          <div className="animate-in fade-in duration-400">
            <ChatBubble mine>{pickedEmoji}</ChatBubble>
          </div>
        )}
        {step >= 6 && (
          <div className="flex justify-end animate-in fade-in duration-400">
            <span className="bg-cyan-500 text-white text-2xl px-3 py-2 rounded-2xl rounded-br-md">🎊</span>
          </div>
        )}
      </div>

      {showEmoji && (
        <div className="bg-white border-t border-gray-200 p-2 animate-in fade-in slide-in-from-bottom-2 duration-400">
          <div className="flex gap-1 mb-1 bg-gray-50 px-1 py-0.5">
            {['😀 표정', '❤️ 하트', '🎉 축하'].map((c, i) => (
              <span key={c} className={`flex-1 text-center px-1 py-0.5 rounded text-[7px] font-bold ${i === 0 ? 'text-cyan-600' : 'text-gray-400 opacity-40'}`}>{c}</span>
            ))}
          </div>
          <div className="grid grid-cols-8 gap-0.5">
            {emojis.map((e, i) => (
              <div key={e} className={`relative h-7 w-7 rounded-lg flex items-center justify-center text-base transition-all duration-300 ${
                step === 2 && i === 3 ? 'bg-cyan-100 ring-2 ring-cyan-400 scale-110' : 'bg-gray-50'
              }`}>
                <Ring on={step === 2 && i === 3} />
                {e}
              </div>
            ))}
          </div>
        </div>
      )}

      {showMore && (
        <div className="bg-white border-t border-gray-200 px-2 pt-1.5 flex items-center gap-1 animate-in fade-in duration-300">
          <div className="p-1.5 rounded-full text-gray-400 text-sm">📷</div>
          <div className="relative p-1.5 rounded-full bg-rose-50 text-base">
            <Ring on color="ring-rose-400" />
            <Tip text="🎨 스티커" show dir="top" />
            🎨
          </div>
          <div className="p-1.5 rounded-full text-base">⚡</div>
          <div className="p-1.5 rounded-full text-base">📋</div>
        </div>
      )}

      {showSticker && (
        <div className="bg-white border-t border-gray-200 p-2 animate-in fade-in slide-in-from-bottom-2 duration-400">
          <p className="text-indigo-500 text-[8px] font-black mb-1">🎨 스티커 — + 다음 🎨</p>
          <div className="grid grid-cols-6 gap-1">
            {stickers.map((s, i) => (
              <div key={s} className={`relative h-9 rounded-xl flex items-center justify-center text-xl transition-all duration-300 ${
                step === 6 && i === 0 ? 'bg-rose-100 ring-2 ring-rose-400 scale-110' : 'bg-gray-50'
              }`}>
                <Ring on={step === 6 && i === 0} color="ring-rose-400" />
                {s}
              </div>
            ))}
          </div>
        </div>
      )}

      {!showEmoji && !showSticker && (
        <>
          {showMore ? null : (
            <ChatComposer
              highlight={step === 0 ? 'smile' : step === 3 ? 'plus' : null}
              tip={step === 0 ? '😊 이모지' : step === 3 ? '+ 더보기' : undefined}
            />
          )}
          {showMore && <ChatComposer moreOpen highlight="plus" />}
        </>
      )}
    </ChatWallpaper>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Scene 5: 사진 · 빠른 메시지 (+ 펼침)
// ══════════════════════════════════════════════════════════════════════════════
function S5({ step }: { step: number }) {
  const showMore = step >= 0 && step < 5;
  const showUploading = step === 2;
  const imgSent = step >= 3;
  const showQuick = step >= 5;
  const quickMsgs = ['오늘 즐거웠어요 ☺️', '술 한 잔 더 할래요? 🍺', '번호 교환해요! 📱', '이따가 연락해요 ☎️'];
  return (
    <ChatWallpaper>
      <div className="flex-1 px-3 py-2 space-y-1 overflow-hidden flex flex-col justify-end">
        <ChatBubble>사진 있어요?</ChatBubble>
        {showUploading && (
          <div className="flex justify-end">
            <div className="bg-cyan-400/50 rounded-2xl rounded-br-md p-2 w-24 h-16 flex items-center justify-center animate-pulse">
              <span className="text-white text-[9px] font-bold">업로드 중…</span>
            </div>
          </div>
        )}
        {imgSent && (
          <div className="flex justify-end animate-in fade-in duration-500">
            <div className="bg-cyan-500 rounded-2xl rounded-br-md p-1.5 w-24 h-16 flex items-center justify-center">
              <span className="text-3xl">🌅</span>
            </div>
          </div>
        )}
        {step >= 7 && (
          <div className="animate-in fade-in duration-400">
            <ChatBubble mine>오늘 즐거웠어요 ☺️</ChatBubble>
          </div>
        )}
      </div>

      {showQuick && (
        <div className="bg-white border-t border-gray-200 p-2 animate-in fade-in slide-in-from-bottom-2 duration-400 max-h-[7.5rem] overflow-hidden">
          <p className="text-violet-500 text-[8px] font-black mb-1">⚡ 빠른 메시지</p>
          <div className="space-y-1">
            {quickMsgs.map((q, i) => (
              <div key={q} className={`relative px-2.5 py-1 rounded-xl text-[9px] font-semibold transition-all duration-300 ${
                step >= 6 && i === 0 ? 'bg-violet-500 text-white' : 'bg-gray-50 text-gray-600'
              }`}>
                <Ring on={step === 5 && i === 0} color="ring-violet-400" />
                {q}
              </div>
            ))}
          </div>
        </div>
      )}

      {!showQuick && (
        <>
          {showMore && (
            <div className="bg-white border-t border-gray-200 px-2 pt-1.5 flex items-center gap-1 animate-in fade-in duration-300">
              <div className={`relative p-1.5 rounded-full text-sm transition-all duration-300 ${
                step === 1 || step === 2 ? 'bg-cyan-50 text-cyan-600' : 'text-gray-400'
              }`}>
                <Ring on={step === 1} />
                {step === 1 && <Tip text="📷 사진" show dir="top" />}
                📷
              </div>
              <div className="p-1.5 rounded-full text-base">🎨</div>
              <div className={`relative p-1.5 rounded-full text-base transition-all duration-300 ${
                step === 4 ? 'bg-violet-100' : ''
              }`}>
                <Ring on={step === 4} color="ring-violet-400" />
                {step === 4 && <Tip text="⚡ 빠른 메시지" show dir="top" />}
                ⚡
              </div>
              <div className="p-1.5 rounded-full text-base">📋</div>
            </div>
          )}
          <ChatComposer moreOpen={showMore} highlight={step === 0 ? 'plus' : null} tip={step === 0 ? '+ 더보기' : undefined} />
        </>
      )}
    </ChatWallpaper>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Scene 6: 스와이프 답장 · 길게누르기
// ══════════════════════════════════════════════════════════════════════════════
function S6({ step }: { step: number }) {
  const swipeOffset = step === 1 ? 48 : 0;
  const showReply = step >= 2;
  const showCtx = step >= 4;
  return (
    <ChatWallpaper>
      <div className="flex-1 px-3 py-2 space-y-1 overflow-hidden flex flex-col justify-end relative">
        <ChatBubble>오늘 같은 자리라 반가웠어요!</ChatBubble>
        <div className="flex justify-start">
          <div className="relative transition-transform duration-500 ease-out" style={{ transform: `translateX(${swipeOffset}px)` }}>
            <span className="bg-white text-gray-900 text-[10px] px-2.5 py-1.5 rounded-2xl rounded-bl-md inline-block shadow-sm max-w-[72%]">
              내일도 올 거죠?
            </span>
            <Ring on={step === 1} color="ring-cyan-400" />
            {step === 1 && (
              <div className="absolute right-full mr-1.5 top-1/2 -translate-y-1/2 text-[8px] text-cyan-600 font-black whitespace-nowrap">
                ←→ 스와이프
              </div>
            )}
          </div>
        </div>

        {showReply && (
          <div className="flex items-center gap-1 animate-in fade-in duration-500">
            <div className="flex-1 min-w-0 bg-cyan-50 border-l-4 border-cyan-400 rounded-r-xl px-2 py-1 text-[9px] text-gray-600">
              <span className="font-bold text-cyan-600 mr-1">하늘다람쥐에 답장</span>
              <span className="line-clamp-1">내일도 올 거죠?</span>
            </div>
          </div>
        )}
        {showReply && (
          <div className="animate-in fade-in duration-500">
            <ChatBubble mine>저도요! 연락해요 😊</ChatBubble>
          </div>
        )}

        <div className="flex justify-end">
          <div className="relative">
            <span className={`bg-cyan-500 text-white text-[10px] px-2.5 py-1.5 rounded-2xl rounded-br-md inline-block transition-all duration-400 ${
              step === 3 ? 'ring-2 ring-cyan-300 scale-[1.03]' : ''
            }`}>내일 또 봬요!</span>
            <Ring on={step === 3} color="ring-cyan-300" />
            {step === 3 && (
              <div className="absolute left-full ml-1.5 top-1/2 -translate-y-1/2 text-[8px] text-amber-500 font-black whitespace-nowrap">
                길게 →
              </div>
            )}
          </div>
        </div>
      </div>

      {showCtx && (
        <div className="absolute bottom-14 right-3 z-20 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-400 min-w-[7.5rem]">
          <div className="flex gap-1 px-2 py-1.5 border-b border-gray-100 bg-slate-50">
            {['❤️', '😂', '👍', '🔥'].map(r => (
              <span key={r} className="text-sm">{r}</span>
            ))}
          </div>
          {['답장 ↩️', '복사 📋', '삭제 (모두에게) 🗑️'].map((item, i) => (
            <div key={item} className={`px-3 py-2 text-[10px] font-bold border-b last:border-0 border-gray-100 transition-all duration-300 ${
              step === 5 && i === 2 ? 'bg-red-50 text-red-500' : 'text-gray-700'
            }`}>
              {item}
            </div>
          ))}
        </div>
      )}

      <ChatComposer />
    </ChatWallpaper>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Scene 7: 받은 하트 (하트, 채팅 → 내 상태)
// ══════════════════════════════════════════════════════════════════════════════
function S7({ step }: { step: number }) {
  const unlocked = step >= 2;
  const accepted = step >= 6;

  return (
    <div className="h-full flex flex-col bg-slate-900">
      <HeartHeader unlocked={unlocked} />
      <div className="flex-1 overflow-hidden px-2.5 pt-1.5 pb-1 space-y-1.5">
        <div className="flex rounded-lg p-0.5 bg-slate-700">
          <div className="flex-1 py-1 text-center text-[8px] font-black rounded-md bg-slate-600 text-white">💝 내 상태</div>
          <div className="flex-1 py-1 text-center text-[8px] font-black text-slate-400">💬 내 채팅</div>
        </div>

        {step >= 1 && !unlocked && (
          <div className="relative rounded-xl border border-amber-500/40 bg-amber-950/30 px-2 py-1.5">
            <p className="text-[8px] font-black text-amber-200">🔒 아직 잠금</p>
            <p className="text-[7px] text-amber-100/80 font-bold mt-0.5 leading-snug">정해진 시간에 호감·친구·뜨밤·칭찬·무지개가 열려요. 남은 시간은 위 안내줄</p>
            <Ring on={step === 1} color="ring-amber-400" />
          </div>
        )}

        <div className="flex flex-col items-center py-0.5">
          <span className="text-sm leading-none" aria-hidden>👇</span>
          <span className="text-[7px] font-bold text-rose-300">받은 하트가 있어요 확인해보세요</span>
        </div>

        <div className={`relative rounded-2xl overflow-hidden border ${
          step >= 3 ? 'border-pink-500/50 bg-slate-800' : 'border-slate-700 bg-slate-800'
        }`}>
          <Ring on={step === 3 || step === 4} color="ring-pink-400" />
          <Tip text="받은 하트 확인" show={step === 3} dir="right" />
          <div className="flex items-center justify-between px-2.5 py-1.5">
            <p className="text-[9px] font-black text-slate-200">💕 받은 하트</p>
            <span className="px-1.5 py-0.5 bg-rose-500/20 text-rose-300 text-[7px] font-bold rounded-full">1개 미응답</span>
          </div>
          <div className="px-2 pb-2">
            <div className={`rounded-xl p-2 ${step >= 4 ? 'bg-rose-900/25 ring-1 ring-pink-400/50' : 'bg-slate-700/60'}`}>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-pink-400 to-rose-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-[9px] font-bold">하늘다람쥐</p>
                  <p className="text-[8px] text-rose-300">❤️ 호감 하트</p>
                </div>
              </div>
              {step >= 4 && !accepted && (
                <div className="flex gap-1 mt-1.5">
                  <span className="flex-1 py-1 text-center bg-slate-600 text-slate-200 text-[7px] font-bold rounded-lg">거절</span>
                  <span className="relative flex-[1.4] py-1 text-center bg-rose-500 text-white text-[7px] font-bold rounded-lg">
                    <Ring on={step === 5} color="ring-rose-300" />
                    <Tip text="수락하면 연락처 공유" show={step === 5} dir="top" />
                    수락 + 연락처 공유
                  </span>
                </div>
              )}
              {accepted && (
                <span className="mt-1.5 inline-flex text-[8px] text-teal-300 font-bold animate-in fade-in duration-400">
                  ✓ 연락처 공유 완료
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      <Tabs active="my" hl={step === 0 ? 'my' : undefined} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Scene 8: 하트 보내기 (참여자 카드 → 종류 고르기)
// ══════════════════════════════════════════════════════════════════════════════
function S8({ step }: { step: number }) {
  const dialog = step >= 2;
  const selected = step >= 4;
  const sent = step >= 6;
  return (
    <div className="h-full flex flex-col bg-slate-900 relative">
      <HeartHeader unlocked />
      <div className="flex-1 overflow-hidden px-3 pt-2 flex flex-col items-center justify-center">
        <div className="relative w-[7.6rem] rounded-xl overflow-hidden border border-slate-600 bg-slate-800">
          <div className="h-20 bg-gradient-to-br from-teal-700 to-slate-800" />
          <div className="absolute bottom-8 inset-x-0 bg-white/95 px-1.5 py-0.5">
            <div className="flex items-center">
              <span className="text-[9px] font-black text-gray-950">황금여우</span>
              <span className="ml-auto text-[8px] font-bold text-gray-600">27</span>
            </div>
            <p className="text-[6px] text-gray-500 font-bold truncate">ENFP · #맥주</p>
          </div>
          <div className="bg-white px-1 py-1 flex gap-1">
            <div className={`relative flex-1 py-0.5 rounded border border-rose-200 text-center text-[8px] font-bold text-rose-500 ${step === 1 ? 'ring-2 ring-rose-400' : ''}`}>
              <Ring on={step === 1} color="ring-rose-400" />
              <Tip text="카드 아래 하트" show={step === 1} dir="top" />
              하트
            </div>
            <div className="flex-1 py-0.5 rounded border border-sky-200 text-center text-[8px] font-bold text-sky-500">채팅</div>
          </div>
        </div>
        {sent && (
          <p className="mt-2 text-[8px] font-black text-rose-200 animate-in fade-in duration-400">❤️ 호감 하트를 보냈어요</p>
        )}
      </div>

      {dialog && !sent && (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/50 p-2">
          <div className="bg-white rounded-2xl w-full max-w-[210px] p-2.5 shadow-2xl">
            <p className="text-center text-[10px] font-black text-gray-900">황금여우</p>
            <p className="text-center text-[7px] font-bold text-teal-600 mt-0.5">종류별로 한 번 보낼 수 있어요</p>
            <div className="mt-1.5 space-y-1">
              {[{ e: '❤️', l: '호감' }, { e: '💙', l: '친구' }, { e: '💗', l: '뜨밤' }, { e: '💚', l: '칭찬' }].map((h, i) => (
                <div
                  key={h.l}
                  className={`relative flex items-center gap-2 px-2 py-1 rounded-xl border-2 text-left ${
                    selected && i === 0 ? 'border-rose-300 bg-rose-50' : 'border-gray-200'
                  }`}
                >
                  <Ring on={step === 3 && i === 0} color="ring-rose-400" />
                  {step === 3 && i === 0 && <Tip text="호감 고르기" show dir="right" />}
                  <span className="text-sm">{h.e}</span>
                  <span className="text-[9px] font-bold text-gray-800">{h.l}</span>
                  <span className="ml-auto text-[8px]">🔓</span>
                </div>
              ))}
            </div>
            <div className="flex gap-1.5 mt-2">
              <span className="flex-1 py-1.5 text-center bg-gray-100 rounded-xl text-[8px] font-bold text-gray-600">취소</span>
              <span className={`relative flex-1 py-1.5 text-center rounded-xl text-[8px] font-bold text-white ${selected ? 'bg-rose-500' : 'bg-gray-300'}`}>
                <Ring on={step === 5} color="ring-rose-300" />
                <Tip text="보내기" show={step === 5} dir="top" />
                보내기
              </span>
            </div>
          </div>
        </div>
      )}
      <Tabs active="profiles" hl={step === 0 ? 'profiles' : undefined} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Scene 9: 무지개하트 (4번 · 일반 하트는 줄지 않음)
// ══════════════════════════════════════════════════════════════════════════════
function S9({ step }: { step: number }) {
  const rainbowOpen = step >= 3;
  const picked = step >= 5;
  const sent = step >= 7;
  const left = sent ? 3 : 4;
  return (
    <div className="h-full flex flex-col bg-slate-900 relative">
      <HeartHeader unlocked rainbowLeft={left} />
      <div className="flex-1 overflow-hidden px-3 pt-2 flex flex-col items-center">
        <p className="text-[8px] font-black text-fuchsia-200 mb-1">무지개는 4번 · 일반 하트는 줄지 않아요</p>
        <div className="bg-white rounded-2xl w-full max-w-[210px] p-2.5 shadow-xl">
          <p className="text-center text-[10px] font-black text-gray-900">하늘다람쥐</p>
          <div className="mt-1.5 space-y-1 opacity-50">
            {[{ e: '❤️', l: '호감' }, { e: '💙', l: '친구' }].map(h => (
              <div key={h.l} className="flex items-center gap-2 px-2 py-1 rounded-xl border-2 border-gray-100">
                <span className="text-sm">{h.e}</span>
                <span className="text-[9px] font-bold text-gray-800">{h.l}</span>
                <span className="ml-auto text-[7px] text-gray-400">전송됨</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-center">
            <div className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 text-[9px] font-bold ${
              step >= 2 ? 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800' : 'border-gray-100 text-gray-400'
            }`}>
              <Ring on={step === 2} color="ring-fuchsia-400" />
              <Tip text="무지개하트 누르기" show={step === 2} dir="top" />
              <span>🌈</span>
              <span>무지개하트</span>
              <span className="tabular-nums">{left}</span>
            </div>
          </div>
        </div>
        {sent && (
          <p className="mt-2 text-[8px] font-black text-fuchsia-200 animate-in fade-in duration-400">💙 무지개로 친구 하트 · 일반은 그대로</p>
        )}
      </div>

      {rainbowOpen && !sent && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-3">
          <div className="bg-white rounded-2xl w-full max-w-[190px] p-3 shadow-2xl">
            <p className="text-center text-[10px] font-black text-gray-900">무지개 — 보낼 하트 선택</p>
            <p className="text-center text-[8px] font-semibold text-gray-500 mt-0.5">일반 하트는 줄지 않아요</p>
            <div className="grid grid-cols-2 gap-1.5 mt-2">
              {[{ e: '❤️', l: '호감' }, { e: '💙', l: '친구' }, { e: '💗', l: '뜨밤' }, { e: '💚', l: '칭찬' }].map((h, i) => (
                <div
                  key={h.l}
                  className={`relative flex flex-col items-center gap-0.5 p-2 rounded-xl border-2 ${
                    picked && i === 1 ? 'border-blue-300 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <Ring on={step === 4 && i === 1} color="ring-blue-400" />
                  {step === 4 && i === 1 && <Tip text="색 고르기" show dir="top" />}
                  <span className="text-base">{h.e}</span>
                  <span className="text-[8px] font-bold">{h.l}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-1.5 mt-2">
              <span className="flex-1 py-1.5 text-center bg-gray-100 rounded-xl text-[8px] font-bold">뒤로</span>
              <span className={`relative flex-1 py-1.5 text-center rounded-xl text-[8px] font-bold text-white ${picked ? 'bg-blue-500' : 'bg-gray-300'}`}>
                <Ring on={step === 6} />
                <Tip text="보내기" show={step === 6} dir="top" />
                보내기
              </span>
            </div>
          </div>
        </div>
      )}
      <Tabs active="profiles" />
    </div>
  );
}

// ═
interface Step { cx: number; cy: number; click?: boolean; dur: number; }
interface SceneDef {
  title: string; sub: string;
  steps: Step[];
  render: (s: number) => ReactElement;
}

/** 홀드·이동을 넉넉히 — 끊김 완화 (이전 대비 ~1.4×) */
const SCENES: SceneDef[] = [
  {
    title: '입장 코드로 들어가기', sub: '운영진에게 받은 입장 코드를 입력하고 입장해요',
    steps: [
      { cx: 124, cy: 120, dur: 1400 },
      { cx: 124, cy: 148, click: false, dur: 1100 },
      { cx: 124, cy: 148, click: true,  dur: 900 },
      { cx: 124, cy: 148, click: false, dur: 1200 },
      { cx: 124, cy: 188, click: false, dur: 1100 },
      { cx: 124, cy: 188, click: true,  dur: 1000 },
      { cx: 124, cy: 130, click: false, dur: 2000 },
    ],
    render: s => <S1 step={s} />,
  },
  {
    title: '사진 · 아바타 바꾸기', sub: '설정 탭 → 사진 · 아바타에서 고르세요',
    steps: [
      { cx: 224, cy: 232, dur: 1300 },
      { cx: 224, cy: 232, click: true,  dur: 1000 },
      { cx: 55,  cy: 70,  dur: 1300 },
      { cx: 55,  cy: 70,  click: true,  dur: 1000 },
      { cx: 130, cy: 130, dur: 1400 },
      { cx: 130, cy: 130, click: true,  dur: 1000 },
      { cx: 124, cy: 175, dur: 2200 },
    ],
    render: s => <S2 step={s} />,
  },
  {
    title: '한마디는 전광판, 칩은 이상형', sub: '설정 탭에서 한마디·이상형·특징을 채워요',
    steps: [
      { cx: 224, cy: 232, dur: 1200 },
      { cx: 124, cy: 65,  dur: 1300 },
      { cx: 124, cy: 95,  click: true,  dur: 1000 },
      { cx: 124, cy: 118, click: true,  dur: 1000 },
      { cx: 124, cy: 115, dur: 1500 },
      { cx: 124, cy: 80,  dur: 1400 },
      { cx: 124, cy: 70,  dur: 1300 },
      { cx: 70,  cy: 115, click: true,  dur: 1000 },
      { cx: 124, cy: 155, dur: 1300 },
      { cx: 70,  cy: 185, click: true,  dur: 1100 },
      { cx: 124, cy: 150, dur: 2000 },
    ],
    render: s => <S3 step={s} />,
  },
  {
    title: '이모지 · 스티커', sub: '입력줄 😊 이모지 · + 다음 🎨 스티커',
    steps: [
      { cx: 42,  cy: 228, dur: 1300 },
      { cx: 42,  cy: 228, click: true,  dur: 1000 },
      { cx: 95,  cy: 200, dur: 1400 },
      { cx: 95,  cy: 200, click: true,  dur: 1000 },
      { cx: 28,  cy: 228, dur: 1200 },
      { cx: 28,  cy: 228, click: true,  dur: 1000 },
      { cx: 55,  cy: 205, dur: 1200 },
      { cx: 55,  cy: 205, click: true,  dur: 1000 },
      { cx: 40,  cy: 195, click: true,  dur: 1000 },
      { cx: 124, cy: 120, dur: 1800 },
    ],
    render: s => <S4 step={s} />,
  },
  {
    title: '사진 · 빠른 메시지', sub: '+ 펼침 → 📷 사진 · ⚡ 빠른 메시지',
    steps: [
      { cx: 28,  cy: 228, dur: 1200 },
      { cx: 28,  cy: 228, click: true,  dur: 1000 },
      { cx: 40,  cy: 205, click: true,  dur: 1000 },
      { cx: 124, cy: 120, dur: 1400 },
      { cx: 124, cy: 120, dur: 1600 },
      { cx: 72,  cy: 205, dur: 1200 },
      { cx: 72,  cy: 205, click: true,  dur: 1000 },
      { cx: 124, cy: 195, dur: 1300 },
      { cx: 124, cy: 195, click: true,  dur: 1000 },
      { cx: 124, cy: 130, dur: 2000 },
    ],
    render: s => <S5 step={s} />,
  },
  {
    title: '스와이프 답장 · 길게 메뉴', sub: '옆으로 밀면 답장 · 길게 누르면 복사·삭제',
    steps: [
      { cx: 80,  cy: 70,  dur: 1200 },
      { cx: 150, cy: 70,  dur: 1300 },
      { cx: 80,  cy: 70,  dur: 1100 },
      { cx: 124, cy: 140, dur: 1700 },
      { cx: 180, cy: 155, dur: 1400 },
      { cx: 180, cy: 155, click: true,  dur: 1600 },
      { cx: 195, cy: 195, dur: 1300 },
      { cx: 195, cy: 205, click: true,  dur: 1000 },
      { cx: 124, cy: 140, dur: 1800 },
    ],
    render: s => <S6 step={s} />,
  },
  {
    title: '하트 잠금→해금 · 받은 하트', sub: '하트, 채팅 → 내 상태. 받은 하트를 수락하면 연락처가 공유돼요',
    steps: [
      { cx: 74,  cy: 232, dur: 1200 },
      { cx: 74,  cy: 232, click: true,  dur: 1000 },
      { cx: 190, cy: 28,  dur: 1500 },
      { cx: 124, cy: 88,  dur: 1300 },
      { cx: 124, cy: 145, dur: 1400 },
      { cx: 165, cy: 175, click: true,  dur: 1300 },
      { cx: 124, cy: 175, dur: 1800 },
    ],
    render: s => <S7 step={s} />,
  },
  {
    title: '하트 보내기', sub: '참여자 카드 아래 하트 → 호감·친구·뜨밤·칭찬 중 하나. 종류마다 한 번',
    steps: [
      { cx: 124, cy: 232, dur: 1100 },
      { cx: 90,  cy: 155, dur: 1300 },
      { cx: 90,  cy: 155, click: true,  dur: 1000 },
      { cx: 124, cy: 118, dur: 1300 },
      { cx: 124, cy: 118, click: true,  dur: 1000 },
      { cx: 165, cy: 200, dur: 1200 },
      { cx: 165, cy: 200, click: true,  dur: 1100 },
      { cx: 124, cy: 160, dur: 1800 },
    ],
    render: s => <S8 step={s} />,
  },
  {
    title: '하트 잠금→해금 · 무지개 4', sub: '🌈 무지개는 4번. 색을 골라 보내고, 일반 하트는 줄지 않아요',
    steps: [
      { cx: 200, cy: 28,  dur: 1400 },
      { cx: 124, cy: 70,  dur: 1300 },
      { cx: 124, cy: 168, dur: 1300 },
      { cx: 124, cy: 168, click: true,  dur: 1100 },
      { cx: 155, cy: 128, dur: 1300 },
      { cx: 155, cy: 128, click: true,  dur: 1000 },
      { cx: 165, cy: 188, dur: 1200 },
      { cx: 165, cy: 188, click: true,  dur: 1100 },
      { cx: 200, cy: 28,  dur: 2000 },
    ],
    render: s => <S9 step={s} />,
  },
];

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
  const [sceneFade, setSceneFade] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeInTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerModeRef = useRef<'mouse' | 'touch' | null>(null);
  const CONTROLS_IDLE_MS = 2500;
  const CONTROLS_TOUCH_MS = 3000;

  const scene = SCENES[sceneIdx];
  const step = scene.steps[Math.min(stepIdx, scene.steps.length - 1)];

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const goPlay = useCallback((nextPlay: number) => {
    clearTimer();
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    if (fadeInTimerRef.current) clearTimeout(fadeInTimerRef.current);
    setSceneFade(0);
    fadeTimerRef.current = setTimeout(() => {
      fadeTimerRef.current = null;
      setPlayIdx(Math.max(0, Math.min(playlist.length - 1, nextPlay)));
      setStepIdx(0);
      // 같은 커밋에서 1로 올리면 새 장면이 하드 컷으로 뜬다(1장면 루프에서는 깜빡임).
      // 한 프레임 뒤에 올려 페이드인 트랜지션이 실제로 돌게 한다.
      fadeInTimerRef.current = setTimeout(() => {
        fadeInTimerRef.current = null;
        setSceneFade(1);
      }, 40);
    }, 220);
  }, [clearTimer, playlist.length]);

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

  useEffect(() => () => {
    clearTimer();
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    if (fadeInTimerRef.current) clearTimeout(fadeInTimerRef.current);
    if (controlsHideRef.current) clearTimeout(controlsHideRef.current);
  }, [clearTimer]);

  const clearControlsHide = useCallback(() => {
    if (controlsHideRef.current !== null) {
      clearTimeout(controlsHideRef.current);
      controlsHideRef.current = null;
    }
  }, []);

  const scheduleControlsHide = useCallback((ms: number) => {
    clearControlsHide();
    controlsHideRef.current = setTimeout(() => {
      setControlsVisible(false);
      controlsHideRef.current = null;
    }, ms);
  }, [clearControlsHide]);

  const revealControls = useCallback((ms = CONTROLS_IDLE_MS) => {
    setControlsVisible(true);
    if (ms > 0) scheduleControlsHide(ms);
    else clearControlsHide();
  }, [scheduleControlsHide, clearControlsHide]);

  const onStagePointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      pointerModeRef.current = 'touch';
    } else if (e.pointerType === 'mouse') {
      pointerModeRef.current = 'mouse';
    }
  }, []);

  const onStageClick = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('[data-tutorial-controls]')) {
      revealControls(pointerModeRef.current === 'touch' ? CONTROLS_TOUCH_MS : CONTROLS_IDLE_MS);
      return;
    }
    if (pointerModeRef.current === 'touch') {
      setControlsVisible((v) => {
        const next = !v;
        if (next) scheduleControlsHide(CONTROLS_TOUCH_MS);
        else clearControlsHide();
        return next;
      });
      return;
    }
    revealControls(CONTROLS_IDLE_MS);
  }, [revealControls, scheduleControlsHide, clearControlsHide]);

  const progress = (() => {
    const total = scene.steps.reduce((a, s) => a + s.dur, 0);
    let done = 0;
    for (let i = 0; i < stepIdx; i++) done += scene.steps[i].dur;
    return Math.min(100, (done / total) * 100);
  })();

  const DESIGN_W = 248;
  const DESIGN_H = 248;
  const COMPACT_STAGE_H = 144;
  const scaleStage = compact || fill;
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageBox, setStageBox] = useState({ w: DESIGN_W, h: compact ? COMPACT_STAGE_H : DESIGN_H });
  // 페인트 전에 재야 한다. useEffect로 재면 첫 프레임이 기본 높이 기준 축소 배율로 그려져 화면이 튄다.
  useLayoutEffect(() => {
    if (!scaleStage) return;
    const el = stageRef.current;
    if (!el) return;
    const sync = () => setStageBox({
      w: el.clientWidth || DESIGN_W,
      h: el.clientHeight || (compact ? COMPACT_STAGE_H : DESIGN_H),
    });
    sync();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scaleStage, compact]);
  const sceneScale = scaleStage
    ? Math.min(1, stageBox.w / DESIGN_W, stageBox.h / DESIGN_H)
    : 1;
  const sceneH = embedded ? 220 : 280;
  const clock = (() => {
    const total = scene.steps.reduce((a, s) => a + s.dur, 0);
    const sec = Math.round((progress / 100) * (total / 1000));
    return `0:${String(Math.min(59, sec)).padStart(2, '0')}`;
  })();
  const isEmbeddedCompact = embedded && compact;
  const player = (
    <div className={`relative w-full min-h-0 overflow-hidden flex flex-col bg-gradient-to-b from-slate-950 via-zinc-950 to-black ${
      embedded
        ? `${compact && !fill ? '' : 'h-full '} ${isEmbeddedCompact ? 'rounded-[1.35rem] border-[3px]' : compact ? 'rounded-[1.35rem] border-[3px]' : 'rounded-[1.6rem] border-[4px]'} border-cyan-500/40 shadow-[0_12px_32px_rgba(34,211,238,0.28),inset_0_0_0_1px_rgba(255,255,255,0.12)]`
        : 'max-w-xs rounded-[1.85rem] shadow-2xl border-[4px] border-cyan-400/50'
    }`}>
      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-amber-300 pointer-events-none z-20" aria-hidden />
      {!isEmbeddedCompact && (
        <div className={`flex items-center gap-2 flex-shrink-0 ${compact ? 'px-2.5 pt-2.5 pb-1' : 'px-3 pt-3 pb-1.5'}`}>
          <span className="relative flex flex-shrink-0 h-2.5 w-2.5">
            <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-70" />
            <span className="relative rounded-full bg-emerald-400 h-2.5 w-2.5 ring-2 ring-emerald-200/40" />
          </span>
          <span className="text-[10px] text-emerald-300 font-black tracking-wider">LIVE</span>
          <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/40">UI 2026.09</span>
          {!embedded && (
            <p className={`flex-1 min-w-0 text-center text-white font-bold ${compact ? 'text-xs leading-tight' : 'text-sm truncate'}`}>{scene.title}</p>
          )}
          {embedded && <div className="flex-1" />}
          <span className="text-[11px] text-zinc-400 font-mono tabular-nums">{clock}</span>
          {!embedded && (
            <button onClick={onClose}
              className="w-6 h-6 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-300 text-xs flex-shrink-0">
              ✕
            </button>
          )}
        </div>
      )}
      {!embedded && (
        <p className={`text-zinc-500 text-center leading-snug flex-shrink-0 px-3 break-keep ${compact ? 'text-[11px] pb-1 line-clamp-2' : 'text-xs pb-2 truncate'}`}>{scene.sub}</p>
      )}

      <div
        ref={stageRef}
        className={`overflow-hidden scrollbar-hide bg-slate-900 relative flex items-center justify-center ${
          isEmbeddedCompact
            ? 'flex-1 min-h-0 mx-0 rounded-none'
            : `${compact ? 'mx-1.5 rounded-xl' : 'mx-2 mb-1 rounded-2xl'} ${fill ? 'flex-1 min-h-0' : 'flex-shrink-0'}`
        }`}
        style={!isEmbeddedCompact && !fill ? (compact ? { height: COMPACT_STAGE_H } : { height: sceneH }) : undefined}
        onPointerDown={isEmbeddedCompact ? onStagePointerDown : undefined}
        onClick={isEmbeddedCompact ? onStageClick : undefined}
        onMouseEnter={isEmbeddedCompact ? () => {
          if (pointerModeRef.current === 'touch') return;
          pointerModeRef.current = 'mouse';
          revealControls(CONTROLS_IDLE_MS);
        } : undefined}
        onMouseMove={isEmbeddedCompact ? () => {
          if (pointerModeRef.current === 'touch') return;
          revealControls(CONTROLS_IDLE_MS);
        } : undefined}
        onMouseLeave={isEmbeddedCompact ? () => {
          if (pointerModeRef.current === 'touch') return;
          clearControlsHide();
          setControlsVisible(false);
        } : undefined}
        onFocusCapture={isEmbeddedCompact ? () => revealControls(CONTROLS_IDLE_MS) : undefined}
      >
        <div
          key={sceneIdx}
          className="relative transition-opacity duration-300 ease-out overflow-hidden scrollbar-hide shrink-0"
          style={{
            width: DESIGN_W,
            height: DESIGN_H,
            transform: `scale(${sceneScale})`,
            transformOrigin: 'center center',
            opacity: sceneFade,
          }}
        >
          {scene.render(stepIdx)}
          <Cursor x={step.cx} y={step.cy} clicking={step.click ?? false} />
        </div>

        {isEmbeddedCompact && (
          <div
            data-tutorial-controls
            className={`absolute inset-x-0 bottom-0 z-[60] transition-opacity duration-200 ${
              controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/55 via-black/20 to-transparent pointer-events-none" />
            <div className="relative px-2 pb-0 pt-0.5">
              <div className="flex gap-0.5 mb-0.5">
                {playlist.map((sceneNo, i) => (
                  <button key={sceneNo} type="button" onClick={() => goPlay(i)} className="flex-1 h-1 rounded-full overflow-hidden bg-white/25">
                    <div className="h-full bg-cyan-400/90 transition-all duration-200"
                      style={{ width: i < playIdx ? '100%' : i === playIdx ? `${progress}%` : '0%' }} />
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-center gap-2 pb-0">
                <button type="button" onClick={() => goPlay(playIdx - 1)} disabled={playIdx === 0}
                  className="w-5 h-5 rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/55 disabled:opacity-25 flex items-center justify-center transition-all">
                  <SkipBack className="w-2.5 h-2.5 text-white/90" />
                </button>
                <button type="button" onClick={() => setPlaying(p => !p)}
                  className="w-6 h-6 rounded-full bg-white/90 text-black flex items-center justify-center shadow-md active:scale-95 transition-all">
                  {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-px" />}
                </button>
                <button type="button"
                  onClick={() => playIdx === playlist.length - 1 ? goPlay(0) : goPlay(playIdx + 1)}
                  className="w-5 h-5 rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/55 flex items-center justify-center transition-all">
                  <SkipForward className="w-2.5 h-2.5 text-white/90" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {!isEmbeddedCompact && (
      <div className={`flex-shrink-0 ${compact ? 'px-2.5 pt-1.5 pb-2' : 'px-3 pt-2 pb-3'}`}>
        <div className={`flex items-center gap-2 ${compact ? 'mb-1.5' : 'mb-2'}`}>
          <span className="text-[11px] text-zinc-500 font-mono w-7">{clock}</span>
          <div className="flex-1 flex gap-1">
            {playlist.map((sceneNo, i) => (
              <button key={sceneNo} onClick={() => goPlay(i)} className="flex-1 h-1.5 rounded-full overflow-hidden bg-zinc-700/80">
                <div className="h-full bg-gradient-to-r from-cyan-400 to-teal-400 transition-all duration-200"
                  style={{ width: i < playIdx ? '100%' : i === playIdx ? `${progress}%` : '0%' }} />
              </button>
            ))}
          </div>
          <span className="text-[11px] text-zinc-500 font-mono w-7 text-right">{playIdx + 1}/{playlist.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => goPlay(playIdx - 1)} disabled={playIdx === 0}
            className={`${compact ? 'w-8 h-8' : 'w-9 h-9'} rounded-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 flex items-center justify-center transition-all`}>
            <SkipBack className={`${compact ? 'w-4 h-4' : 'w-4 h-4'} text-zinc-200`} />
          </button>
          <button onClick={() => setPlaying(p => !p)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-full bg-white text-black font-bold transition-all active:scale-95 ${compact ? 'py-2 text-xs' : 'py-2.5 text-sm gap-2'}`}>
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {playing ? '일시정지' : '재생'}
          </button>
          <button
            onClick={() => playIdx === playlist.length - 1 ? (embedded ? goPlay(0) : onClose()) : goPlay(playIdx + 1)}
            className={`${compact ? 'w-8 h-8' : 'w-9 h-9'} rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-all`}>
            <SkipForward className={`${compact ? 'w-4 h-4' : 'w-4 h-4'} text-zinc-200`} />
          </button>
        </div>
      </div>
      )}
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
