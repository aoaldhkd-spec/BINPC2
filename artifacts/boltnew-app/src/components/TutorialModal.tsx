import React, { useState, useEffect } from 'react';
import { X, ArrowLeft, ArrowRight } from 'lucide-react';
import { TutorialVideo } from './TutorialVideo';

type Topic = {
  id: string;
  emoji: string;
  label: string;
  title: string;
  color: string;
  tips: { icon: string; title: string; desc: string }[];
  video?: number[];
};

const BASIC: Topic[] = [
  {
    id: 'start',
    emoji: '🥂',
    label: '시작',
    title: '이 앱으로 오늘 하는 일',
    color: 'from-cyan-500 to-teal-500',
    tips: [
      { icon: '👥', title: '참여자', desc: '아래 참여자 탭에서 오늘 온 사람들을 봐요.' },
      { icon: '❤️', title: '하트', desc: '카드 아래 하트를 누르면 보낼 수 있어요.' },
      { icon: '💬', title: '채팅', desc: '하트와 별개예요. 카드의 채팅, 또는 오른쪽 아래 MY → 내 채팅.' },
      { icon: '🙋', title: '내 정보', desc: '사진·닉네임·관심사는 오른쪽 아래 MY → 내 상태에서 고쳐요.' },
    ],
    video: [2],
  },
  {
    id: 'heart',
    emoji: '❤️',
    label: '하트',
    title: '하트는 이렇게 보내요',
    color: 'from-pink-500 to-rose-500',
    tips: [
      { icon: '🤍', title: '보내는 곳', desc: '참여자 카드 아래쪽 하트 버튼이에요. 오른쪽 위가 아니에요.' },
      { icon: '8️⃣', title: '개수', desc: '❤️호감 💙친구 💗뜨밤 💚칭찬 · 종류마다 2개, 오늘 총 8개.' },
      { icon: '✅', title: '수락되면', desc: '상대가 받으면 연락처를 나눌 수 있어요. 채팅방은 자동으로 안 생겨요.' },
    ],
    video: [6],
  },
  {
    id: 'chat',
    emoji: '💬',
    label: '채팅',
    title: '채팅은 하트와 따로 열려요',
    color: 'from-blue-500 to-indigo-500',
    tips: [
      { icon: '💬', title: '여는 곳', desc: '카드의 채팅 버튼, 또는 MY → 내 채팅에서 닉네임으로 찾아요.' },
      { icon: '⌨️', title: '보내기', desc: '글을 치고 보내면 되고, 사진도 첨부할 수 있어요.' },
      { icon: '📱', title: '연락처', desc: '채팅방 위 공유 버튼으로 카카오·인스타·전화를 나눠요.' },
    ],
  },
  {
    id: 'fortune',
    emoji: '🔮',
    label: '운세',
    title: '타로·사주·궁합',
    color: 'from-purple-500 to-pink-500',
    tips: [
      { icon: '🔮', title: '내 운세', desc: '오른쪽 아래 MY → 내 운세에서 타로·사주·궁합을 봐요.' },
      { icon: '📅', title: '사주', desc: '생월·생일은 내 상태 또는 내 운세에서 넣어야 사주가 나와요.' },
    ],
  },
  {
    id: 'rules',
    emoji: '📋',
    label: '공지',
    title: '오늘만 꼭 지켜 주세요',
    color: 'from-teal-500 to-cyan-600',
    tips: [
      { icon: '🍺', title: '술 강요 없음', desc: '마시고 싶은 만큼만. 안 마셔도 됩니다.' },
      { icon: '🚫', title: '금지', desc: '정치·종교·지역감정·패드립·욕설·반말은 영구밴될 수 있어요.' },
      { icon: '🚶', title: '자리 비울 때', desc: '화장실·담배는 같이 가고, 급하면 먼저 말하고 나가 주세요.' },
    ],
  },
];

const ADVANCED: Topic[] = [
  {
    id: 'pin',
    emoji: '🔑',
    label: '고유번호',
    title: '폰 바뀌면 이걸로 복구해요',
    color: 'from-amber-500 to-orange-500',
    tips: [
      { icon: '📍', title: '어디에 있나', desc: 'MY → 내 상태 프로필의 4자리예요. 행사장 입장 핀과는 달라요.' },
      { icon: '📱', title: '기기 바꿨을 때', desc: '새 폰에서 프로필을 다시 만들지 말고, 고유번호 복구를 누르세요.' },
      { icon: '⚠️', title: '모르면', desc: '관리자에게 닉네임을 말하고 찾아 달라고 하세요. 없으면 계정이 새로 생깁니다.' },
    ],
  },
  {
    id: 'hidden',
    emoji: '👀',
    label: '숨은기능',
    title: '대부분 모르는 것들',
    color: 'from-violet-500 to-purple-600',
    tips: [
      { icon: '🔄', title: '카드 뒤집기', desc: '참여자 사진을 탭하면 그 사람의 이상형이 뒷면에 나와요.' },
      { icon: '💚', title: '칭찬 하트', desc: '💚은 칭찬만 전달돼요. 수락해도 연락처 공유가 안 떠요.' },
      { icon: '📷', title: '연락처 QR', desc: 'MY → 내 상태의 연락처 QR을 보여주고, 상대는 QR 찍기로 저장해요.' },
      { icon: '🚫', title: '차단·숨기기', desc: '카드 ⋯ → 차단은 서로 안 보임. 👻 나를 못 보게는 상대만 나를 못 봄.' },
      { icon: '👁', title: '방문자', desc: 'MY → 내 상태에서 내 프로필을 열어본 사람을 볼 수 있어요.' },
      { icon: '🔮', title: '채팅 궁합', desc: '채팅방 위 🔮 궁합 버튼으로 상대와의 궁합을 바로 봐요.' },
    ],
  },
  {
    id: 'chat-tips',
    emoji: '✨',
    label: '채팅팁',
    title: '채팅창에 숨겨 둔 조작',
    color: 'from-indigo-500 to-blue-600',
    tips: [
      { icon: '😊', title: '스티커·이모지', desc: '입력창 왼쪽 😊 → 이모지 / 스티커 팩' },
      { icon: '⚡', title: '빠른 메시지', desc: '⚡ 버튼으로 자주 쓰는 한 줄을 바로 보내요.' },
      { icon: '📷', title: '사진', desc: '카메라 버튼으로 이미지를 보낼 수 있어요.' },
      { icon: '👉', title: '스와이프 답장', desc: '메시지를 옆으로 밀면 그 말에 답장이 걸려요.' },
      { icon: '👆', title: '길게 누르기', desc: '길게 누르면 답장·복사, 내 메시지는 삭제도 돼요.' },
    ],
    video: [3, 4, 5],
  },
];

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
          className="absolute top-2.5 right-2.5 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/25 hover:bg-black/45 text-white">
          <X className="w-4 h-4" />
        </button>

        <div className={`bg-gradient-to-br ${topic.color} px-4 pt-3.5 pb-2.5 pr-12 flex-shrink-0`}>
          <p className="text-white/80 text-[10px] font-bold tracking-wide">도움말</p>
          <h2 className="text-white font-black text-[16px] leading-snug mt-0.5">{topic.emoji} {topic.title}</h2>
        </div>

        <div className={`flex-shrink-0 px-3 pt-2 ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
          <div className={`grid grid-cols-2 p-0.5 rounded-2xl ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
            <button type="button" onClick={() => switchMode('basic')}
              className={`py-1.5 rounded-xl text-[12px] font-black transition-all ${
                mode === 'basic'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : darkMode ? 'text-slate-400' : 'text-gray-500'
              }`}>
              기본
            </button>
            <button type="button" onClick={() => switchMode('advanced')}
              className={`py-1.5 rounded-xl text-[12px] font-black transition-all ${
                mode === 'advanced'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : darkMode ? 'text-slate-400' : 'text-gray-500'
              }`}>
              심화
            </button>
          </div>
        </div>

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

        <div className="flex-1 min-h-0 overflow-hidden px-3 py-2 flex flex-col gap-1.5">
          <div className={`grid gap-1.5 flex-shrink-0 ${hasVideo || topic.tips.length > 3 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {topic.tips.map((tip) => (
              <div key={tip.title} className={`flex gap-2 rounded-xl border px-2 py-1.5 ${panel}`}>
                <span className="text-sm leading-none mt-0.5 flex-shrink-0">{tip.icon}</span>
                <div className="min-w-0">
                  <p className={`text-[11px] font-black leading-tight ${text}`}>{tip.title}</p>
                  <p className={`text-[10px] leading-snug mt-0.5 ${muted}`}>{tip.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {hasVideo && topic.video && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <TutorialVideo
                key={`${mode}-${topic.id}`}
                embedded
                compact
                sceneIndices={topic.video}
                onClose={() => setShowVideo(false)}
              />
            </div>
          )}
        </div>

        <div className={`flex-shrink-0 px-3 py-2 flex gap-2 border-t ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
          {safeIdx > 0 ? (
            <button onClick={() => setTopicIdx(safeIdx - 1)}
              className={`flex-[2] flex items-center justify-center gap-1 py-2.5 rounded-2xl text-sm font-semibold border ${darkMode ? 'border-slate-700 text-slate-300' : 'border-gray-200 text-gray-600'}`}>
              <ArrowLeft className="w-4 h-4" /> 이전
            </button>
          ) : mode === 'advanced' ? (
            <button onClick={() => switchMode('basic')}
              className={`flex-[2] py-2.5 rounded-2xl text-sm font-semibold border ${darkMode ? 'border-slate-700 text-slate-300' : 'border-gray-200 text-gray-600'}`}>
              기본으로
            </button>
          ) : (
            <button onClick={onClose}
              className={`flex-[2] py-2.5 rounded-2xl text-sm font-semibold border ${darkMode ? 'border-slate-700 text-slate-300' : 'border-gray-200 text-gray-500'}`}>
              닫기
            </button>
          )}
          <button
            onClick={() => {
              if (!isLast) { setTopicIdx(safeIdx + 1); return; }
              if (mode === 'basic') { switchMode('advanced'); return; }
              onClose();
            }}
            className={`flex-[3] flex items-center justify-center gap-1 py-2.5 rounded-2xl text-sm font-bold text-white bg-gradient-to-r ${topic.color}`}
          >
            {isLast && mode === 'advanced' ? '알겠어요' : isLast && mode === 'basic' ? '심화 보기' : <>다음 <ArrowRight className="w-4 h-4" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
