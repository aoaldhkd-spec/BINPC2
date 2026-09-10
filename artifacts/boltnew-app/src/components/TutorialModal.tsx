import React, { useState, useEffect } from 'react';
import { X, ArrowLeft, ArrowRight, PlayCircle, Sparkles } from 'lucide-react';
import { TutorialVideo } from './TutorialVideo';
import { HOST_AGE_EASTER_EGG_HINT } from '../lib/host-age-easter-egg';

type Tip = { icon: string; title: string; desc: string };
type Section = { emoji: string; title: string; tips: Tip[]; footer?: string; variant?: 'rules' | 'tabs' | 'default' };
type FillerKind = 'guide' | 'chat' | 'group' | 'pin' | 'hidden' | 'heart';

type Topic = {
  id: string;
  emoji: string;
  label: string;
  title: string;
  color: string;
  tips: Tip[];
  video?: number[];
  videoHint?: string;
  sections?: Section[];
  footer?: string;
  filler?: FillerKind;
};

const BASIC: Topic[] = [
  {
    id: 'guide',
    emoji: '📋',
    label: '안내',
    title: '오늘만 이 정도는 지켜줘',
    color: 'from-teal-500 to-cyan-600',
    tips: [],
    sections: [
      {
        emoji: '📌',
        title: '오늘의 규칙',
        variant: 'rules',
        tips: [
          { icon: '🍺', title: '술 강요 없음', desc: '마시고 싶은 만큼만.' },
          { icon: '🗳️', title: '정치·종교', desc: '토크 패스. 영구밴.' },
          { icon: '🚫', title: '지역·패드립', desc: '바로 영구밴.' },
          { icon: '🗣️', title: '욕설·반말', desc: '존댓말로. 영구밴.' },
        ],
      },
      {
        emoji: '🗂️',
        title: '탭 안내',
        variant: 'tabs',
        tips: [
          { icon: '👥', title: '참여자', desc: '오늘 온 사람 카드.' },
          { icon: '💝', title: '하트, 채팅', desc: '내 상태·내 채팅.' },
          { icon: '📊', title: '통계', desc: '하트 수·비율.' },
          { icon: '🏆', title: '랭킹', desc: 'TOP 10.' },
          { icon: '⚙️', title: '설정', desc: '프로필·생월생일.' },
        ],
      },
    ],
    footer: '🔒 번호·SNS 금지 · 하트는 카드 아래 · 채팅은 하트, 채팅 탭 · 프로필은 설정',
  },
  {
    id: 'heart',
    emoji: '❤️',
    label: '하트',
    title: '하트 보내기',
    color: 'from-pink-500 to-rose-500',
    video: [6],
    videoHint: '받은·보낸 하트 확인하는 방법',
    tips: [
      { icon: '🤍', title: '보내는 곳', desc: '참여자 카드 아래 하트. 오른쪽 위 아님.' },
      { icon: '8️⃣', title: '개수', desc: '❤️호감 💙친구 💗뜨밤 💚칭찬 · 종류당 2개, 오늘 8개' },
      { icon: '✅', title: '확인 곳', desc: '하트, 채팅 → 내 상태. 받은 하트가 아래에 있어요.' },
    ],
  },
  {
    id: 'settings',
    emoji: '⚙️',
    label: '설정',
    title: '설정 · 프로필',
    color: 'from-cyan-500 to-sky-600',
    video: [1, 2],
    videoHint: '아바타 · 한마디 · 이상형 칩',
    tips: [
      { icon: '🔑', title: '고유번호', desc: '맨 위 4자리. 폰 바꾸면 복구.' },
      { icon: '📷', title: '사진·아바타', desc: '업로드 또는 기본 아바타.' },
      { icon: '🏷️', title: '닉네임', desc: '2~6글자. 1회만 변경.' },
      { icon: '🎯', title: '관심사', desc: '2~5개. 프로필 카드에 표시.' },
      { icon: '📋', title: '연락처', desc: '카톡·인스타·전화. 수락 시 전달.' },
      { icon: '🔮', title: '생월·생일', desc: '월·일. 2회만 변경. 사주·궁합 반영.' },
      { icon: '💬', title: '한마디', desc: '⚡ 빠른 선택·직접 입력. 전광판.' },
      { icon: '💘', title: '이상형', desc: '얼굴·체형·매력·성격 칩.' },
      { icon: '🌟', title: '나의 특징', desc: '같은 칩. 포지션은 닉네임.' },
      { icon: '🚫', title: '차단', desc: '차단 시 서로 프로필·채팅 불가.' },
    ],
  },
  {
    id: 'chat',
    emoji: '💬',
    label: '채팅',
    title: '채팅, 이렇게만 알면 됨',
    color: 'from-blue-500 to-indigo-500',
    video: [3, 4, 5],
    videoHint: '이모지·스티커 · 사진 · 스와이프 답장',
    tips: [
      { icon: '💬', title: '여는 곳', desc: '하트, 채팅 → 내 채팅 · 단톡은 옆' },
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
    tips: [
      { icon: '📍', title: '여는 곳', desc: '하트, 채팅 → 내 채팅 → 단체 채팅' },
      { icon: '✨', title: '자동 입장', desc: '년생 모임 · N대 모임, 두 방' },
      { icon: '🚪', title: '2차', desc: '술·클럽 각 1방. 나가기·입장 자유' },
      { icon: '4️⃣', title: '한도', desc: '자동 2 + 2차 2 · 정원 무제한' },
    ],
  },
];

const HIDDEN: Topic[] = [
  {
    id: 'pin',
    emoji: '🔑',
    label: '고유번호',
    title: '고유번호 캡처 필수',
    color: 'from-amber-500 to-orange-500',
    filler: 'pin',
    tips: [
      { icon: '📍', title: '어디에', desc: '설정 탭 맨 위 4자리. 입장 핀이랑 다름.' },
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
    tips: [
      { icon: '🔄', title: '카드 뒤집기', desc: '사진 탭하면 뒷면에 이상형.' },
      { icon: '👁', title: '방문자', desc: '하트, 채팅 → 내 상태. 목록만, 알림 없음.' },
      { icon: '🚫', title: '차단·숨기기', desc: '차단은 서로. 👻는 상대만 못 봄.' },
      { icon: '🍻', title: 'NPC 나이', desc: HOST_AGE_EASTER_EGG_HINT },
    ],
  },
];

const KR_WRAP = 'break-keep [word-break:keep-all] [line-break:strict] [overflow-wrap:break-word] text-pretty';

/** Fixed shell — identical height on every topic/mode (tips + video). No inner scroll. */
const MODAL_SHELL =
  'w-[calc(100vw-1rem)] max-w-md h-[min(560px,calc(85dvh-var(--safe-top,0px)-var(--safe-bottom,0px)))]';

/** One tip-card size on every topic so the densest page still fits without scrolling. */
const TIP_BOX = 'h-[2.75rem] items-center';

type TopicAccent = {
  cardLight: string;
  cardDark: string;
  iconLight: string;
  iconDark: string;
  bar: string;
  chipIdle: string;
  chipIdleDark: string;
};

const TOPIC_ACCENTS: Record<string, TopicAccent> = {
  guide: {
    cardLight: 'bg-gradient-to-br from-teal-50/90 to-cyan-50/60 border-teal-100/80 shadow-sm shadow-teal-100/40',
    cardDark: 'bg-gradient-to-br from-teal-950/40 to-slate-800/80 border-teal-800/50 shadow-sm shadow-teal-900/20',
    iconLight: 'bg-gradient-to-br from-teal-500 to-cyan-600 shadow-sm shadow-teal-300/50',
    iconDark: 'bg-gradient-to-br from-teal-600 to-cyan-700 shadow-sm shadow-teal-900/40',
    bar: 'from-teal-400 to-cyan-500',
    chipIdle: 'bg-teal-50/60 border-teal-100/60 text-teal-700/70',
    chipIdleDark: 'bg-teal-950/30 border-teal-900/40 text-teal-300/70',
  },
  heart: {
    cardLight: 'bg-gradient-to-br from-rose-50/90 to-pink-50/60 border-rose-100/80 shadow-sm shadow-rose-100/40',
    cardDark: 'bg-gradient-to-br from-rose-950/40 to-slate-800/80 border-rose-900/50 shadow-sm shadow-rose-900/20',
    iconLight: 'bg-gradient-to-br from-pink-500 to-rose-500 shadow-sm shadow-rose-300/50',
    iconDark: 'bg-gradient-to-br from-pink-600 to-rose-600 shadow-sm shadow-rose-900/40',
    bar: 'from-pink-400 to-rose-500',
    chipIdle: 'bg-rose-50/60 border-rose-100/60 text-rose-700/70',
    chipIdleDark: 'bg-rose-950/30 border-rose-900/40 text-rose-300/70',
  },
  signal: {
    cardLight: 'bg-gradient-to-br from-fuchsia-50/90 to-rose-50/60 border-fuchsia-100/80 shadow-sm shadow-fuchsia-100/40',
    cardDark: 'bg-gradient-to-br from-fuchsia-950/40 to-slate-800/80 border-fuchsia-900/50 shadow-sm shadow-fuchsia-900/20',
    iconLight: 'bg-gradient-to-br from-fuchsia-500 to-rose-500 shadow-sm shadow-fuchsia-300/50',
    iconDark: 'bg-gradient-to-br from-fuchsia-600 to-rose-600 shadow-sm shadow-fuchsia-900/40',
    bar: 'from-fuchsia-400 to-rose-500',
    chipIdle: 'bg-fuchsia-50/60 border-fuchsia-100/60 text-fuchsia-700/70',
    chipIdleDark: 'bg-fuchsia-950/30 border-fuchsia-900/40 text-fuchsia-300/70',
  },
  settings: {
    cardLight: 'bg-gradient-to-br from-sky-50/90 to-cyan-50/60 border-sky-100/80 shadow-sm shadow-sky-100/40',
    cardDark: 'bg-gradient-to-br from-sky-950/40 to-slate-800/80 border-sky-900/50 shadow-sm shadow-sky-900/20',
    iconLight: 'bg-gradient-to-br from-cyan-500 to-sky-600 shadow-sm shadow-cyan-300/50',
    iconDark: 'bg-gradient-to-br from-cyan-600 to-sky-700 shadow-sm shadow-cyan-900/40',
    bar: 'from-cyan-400 to-sky-500',
    chipIdle: 'bg-sky-50/60 border-sky-100/60 text-sky-700/70',
    chipIdleDark: 'bg-sky-950/30 border-sky-900/40 text-sky-300/70',
  },
  chat: {
    cardLight: 'bg-gradient-to-br from-indigo-50/90 to-blue-50/60 border-indigo-100/80 shadow-sm shadow-indigo-100/40',
    cardDark: 'bg-gradient-to-br from-indigo-950/40 to-slate-800/80 border-indigo-900/50 shadow-sm shadow-indigo-900/20',
    iconLight: 'bg-gradient-to-br from-blue-500 to-indigo-500 shadow-sm shadow-indigo-300/50',
    iconDark: 'bg-gradient-to-br from-blue-600 to-indigo-600 shadow-sm shadow-indigo-900/40',
    bar: 'from-blue-400 to-indigo-500',
    chipIdle: 'bg-indigo-50/60 border-indigo-100/60 text-indigo-700/70',
    chipIdleDark: 'bg-indigo-950/30 border-indigo-900/40 text-indigo-300/70',
  },
  group: {
    cardLight: 'bg-gradient-to-br from-emerald-50/90 to-teal-50/60 border-emerald-100/80 shadow-sm shadow-emerald-100/40',
    cardDark: 'bg-gradient-to-br from-emerald-950/40 to-slate-800/80 border-emerald-900/50 shadow-sm shadow-emerald-900/20',
    iconLight: 'bg-gradient-to-br from-teal-500 to-emerald-600 shadow-sm shadow-emerald-300/50',
    iconDark: 'bg-gradient-to-br from-teal-600 to-emerald-700 shadow-sm shadow-emerald-900/40',
    bar: 'from-teal-400 to-emerald-500',
    chipIdle: 'bg-emerald-50/60 border-emerald-100/60 text-emerald-700/70',
    chipIdleDark: 'bg-emerald-950/30 border-emerald-900/40 text-emerald-300/70',
  },
  pin: {
    cardLight: 'bg-gradient-to-br from-amber-50/90 to-orange-50/60 border-amber-100/80 shadow-sm shadow-amber-100/40',
    cardDark: 'bg-gradient-to-br from-amber-950/40 to-slate-800/80 border-amber-900/50 shadow-sm shadow-amber-900/20',
    iconLight: 'bg-gradient-to-br from-amber-500 to-orange-500 shadow-sm shadow-amber-300/50',
    iconDark: 'bg-gradient-to-br from-amber-600 to-orange-600 shadow-sm shadow-amber-900/40',
    bar: 'from-amber-400 to-orange-500',
    chipIdle: 'bg-amber-50/60 border-amber-100/60 text-amber-700/70',
    chipIdleDark: 'bg-amber-950/30 border-amber-900/40 text-amber-300/70',
  },
  hidden: {
    cardLight: 'bg-gradient-to-br from-violet-50/90 to-purple-50/60 border-violet-100/80 shadow-sm shadow-violet-100/40',
    cardDark: 'bg-gradient-to-br from-violet-950/40 to-slate-800/80 border-violet-900/50 shadow-sm shadow-violet-900/20',
    iconLight: 'bg-gradient-to-br from-violet-500 to-purple-600 shadow-sm shadow-violet-300/50',
    iconDark: 'bg-gradient-to-br from-violet-600 to-purple-700 shadow-sm shadow-violet-900/40',
    bar: 'from-violet-400 to-purple-500',
    chipIdle: 'bg-violet-50/60 border-violet-100/60 text-violet-700/70',
    chipIdleDark: 'bg-violet-950/30 border-violet-900/40 text-violet-300/70',
  },
};

const SECTION_VARIANTS: Record<'rules' | 'tabs' | 'default', { bar: string; headerLight: string; headerDark: string }> = {
  rules: {
    bar: 'from-rose-400 to-amber-400',
    headerLight: 'text-rose-700 bg-rose-50/80 border-rose-100',
    headerDark: 'text-rose-200 bg-rose-950/40 border-rose-900/50',
  },
  tabs: {
    bar: 'from-teal-400 to-cyan-500',
    headerLight: 'text-teal-700 bg-teal-50/80 border-teal-100',
    headerDark: 'text-teal-200 bg-teal-950/40 border-teal-900/50',
  },
  default: {
    bar: 'from-slate-300 to-slate-400',
    headerLight: 'text-slate-700 bg-slate-50/80 border-slate-100',
    headerDark: 'text-slate-200 bg-slate-800/60 border-slate-700',
  },
};

function topicAccent(topic: Topic): TopicAccent {
  return TOPIC_ACCENTS[topic.id] ?? TOPIC_ACCENTS.guide;
}

function topicTipCount(topic: Topic): number {
  const sectionTips = (topic.sections ?? []).reduce((n, s) => n + s.tips.length, 0);
  return topic.tips.length + sectionTips;
}

function topicLayout(topic: Topic) {
  const count = topicTipCount(topic);
  const dense = count >= 4 || topic.id === 'guide';
  const gapFill = topic.id === 'heart' || topic.id === 'pin' || topic.id === 'group' || topic.id === 'hidden';
  return {
    twoColumn: dense,
    compact: true,
    fillVertical: false,
    fillerCompact: Boolean(topic.filler),
    scrollable: false,
    gapFill,
    gapFillKind: (topic.filler ?? (topic.id === 'heart' ? 'heart' : undefined)) as FillerKind | undefined,
  };
}

function TipCard({
  tip,
  accent,
  text,
  muted,
  darkMode,
  spanFull,
  compact: _compact,
  fill: _fill,
  sectionBar,
  longDesc,
}: {
  tip: Tip;
  accent: TopicAccent;
  text: string;
  muted: string;
  darkMode?: boolean;
  spanFull?: boolean;
  compact?: boolean;
  fill?: boolean;
  sectionBar?: string;
  longDesc?: boolean;
}) {
  const desc = tip.desc.replace(/([.·])\s+/g, '$1\u200b ');
  const cardCls = darkMode ? accent.cardDark : accent.cardLight;
  const iconCls = darkMode ? accent.iconDark : accent.iconLight;
  const barCls = sectionBar ?? accent.bar;
  const iconShell = 'w-6 h-6 text-xs rounded-lg flex-shrink-0 flex items-center justify-center text-white ' + iconCls;
  const titleCls = 'text-[11px]';
  const descCls = longDesc ? 'text-[10px] leading-snug' : 'text-[10px] leading-snug';
  const pad = 'px-2 py-1';
  const stretchCls = TIP_BOX;

  const body = (
    <div className="flex gap-1.5 min-w-0 flex-1 pl-1 items-center">
      <span className={iconShell}>{tip.icon}</span>
      <div className="min-w-0 flex-1">
        <p className={`${titleCls} font-bold leading-tight line-clamp-1 ${KR_WRAP} ${text}`}>{tip.title}</p>
        <p className={`${descCls} mt-px line-clamp-2 ${KR_WRAP} ${muted}`}>{desc}</p>
      </div>
    </div>
  );

  if (spanFull) {
    return (
      <div className={`relative col-span-2 flex rounded-2xl border ${stretchCls} ${pad} ${cardCls}`}>
        <span className={`absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-full bg-gradient-to-b ${barCls}`} aria-hidden />
        {body}
      </div>
    );
  }

  return (
    <div className={`relative flex rounded-2xl border ${stretchCls} ${pad} ${cardCls}`}>
      <span className={`absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-full bg-gradient-to-b ${barCls}`} aria-hidden />
      {body}
    </div>
  );
}

function TipGrid({
  tips,
  accent,
  text,
  muted,
  darkMode,
  twoColumn,
  compact,
  fill,
  sectionBar,
  longDescTitle,
}: {
  tips: Tip[];
  accent: TopicAccent;
  text: string;
  muted: string;
  darkMode?: boolean;
  twoColumn?: boolean;
  compact?: boolean;
  fill?: boolean;
  sectionBar?: string;
  longDescTitle?: string;
}) {
  const useTwoCol = twoColumn ?? tips.length >= 4;
  const oddLast = useTwoCol && tips.length % 2 === 1;
  const gap = 'gap-1';
  const stretchCls = fill ? 'flex-1 min-h-0 h-full' : '';

  if (!useTwoCol) {
    return (
      <div className={`flex flex-col ${gap} ${stretchCls}`}>
        {tips.map((tip) => (
          <TipCard
            key={tip.title}
            tip={tip}
            accent={accent}
            text={text}
            muted={muted}
            darkMode={darkMode}
            compact={compact}
            fill={fill}
            sectionBar={sectionBar}
            longDesc={longDescTitle === tip.title}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-2 ${gap} auto-rows-fr ${stretchCls}`}>
      {tips.map((tip, i) => (
        <TipCard
          key={tip.title}
          tip={tip}
          accent={accent}
          text={text}
          muted={muted}
          darkMode={darkMode}
          compact={compact}
          fill={fill}
          sectionBar={sectionBar}
          spanFull={oddLast && i === tips.length - 1}
          longDesc={longDescTitle === tip.title}
        />
      ))}
    </div>
  );
}

function FillerArt({ kind, darkMode }: { kind: FillerKind; darkMode?: boolean }) {
  if (kind === 'heart') {
    return (
      <div className="relative h-14 w-28 mb-1" aria-hidden>
        <div className={`absolute left-1 top-2 w-10 h-10 rounded-2xl rotate-[-12deg] ${darkMode ? 'bg-rose-900/70' : 'bg-rose-100'}`} />
        <div className={`absolute left-8 top-0.5 w-12 h-12 rounded-2xl flex items-center justify-center ${darkMode ? 'bg-rose-950 ring-1 ring-rose-400/40' : 'bg-white ring-1 ring-rose-200'} shadow-md`}>
          <span className="text-[22px] leading-none">🤍</span>
        </div>
        <span className="absolute right-1 top-1 text-[14px]">💙</span>
        <span className="absolute right-0 bottom-0 text-[12px]">💚</span>
      </div>
    );
  }
  if (kind === 'guide') {
    return (
      <div className="relative h-9 w-24 mb-1" aria-hidden>
        <div className={`absolute inset-x-3 top-0.5 h-8 rounded-2xl rotate-[-8deg] ${darkMode ? 'bg-amber-900/40' : 'bg-amber-100/90'}`} />
        <div className={`absolute inset-x-2 top-1 h-7 rounded-2xl rotate-[6deg] ${darkMode ? 'bg-teal-800/70' : 'bg-teal-100/90'}`} />
        <div className={`absolute inset-x-5 top-1.5 h-7 rounded-xl flex items-center justify-center ${darkMode ? 'bg-slate-800 ring-1 ring-white/10' : 'bg-white ring-1 ring-teal-100'} shadow-md`}>
          <span className="text-[18px] leading-none">🥂</span>
        </div>
        <span className="absolute -right-0.5 top-0 text-[10px] animate-pulse">✨</span>
        <span className="absolute -left-0.5 bottom-0 text-[11px]">🌙</span>
      </div>
    );
  }
  if (kind === 'chat') {
    return (
      <div className="relative h-9 w-24 mb-1" aria-hidden>
        <div className={`absolute left-0.5 top-1 w-11 h-6 rounded-2xl rounded-bl-sm flex items-center justify-center text-[8px] font-bold ${darkMode ? 'bg-slate-700 text-slate-200' : 'bg-white text-slate-600'} shadow-md`}>안녕</div>
        <div className={`absolute right-0 bottom-0 w-14 h-6 rounded-2xl rounded-br-sm flex items-center justify-center gap-0.5 ${darkMode ? 'bg-indigo-600 text-white' : 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white'} shadow-md`}>
          <span className="text-[8px] font-black">반가워</span>
          <span className="text-[9px]">💌</span>
        </div>
        <span className="absolute right-0.5 top-0 text-[11px]">💭</span>
      </div>
    );
  }
  if (kind === 'group') {
    return (
      <div className="relative h-9 w-24 mb-1" aria-hidden>
        <div className={`absolute left-1.5 top-1.5 w-8 h-7 rounded-xl rotate-[-10deg] ${darkMode ? 'bg-teal-900/70' : 'bg-teal-100/90'}`} />
        <div className={`absolute left-6 top-0.5 w-9 h-8 rounded-xl flex items-center justify-center ${darkMode ? 'bg-emerald-950 ring-1 ring-emerald-400/40' : 'bg-white ring-1 ring-teal-200'} shadow-md`}>
          <span className="text-[15px] leading-none">👥</span>
        </div>
        <span className="absolute right-0 top-0 text-[10px]">🍻</span>
        <span className="absolute right-0.5 bottom-0 text-[10px]">🚪</span>
      </div>
    );
  }
  if (kind === 'pin') {
    return (
      <div className="relative h-7 w-16 mb-0.5 flex flex-col items-center" aria-hidden>
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[14px] shadow-md ${darkMode ? 'bg-amber-900/70 ring-2 ring-amber-500/50' : 'bg-gradient-to-br from-amber-100 to-orange-100 ring-2 ring-amber-300'}`}>🔑</div>
      </div>
    );
  }
  return (
    <div className="relative h-8 w-16 mb-0.5" aria-hidden>
      <div className={`absolute left-1/2 top-0 -translate-x-1/2 w-8 h-8 rounded-xl rotate-[-10deg] ${darkMode ? 'bg-violet-900/80' : 'bg-violet-200/90'}`} />
      <div className={`absolute left-1/2 top-0 -translate-x-1/2 w-8 h-8 rounded-xl rotate-[8deg] flex items-center justify-center ${darkMode ? 'bg-fuchsia-950 ring-1 ring-fuchsia-400/40' : 'bg-white ring-1 ring-fuchsia-200'} shadow-md`}>
        <span className="text-[14px] leading-none">🔄</span>
      </div>
    </div>
  );
}

const FILLERS: Record<FillerKind, { title: string; line: string; quote: string; shell: string; darkShell: string }> = {
  heart: {
    title: '하트는 카드 아래, 확인은 하트, 채팅',
    line: '종류당 2개 · 오늘 8개. 수락되면 연락처',
    quote: '오른쪽 위 하트 아님. 받은 하트는 아래로',
    shell: 'bg-gradient-to-br from-rose-50 via-pink-50 to-white border border-rose-100/80 shadow-sm shadow-rose-100/30',
    darkShell: 'bg-gradient-to-br from-slate-800/90 via-rose-950/50 to-slate-900 border border-rose-900/50 shadow-sm shadow-rose-900/20',
  },
  guide: {
    title: '오늘 하나만 건져도 이득',
    line: '규칙은 짧게, 텐션은 자유롭게',
    quote: '존댓말로 시작하면 반은 먹고 들어감',
    shell: 'bg-gradient-to-br from-teal-50 via-white to-amber-50/80 border border-teal-100/80 shadow-sm shadow-teal-100/30',
    darkShell: 'bg-gradient-to-br from-slate-800/90 via-slate-800/60 to-teal-950/40 border border-teal-800/50 shadow-sm shadow-teal-900/20',
  },
  chat: {
    title: '말 거는 게 제일 어려움 인정',
    line: '하트랑 채팅은 따로. 그냥 먼저 쳐도 됨',
    quote: '한 줄이면 충분, 소설 쓸 필요 없음',
    shell: 'bg-gradient-to-br from-sky-50 via-indigo-50 to-white border border-indigo-100/80 shadow-sm shadow-indigo-100/30',
    darkShell: 'bg-gradient-to-br from-slate-800/90 via-indigo-950/50 to-slate-900 border border-indigo-900/60 shadow-sm shadow-indigo-900/20',
  },
  group: {
    title: '두 방은 알아서 들어감',
    line: '2차 클럽·2차 술만 직접 입장',
    quote: '년생·N대 자동, 2차는 들락날락',
    shell: 'bg-gradient-to-br from-teal-50 via-emerald-50 to-white border border-teal-100/80 shadow-sm shadow-teal-100/30',
    darkShell: 'bg-gradient-to-br from-slate-800/90 via-teal-950/50 to-slate-900 border border-teal-900/60 shadow-sm shadow-teal-900/20',
  },
  pin: {
    title: '모르면?',
    line: '관리자에게 닉네임 말하고 찾아 달라고',
    quote: '입장 핀이랑 다른 거예요. 캡처 필수',
    shell: 'bg-gradient-to-br from-amber-50 via-orange-50 to-white border border-amber-100/80 shadow-sm shadow-amber-100/30',
    darkShell: 'bg-gradient-to-br from-slate-800/90 via-amber-950/40 to-slate-900 border border-amber-900/50 shadow-sm shadow-amber-900/20',
  },
  hidden: {
    title: '몰라도 되는데, 알면 이득',
    line: '카드 뒤집기 · 방문자 · NPC 나이',
    quote: '술번개 3번이면 NPC 나이. 진짜임',
    shell: 'bg-gradient-to-br from-violet-50 via-fuchsia-50 to-white border border-violet-100/80 shadow-sm shadow-violet-100/30',
    darkShell: 'bg-gradient-to-br from-slate-800/90 via-violet-950/50 to-slate-900 border border-violet-900/60 shadow-sm shadow-violet-900/20',
  },
};

function FillerPanel({ kind, darkMode, compact, fill }: { kind: FillerKind; darkMode?: boolean; compact?: boolean; fill?: boolean }) {
  const f = FILLERS[kind];
  const pin = kind === 'pin';
  return (
    <div
      className={`${fill ? 'flex-1 min-h-0 overflow-hidden' : 'flex-shrink-0'} flex items-center rounded-2xl ${
        compact ? 'gap-2 px-2.5 py-1.5 text-left' : 'flex-col justify-center gap-1 px-3.5 py-2.5 text-center'
      } ${darkMode ? f.darkShell : f.shell}`}
    >
      {pin && (
        <span className={`inline-flex flex-shrink-0 items-center justify-center rounded-full font-bold tracking-tight text-white shadow-md bg-gradient-to-r from-amber-500 to-orange-500 ${compact ? 'px-2 py-0.5 text-[11px]' : 'mb-0.5 px-2.5 py-0.5 text-xs'}`}>
          관리자문의
        </span>
      )}
      {!compact && <FillerArt kind={kind} darkMode={darkMode} />}
      <div className={compact ? 'min-w-0 flex-1' : ''}>
        <p className={`font-bold tracking-tight leading-snug ${KR_WRAP} ${compact ? 'text-[11px]' : 'text-xs'} ${darkMode ? 'text-white' : 'text-slate-800'}`}>
          {f.title}
        </p>
        {!compact && (
          <p className={`text-xs leading-snug mt-0.5 ${KR_WRAP} ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
            {f.line.replace(/([.·])\s+/g, '$1\u200b ')}
          </p>
        )}
        {fill && !compact && (
          <p className={`text-[11px] leading-snug mt-1 ${KR_WRAP} ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            {f.quote.replace(/([.·])\s+/g, '$1\u200b ')}
          </p>
        )}
      </div>
    </div>
  );
}

function TopicSubTabs({
  subView,
  onChange,
  hasVideo,
  darkMode,
  topicColor,
}: {
  subView: 'tips' | 'video';
  onChange: (v: 'tips' | 'video') => void;
  hasVideo: boolean;
  darkMode?: boolean;
  topicColor: string;
}) {
  const base = 'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all duration-200 active:scale-[0.97]';
  const idle = darkMode ? 'text-slate-400 bg-slate-800/60' : 'text-gray-500 bg-white/60';
  const activeTips = darkMode
    ? 'bg-slate-700 text-white shadow-md ring-1 ring-white/10'
    : 'bg-white text-gray-900 shadow-md ring-1 ring-gray-200/80';
  const activeVideo = `bg-gradient-to-r ${topicColor} text-white shadow-lg shadow-black/10`;

  if (!hasVideo) return null;

  return (
    <div className={`flex-shrink-0 h-11 px-4 pb-1.5 ${darkMode ? 'bg-slate-900/80' : 'bg-gradient-to-b from-white to-slate-50/80'}`}>
      <div className={`grid grid-cols-2 gap-1 p-0.5 rounded-xl h-8 ${darkMode ? 'bg-slate-800/80 ring-1 ring-slate-700/60' : 'bg-gray-100/90 ring-1 ring-gray-200/60'}`}>
        <button type="button" onClick={() => onChange('tips')} className={`${base} ${subView === 'tips' ? activeTips : idle}`}>
          📋 설명
        </button>
        <button type="button" onClick={() => onChange('video')} className={`${base} ${subView === 'video' ? activeVideo : idle}`}>
          <PlayCircle className="w-3.5 h-3.5" />
          동영상
        </button>
      </div>
    </div>
  );
}

function SectionHeader({
  section,
  compact,
  darkMode,
}: {
  section: Section;
  compact?: boolean;
  darkMode?: boolean;
}) {
  const variant = SECTION_VARIANTS[section.variant ?? 'default'];
  const headerCls = darkMode ? variant.headerDark : variant.headerLight;
  return (
    <div className={`flex items-center gap-1.5 mb-1 rounded-lg border px-2 py-0.5 ${headerCls}`}>
      <span className="leading-none text-sm">{section.emoji}</span>
      <p className={`font-bold text-[11px] ${KR_WRAP}`}>{section.title}</p>
      <span className={`ml-auto h-1 flex-1 max-w-16 rounded-full bg-gradient-to-r ${variant.bar} opacity-70`} aria-hidden />
    </div>
  );
}

export function TutorialModal({
  onClose,
  darkMode,
}: {
  page?: number;
  onChangePage?: (p: number) => void;
  onClose: () => void;
  darkMode?: boolean;
}) {
  const [mode, setMode] = useState<'basic' | 'hidden'>('basic');
  const [topicIdx, setTopicIdx] = useState(0);
  const [subView, setSubView] = useState<'tips' | 'video'>('tips');

  const topics = mode === 'basic' ? BASIC : HIDDEN;
  const safeIdx = Math.min(topicIdx, topics.length - 1);
  const topic = topics[safeIdx];
  const accent = topicAccent(topic);
  const isLast = safeIdx === topics.length - 1;
  const hasVideo = Boolean(topic.video?.length);
  const showChips = topics.length > 1;
  const denseTabs = mode === 'hidden';
  const layout = topicLayout(topic);

  useEffect(() => {
    setSubView('tips');
  }, [mode, safeIdx]);

  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const text = darkMode ? 'text-slate-200' : 'text-gray-800';

  const switchMode = (next: 'basic' | 'hidden') => {
    setMode(next);
    setTopicIdx(0);
    setSubView('tips');
  };

  const selectTopic = (idx: number) => {
    setTopicIdx(idx);
    setSubView('tips');
  };

  const modalShell = MODAL_SHELL;

  const tipsContent = (
    <div className="flex flex-col flex-1 min-h-0 h-full overflow-hidden gap-1">

      {topic.filler && topic.id !== 'hidden' && (
        <FillerPanel kind={topic.filler} darkMode={darkMode} compact={layout.fillerCompact} />
      )}

      {(topic.sections ?? []).map((section) => {
        const variant = SECTION_VARIANTS[section.variant ?? 'default'];
        return (
          <div key={section.title}>
            <SectionHeader section={section} compact={layout.compact} darkMode={darkMode} />
            <TipGrid
              tips={section.tips}
              accent={accent}
              text={text}
              muted={muted}
              darkMode={darkMode}
              twoColumn={layout.twoColumn}
              compact={layout.compact}
              fill={layout.fillVertical}
              sectionBar={variant.bar}
            />
            {section.footer && (
              <p className={`mt-1 px-1 leading-snug ${KR_WRAP} text-[11px] ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                {section.footer.replace(/([.·])\s+/g, '$1\u200b ')}
              </p>
            )}
          </div>
        );
      })}

      {topic.tips.length > 0 && (
        <TipGrid
          tips={topic.tips}
          accent={accent}
          text={text}
          muted={muted}
          darkMode={darkMode}
          twoColumn={layout.twoColumn}
          compact={layout.compact}
          fill={layout.fillVertical}
          longDescTitle="NPC 나이"
        />
      )}

      {topic.footer && (
        <p className={`flex-shrink-0 leading-snug px-2 py-1 rounded-lg border text-[10px] line-clamp-2 ${KR_WRAP} ${
          darkMode ? 'text-slate-400 bg-slate-800/40 border-slate-700/60' : 'text-gray-500 bg-slate-50/80 border-slate-100'
        }`}>
          {topic.footer.replace(/([.·])\s+/g, '$1\u200b ')}
        </p>
      )}

      {layout.gapFill && layout.gapFillKind && (
        <FillerPanel kind={layout.gapFillKind} darkMode={darkMode} fill />
      )}
    </div>
  );

  const videoContent = topic.video ? (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden scrollbar-hide rounded-2xl">
      <TutorialVideo
        key={`${mode}-${topic.id}-video`}
        embedded
        compact
        fill
        sceneIndices={topic.video}
        onClose={() => setSubView('tips')}
      />
    </div>
  ) : null;

  return (
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/70 backdrop-blur-sm overflow-hidden overscroll-none animate-[fadeIn_0.2s_ease-out]"
      style={{
        padding:
          'max(0.5rem, var(--safe-top, 0px)) max(0.5rem, var(--safe-right, 0px)) max(0.5rem, var(--safe-bottom, 0px)) max(0.5rem, var(--safe-left, 0px))',
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-modal-title"
        className={`relative ${modalShell} rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-[scaleIn_0.25s_ease-out] ${
          darkMode
            ? 'bg-gradient-to-b from-slate-900 to-slate-950 ring-1 ring-slate-700/50'
            : 'bg-gradient-to-b from-white to-slate-50/90 ring-1 ring-black/[0.04]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="touch-target absolute top-2.5 right-2.5 z-10 flex items-center justify-center w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 text-white backdrop-blur-sm ring-1 ring-white/20 transition-all active:scale-95"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className={`relative bg-gradient-to-br ${topic.color} px-4 pt-2.5 pb-2 pr-12 flex-shrink-0 overflow-hidden transition-all duration-300`}>
          <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10 blur-2xl pointer-events-none" aria-hidden />
          <div className="absolute -left-4 bottom-0 w-16 h-16 rounded-full bg-black/10 blur-xl pointer-events-none" aria-hidden />
          <div className="relative flex items-start gap-2.5">
            <span className="flex-shrink-0 w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm ring-1 ring-white/30 flex items-center justify-center text-xl shadow-lg">
              {topic.emoji}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/15 text-white/90 text-[11px] font-bold tracking-wide ring-1 ring-white/10">
                <Sparkles className="w-3 h-3" />
                도움말
              </span>
              <h2 id="tutorial-modal-title" className={`text-white font-bold text-sm leading-snug mt-0.5 line-clamp-1 ${KR_WRAP}`}>
                {topic.title}
              </h2>
            </div>
          </div>
        </div>

        {/* Mode toggle */}
        <div
          className={`flex-shrink-0 px-4 flex items-end ${
            denseTabs ? 'h-10 pt-1.5 pb-1' : 'h-[2.75rem] pt-2 pb-1.5'
          } ${darkMode ? 'bg-slate-900/80' : 'bg-gradient-to-b from-white to-slate-50/80'}`}
        >
          <div className={`grid grid-cols-2 p-1 rounded-2xl gap-1 w-full ${darkMode ? 'bg-slate-800/80 ring-1 ring-slate-700/60' : 'bg-gray-100/90 ring-1 ring-gray-200/60'}`}>
            <button
              type="button"
              onClick={() => switchMode('basic')}
              className={`${denseTabs ? 'py-1.5' : 'py-2'} rounded-xl text-xs font-bold transition-all duration-200 active:scale-[0.97] ${
                mode === 'basic'
                  ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-white shadow-md shadow-cyan-500/25'
                  : darkMode ? 'text-slate-400' : 'text-gray-500'
              }`}
            >
              기본
            </button>
            <button
              type="button"
              onClick={() => switchMode('hidden')}
              className={`${denseTabs ? 'py-1.5' : 'py-2'} rounded-xl text-xs font-bold transition-all duration-200 active:scale-[0.97] ${
                mode === 'hidden'
                  ? 'bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-md shadow-violet-500/25'
                  : darkMode ? 'text-slate-400' : 'text-gray-500'
              }`}
            >
              ✨ 숨은기능
            </button>
          </div>
        </div>

        {/* Topic chips — edge-to-edge segmented tabs, no inter-tab gaps */}
        {showChips && (
          <div className={`flex-shrink-0 border-b ${darkMode ? 'border-slate-700/80 bg-slate-900/60' : 'border-gray-100/80 bg-white/80'}`}>
            <div
              className="grid w-full"
              style={{ gridTemplateColumns: `repeat(${topics.length}, minmax(0, 1fr))` }}
            >
              {topics.map((t, i) => {
                const tAccent = topicAccent(t);
                const active = i === safeIdx;
                const divider =
                  i > 0 ? (active || i - 1 === safeIdx ? 'border-transparent' : darkMode ? 'border-l border-slate-700/45' : 'border-l border-gray-200/80') : '';
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-current={active ? 'true' : undefined}
                    onClick={() => selectTopic(i)}
                    className={`relative flex flex-col items-center justify-center ${
                      denseTabs ? 'min-h-10 py-0.5' : 'min-h-[2.75rem] py-1'
                    } px-0 gap-px text-center transition-all duration-200 active:brightness-95 ${divider} ${
                      active
                        ? `bg-gradient-to-b ${t.color} text-white shadow-[inset_0_-1px_0_rgba(255,255,255,0.15)]`
                        : darkMode
                          ? `${tAccent.chipIdleDark} border-0 hover:brightness-110`
                          : `${tAccent.chipIdle} border-0 hover:brightness-[1.02]`
                    }`}
                  >
                    <span className="text-[15px] leading-none">{t.emoji}</span>
                    <span className={`text-[10px] font-semibold leading-none tracking-tight ${KR_WRAP}`}>{t.label}</span>
                    {t.video?.length ? (
                      <span className={`absolute top-0.5 right-0.5 text-[7px] leading-none ${active ? 'opacity-90' : 'opacity-40'}`} aria-hidden>▶</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <TopicSubTabs subView={subView} onChange={setSubView} hasVideo={hasVideo} darkMode={darkMode} topicColor={topic.color} />

        {/* Content */}
        <div className={`flex-1 min-h-0 px-3 pt-1.5 pb-1 flex flex-col overflow-hidden ${
          darkMode ? 'bg-gradient-to-b from-slate-900/80 to-slate-950' : 'bg-gradient-to-b from-slate-50/80 to-white'
        }`}>
          {subView === 'video' && hasVideo ? videoContent : tipsContent}
        </div>

        {/* Footer */}
        <div className={`flex-shrink-0 h-[3.75rem] px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-start gap-2 border-t ${
          darkMode ? 'border-slate-700/80 bg-slate-900/90' : 'border-gray-100/80 bg-white/90'
        }`}>
          {safeIdx > 0 ? (
            <button
              onClick={() => selectTopic(safeIdx - 1)}
              className={`touch-target flex-[2] flex items-center justify-center gap-1 py-2.5 rounded-2xl text-sm font-semibold border transition-all active:scale-[0.98] ${
                darkMode ? 'border-slate-700 text-slate-300 bg-slate-800/60 hover:bg-slate-800' : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50 shadow-sm'
              }`}
            >
              <ArrowLeft className="w-4 h-4" /> 이전
            </button>
          ) : mode === 'hidden' ? (
            <button
              onClick={() => switchMode('basic')}
              className={`touch-target flex-[2] py-2.5 rounded-2xl text-sm font-semibold border transition-all active:scale-[0.98] ${
                darkMode ? 'border-slate-700 text-slate-300 bg-slate-800/60' : 'border-gray-200 text-gray-600 bg-white shadow-sm'
              }`}
            >
              기본으로
            </button>
          ) : (
            <button
              onClick={onClose}
              className={`touch-target flex-[2] py-2.5 rounded-2xl text-sm font-semibold border transition-all active:scale-[0.98] ${
                darkMode ? 'border-slate-700 text-slate-400 bg-slate-800/40' : 'border-gray-200 text-gray-500 bg-white shadow-sm'
              }`}
            >
              닫기
            </button>
          )}
          <button
            onClick={() => {
              if (!isLast) { selectTopic(safeIdx + 1); return; }
              if (mode === 'basic') { switchMode('hidden'); return; }
              onClose();
            }}
            className={`touch-target flex-[3] flex items-center justify-center gap-1 py-2.5 rounded-2xl text-sm font-bold text-white bg-gradient-to-r ${topic.color} shadow-lg shadow-black/15 transition-all active:scale-[0.98] hover:brightness-105`}
          >
            {isLast && mode === 'hidden' ? '알겠어요' : isLast && mode === 'basic' ? '숨은기능 보기' : <>다음 <ArrowRight className="w-4 h-4" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
