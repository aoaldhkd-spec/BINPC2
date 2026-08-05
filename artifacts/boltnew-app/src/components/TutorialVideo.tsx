/**
 * TutorialVideo — 앱 실제 UI를 재현한 커서 애니메이션 튜토리얼
 * 각 장면: 실제 앱 화면 mockup + 애니메이션 커서(손 모양) + 클릭 효과 + 결과 표시
 */
import { useState, useEffect, useRef, type ReactElement } from 'react';
import { SkipBack, SkipForward, Play, Pause } from 'lucide-react';

// ── 마우스 커서 컴포넌트 ──────────────────────────────────────────────────────
function Cursor({ x, y, clicking }: { x: number; y: number; clicking: boolean }) {
  return (
    <div
      className="absolute pointer-events-none z-50 transition-all duration-500 ease-in-out"
      style={{ left: x, top: y, transform: 'translate(-4px, -4px)' }}
    >
      {/* 클릭 파문 */}
      {clicking && (
        <div className="absolute -inset-3 rounded-full border-2 border-teal-400 animate-ping opacity-70" />
      )}
      {/* 손 커서 SVG */}
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
        className={`transition-transform duration-100 ${clicking ? 'scale-90' : 'scale-100'} drop-shadow-lg`}>
        <path d="M9 3C9 2.44772 9.44772 2 10 2C10.5523 2 11 2.44772 11 3V11.5858L12.2929 10.2929C12.6834 9.90237 13.3166 9.90237 13.7071 10.2929C14.0976 10.6834 14.0976 11.3166 13.7071 11.7071L11 14.4142V15C11 15.5523 10.5523 16 10 16C9.44772 16 9 15.5523 9 15V3Z" fill="white"/>
        <path d="M9 3C9 2.44772 9.44772 2 10 2C10.5523 2 11 2.44772 11 3V11.5858L12.2929 10.2929C12.6834 9.90237 13.3166 9.90237 13.7071 10.2929C14.0976 10.6834 14.0976 11.3166 13.7071 11.7071L11 14.4142V15C11 15.5523 10.5523 16 10 16C9.44772 16 9 15.5523 9 15V3Z" stroke="black" strokeWidth="0.5"/>
        <path d="M7 6C7 5.44772 7.44772 5 8 5H9V15C9 15.5523 9.44772 16 10 16H12L14 18V20C14 20.5523 13.5523 21 13 21H8C7.44772 21 7 20.5523 7 20V6Z" fill="white" stroke="black" strokeWidth="0.5"/>
        <path d="M11 5H13C13.5523 5 14 5.44772 14 6V14.5858L15.7071 12.8787C16.0976 12.4882 16.7308 12.4882 17.1213 12.8787C17.5118 13.2692 17.5118 13.9024 17.1213 14.2929L14.7071 16.7071C14.3166 17.0976 14 17.4142 14 18V20" fill="white"/>
        <path d="M11 5H13C13.5523 5 14 5.44772 14 6V14.5858L15.7071 12.8787C16.0976 12.4882 16.7308 12.4882 17.1213 12.8787C17.5118 13.2692 17.5118 13.9024 17.1213 14.2929L14.7071 16.7071C14.3166 17.0976 14 17.4142 14 18V20" stroke="black" strokeWidth="0.5"/>
      </svg>
    </div>
  );
}

// ── 하이라이트 링 ────────────────────────────────────────────────────────────
function Highlight({ active, color = 'ring-teal-400' }: { active: boolean; color?: string }) {
  return active ? (
    <div className={`absolute inset-0 rounded-inherit pointer-events-none ring-2 ring-offset-1 ring-offset-slate-900 ${color} transition-all duration-300 rounded-xl`} />
  ) : null;
}

// ── 풍선 힌트 ────────────────────────────────────────────────────────────────
function Tooltip({ text, visible, position = 'bottom' }: { text: string; visible: boolean; position?: 'top'|'bottom'|'left'|'right' }) {
  if (!visible) return null;
  const posClass = {
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
  }[position];
  return (
    <div className={`absolute ${posClass} z-40 bg-teal-500 text-white text-[9px] font-black px-2 py-1 rounded-lg whitespace-nowrap shadow-lg animate-in fade-in slide-in-from-bottom-1 duration-200`}>
      {text}
      <div className={`absolute w-2 h-2 bg-teal-500 rotate-45 ${position === 'bottom' ? '-top-1 left-1/2 -translate-x-1/2' : position === 'top' ? '-bottom-1 left-1/2 -translate-x-1/2' : position === 'left' ? '-right-1 top-1/2 -translate-y-1/2' : '-left-1 top-1/2 -translate-y-1/2'}`} />
    </div>
  );
}

// ── 실제 앱 탭바 ─────────────────────────────────────────────────────────────
function AppTabs({ active, highlight }: { active: string; highlight?: string }) {
  const rows = [
    [
      { id: 'status', label: '내 상태', emoji: '😊' },
      { id: 'my-table', label: '내 테이블', emoji: '🪑' },
      { id: 'chat', label: '내 채팅', emoji: '💬' },
      { id: 'fortune', label: '내 운세', emoji: '🔮' },
      { id: 'stats', label: '통계', emoji: '📊' },
    ],
    [
      { id: 'profiles', label: '참여자', emoji: '👥' },
      { id: 'seating', label: '배치도', emoji: '🗺️' },
      { id: 'suggestions', label: '요청', emoji: '📋' },
      { id: 'game', label: '게임', emoji: '🎮' },
      { id: 'ranking', label: '랭킹', emoji: '🏆' },
    ],
  ];
  return (
    <div className="border-t border-slate-700 bg-slate-900 px-1 py-1">
      {rows.map((row, ri) => (
        <div key={ri} className="flex">
          {row.map(tab => (
            <div key={tab.id} className={`relative flex-1 flex flex-col items-center py-1 rounded-lg cursor-pointer transition-all ${active === tab.id ? 'bg-teal-500/20' : ''}`}>
              <Highlight active={highlight === tab.id} color="ring-teal-400" />
              <span className="text-[14px] leading-none">{tab.emoji}</span>
              <span className={`text-[7px] font-bold mt-0.5 ${active === tab.id ? 'text-teal-400' : 'text-slate-500'}`}>{tab.label}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── 장면 정의 ─────────────────────────────────────────────────────────────────
interface Step {
  cursorX: number; cursorY: number;
  clicking?: boolean;
  duration: number; // ms
}

interface Scene {
  title: string; subtitle: string; duration: number;
  steps: Step[];
  render: (stepIdx: number) => ReactElement;
}

// ── 장면 1: 앱 입장 ───────────────────────────────────────────────────────────
function Scene1({ step }: { step: number }) {
  const [typed, setTyped] = useState('');
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (step < 1) return undefined;
    if (step === 2) {
      let s = '';
      const chars = ['*','*','*','*','*','*'];
      let i = 0;
      const iv = setInterval(() => {
        s += chars[i++];
        setTyped(s);
        if (i >= chars.length) clearInterval(iv);
      }, 200);
      return () => clearInterval(iv);
    }
    if (step >= 3) setEntered(true);
    return undefined;
  }, [step]);

  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-slate-900 to-slate-800 px-5">
      {!entered ? (
        <>
          <div className="text-center">
            <div className="text-4xl mb-2">🥂</div>
            <p className="text-white font-black text-base">2026 회식 매칭</p>
            <p className="text-slate-400 text-[10px] mt-0.5">비밀번호를 입력하세요</p>
          </div>
          <div className={`relative w-full`}>
            <Highlight active={step === 1 || step === 2} />
            <div className={`bg-slate-700 border-2 rounded-2xl px-4 py-3 text-center text-base font-black tracking-[0.3em] transition-all ${step >= 1 ? 'border-teal-500' : 'border-slate-600'} ${typed ? 'text-white' : 'text-slate-500'}`}>
              {typed || '비밀번호'}
            </div>
          </div>
          <div className="relative w-full">
            <Highlight active={step === 3} color="ring-emerald-400" />
            <div className={`bg-teal-500 rounded-2xl py-3 text-center text-white font-black text-sm transition-all ${step === 3 ? 'scale-95 bg-teal-400' : ''}`}>
              입장하기 →
            </div>
          </div>
        </>
      ) : (
        <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="text-5xl mb-3">🎉</div>
          <p className="text-white font-black text-base">입장 완료!</p>
          <p className="text-slate-400 text-[11px] mt-1">프로필 설정 화면으로 이동합니다</p>
        </div>
      )}
    </div>
  );
}

// ── 장면 2: 탭 설명 ───────────────────────────────────────────────────────────
function Scene2({ step }: { step: number }) {
  const activeTab = step <= 1 ? 'status' : step <= 3 ? 'chat' : step <= 5 ? 'fortune' : 'seating';
  const highlightTab = step === 0 ? 'status' : step === 1 ? 'chat' : step === 2 ? 'chat' : step === 3 ? 'fortune' : step === 4 ? 'fortune' : 'seating';
  const descriptions: Record<string, { icon: string; title: string; desc: string }> = {
    status:  { icon: '😊', title: '내 상태', desc: '프로필·운세·연락처를 한눈에. 아바타도 여기서 변경!' },
    chat:    { icon: '💬', title: '내 채팅', desc: '1:1 채팅방 목록. 새 메시지엔 빨간 뱃지 표시됩니다.' },
    fortune: { icon: '🔮', title: '내 운세', desc: '오늘의 사주·타로·궁합. 생월일 등록 후 사용 가능.' },
    seating: { icon: '🗺️', title: '배치도', desc: '전체 테이블 좌석 현황. 빈 자리(+) 탭하면 이동!' },
  };
  const cur = descriptions[activeTab];
  return (
    <div className="h-full flex flex-col bg-slate-900">
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
        <div className={`text-5xl transition-all duration-300 ${step % 2 === 0 ? 'scale-110' : 'scale-100'}`}>{cur.icon}</div>
        <div className="text-center">
          <p className="text-white font-black text-[15px]">{cur.title} 탭</p>
          <p className="text-slate-300 text-[11px] mt-1 leading-relaxed">{cur.desc}</p>
        </div>
        <div className={`w-full bg-slate-800 border border-slate-700 rounded-2xl p-2.5 text-[10px] text-slate-400 font-semibold text-center transition-all duration-300 ${step >= 3 ? 'opacity-100' : 'opacity-0'}`}>
          💡 상단 탭 2줄 — 총 10개 탭 제공
        </div>
      </div>
      <AppTabs active={activeTab} highlight={highlightTab} />
    </div>
  );
}

// ── 장면 3: 참여자 프로필 + 하트 전송 ─────────────────────────────────────────
function Scene3({ step }: { step: number }) {
  const [sent, setSent] = useState(false);
  const [selectedHeart, setSelectedHeart] = useState<string|null>(null);
  useEffect(() => {
    if (step === 3) { setSelectedHeart('❤️'); }
    if (step >= 4) { setSent(true); }
  }, [step]);
  const hearts = ['❤️','🧡','💛','💚','💙','💜','🖤'];
  return (
    <div className="h-full flex flex-col bg-slate-900 px-3 pt-3 gap-2.5">
      {/* 참여자 카드 */}
      <div className={`bg-slate-800 border rounded-2xl p-3 flex items-center gap-3 transition-all ${step >= 1 ? 'border-teal-500/60' : 'border-slate-700'}`}>
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center text-2xl flex-shrink-0">🐶</div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-black text-sm">이수빈</p>
          <p className="text-slate-400 text-[10px]">3번 테이블 · ENFP · 29세</p>
          <p className="text-teal-400 text-[9px] mt-0.5 font-bold">💬 카카오: subin_lee</p>
        </div>
        <div className="relative">
          <Highlight active={step === 1} />
          <div className="bg-teal-500/20 border border-teal-500/40 rounded-xl px-2.5 py-1 text-teal-300 text-[10px] font-black">채팅 →</div>
        </div>
      </div>

      {/* 하트 선택 */}
      <div className={`relative bg-slate-800 border rounded-2xl p-3 transition-all ${step >= 2 ? 'border-rose-500/50' : 'border-slate-700'}`}>
        <Highlight active={step === 2} color="ring-rose-400" />
        <p className="text-slate-300 text-[10px] font-black mb-2">❤️ 하트 보내기</p>
        <div className="flex gap-1.5 flex-wrap">
          {hearts.map(h => (
            <div key={h} className={`relative w-9 h-9 rounded-xl flex items-center justify-center text-xl cursor-pointer transition-all duration-200 ${selectedHeart === h ? 'bg-rose-500/30 ring-2 ring-rose-400 scale-115' : 'bg-slate-700 hover:bg-slate-600'}`}>
              <Highlight active={step === 2 && h === '❤️'} color="ring-rose-400" />
              {h}
            </div>
          ))}
        </div>
      </div>

      {/* 전송 결과 */}
      {sent && (
        <div className="flex items-center gap-2 bg-rose-900/30 border border-rose-500/40 rounded-xl px-3 py-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <span className="text-2xl animate-bounce">❤️</span>
          <div>
            <p className="text-rose-300 font-black text-[11px]">하트 전송 완료!</p>
            <p className="text-slate-400 text-[9px]">상대방이 수락하면 연락처가 공유됩니다</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 장면 4: 채팅 ─────────────────────────────────────────────────────────────
function Scene4({ step }: { step: number }) {
  const [chatOpen, setChatOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<{text:string;mine:boolean}[]>([
    { text: '안녕하세요! 반갑습니다 😊', mine: false },
  ]);
  useEffect(() => {
    if (step === 2) { setChatOpen(true); return undefined; }
    if (step === 3) {
      let t = '';
      const target = '안녕하세요!';
      const chars = target.split('');
      let i = 0;
      const iv = setInterval(() => {
        t += chars[i++];
        setInputText(t);
        if (i >= chars.length) clearInterval(iv);
      }, 100);
      return () => clearInterval(iv);
    }
    if (step >= 4) {
      setMessages(prev => [...prev, { text: '안녕하세요!', mine: true }]);
      setInputText('');
    }
    return undefined;
  }, [step]);

  if (!chatOpen) {
    return (
      <div className="h-full flex flex-col bg-slate-900 px-3 pt-3 gap-2">
        <p className="text-slate-400 text-[10px] font-bold px-1">내 채팅 목록</p>
        {[
          { name: '이수빈', msg: '안녕하세요!', badge: 2, emoji: '🐶' },
          { name: '김민준', msg: '오늘 재밌었어요', badge: 0, emoji: '🐱' },
          { name: '박지현', msg: '연락처 공유 감사해요', badge: 1, emoji: '🦊' },
        ].map((c, i) => (
          <div key={c.name} className={`relative bg-slate-800 border rounded-2xl px-3 py-2.5 flex items-center gap-2.5 transition-all ${i === 0 && step >= 1 ? 'border-teal-500 scale-[1.02]' : 'border-slate-700'}`}>
            <Highlight active={i === 0 && step === 1} />
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-lg flex-shrink-0">{c.emoji}</div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-[12px] font-black">{c.name}</p>
              <p className="text-slate-400 text-[10px] truncate">{c.msg}</p>
            </div>
            {c.badge > 0 && <span className="w-5 h-5 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center flex-shrink-0">{c.badge}</span>}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-900">
      <div className="px-3 py-2 border-b border-slate-700 flex items-center gap-2">
        <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-base">🐶</div>
        <div className="flex-1">
          <p className="text-white text-[12px] font-black leading-tight">이수빈</p>
          <p className="text-teal-400 text-[9px]">● 온라인</p>
        </div>
        <span className="text-[9px] font-bold text-slate-400">📱 연락처 공유</span>
      </div>
      <div className="flex-1 px-3 py-2 space-y-2 overflow-hidden">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.mine ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-1 duration-300`}>
            <span className={`inline-block px-3 py-1.5 rounded-2xl text-[11px] font-semibold ${m.mine ? 'bg-teal-500 text-white' : 'bg-slate-700 text-slate-200'}`}>{m.text}</span>
          </div>
        ))}
      </div>
      <div className="px-3 pb-2.5">
        <div className={`relative flex items-center gap-2 rounded-2xl px-3 py-2 transition-all ${step >= 3 ? 'bg-slate-700 ring-2 ring-teal-500/50' : 'bg-slate-700'}`}>
          <Highlight active={step === 3 || step === 4} color="ring-teal-400" />
          <span className="flex-1 text-[11px] text-white">{inputText || <span className="text-slate-500">메시지 입력…</span>}</span>
          <div className={`relative flex-shrink-0`}>
            <Highlight active={step >= 4} color="ring-teal-400" />
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-sm font-black transition-all ${inputText ? 'bg-teal-500' : 'bg-slate-600'}`}>↑</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 장면 5: 오늘의 운세 ───────────────────────────────────────────────────────
function Scene5({ step }: { step: number }) {
  return (
    <div className="h-full flex flex-col bg-slate-900 px-3 pt-3 gap-2">
      <p className="text-slate-400 text-[10px] font-bold px-1">내 상태 탭</p>
      {/* 운세 카드 */}
      <div className={`relative bg-gradient-to-r from-purple-900/60 to-slate-800 border rounded-2xl p-3 transition-all ${step >= 1 ? 'border-purple-500/60' : 'border-slate-700'}`}>
        <Highlight active={step === 0} color="ring-purple-400" />
        <div className="flex items-center gap-2.5 mb-2">
          <span className="text-2xl">🐯</span>
          <div className="flex-1">
            <p className="text-purple-300 text-[9px] font-black uppercase tracking-widest">오늘의 운세</p>
            <p className="text-slate-300 text-[10px]">3월 15일 · 호랑이띠</p>
          </div>
          <div className={`relative bg-purple-900/60 rounded-xl px-2.5 py-1 text-center transition-all ${step === 2 ? 'ring-2 ring-purple-400 scale-110' : ''}`}>
            <Highlight active={step === 2} color="ring-purple-400" />
            <p className="text-purple-200 font-black text-lg leading-none">82</p>
            <p className="text-purple-400 text-[8px]">에너지</p>
          </div>
        </div>
        <p className={`text-slate-200 text-[11px] leading-relaxed transition-all ${step >= 1 ? 'opacity-100' : 'opacity-30'}`}>
          오늘은 새로운 인연이 기다리고 있어요. 먼저 말을 건네 보세요! 🌟
        </p>
        <div className={`flex gap-1.5 flex-wrap mt-2 transition-all ${step >= 3 ? 'opacity-100' : 'opacity-0'}`}>
          {['🎨 초록색','🔢 7','✨ 크리스탈'].map(t => (
            <span key={t} className="bg-slate-700 text-slate-300 text-[9px] px-2 py-0.5 rounded-full font-bold">{t}</span>
          ))}
        </div>
      </div>
      {/* 궁합 */}
      <div className={`relative bg-violet-900/30 border border-violet-500/30 rounded-2xl p-2.5 transition-all ${step >= 4 ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
        <Highlight active={step === 4} color="ring-violet-400" />
        <p className="text-violet-300 text-[10px] font-black mb-1.5">💘 다른 참여자와 궁합 확인</p>
        <div className="flex gap-1.5">
          {[{e:'🐶',n:'이수빈',s:'92'},{e:'🐱',n:'김민준',s:'78'},{e:'🦊',n:'박지현',s:'65'}].map(p=>(
            <div key={p.n} className="flex-1 bg-slate-800 rounded-xl p-1.5 text-center border border-slate-700">
              <span className="text-lg">{p.e}</span>
              <p className="text-slate-300 text-[8px] font-bold">{p.n}</p>
              <p className="text-rose-400 text-[9px] font-black">{p.s}점</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 장면 6: 배치도 + 자리 이동 ───────────────────────────────────────────────
function Scene6({ step }: { step: number }) {
  const [seatSelected, setSeatSelected] = useState(false);
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    if (step >= 3) setSeatSelected(true);
    if (step >= 4) setMoved(true);
  }, [step]);
  const tables = [1,2,3,4,5,6,7,8,9,10,11,12];
  return (
    <div className="h-full flex flex-col bg-slate-900 px-2.5 pt-2.5 gap-2">
      <p className="text-slate-400 text-[10px] font-bold px-0.5">배치도 탭 — 전체 테이블 현황</p>
      <div className="grid grid-cols-4 gap-1">
        {tables.map(n => {
          const isMe = n === 3;
          const isFull = n === 7;
          const isSelected = seatSelected && n === 5;
          return (
            <div key={n} className={`relative rounded-xl border py-1.5 text-center transition-all duration-300 ${isMe ? 'border-cyan-400 bg-cyan-500/20' : isFull ? 'border-rose-500/40 bg-rose-900/20' : isSelected ? 'border-teal-400 bg-teal-500/20 scale-105' : n === 5 && step >= 2 ? 'border-teal-500/60 bg-slate-700' : 'border-slate-700 bg-slate-800'}`}>
              <Highlight active={(n === 5 && step === 2) || (n === 5 && step === 3)} color="ring-teal-400" />
              <p className={`text-[9px] font-black ${isMe ? 'text-cyan-300' : isFull ? 'text-rose-400' : 'text-slate-300'}`}>{isMe ? '★' : ''}{n}번</p>
              <p className={`text-[8px] ${isFull ? 'text-rose-400 font-bold' : 'text-slate-500'}`}>{isFull ? '만석' : `${[5,7,4,8,2,6,7,8,3,4,5,6][n-1]}/8`}</p>
            </div>
          );
        })}
      </div>
      {!moved ? (
        <div className={`bg-slate-800 border border-slate-700 rounded-xl p-2 text-center transition-all ${step >= 1 ? 'opacity-100' : 'opacity-0'}`}>
          <p className="text-teal-300 text-[10px] font-bold">테이블 탭하면 자리 배치도 확대</p>
          <p className="text-slate-500 text-[9px] mt-0.5">빈 자리(+) 탭하면 직접 이동 가능</p>
        </div>
      ) : (
        <div className="bg-teal-900/30 border border-teal-500/40 rounded-xl p-2 text-center animate-in fade-in slide-in-from-bottom-2 duration-500">
          <p className="text-teal-300 font-black text-[11px]">✅ 5번 테이블로 이동 완료!</p>
        </div>
      )}
    </div>
  );
}

// ── 장면 데이터 ───────────────────────────────────────────────────────────────
// cursorX/Y: 장면 컨테이너(w=248, h=280) 기준 픽셀 위치
const SCENES: Scene[] = [
  {
    title: '앱 입장하기', subtitle: '비밀번호 입력 → 입장 버튼 클릭',
    duration: 7000,
    steps: [
      { cursorX: 124, cursorY: 140, clicking: false, duration: 800 },  // 0: 초기 위치
      { cursorX: 124, cursorY: 140, clicking: true,  duration: 600 },  // 1: 비번 입력창 클릭
      { cursorX: 124, cursorY: 140, clicking: false, duration: 2200 }, // 2: 타이핑 중
      { cursorX: 124, cursorY: 185, clicking: false, duration: 500 },  // 3: 버튼으로 이동
      { cursorX: 124, cursorY: 185, clicking: true,  duration: 500 },  // 4: 클릭
      { cursorX: 124, cursorY: 200, clicking: false, duration: 1400 }, // 5: 완료 화면
    ],
    render: (s) => <Scene1 step={s} />,
  },
  {
    title: '탭 설명', subtitle: '10개 탭을 탭해서 각 기능으로 이동',
    duration: 8000,
    steps: [
      { cursorX: 25,  cursorY: 248, clicking: false, duration: 800 },
      { cursorX: 25,  cursorY: 248, clicking: true,  duration: 500 }, // 내 상태
      { cursorX: 124, cursorY: 258, clicking: false, duration: 1500 },
      { cursorX: 124, cursorY: 258, clicking: true,  duration: 500 }, // 내 채팅
      { cursorX: 198, cursorY: 248, clicking: false, duration: 1500 },
      { cursorX: 198, cursorY: 248, clicking: true,  duration: 500 }, // 내 운세
      { cursorX: 75,  cursorY: 258, clicking: false, duration: 1500 },
      { cursorX: 75,  cursorY: 258, clicking: true,  duration: 500 }, // 배치도
      { cursorX: 124, cursorY: 140, clicking: false, duration: 700 },
    ],
    render: (s) => <Scene2 step={s} />,
  },
  {
    title: '하트 보내기', subtitle: '참여자 카드 → 하트 버튼 탭',
    duration: 7000,
    steps: [
      { cursorX: 200, cursorY: 75,  clicking: false, duration: 800 },  // 채팅 버튼 쪽
      { cursorX: 200, cursorY: 75,  clicking: true,  duration: 500 },  // 클릭
      { cursorX: 35,  cursorY: 145, clicking: false, duration: 1200 }, // 하트 섹션
      { cursorX: 35,  cursorY: 155, clicking: false, duration: 600 },  // ❤️ 쪽으로
      { cursorX: 35,  cursorY: 155, clicking: true,  duration: 500 },  // 클릭
      { cursorX: 124, cursorY: 200, clicking: false, duration: 2400 }, // 결과
    ],
    render: (s) => <Scene3 step={s} />,
  },
  {
    title: '1:1 채팅하기', subtitle: '채팅 목록 → 채팅방 입장 → 메시지 전송',
    duration: 9000,
    steps: [
      { cursorX: 124, cursorY: 90,  clicking: false, duration: 800 },  // 목록 첫 번째 채팅
      { cursorX: 124, cursorY: 90,  clicking: true,  duration: 600 },  // 클릭 → 채팅방
      { cursorX: 124, cursorY: 90,  clicking: false, duration: 700 },  // 채팅방 열림
      { cursorX: 168, cursorY: 248, clicking: false, duration: 1800 }, // 입력창 클릭
      { cursorX: 222, cursorY: 248, clicking: false, duration: 1800 }, // 전송 버튼으로
      { cursorX: 222, cursorY: 248, clicking: true,  duration: 600 },  // 전송
      { cursorX: 124, cursorY: 200, clicking: false, duration: 2700 }, // 결과 확인
    ],
    render: (s) => <Scene4 step={s} />,
  },
  {
    title: '오늘의 운세', subtitle: '운세 카드 → 에너지·행운 태그·궁합 확인',
    duration: 8000,
    steps: [
      { cursorX: 124, cursorY: 100, clicking: false, duration: 800 }, // 운세 카드
      { cursorX: 124, cursorY: 120, clicking: false, duration: 1500 }, // 메시지 읽기
      { cursorX: 205, cursorY: 85,  clicking: false, duration: 1500 }, // 에너지 뱃지
      { cursorX: 60,  cursorY: 158, clicking: false, duration: 1500 }, // 행운 태그
      { cursorX: 124, cursorY: 210, clicking: false, duration: 1500 }, // 궁합 섹션
      { cursorX: 60,  cursorY: 225, clicking: true,  duration: 900 },  // 클릭
    ],
    render: (s) => <Scene5 step={s} />,
  },
  {
    title: '배치도 & 자리 이동', subtitle: '테이블 현황 확인 → 빈 테이블 탭 → 이동',
    duration: 7000,
    steps: [
      { cursorX: 124, cursorY: 140, clicking: false, duration: 1000 },
      { cursorX: 65,  cursorY: 115, clicking: false, duration: 1200 }, // 5번 테이블 탐색
      { cursorX: 65,  cursorY: 115, clicking: true,  duration: 600 },  // 클릭
      { cursorX: 65,  cursorY: 115, clicking: false, duration: 1500 }, // 선택됨
      { cursorX: 65,  cursorY: 115, clicking: true,  duration: 600 },  // 확정 클릭
      { cursorX: 124, cursorY: 240, clicking: false, duration: 2100 }, // 완료 메시지
    ],
    render: (s) => <Scene6 step={s} />,
  },
];

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export function TutorialVideo({ onClose }: { darkMode?: boolean; onClose: () => void }) {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  const scene = SCENES[sceneIdx];
  const step = scene.steps[stepIdx] ?? scene.steps[scene.steps.length - 1];
  const isLast = sceneIdx === SCENES.length - 1;

  const goScene = (idx: number) => {
    setSceneIdx(Math.max(0, Math.min(SCENES.length - 1, idx)));
    setStepIdx(0);
    setElapsed(0);
  };

  // 스텝 자동 전진
  useEffect(() => {
    if (!playing) return;
    let spent = 0;
    for (let i = 0; i < stepIdx; i++) spent += scene.steps[i].duration;
    const remaining = step.duration - (elapsed - spent);

    const t = setTimeout(() => {
      if (stepIdx < scene.steps.length - 1) {
        setStepIdx(s => s + 1);
        setElapsed(e => e + step.duration);
      } else {
        // 장면 전환
        if (sceneIdx < SCENES.length - 1) {
          setTimeout(() => goScene(sceneIdx + 1), 600);
        }
      }
    }, Math.max(50, remaining));
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, stepIdx, sceneIdx]);

  const progress = (() => {
    const totalStepDur = scene.steps.reduce((a, s) => a + s.duration, 0);
    let done = 0;
    for (let i = 0; i < stepIdx; i++) done += scene.steps[i].duration;
    return Math.min(100, (done / totalStepDur) * 100);
  })();

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center sm:items-center p-4 bg-black/85 backdrop-blur-sm"
      onClick={onClose}>
      <div className="relative w-full max-w-xs rounded-3xl shadow-2xl overflow-hidden bg-slate-900 border border-slate-700"
        onClick={e => e.stopPropagation()}>

        {/* 헤더 */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          <div className="flex-1">
            <p className="text-white font-black text-[13px]">{scene.title}</p>
            <p className="text-slate-400 text-[10px]">{scene.subtitle}</p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-slate-300 text-xs transition-all flex-shrink-0">
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

        {/* 앱 화면 (폰 비율) */}
        <div className="mx-4 mb-3 rounded-2xl overflow-hidden border border-slate-700 bg-slate-900 relative"
          style={{ height: 280 }}>
          <div key={sceneIdx} className="w-full h-full">
            {scene.render(stepIdx)}
          </div>
          {/* 애니메이션 커서 */}
          <Cursor x={step.cursorX} y={step.cursorY} clicking={step.clicking ?? false} />
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
          <button onClick={() => isLast && stepIdx >= scene.steps.length - 2 ? onClose() : goScene(sceneIdx + 1)}
            className="w-9 h-9 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center transition-all">
            <SkipForward className="w-4 h-4 text-slate-300" />
          </button>
        </div>

        {/* 장면 번호 */}
        <div className="absolute bottom-[52px] right-5">
          <span className="text-[9px] text-slate-600 font-bold">{sceneIdx + 1}/{SCENES.length}</span>
        </div>
      </div>
    </div>
  );
}
