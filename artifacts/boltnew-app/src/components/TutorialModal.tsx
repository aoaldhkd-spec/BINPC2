import React, { useState, useEffect } from 'react';
import { X, ArrowLeft, ArrowRight } from 'lucide-react';
import { TutorialVideo } from './TutorialVideo';

type Tip = { icon: string; title: string; desc: string };
type Section = { emoji: string; title: string; tips: Tip[]; footer?: string };
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
  welcome?: boolean;
};

const BASIC: Topic[] = [
  {
    id: 'guide',
    emoji: '📋',
    label: '안내',
    title: '오늘만 꼭 지켜 주세요',
    color: 'from-teal-500 to-cyan-600',
    tips: [],
    welcome: true,
    sections: [
      {
        emoji: '📋',
        title: '공지',
        tips: [
          { icon: '🍺', title: '술 강요 없음', desc: '마시고 싶은 만큼만. 잔을 채우라고 보채지 마세요.' },
          { icon: '🗳️', title: '정치·종교', desc: '정치·종교 이야기는 하지 마세요. 영구밴될 수 있어요.' },
          { icon: '🚫', title: '지역·패드립', desc: '지역감정·패드립은 즉시 퇴장·영구밴입니다.' },
          { icon: '🗣️', title: '욕설·반말', desc: '욕설·반말은 영구밴. 처음 보는 사이니 존댓말로.' },
        ],
        footer: '🔒 번호·SNS는 강요 금지. 모임 끝나면 입력 정보는 파기됩니다.',
      },
      {
        emoji: '🥂',
        title: '시작 · 상단탭',
        tips: [
          { icon: '👥', title: '참여자', desc: '오늘 온 사람 카드가 여기 모여 있어요.' },
          { icon: '📊', title: '통계', desc: '오늘 오간 하트 수와 종류별 비율.' },
          { icon: '🏆', title: '랭킹', desc: '하트를 많이 받은 사람 TOP 10.' },
        ],
        footer: '하트는 카드 아래 · 채팅·설정은 오른쪽 아래 MY',
      },
    ],
  },
  {
    id: 'heart-settings',
    emoji: '❤️',
    label: '하트·설정',
    title: '하트 보내기 · 내 설정',
    color: 'from-pink-500 to-rose-500',
    tips: [
      { icon: '🤍', title: '보내는 곳', desc: '참여자 카드 아래쪽 하트. 오른쪽 위가 아니에요.' },
      { icon: '8️⃣', title: '개수', desc: '❤️호감 💙친구 💗뜨밤 💚칭찬 · 종류마다 2개, 오늘 8개.' },
      { icon: '✅', title: '수락되면', desc: '연락처를 나눌 수 있어요. 채팅방은 자동으로 안 생겨요.' },
      { icon: '🏷️', title: '닉네임·관심사', desc: 'MY → 내 설정 → 프로필 편집에서 고쳐요.' },
      { icon: '📷', title: '사진·아바타', desc: '같은 내 설정에서 사진 올리거나 아바타를 골라요.' },
      { icon: '📅', title: '생월·연락처', desc: '생월일은 내 설정 또는 내 운세. 연락처도 내 설정.' },
    ],
    video: [6, 1, 2],
  },
  {
    id: 'chat',
    emoji: '💬',
    label: '채팅',
    title: '채팅은 이렇게 해요',
    color: 'from-blue-500 to-indigo-500',
    welcome: true,
    tips: [
      { icon: '💬', title: '여는 곳', desc: '카드의 채팅, 또는 MY → 내 채팅. 하트와 별개예요.' },
      { icon: '😊', title: '스티커·이모지', desc: '입력창 왼쪽 😊 → 이모지 / 스티커 팩' },
      { icon: '📷', title: '사진', desc: '카메라 버튼으로 이미지를 보내요.' },
      { icon: '⚡', title: '빠른 메시지', desc: '⚡ 로 자주 쓰는 한 줄을 바로 보내요.' },
      { icon: '📱', title: '연락처·궁합', desc: '채팅방 위 공유로 연락처, 🔮 로 궁합.' },
      { icon: '👉', title: '스와이프 답장', desc: '메시지를 옆으로 밀면 그 말에 답장이 걸려요.' },
      { icon: '👆', title: '길게 누르기', desc: '길게 누르면 답장·복사, 내 메시지는 삭제도 돼요.' },
    ],
  },
  {
    id: 'chat-video',
    emoji: '▶️',
    label: '채팅영상',
    title: '채팅 따라해 보기',
    color: 'from-indigo-500 to-blue-600',
    tips: [],
    video: [3, 4, 5],
  },
];

const ADVANCED: Topic[] = [
  {
    id: 'pin',
    emoji: '🔑',
    label: '고유번호',
    title: '내 고유번호',
    color: 'from-amber-500 to-orange-500',
    welcome: true,
    tips: [
      { icon: '📍', title: '어디에', desc: 'MY → 내 상태의 4자리. 입장 핀과 달라요.' },
      { icon: '📱', title: '기기 바꿈', desc: '새 폰에서 프로필을 다시 만들지 말고 복구.' },
      { icon: '⚠️', title: '모르면', desc: '관리자에게 닉네임을 말하고 찾아 달라고 하세요.' },
    ],
    footer: '입장 때 누른 4자리 ≠ 내 상태의 고유번호',
  },
  {
    id: 'hidden',
    emoji: '✨',
    label: '숨은기능',
    title: '알아두면 좋은 숨은 기능',
    color: 'from-violet-500 to-purple-600',
    welcome: true,
    tips: [
      { icon: '🔄', title: '카드 뒤집기', desc: '참여자 사진을 탭하면 이상형이 뒷면에 나와요.' },
      { icon: '💚', title: '칭찬 하트', desc: '💚은 칭찬만. 수락해도 연락처 공유가 안 떠요.' },
      { icon: '📷', title: '연락처 QR', desc: 'MY → 내 상태 QR을 보여주고, 상대는 QR 찍기.' },
      { icon: '🚫', title: '차단·숨기기', desc: '차단은 서로 안 보임. 👻는 상대만 나를 못 봄.' },
      { icon: '👁', title: '방문자', desc: 'MY → 내 상태에서 내 프로필을 열어본 사람.' },
      { icon: '🔮', title: '내 운세', desc: 'MY → 내 운세에서 타로·사주·궁합.' },
    ],
  },
];

function TipCard({ tip, panel, text, muted }: {
  tip: Tip;
  panel: string;
  text: string;
  muted: string;
}) {
  return (
    <div className={`flex gap-2 rounded-xl border px-2.5 py-1.5 ${panel}`}>
      <span className="text-[14px] leading-none mt-0.5 flex-shrink-0">{tip.icon}</span>
      <div className="min-w-0">
        <p className={`text-[12px] font-black leading-tight ${text}`}>{tip.title}</p>
        <p className={`text-[11px] leading-snug mt-0.5 ${muted}`}>{tip.desc}</p>
      </div>
    </div>
  );
}

function TipGrid({ tips, panel, text, muted }: {
  tips: Tip[];
  panel: string;
  text: string;
  muted: string;
}) {
  return (
    <div className={`grid gap-1.5 ${tips.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {tips.map((tip) => (
        <TipCard key={tip.title} tip={tip} panel={panel} text={text} muted={muted} />
      ))}
    </div>
  );
}

function WelcomePanel({ darkMode }: { darkMode?: boolean }) {
  return (
    <div
      className={`flex-1 min-h-[88px] flex flex-col items-center justify-center rounded-2xl px-4 py-3 text-center ${
        darkMode
          ? 'bg-gradient-to-br from-slate-800/90 via-slate-800/60 to-teal-950/40 border border-slate-700'
          : 'bg-gradient-to-br from-teal-50 via-white to-amber-50 border border-teal-100'
      }`}
    >
      <div className="text-[28px] leading-none mb-1.5" aria-hidden>🥂</div>
      <p className={`text-[14px] font-black tracking-tight ${darkMode ? 'text-white' : 'text-slate-800'}`}>
        환영합니다
      </p>
      <p className={`text-[12px] leading-snug mt-1 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
        오늘 모임을 이용해주셔서 감사합니다
      </p>
      <p className={`text-[11px] italic mt-1.5 ${darkMode ? 'text-teal-300/80' : 'text-teal-700/80'}`}>
        좋은 인연이 오늘 여기서 시작되길
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
  const videoOnly = hasVideo && topic.tips.length === 0 && !topic.sections?.length;
  const showChips = topics.length > 1;

  useEffect(() => { setShowVideo(true); }, [mode, safeIdx]);

  const panel = darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-50 border-slate-200';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const text = darkMode ? 'text-slate-200' : 'text-gray-800';

  const switchMode = (next: 'basic' | 'advanced') => {
    setMode(next);
    setTopicIdx(0);
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`relative w-full max-w-md h-[min(100dvh-12px,720px)] rounded-3xl shadow-2xl flex flex-col overflow-hidden ${darkMode ? 'bg-slate-900' : 'bg-white'}`}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose}
          className="absolute top-2 right-2 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/25 hover:bg-black/45 text-white">
          <X className="w-4 h-4" />
        </button>

        <div className={`bg-gradient-to-br ${topic.color} px-3.5 pt-3 pb-2 pr-12 flex-shrink-0`}>
          <p className="text-white/80 text-[10px] font-bold tracking-wide">도움말</p>
          <h2 className="text-white font-black text-[15px] leading-snug mt-0.5">{topic.emoji} {topic.title}</h2>
        </div>

        <div className={`flex-shrink-0 px-3 pt-1.5 ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
          <div className={`grid grid-cols-2 p-0.5 rounded-2xl ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
            <button type="button" onClick={() => switchMode('basic')}
              className={`py-1 rounded-xl text-[11px] font-black transition-all ${
                mode === 'basic'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : darkMode ? 'text-slate-400' : 'text-gray-500'
              }`}>
              기본
            </button>
            <button type="button" onClick={() => switchMode('advanced')}
              className={`py-1 rounded-xl text-[11px] font-black transition-all ${
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
            <div className="flex gap-1 overflow-x-auto">
              {topics.map((t, i) => (
                <button key={t.id} onClick={() => setTopicIdx(i)}
                  className={`flex-shrink-0 px-2 py-1 rounded-xl text-[11px] font-bold transition-all active:scale-95 ${
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

        <div className="flex-1 min-h-0 overflow-hidden px-3 py-1.5 flex flex-col gap-1.5">
          {hasVideo && topic.video ? (
            videoOnly ? (
              <div className="flex-1 min-h-0">
                <TutorialVideo
                  key={`${mode}-${topic.id}`}
                  embedded
                  fill
                  sceneIndices={topic.video}
                  onClose={() => setShowVideo(false)}
                />
              </div>
            ) : (
              <>
                <div className="flex-shrink-0">
                  <TipGrid tips={topic.tips} panel={panel} text={text} muted={muted} />
                </div>
                <div className="flex-1 min-h-0">
                  <TutorialVideo
                    key={`${mode}-${topic.id}`}
                    embedded
                    compact
                    sceneIndices={topic.video}
                    onClose={() => setShowVideo(false)}
                  />
                </div>
              </>
            )
          ) : (
            <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
              <div className="flex-shrink-0 flex flex-col gap-2">
                {(topic.sections ?? []).map((section) => (
                  <div key={section.title}>
                    <p className={`text-[12px] font-black mb-1 ${text}`}>{section.emoji} {section.title}</p>
                    <TipGrid tips={section.tips} panel={panel} text={text} muted={muted} />
                    {section.footer && (
                      <p className={`mt-1 text-[11px] leading-snug ${muted}`}>
                        {section.footer}
                      </p>
                    )}
                  </div>
                ))}
                {topic.tips.length > 0 && (
                  <TipGrid tips={topic.tips} panel={panel} text={text} muted={muted} />
                )}
                {topic.footer && (
                  <p className={`text-[11px] leading-snug ${muted}`}>{topic.footer}</p>
                )}
              </div>
              {topic.welcome && <WelcomePanel darkMode={darkMode} />}
            </div>
          )}
        </div>

        <div className={`flex-shrink-0 px-3 py-1.5 flex gap-2 border-t ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
          {safeIdx > 0 ? (
            <button onClick={() => setTopicIdx(safeIdx - 1)}
              className={`flex-[2] flex items-center justify-center gap-1 py-2 rounded-2xl text-[13px] font-semibold border ${darkMode ? 'border-slate-700 text-slate-300' : 'border-gray-200 text-gray-600'}`}>
              <ArrowLeft className="w-4 h-4" /> 이전
            </button>
          ) : mode === 'advanced' ? (
            <button onClick={() => switchMode('basic')}
              className={`flex-[2] py-2 rounded-2xl text-[13px] font-semibold border ${darkMode ? 'border-slate-700 text-slate-300' : 'border-gray-200 text-gray-600'}`}>
              기본으로
            </button>
          ) : (
            <button onClick={onClose}
              className={`flex-[2] py-2 rounded-2xl text-[13px] font-semibold border ${darkMode ? 'border-slate-700 text-slate-300' : 'border-gray-200 text-gray-500'}`}>
              닫기
            </button>
          )}
          <button
            onClick={() => {
              if (!isLast) { setTopicIdx(safeIdx + 1); return; }
              if (mode === 'basic') { switchMode('advanced'); return; }
              onClose();
            }}
            className={`flex-[3] flex items-center justify-center gap-1 py-2 rounded-2xl text-[13px] font-bold text-white bg-gradient-to-r ${topic.color}`}
          >
            {isLast && mode === 'advanced' ? '알겠어요' : isLast && mode === 'basic' ? '심화 보기' : <>다음 <ArrowRight className="w-4 h-4" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
