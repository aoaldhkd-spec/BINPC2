/**
 * TutorialVideo — 참여자가 모를 만한 숨겨진 기능 위주 커서 애니메이션 튜토리얼
 * 제외: 하트 보내기, 채팅 기본, 운세
 * 포함: PIN 입장 → 아바타 변경 → 프로필 등록 → 채팅 이모지/스티커 → 사진/빠른메시지 → 스와이프/길게누르기
 */
import { useState, useEffect, useRef, useCallback, type ReactElement } from 'react';
import { SkipBack, SkipForward, Play, Pause } from 'lucide-react';

// ── 커서 ─────────────────────────────────────────────────────────────────────
function Cursor({ x, y, clicking }: { x: number; y: number; clicking: boolean }) {
  return (
    <div
      className="absolute pointer-events-none z-50 transition-all duration-[650ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
      style={{ left: x, top: y, transform: 'translate(-3px, -3px)' }}
    >
      {clicking && (
        <div className="absolute -inset-4 rounded-full bg-teal-400/30 animate-ping" />
      )}
      <svg width="22" height="28" viewBox="0 0 22 28" fill="none" className={`drop-shadow-lg transition-transform duration-100 ${clicking ? 'scale-90' : 'scale-100'}`}>
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
    <div className={`absolute ${pos} z-40 bg-teal-500 text-white text-[9px] font-black px-2 py-1 rounded-lg whitespace-nowrap shadow-lg animate-in fade-in duration-200`}>
      {text}
    </div>
  );
}

// ── 앱 탭바 ───────────────────────────────────────────────────────────────────
function Tabs({ active, hl }: { active: string; hl?: string }) {
  const row1 = [
    { id: 'status', e: '😊', l: '내 상태' },
    { id: 'my-table', e: '🪑', l: '내 테이블' },
    { id: 'chat', e: '💬', l: '내 채팅' },
    { id: 'fortune', e: '🔮', l: '내 운세' },
    { id: 'stats', e: '📊', l: '통계' },
  ];
  const row2 = [
    { id: 'profiles', e: '👥', l: '참여자' },
    { id: 'seating', e: '🗺️', l: '배치도' },
    { id: 'suggestions', e: '📋', l: '요청' },
    { id: 'game', e: '🎮', l: '게임' },
    { id: 'ranking', e: '🏆', l: '랭킹' },
  ];
  return (
    <div className="border-t border-slate-700 bg-slate-900 px-0.5 pt-0.5 pb-1">
      {[row1, row2].map((row, ri) => (
        <div key={ri} className="flex">
          {row.map(t => (
            <div key={t.id} className={`relative flex-1 flex flex-col items-center py-1 rounded-lg ${active === t.id ? 'bg-teal-500/20' : ''}`}>
              <Ring on={hl === t.id} />
              <span className="text-[13px] leading-none">{t.e}</span>
              <span className={`text-[7px] font-bold mt-0.5 ${active === t.id ? 'text-teal-400' : 'text-slate-500'}`}>{t.l}</span>
            </div>
          ))}
        </div>
      ))}
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
  useEffect(() => {
    if (step === 2) { setDots([1]); setPressed('1'); setTimeout(() => setPressed(null), 200); }
    if (step === 3) { setDots([1,2]); setPressed('5'); setTimeout(() => setPressed(null), 200); }
    if (step === 4) { setDots([1,2,3]); setPressed('2'); setTimeout(() => setPressed(null), 200); }
    if (step === 5) { setDots([1,2,3,4]); setPressed('8'); setTimeout(() => setPressed(null), 200); }
    if (step >= 6) { setEntered(true); }
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
            <p className="text-slate-400 text-[10px]">내 상태 탭 → 아바타 클릭</p>
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
      <Tabs active="status" hl={step === 0 ? 'status' : undefined} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Scene 3: 프로필 정보 등록 (관심사·생월일·연락처)
// ══════════════════════════════════════════════════════════════════════════════
function S3({ step }: { step: number }) {
  const interestOptions = [
    { emoji: '🎵', label: '음악' }, { emoji: '✈️', label: '여행' },
    { emoji: '🍕', label: '맛집' }, { emoji: '🏃', label: '운동' },
    { emoji: '🎮', label: '게임' }, { emoji: '📚', label: '독서' },
    { emoji: '🎨', label: '그림' }, { emoji: '☕', label: '카페' },
  ];
  const [selected, setSelected] = useState<number[]>([]);
  const [showContact, setShowContact] = useState(false);
  useEffect(() => {
    if (step >= 2) setSelected([0]);          // 음악 선택
    if (step >= 3) setSelected([0, 1]);       // 여행도 선택
    if (step >= 5) setShowContact(true);
  }, [step]);
  return (
    <div className="h-full flex flex-col bg-slate-900 px-3 pt-3 gap-2 overflow-hidden">
      <p className="text-slate-400 text-[10px] font-bold">내 상태 탭 → 프로필 편집</p>

      {/* 관심사 */}
      <div className={`relative bg-slate-800 border rounded-2xl p-2.5 transition-all duration-300 ${step >= 1 && step <= 3 ? 'border-teal-500/70' : 'border-slate-700'}`}>
        <Ring on={step === 1} />
        <Tip text="관심사 2개 이상 선택!" show={step === 1} dir="right" />
        <p className="text-slate-400 text-[9px] font-bold mb-1.5">🌟 관심사</p>
        <div className="flex flex-wrap gap-1.5">
          {interestOptions.map((it, i) => (
            <div key={it.label}
              className={`relative flex items-center gap-1 px-2 py-1 rounded-xl text-[9px] font-black transition-all duration-300
                ${selected.includes(i) ? 'bg-teal-500 text-white scale-105' : 'bg-slate-700 text-slate-400'}
                ${step === 2 && i === 0 ? 'ring-2 ring-teal-300' : ''}
                ${step === 3 && i === 1 ? 'ring-2 ring-teal-300' : ''}`}>
              <span>{it.emoji}</span>
              <span>{it.label}</span>
            </div>
          ))}
        </div>
        {selected.length >= 2 && (
          <p className="text-teal-400 text-[8px] mt-1.5 font-bold animate-in fade-in duration-300">✅ 관심사가 저장되었습니다!</p>
        )}
      </div>

      {/* 생월일 */}
      <div className={`relative bg-slate-800 border rounded-2xl p-2.5 transition-all duration-300 ${step === 4 ? 'border-violet-500/70' : 'border-slate-700'}`}>
        <Ring on={step === 4} color="ring-violet-400" />
        <Tip text="생월·생일 입력 → 운세·궁합 활성화!" show={step === 4} dir="right" />
        <p className="text-slate-400 text-[9px] font-bold mb-1.5">🎂 생월·생일</p>
        <div className="flex gap-2">
          <div className={`flex-1 bg-slate-700 rounded-xl px-2 py-1.5 text-center transition-all duration-300 ${step === 4 ? 'ring-2 ring-violet-400 text-white' : 'text-slate-400'} text-[11px] font-black`}>
            {step >= 4 ? '3월' : '-- 월'}
          </div>
          <div className={`flex-1 bg-slate-700 rounded-xl px-2 py-1.5 text-center transition-all duration-300 ${step === 4 ? 'ring-2 ring-violet-400 text-white' : 'text-slate-400'} text-[11px] font-black`}>
            {step >= 4 ? '15일' : '-- 일'}
          </div>
        </div>
        {step >= 4 && <p className="text-violet-400 text-[8px] mt-1 font-bold">✨ 등록하면 운세·궁합 기능이 열려요!</p>}
      </div>

      {/* 연락처 */}
      {showContact && (
        <div className="relative bg-slate-800 border border-rose-500/50 rounded-2xl p-2.5 animate-in slide-in-from-bottom-2 duration-500">
          <Ring on={step === 5} color="ring-rose-400" />
          <Tip text="연락처 등록 → 상대와 공유 가능!" show={step === 5} dir="right" />
          <p className="text-slate-400 text-[9px] font-bold mb-1.5">📱 연락처</p>
          <div className="space-y-1">
            {[{icon:'K',label:'카카오톡',val:'my_kakao',color:'text-yellow-400'},{icon:'@',label:'인스타그램',val:'@my_insta',color:'text-pink-400'}].map(c => (
              <div key={c.label} className="flex items-center gap-2 bg-slate-700 rounded-xl px-2 py-1.5">
                <span className={`font-black text-[11px] w-4 text-center ${c.color}`}>{c.icon}</span>
                <span className="text-slate-300 text-[10px] flex-1">{c.val}</span>
                <span className="text-teal-400 text-[8px] font-bold">저장됨 ✓</span>
              </div>
            ))}
          </div>
        </div>
      )}
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
          <p className="text-slate-400 text-[9px] font-bold mb-1.5">😊 이모지 — 😊 버튼을 눌러 열어요</p>
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
          <p className="text-slate-400 text-[9px] font-bold mb-1.5">🎊 스티커 — 스티커 버튼으로 전송</p>
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
          <div className="flex items-center gap-2 bg-slate-700 rounded-2xl px-3 py-2">
            <div className={`relative w-7 h-7 rounded-full flex items-center justify-center text-base transition-all ${step === 1 ? 'bg-teal-500/30 ring-2 ring-teal-400' : 'bg-slate-600'}`}>
              <Ring on={step === 0} />
              <Tip text="😊 버튼 탭!" show={step === 0} dir="top" />
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
      { cx: 124, cy: 200, dur: 800 },
      { cx: 67,  cy: 168, click: false, dur: 700 },  // 1 버튼 위
      { cx: 67,  cy: 168, click: true,  dur: 500 },  // 1 클릭
      { cx: 124, cy: 210, click: false, dur: 500 },  // 5
      { cx: 124, cy: 210, click: true,  dur: 500 },
      { cx: 67,  cy: 210, click: false, dur: 500 },  // 2
      { cx: 67,  cy: 210, click: true,  dur: 500 },
      { cx: 181, cy: 210, click: false, dur: 500 },  // 8
      { cx: 181, cy: 210, click: true,  dur: 500 },
      { cx: 124, cy: 200, click: false, dur: 1200 }, // 완료
    ],
    render: s => <S1 step={s} />,
  },
  {
    title: '아바타(동물) 변경하기', sub: '내 상태 탭 → 아바타 탭 → 동물 선택',
    steps: [
      { cx: 25, cy: 248, dur: 800 },               // 내 상태 탭
      { cx: 25, cy: 248, click: true, dur: 600 },
      { cx: 50, cy: 85,  dur: 900 },               // 아바타 탭
      { cx: 50, cy: 85,  click: true, dur: 600 },
      { cx: 148, cy: 158, dur: 1000 },             // 여우 선택
      { cx: 148, cy: 158, click: true, dur: 600 },
      { cx: 124, cy: 200, dur: 1800 },
    ],
    render: s => <S2 step={s} />,
  },
  {
    title: '관심사·생월일·연락처 등록', sub: '내 상태 탭 → 프로필 편집에서 등록',
    steps: [
      { cx: 124, cy: 80,  dur: 1000 },              // 관심사 섹션 소개
      { cx: 55,  cy: 100, click: false, dur: 900 }, // 음악 위로 이동
      { cx: 55,  cy: 100, click: true,  dur: 700 }, // 음악 선택
      { cx: 104, cy: 100, click: false, dur: 900 }, // 여행으로 이동
      { cx: 104, cy: 100, click: true,  dur: 700 }, // 여행 선택 → 저장됨
      { cx: 124, cy: 160, click: false, dur: 1000 }, // 생월일로 이동
      { cx: 80,  cy: 175, click: false, dur: 800 }, // 월 선택
      { cx: 80,  cy: 175, click: true,  dur: 700 },
      { cx: 124, cy: 215, click: false, dur: 900 }, // 연락처로 이동
      { cx: 124, cy: 230, click: false, dur: 1600 },
    ],
    render: s => <S3 step={s} />,
  },
  {
    title: '이모지 & 스티커 전송', sub: '채팅창 😊 버튼 → 이모지 / 스티커 선택',
    steps: [
      { cx: 45, cy: 250, dur: 900 },               // 😊 버튼
      { cx: 45, cy: 250, click: true, dur: 600 },
      { cx: 83, cy: 238, dur: 1000 },              // 이모지 피커에서 😍
      { cx: 83, cy: 238, click: true, dur: 600 },
      { cx: 45, cy: 250, dur: 900 },               // 다시 버튼
      { cx: 80, cy: 250, dur: 800 },               // 스티커 버튼
      { cx: 80, cy: 250, click: true, dur: 600 },
      { cx: 35, cy: 224, dur: 900 },               // 스티커 선택
      { cx: 35, cy: 224, click: true, dur: 600 },
      { cx: 124, cy: 140, dur: 1200 },
    ],
    render: s => <S4 step={s} />,
  },
  {
    title: '사진 전송 & 빠른 메시지', sub: '📷로 사진 · ⚡로 자주 쓰는 문장 전송',
    steps: [
      { cx: 200, cy: 250, dur: 900 },              // 📷 버튼
      { cx: 200, cy: 250, click: true, dur: 600 },
      { cx: 124, cy: 150, dur: 1000 },             // 사진 전송됨
      { cx: 124, cy: 150, dur: 1200 },
      { cx: 215, cy: 250, dur: 900 },              // ⚡ 버튼
      { cx: 215, cy: 250, click: true, dur: 600 },
      { cx: 124, cy: 215, dur: 900 },             // 빠른메시지 선택
      { cx: 124, cy: 215, click: true, dur: 600 },
      { cx: 124, cy: 140, dur: 1400 },
    ],
    render: s => <S5 step={s} />,
  },
  {
    title: '스와이프 답장 & 길게누르기', sub: '메시지 옆으로 밀면 답장 · 길게 누르면 메뉴',
    steps: [
      { cx: 80,  cy: 90, dur: 900 },
      { cx: 140, cy: 90, dur: 800 },               // 스와이프
      { cx: 80,  cy: 90, dur: 700 },
      { cx: 124, cy: 170, dur: 1200 },             // 답장 완성
      { cx: 180, cy: 130, dur: 1000 },             // 내 메시지
      { cx: 180, cy: 130, click: true, dur: 1200 }, // 길게누르기
      { cx: 200, cy: 200, dur: 900 },              // 삭제 메뉴
      { cx: 200, cy: 210, click: true, dur: 600 },
      { cx: 124, cy: 160, dur: 1200 },
    ],
    render: s => <S6 step={s} />,
  },
];

// ══════════════════════════════════════════════════════════════════════════════
// 메인 플레이어
// ══════════════════════════════════════════════════════════════════════════════
export function TutorialVideo({ onClose }: { darkMode?: boolean; onClose: () => void }) {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scene = SCENES[sceneIdx];
  const step = scene.steps[Math.min(stepIdx, scene.steps.length - 1)];

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const goScene = useCallback((idx: number) => {
    clearTimer();
    setSceneIdx(Math.max(0, Math.min(SCENES.length - 1, idx)));
    setStepIdx(0);
  }, [clearTimer]);

  // 스텝 자동 전진 — playing 상태일 때만
  useEffect(() => {
    if (!playing) return;
    const s = scene.steps[stepIdx] ?? scene.steps[scene.steps.length - 1];
    timerRef.current = setTimeout(() => {
      if (stepIdx < scene.steps.length - 1) {
        setStepIdx(p => p + 1);
      } else if (sceneIdx < SCENES.length - 1) {
        goScene(sceneIdx + 1);
      }
    }, s.dur);
    return clearTimer;
  }, [playing, stepIdx, sceneIdx, scene, clearTimer, goScene]);

  // 언마운트 시 타이머 정리
  useEffect(() => clearTimer, [clearTimer]);

  const progress = (() => {
    const total = scene.steps.reduce((a, s) => a + s.dur, 0);
    let done = 0;
    for (let i = 0; i < stepIdx; i++) done += scene.steps[i].dur;
    return Math.min(100, (done / total) * 100);
  })();

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center sm:items-center p-4 bg-black/85 backdrop-blur-sm"
      onClick={onClose}>
      <div className="relative w-full max-w-xs rounded-3xl shadow-2xl overflow-hidden bg-slate-900 border border-slate-700"
        onClick={e => e.stopPropagation()}>

        {/* 헤더 */}
        <div className="flex items-start gap-2 px-4 pt-3 pb-2">
          <div className="flex-1 min-w-0">
            <p className="text-white font-black text-[13px] leading-tight">{scene.title}</p>
            <p className="text-slate-400 text-[10px] mt-0.5 leading-tight">{scene.sub}</p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-slate-300 text-xs transition-all flex-shrink-0 mt-0.5">
            ✕
          </button>
        </div>

        {/* 진행 바 */}
        <div className="flex gap-0.5 px-4 mb-2">
          {SCENES.map((_, i) => (
            <button key={i} onClick={() => goScene(i)} className="flex-1 h-1 rounded-full overflow-hidden bg-slate-700">
              <div className="h-full bg-teal-400 transition-all duration-100"
                style={{ width: i < sceneIdx ? '100%' : i === sceneIdx ? `${progress}%` : '0%' }} />
            </button>
          ))}
        </div>

        {/* 앱 화면 */}
        <div className="mx-4 mb-3 rounded-2xl overflow-hidden border border-slate-700 bg-slate-900 relative"
          style={{ height: 280 }}>
          <div key={sceneIdx} className="w-full h-full">
            {scene.render(stepIdx)}
          </div>
          <Cursor x={step.cx} y={step.cy} clicking={step.click ?? false} />
        </div>

        {/* 컨트롤 */}
        <div className="flex items-center gap-2 px-4 pb-4">
          <button onClick={() => goScene(sceneIdx - 1)} disabled={sceneIdx === 0}
            className="w-9 h-9 rounded-full bg-slate-700 hover:bg-slate-600 disabled:opacity-30 flex items-center justify-center transition-all">
            <SkipBack className="w-4 h-4 text-slate-300" />
          </button>
          <button onClick={() => setPlaying(p => !p)}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-2xl bg-teal-500 hover:bg-teal-400 text-white font-black text-[13px] transition-all active:scale-95">
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {playing ? '일시정지' : '재생'}
          </button>
          <button onClick={() => sceneIdx === SCENES.length - 1 ? onClose() : goScene(sceneIdx + 1)}
            className="w-9 h-9 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center transition-all">
            <SkipForward className="w-4 h-4 text-slate-300" />
          </button>
        </div>

        <div className="absolute bottom-[52px] right-5">
          <span className="text-[9px] text-slate-600 font-bold">{sceneIdx + 1} / {SCENES.length}</span>
        </div>
      </div>
    </div>
  );
}
