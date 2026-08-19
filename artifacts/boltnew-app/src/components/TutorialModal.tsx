import React, { useState, useEffect } from 'react';
import { X, ArrowLeft, ArrowRight } from 'lucide-react';
import { TutorialVideo } from './TutorialVideo';

type Tip = { icon: string; title: string; desc: string };
type Section = { emoji: string; title: string; tips: Tip[]; footer?: string };
type FillerKind = 'guide' | 'signal' | 'chat' | 'group' | 'pin' | 'hidden';
type Topic = {
  id: string;
  emoji: string;
  label: string;
  title: string;
  color: string;
  tips: Tip[];
  video?: number[];
  sections?: Section[];
  footer?: string;
  filler?: FillerKind;
  wideTips?: boolean;
  nowrapTips?: boolean;
};

const BASIC: Topic[] = [
  {
    id: 'guide',
    emoji: '📋',
    label: '안내',
    title: '오늘만 이 정도는 지켜줘',
    color: 'from-teal-500 to-cyan-600',
    tips: [],
    filler: 'guide',
    sections: [
      {
        emoji: '📋',
        title: '공지',
        tips: [
          { icon: '🍺', title: '술 강요 없음', desc: '마시고 싶은 만큼만. 강요 금지.' },
          { icon: '🗳️', title: '정치·종교', desc: '정치·종교 토크는 패스. 영구밴.' },
          { icon: '🚫', title: '지역·패드립', desc: '지역·패드립은 바로 영구밴.' },
          { icon: '🗣️', title: '욕설·반말', desc: '욕·반말은 영구밴. 존댓말로.' },
        ],
        footer: '🔒 번호·SNS 강요 금지. 끝나면 정보 파기.',
      },
      {
        emoji: '🥂',
        title: '아래 있는 탭',
        tips: [
          { icon: '👥', title: '참여자', desc: '오늘 온 사람들 카드가 여기.' },
          { icon: '💕', title: '시그널', desc: '미션 전엔 설명서. 열리면 패스·시그널.' },
          { icon: '📊', title: '통계', desc: '오늘 오간 하트 수랑 비율.' },
          { icon: '🏆', title: '랭킹', desc: '하트 많이 받은 사람 TOP 10.' },
        ],
        footer: '하트는 카드 아래 · 채팅·설정은 MY',
      },
    ],
  },
  {
    id: 'heart',
    emoji: '❤️',
    label: '하트',
    title: '하트 보내기',
    color: 'from-pink-500 to-rose-500',
    wideTips: true,
    tips: [
      { icon: '🤍', title: '보내는 곳', desc: '카드 아래 하트. 오른쪽 위 아님.' },
      { icon: '8️⃣', title: '개수', desc: '❤️호감 💙친구 💗뜨밤 💚칭찬 · 종류당 2개, 오늘 8개' },
      { icon: '✅', title: '수락되면', desc: '연락처 나눌 수 있음. 채팅방 자동 생성 없음.' },
    ],
    video: [6],
  },
  {
    id: 'signal',
    emoji: '💕',
    label: '시그널',
    title: '시그널, 미션 먼저',
    color: 'from-fuchsia-500 to-rose-500',
    filler: 'signal',
    wideTips: true,
    tips: [
      { icon: '📖', title: '미션 전', desc: '탭은 열려도 추천은 잠김. 설명서 + 하트 0/3.' },
      { icon: '🎯', title: '오늘의 미션', desc: '다른 3명에게 하트 보내기. 3/3면 추천 해금.' },
      { icon: '👈', title: '왼쪽 = 패스', desc: '별로면 왼쪽으로 밀어요. 패스예요.' },
      { icon: '👉', title: '오른쪽 = 시그널', desc: '관심 있으면 오른쪽으로 밀어 시그널 보내기.' },
      { icon: '💬', title: '채팅은 하트', desc: '시그널만으로는 채팅이 안 열려요. 서로 하트여야 해요.' },
    ],
    video: [7],
  },
  {
    id: 'settings',
    emoji: '⚙️',
    label: '내설정',
    title: '내 설정 · 프로필',
    color: 'from-cyan-500 to-sky-600',
    tips: [
      { icon: '🔑', title: '고유번호', desc: '맨 위 4자리. 폰 바꾸면 복구.' },
      { icon: '📷', title: '사진·닉네임', desc: '사진/아바타. 2~6글자, 1회만 변경.' },
      { icon: '🎯', title: '관심사', desc: '2~5개. 시그널 매칭에 쓰여요.' },
      { icon: '📋', title: '연락처', desc: '카톡·인스타·전화. 수락하면 전달.' },
      { icon: '💬', title: '한마디', desc: '카드 위 전광판에 스크롤돼요.' },
      { icon: '💘', title: '이상형', desc: '성격·술·텐션·흡연 칩. 시그널용.' },
      { icon: '🌟', title: '나의 특징', desc: '같은 칩. 포지션은 닉네임 설정.' },
      { icon: '🚫', title: '차단', desc: '차단하면 서로 프로필·채팅이 안 보여요.' },
    ],
    video: [1, 2],
  },
  {
    id: 'chat',
    emoji: '💬',
    label: '채팅',
    title: '채팅, 이렇게만 알면 됨',
    color: 'from-blue-500 to-indigo-500',
    filler: 'chat',
    nowrapTips: true,
    tips: [
      { icon: '💬', title: '여는 곳', desc: 'MY → 내 채팅 · 단톡은 옆' },
      { icon: '😊', title: '이모지', desc: '입력줄 옆 😊에 붙여 넣음' },
      { icon: '🎨', title: '스티커', desc: '+ 다음 🎨 · 이모지와 다름' },
      { icon: '📷', title: '사진', desc: '+ 다음 이미지로 전송' },
      { icon: '⚡', title: '빠른 메시지', desc: '+ 다음 ⚡ 한 줄 전송' },
      { icon: '📱', title: '연락처·궁합', desc: '위 공유 · 🔮 궁합' },
      { icon: '👉', title: '스와이프 답장', desc: '옆으로 밀면 그 말 답장' },
      { icon: '👆', title: '길게 누르기', desc: '길게 → 답장·복사·삭제' },
    ],
  },
  {
    id: 'group',
    emoji: '👥',
    label: '단톡',
    title: '단톡, 두 방은 자동',
    color: 'from-teal-500 to-emerald-600',
    filler: 'group',
    wideTips: true,
    nowrapTips: true,
    tips: [
      { icon: '📍', title: '여는 곳', desc: 'MY → 내 채팅 → 단체 채팅' },
      { icon: '✨', title: '자동 입장', desc: '년생 모임 · N대 모임, 두 방' },
      { icon: '🚪', title: '2차', desc: '술·클럽 각 1방. 나가기·입장 자유' },
      { icon: '4️⃣', title: '한도', desc: '자동 2 + 2차 2 · 정원 무제한' },
    ],
  },
];

const ADVANCED: Topic[] = [
  {
    id: 'pin',
    emoji: '🔑',
    label: '고유번호',
    title: '고유번호 캡처 필수',
    color: 'from-amber-500 to-orange-500',
    filler: 'pin',
    wideTips: true,
    tips: [
      { icon: '📍', title: '어디에', desc: 'MY → 내 상태 4자리. 입장 핀이랑 다름.' },
      { icon: '📱', title: '폰 바꿈', desc: '다시 만들지 마. 이 번호로 복구.' },
    ],
    footer: '입장 핀이랑 고유번호는 다른 거예요',
  },
  {
    id: 'hidden',
    emoji: '✨',
    label: '숨은기능',
    title: '몰라도 되는데 알면 이득',
    color: 'from-violet-500 to-purple-600',
    filler: 'hidden',
    wideTips: true,
    tips: [
      { icon: '🔄', title: '카드 뒤집기', desc: '사진 탭하면 뒷면에 이상형.' },
      { icon: '💚', title: '칭찬 하트', desc: '💚은 칭찬만. 연락처 공유 없음.' },
      { icon: '🚫', title: '차단·숨기기', desc: '차단은 서로. 👻는 상대만 못 봄.' },
      { icon: '👁', title: '방문자', desc: 'MY → 내 상태. 프로필 본 사람.' },
    ],
  },
];

const KR_WRAP = 'break-keep [word-break:keep-all] [line-break:strict] [overflow-wrap:break-word] text-pretty';

/** 모든 탭에서 동일한 모달·영상 높이 */
const MODAL_SHELL = 'w-full max-w-sm max-h-[min(88dvh,calc(100dvh-var(--safe-top)-var(--safe-bottom)-2rem))]';
const EMBEDDED_VIDEO_H = 'h-[11rem]';

function TipCard({ tip, panel, text, muted }: {
  tip: Tip;
  panel: string;
  text: string;
  muted: string;
}) {
  return (
    <div className={`flex gap-2 rounded-xl border items-start px-2.5 py-2 min-h-[3.25rem] ${panel}`}>
      <span className="text-sm leading-none flex-shrink-0 mt-0.5">{tip.icon}</span>
      <div className="min-w-0 flex-1">
        <p className={`text-[11px] font-black leading-snug ${KR_WRAP} ${text}`}>{tip.title}</p>
        <p className={`text-[10px] leading-snug mt-0.5 ${KR_WRAP} ${muted}`}>
          {tip.desc.replace(/([.·])\s+/g, '$1\u200b ')}
        </p>
      </div>
    </div>
  );
}

function TipGrid({ tips, panel, text, muted, singleColumn }: {
  tips: Tip[];
  panel: string;
  text: string;
  muted: string;
  singleColumn?: boolean;
}) {
  const cols = singleColumn || tips.length <= 1 ? 'grid-cols-1' : 'grid-cols-2';
  return (
    <div className={`grid gap-1.5 ${cols}`}>
      {tips.map((tip) => (
        <TipCard key={tip.title} tip={tip} panel={panel} text={text} muted={muted} />
      ))}
    </div>
  );
}

function FillerArt({ kind, darkMode }: { kind: FillerKind; darkMode?: boolean }) {
  if (kind === 'guide') {
    return (
      <div className="relative h-8 w-20 mb-1" aria-hidden>
        <div className={`absolute inset-x-4 top-0.5 h-7 rounded-xl rotate-[-6deg] ${darkMode ? 'bg-amber-900/40' : 'bg-amber-100'}`} />
        <div className={`absolute inset-x-3.5 top-1 h-6 rounded-xl rotate-[5deg] ${darkMode ? 'bg-teal-800/70' : 'bg-teal-100'}`} />
        <div className={`absolute inset-x-5 top-1 h-6 rounded-xl flex items-center justify-center ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow-sm`}>
          <span className="text-[16px] leading-none">🥂</span>
        </div>
        <span className="absolute -right-0.5 top-0 text-[9px]">✨</span>
        <span className="absolute -left-0.5 bottom-0 text-[10px]">🌙</span>
      </div>
    );
  }
  if (kind === 'signal') {
    return (
      <div className="relative h-8 w-20 mb-1" aria-hidden>
        <div className={`absolute left-2 top-1 w-11 h-6 rounded-lg rotate-[-8deg] ${darkMode ? 'bg-rose-950/80' : 'bg-rose-100'}`} />
        <div className={`absolute left-5 top-0.5 w-11 h-6 rounded-lg rotate-[6deg] flex items-center justify-center ${darkMode ? 'bg-fuchsia-950 ring-1 ring-fuchsia-400/40' : 'bg-white ring-1 ring-rose-200'} shadow-sm`}>
          <span className="text-[14px] leading-none">💕</span>
        </div>
        <span className="absolute right-0 top-0 text-[9px]">✨</span>
        <span className={`absolute left-0 bottom-0 text-[8px] font-black ${darkMode ? 'text-rose-300' : 'text-rose-500'}`}>0/3</span>
      </div>
    );
  }
  if (kind === 'chat') {
    return (
      <div className="relative h-8 w-20 mb-1" aria-hidden>
        <div className={`absolute left-0.5 top-0.5 w-10 h-5 rounded-xl rounded-bl-sm flex items-center justify-center text-[8px] ${darkMode ? 'bg-slate-700 text-slate-200' : 'bg-white text-slate-600'} shadow-sm`}>안녕</div>
        <div className={`absolute right-0 bottom-0 w-12 h-5 rounded-xl rounded-br-sm flex items-center justify-center gap-0.5 ${darkMode ? 'bg-indigo-600 text-white' : 'bg-indigo-500 text-white'} shadow-sm`}>
          <span className="text-[8px] font-black">반가워</span>
          <span className="text-[9px]">💌</span>
        </div>
        <span className="absolute right-0.5 top-0 text-[10px]">💭</span>
      </div>
    );
  }
  if (kind === 'group') {
    return (
      <div className="relative h-8 w-20 mb-1" aria-hidden>
        <div className={`absolute left-1.5 top-1 w-7 h-6 rounded-xl rotate-[-8deg] ${darkMode ? 'bg-teal-900/70' : 'bg-teal-100'}`} />
        <div className={`absolute left-6 top-0.5 w-8 h-7 rounded-xl flex items-center justify-center ${darkMode ? 'bg-emerald-950 ring-1 ring-emerald-400/40' : 'bg-white ring-1 ring-teal-200'} shadow-sm`}>
          <span className="text-[14px] leading-none">👥</span>
        </div>
        <span className="absolute right-0 top-0 text-[9px]">🍻</span>
        <span className="absolute right-0.5 bottom-0 text-[9px]">🚪</span>
      </div>
    );
  }
  if (kind === 'pin') {
    return (
      <div className="relative h-6 w-14 mb-0.5 flex flex-col items-center" aria-hidden>
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[13px] shadow-sm ${darkMode ? 'bg-amber-900/70 ring-2 ring-amber-500/50' : 'bg-amber-100 ring-2 ring-amber-300'}`}>🔑</div>
      </div>
    );
  }
  return (
    <div className="relative h-7 w-16 mb-0.5" aria-hidden>
      <div className={`absolute left-1/2 top-0 -translate-x-1/2 w-7 h-7 rounded-lg rotate-[-8deg] ${darkMode ? 'bg-violet-900/80' : 'bg-violet-200'}`} />
      <div className={`absolute left-1/2 top-0 -translate-x-1/2 w-7 h-7 rounded-lg rotate-[7deg] flex flex-col items-center justify-center ${darkMode ? 'bg-fuchsia-950 ring-1 ring-fuchsia-400/40' : 'bg-white ring-1 ring-fuchsia-200'} shadow-sm`}>
        <span className="text-[13px] leading-none">🔄</span>
      </div>
    </div>
  );
}

const FILLERS: Record<FillerKind, { title: string; line: string; quote: string; shell: string; darkShell: string }> = {
  guide: {
    title: '오늘 하나만 건져도 이득',
    line: '규칙은 짧게, 텐션은 자유롭게',
    quote: '존댓말로 시작하면 반은 먹고 들어감',
    shell: 'bg-gradient-to-br from-teal-50 via-white to-amber-50 border border-teal-100',
    darkShell: 'bg-gradient-to-br from-slate-800/90 via-slate-800/60 to-teal-950/40 border border-slate-700',
  },
  signal: {
    title: '먼저 하트 3명',
    line: '열린 뒤엔 틴더처럼. 왼쪽 패스 · 오른쪽 시그널',
    quote: '채팅은 서로 하트. 시그널만으로는 안 열려요',
    shell: 'bg-gradient-to-br from-rose-50 via-fuchsia-50 to-white border border-rose-100',
    darkShell: 'bg-gradient-to-br from-slate-800/90 via-rose-950/50 to-slate-900 border border-rose-900/50',
  },
  chat: {
    title: '말 거는 게 제일 어려움 인정',
    line: '하트랑 채팅은 따로. 그냥 먼저 쳐도 됨',
    quote: '한 줄이면 충분, 소설 쓸 필요 없음',
    shell: 'bg-gradient-to-br from-sky-50 via-indigo-50 to-white border border-indigo-100',
    darkShell: 'bg-gradient-to-br from-slate-800/90 via-indigo-950/50 to-slate-900 border border-indigo-900/60',
  },
  group: {
    title: '두 방은 알아서 들어감',
    line: '2차 클럽·2차 술만 직접 입장',
    quote: '년생·N대 자동, 2차는 들락날락',
    shell: 'bg-gradient-to-br from-teal-50 via-emerald-50 to-white border border-teal-100',
    darkShell: 'bg-gradient-to-br from-slate-800/90 via-teal-950/50 to-slate-900 border border-teal-900/60',
  },
  pin: {
    title: '모르면?',
    line: '관리자에게 닉네임 말하고 찾아 달라고',
    quote: '입장 핀이랑 다른 거예요. 캡처 필수',
    shell: 'bg-gradient-to-br from-amber-50 via-orange-50 to-white border border-amber-100',
    darkShell: 'bg-gradient-to-br from-slate-800/90 via-amber-950/40 to-slate-900 border border-amber-900/50',
  },
  hidden: {
    title: '몰라도 되는데, 알면 이득',
    line: '카드 뒤집기 · 칭찬 하트 · 방문자',
    quote: '사진 탭하면 이상형 나옴. 진짜임',
    shell: 'bg-gradient-to-br from-violet-50 via-fuchsia-50 to-white border border-violet-100',
    darkShell: 'bg-gradient-to-br from-slate-800/90 via-violet-950/50 to-slate-900 border border-violet-900/60',
  },
};

function FillerPanel({ kind, darkMode }: { kind: FillerKind; darkMode?: boolean }) {
  const f = FILLERS[kind];
  const pin = kind === 'pin';
  return (
    <div
      className={`flex-shrink-0 flex flex-col items-center justify-center rounded-xl px-2.5 ${pin ? 'py-2' : 'py-1.5'} text-center ${
        darkMode ? f.darkShell : f.shell
      }`}
    >
      {pin && (
        <span className="mb-1 inline-flex items-center justify-center px-3.5 py-1 rounded-full text-[12px] font-black tracking-tight text-white shadow-sm bg-gradient-to-r from-amber-500 to-orange-500">
          관리자문의
        </span>
      )}
      <FillerArt kind={kind} darkMode={darkMode} />
      <p className={`${pin ? 'text-[13px]' : 'text-[12px]'} font-black tracking-tight leading-tight ${KR_WRAP} ${darkMode ? 'text-white' : 'text-slate-800'}`}>
        {f.title}
      </p>
      <p className={`${pin ? 'text-[11px]' : 'text-[10px]'} leading-snug mt-0.5 ${KR_WRAP} ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
        {f.line.replace(/([.·])\s+/g, '$1\u200b ')}
      </p>
      <p className={`${pin ? 'text-[10px]' : 'text-[9px]'} leading-snug mt-0.5 ${KR_WRAP} ${darkMode ? 'text-white/55' : 'text-slate-500'}`}>
        {f.quote.replace(/([.·])\s+/g, '$1\u200b ')}
      </p>
    </div>
  );
}

export function TutorialModal({ onClose, darkMode }: {
  page?: number;
  onChangePage?: (p: number) => void;
  onClose: () => void;
  darkMode?: boolean;
}) {
  const [mode, setMode] = useState<'basic' | 'advanced'>('basic');
  const [topicIdx, setTopicIdx] = useState(0);
  const [showVideo, setShowVideo] = useState(true);

  const topics = mode === 'basic' ? BASIC : ADVANCED;
  const safeIdx = Math.min(topicIdx, topics.length - 1);
  const topic = topics[safeIdx];
  const isLast = safeIdx === topics.length - 1;
  const hasVideo = Boolean(topic.video && showVideo);
  const showChips = topics.length > 1;

  useEffect(() => { setShowVideo(true); }, [mode, safeIdx]);

  const panel = darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-50 border-slate-200';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const text = darkMode ? 'text-slate-200' : 'text-gray-800';

  const switchMode = (next: 'basic' | 'advanced') => {
    setMode(next);
    setTopicIdx(0);
  };

  const videoBlock = hasVideo && topic.video ? (
    <div className={`flex-shrink-0 ${EMBEDDED_VIDEO_H}`}>
      <TutorialVideo
        key={`${mode}-${topic.id}`}
        embedded
        compact
        fill
        sceneIndices={topic.video}
        onClose={() => setShowVideo(false)}
      />
    </div>
  ) : null;

  const bodyContent = (
    <div className="flex flex-col gap-2">
      {(topic.sections ?? []).map((section) => (
        <div key={section.title}>
          <p className={`text-[11px] font-black mb-1.5 ${text}`}>{section.emoji} {section.title}</p>
          <TipGrid tips={section.tips} panel={panel} text={text} muted={muted} />
          {section.footer && (
            <p className={`mt-1.5 text-[10px] leading-snug ${KR_WRAP} ${muted}`}>
              {section.footer.replace(/([.·])\s+/g, '$1\u200b ')}
            </p>
          )}
        </div>
      ))}
      {topic.tips.length > 0 && (
        <TipGrid
          tips={topic.tips}
          panel={panel}
          text={text}
          muted={muted}
          singleColumn={topic.wideTips && topic.tips.length <= 3}
        />
      )}
      {topic.footer && (
        <p className={`text-[10px] leading-snug ${KR_WRAP} ${muted}`}>{topic.footer.replace(/([.·])\s+/g, '$1\u200b ')}</p>
      )}
      {topic.filler && <FillerPanel kind={topic.filler} darkMode={darkMode} />}
      {videoBlock}
    </div>
  );

  return (
    <div
      className="safe-overlay fixed inset-0 z-[150] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-modal-title"
        className={`mobile-flow-card relative ${MODAL_SHELL} min-h-0 rounded-2xl shadow-2xl flex flex-col overflow-hidden ${darkMode ? 'bg-slate-900' : 'bg-white'}`}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose}
          className="touch-target absolute top-2 right-2 z-10 flex items-center justify-center w-8 h-8 rounded-full bg-black/25 hover:bg-black/45 text-white">
          <X className="w-4 h-4" />
        </button>

        <div className={`bg-gradient-to-br ${topic.color} px-4 pt-3 pb-2 pr-12 flex-shrink-0`}>
          <p className="text-white/80 text-[10px] font-bold tracking-wide">도움말</p>
          <h2 id="tutorial-modal-title" className={`text-white font-black text-sm leading-snug mt-0.5 ${KR_WRAP}`}>{topic.emoji} {topic.title}</h2>
        </div>

        <div className={`flex-shrink-0 px-3 pt-2 ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
          <div className={`grid grid-cols-2 p-0.5 rounded-xl ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
            <button type="button" onClick={() => switchMode('basic')}
              className={`py-1 rounded-lg text-[11px] font-black transition-all ${
                mode === 'basic'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : darkMode ? 'text-slate-400' : 'text-gray-500'
              }`}>
              기본
            </button>
            <button type="button" onClick={() => switchMode('advanced')}
              className={`py-1 rounded-lg text-[11px] font-black transition-all ${
                mode === 'advanced'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : darkMode ? 'text-slate-400' : 'text-gray-500'
              }`}>
              심화
            </button>
          </div>
        </div>

        {showChips && (
          <div className={`flex-shrink-0 px-3 py-1.5 border-b ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
            <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {topics.map((t, i) => (
                <button key={t.id} onClick={() => setTopicIdx(i)}
                  className={`flex-shrink-0 px-2 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all active:scale-95 ${
                    i === safeIdx
                      ? `bg-gradient-to-br ${t.color} text-white shadow-sm`
                      : darkMode ? 'text-slate-500 hover:bg-slate-800' : 'text-gray-400 hover:bg-gray-50'
                  }`}>
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-2">
          {bodyContent}
        </div>

        <div className={`flex-shrink-0 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-2 border-t ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
          {safeIdx > 0 ? (
            <button onClick={() => setTopicIdx(safeIdx - 1)}
              className={`touch-target flex-[2] flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold whitespace-nowrap border ${darkMode ? 'border-slate-700 text-slate-300' : 'border-gray-200 text-gray-600'}`}>
              <ArrowLeft className="w-4 h-4" /> 이전
            </button>
          ) : mode === 'advanced' ? (
            <button onClick={() => switchMode('basic')}
              className={`touch-target flex-[2] py-2 rounded-xl text-xs font-semibold whitespace-nowrap border ${darkMode ? 'border-slate-700 text-slate-300' : 'border-gray-200 text-gray-600'}`}>
              기본으로
            </button>
          ) : (
            <button onClick={onClose}
              className={`touch-target flex-[2] py-2 rounded-xl text-xs font-semibold whitespace-nowrap border ${darkMode ? 'border-slate-700 text-slate-300' : 'border-gray-200 text-gray-500'}`}>
              닫기
            </button>
          )}
          <button
            onClick={() => {
              if (!isLast) { setTopicIdx(safeIdx + 1); return; }
              if (mode === 'basic') { switchMode('advanced'); return; }
              onClose();
            }}
            className={`touch-target flex-[3] flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-bold whitespace-nowrap text-white bg-gradient-to-r ${topic.color}`}
          >
            {isLast && mode === 'advanced' ? '알겠어요' : isLast && mode === 'basic' ? '심화 보기' : <>다음 <ArrowRight className="w-4 h-4" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
