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
      { icon: '❤️', title: '하트', desc: '마음에 드는 카드의 하트를 누르면 보낼 수 있어요.' },
      { icon: '💬', title: '채팅', desc: '상대가 하트를 받으면 채팅이 열리고, 채팅 탭에서 이어가요.' },
      { icon: '🙋', title: '내 상태', desc: '내 사진·닉네임·관심사는 내 상태 탭에서 고쳐요.' },
    ],
  },
  {
    id: 'heart',
    emoji: '❤️',
    label: '하트',
    title: '하트는 이렇게 보내요',
    color: 'from-pink-500 to-rose-500',
    tips: [
      { icon: '🤍', title: '보내는 곳', desc: '참여자 카드 오른쪽 위 하트 버튼을 눌러요.' },
      { icon: '8️⃣', title: '개수', desc: '❤️💙💗💚 종류마다 2개, 오늘 총 8개예요.' },
      { icon: '✅', title: '수락되면', desc: '상대가 받으면 채팅방이 생기고 연락처를 나눌 수 있어요.' },
    ],
    video: [6],
  },
  {
    id: 'chat',
    emoji: '💬',
    label: '채팅',
    title: '채팅은 하트 다음에 열려요',
    color: 'from-blue-500 to-indigo-500',
    tips: [
      { icon: '💬', title: '채팅 탭', desc: '아래 채팅 탭에서 열린 대화를 골라요.' },
      { icon: '⌨️', title: '보내기', desc: '글을 치고 보내면 되고, 사진도 첨부할 수 있어요.' },
      { icon: '📱', title: '연락처', desc: '채팅방 안에서 카카오·인스타·전화를 공유할 수 있어요.' },
    ],
  },
  {
    id: 'fortune',
    emoji: '🔮',
    label: '운세',
    title: '타로·사주·궁합',
    color: 'from-purple-500 to-pink-500',
    tips: [
      { icon: '🔮', title: '운세 탭', desc: '아래에서 운세를 열면 타로·사주·궁합이 있어요.' },
      { icon: '📅', title: '사주', desc: '내 상태에 생월·생일을 넣어야 사주가 나와요.' },
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
      { icon: '📍', title: '어디에 있나', desc: '내 상태 탭 프로필 카드의 4자리 숫자예요. 캡처해 두세요.' },
      { icon: '📱', title: '기기 바꿨을 때', desc: '새 폰에서 프로필을 다시 만들지 말고, 입장 화면의 고유번호 복구를 누르세요.' },
      { icon: '⚠️', title: '모르면', desc: '관리자에게 닉네임을 말하고 찾아 달라고 하세요. 번호 없으면 계정이 새로 생깁니다.' },
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
      { icon: '💚', title: '칭찬 하트', desc: '💚만 보내면 채팅·연락처가 열리지 않아요. 칭찬만 전달됩니다.' },
      { icon: '📷', title: '연락처 QR', desc: '내 상태 → 연락처 QR을 보여 주고, 상대는 QR 찍기로 저장해요.' },
      { icon: '🚫', title: '차단·숨기기', desc: '카드 ⋯ 메뉴에서 차단(서로 안 보임) 또는 숨기기(나만 안 보임).' },
      { icon: '👁', title: '방문자', desc: '내 상태 탭에서 내 프로필을 열어본 사람을 볼 수 있어요.' },
      { icon: '🔮', title: '채팅 궁합', desc: '채팅방 ♀♂ 버튼으로 상대와의 궁합을 바로 봐요.' },
    ],
    video: [1],
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
      { icon: '👉', title: '스와이프 답장', desc: '상대 메시지를 옆으로 밀면 그 말에 답장이 걸려요.' },
      { icon: '👆', title: '길게 누르기', desc: '내 메시지를 길게 누르면 삭제 메뉴가 나와요.' },
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

  useEffect(() => { setShowVideo(true); }, [mode, safeIdx]);

  const panel = darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-50 border-slate-200';
  const muted = darkMode ? 'text-slate-400' : 'text-gray-500';
  const text = darkMode ? 'text-slate-200' : 'text-gray-800';

  const switchMode = (next: 'basic' | 'advanced') => {
    setMode(next);
    setTopicIdx(0);
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`relative w-full max-w-md max-h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden ${darkMode ? 'bg-slate-900' : 'bg-white'}`}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/25 hover:bg-black/45 text-white">
          <X className="w-4 h-4" />
        </button>

        <div className={`bg-gradient-to-br ${topic.color} px-5 pt-5 pb-4 pr-12 flex-shrink-0`}>
          <p className="text-white/80 text-[11px] font-bold tracking-wide">도움말</p>
          <h2 className="text-white font-black text-[17px] leading-snug mt-1">{topic.emoji} {topic.title}</h2>
        </div>

        <div className={`flex-shrink-0 px-3 pt-3 ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
          <div className={`grid grid-cols-2 p-1 rounded-2xl ${darkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
            <button type="button" onClick={() => switchMode('basic')}
              className={`py-2 rounded-xl text-[13px] font-black transition-all ${
                mode === 'basic'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : darkMode ? 'text-slate-400' : 'text-gray-500'
              }`}>
              기본
            </button>
            <button type="button" onClick={() => switchMode('advanced')}
              className={`py-2 rounded-xl text-[13px] font-black transition-all ${
                mode === 'advanced'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : darkMode ? 'text-slate-400' : 'text-gray-500'
              }`}>
              심화
            </button>
          </div>
          {mode === 'advanced' && (
            <p className={`text-center text-[10px] font-semibold mt-1.5 ${muted}`}>잘 모를 만한 기능만 모아 두었어요</p>
          )}
        </div>

        <div className={`flex-shrink-0 px-3 py-2 border-b ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
          <div className="flex gap-1 overflow-x-auto">
            {topics.map((t, i) => (
              <button key={t.id} onClick={() => setTopicIdx(i)}
                className={`flex-shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95 ${
                  i === safeIdx
                    ? `bg-gradient-to-br ${t.color} text-white shadow-sm`
                    : darkMode ? 'text-slate-500 hover:bg-slate-800' : 'text-gray-400 hover:bg-gray-50'
                }`}>
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
          {topic.tips.map((tip) => (
            <div key={tip.title} className={`flex gap-3 rounded-2xl border px-3 py-2.5 ${panel}`}>
              <span className="text-lg leading-none mt-0.5 flex-shrink-0">{tip.icon}</span>
              <div className="min-w-0">
                <p className={`text-[13px] font-black leading-tight ${text}`}>{tip.title}</p>
                <p className={`text-[12px] leading-snug mt-0.5 ${muted}`}>{tip.desc}</p>
              </div>
            </div>
          ))}

          {topic.video && (
            <div className="pt-1">
              <p className={`text-[11px] font-bold mb-2 ${muted}`}>영상</p>
              {showVideo && (
                <TutorialVideo
                  key={`${mode}-${topic.id}`}
                  embedded
                  sceneIndices={topic.video}
                  onClose={() => setShowVideo(false)}
                />
              )}
            </div>
          )}
        </div>

        <div className={`flex-shrink-0 px-4 py-3 flex gap-2 border-t ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
          {safeIdx > 0 ? (
            <button onClick={() => setTopicIdx(safeIdx - 1)}
              className={`flex-[2] flex items-center justify-center gap-1 py-3 rounded-2xl text-sm font-semibold border ${darkMode ? 'border-slate-700 text-slate-300' : 'border-gray-200 text-gray-600'}`}>
              <ArrowLeft className="w-4 h-4" /> 이전
            </button>
          ) : mode === 'advanced' ? (
            <button onClick={() => switchMode('basic')}
              className={`flex-[2] py-3 rounded-2xl text-sm font-semibold border ${darkMode ? 'border-slate-700 text-slate-300' : 'border-gray-200 text-gray-600'}`}>
              기본으로
            </button>
          ) : (
            <button onClick={onClose}
              className={`flex-[2] py-3 rounded-2xl text-sm font-semibold border ${darkMode ? 'border-slate-700 text-slate-300' : 'border-gray-200 text-gray-500'}`}>
              닫기
            </button>
          )}
          <button
            onClick={() => {
              if (!isLast) { setTopicIdx(safeIdx + 1); return; }
              if (mode === 'basic') { switchMode('advanced'); return; }
              onClose();
            }}
            className={`flex-[3] flex items-center justify-center gap-1 py-3 rounded-2xl text-sm font-bold text-white bg-gradient-to-r ${topic.color}`}
          >
            {isLast && mode === 'advanced' ? '알겠어요' : isLast && mode === 'basic' ? '심화 보기' : <>다음 <ArrowRight className="w-4 h-4" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
