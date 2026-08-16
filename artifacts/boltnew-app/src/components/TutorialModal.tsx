import React, { useState, useEffect } from 'react';
import { X, ArrowLeft, ArrowRight } from 'lucide-react';
import { TutorialVideo } from './TutorialVideo';

type Tip = { icon: string; title: string; desc: string };
type Topic = {
  id: string;
  emoji: string;
  label: string;
  title: string;
  color: string;
  tips: Tip[];
  video?: number[];
  fill?: { emoji: string; title: string; desc: string };
};

const BASIC: Topic[] = [
  {
    id: 'rules-1',
    emoji: '📋',
    label: '공지1',
    title: '오늘만 꼭 지켜 주세요',
    color: 'from-teal-500 to-cyan-600',
    tips: [
      { icon: '🍺', title: '술 강요 없음', desc: '마시고 싶은 만큼만. 안 마셔도 됩니다. 잔을 채우라고 보채지 마세요.' },
      { icon: '🗳️', title: '정치·종교', desc: '정치·종교 이야기는 하지 마세요. 분위기가 깨지고 영구밴될 수 있어요.' },
      { icon: '🚫', title: '지역·패드립', desc: '지역감정·패드립은 즉시 퇴장·영구밴입니다.' },
    ],
    fill: { emoji: '📋', title: '오늘 이 자리의 약속', desc: '편한 회식 · 서로 존중' },
  },
  {
    id: 'rules-2',
    emoji: '📢',
    label: '공지2',
    title: '말투·자리·개인정보',
    color: 'from-cyan-600 to-teal-500',
    tips: [
      { icon: '🗣️', title: '욕설·반말', desc: '욕설·반말은 영구밴될 수 있어요. 처음 보는 사이니 존댓말로.' },
      { icon: '🚶', title: '자리 비울 때', desc: '화장실·담배는 같이 가고, 급하면 먼저 말하고 나가 주세요.' },
      { icon: '📍', title: '자리 이동', desc: '진행 안내가 나오면 지정 자리로 옮겨 주세요. 혼자 빠지지 마세요.' },
    ],
    fill: { emoji: '🔒', title: '연락처·개인정보', desc: '번호·SNS는 강요 금지. 모임 끝나면 입력 정보는 파기됩니다.' },
  },
  {
    id: 'start',
    emoji: '🥂',
    label: '시작',
    title: '위쪽 탭 세 개만 보면 돼요',
    color: 'from-cyan-500 to-teal-500',
    tips: [
      { icon: '👥', title: '참여자', desc: '화면 맨 위 참여자 탭. 오늘 온 사람 카드가 여기에 모여 있어요.' },
      { icon: '📊', title: '통계', desc: '위쪽 통계 탭. 오늘 오간 하트 수와 종류별 비율을 봐요.' },
      { icon: '🏆', title: '랭킹', desc: '위쪽 랭킹 탭. 하트를 많이 받은 사람 TOP 10이 나와요.' },
    ],
    fill: { emoji: '⬆️', title: '하트·채팅·설정은 여기 없어요', desc: '하트는 카드 아래, 채팅·설정은 오른쪽 아래 MY' },
  },
  {
    id: 'heart',
    emoji: '❤️',
    label: '하트',
    title: '하트는 이렇게 보내요',
    color: 'from-pink-500 to-rose-500',
    tips: [
      { icon: '🤍', title: '보내는 곳', desc: '참여자 카드 아래쪽 하트. 오른쪽 위가 아니에요.' },
      { icon: '8️⃣', title: '개수', desc: '❤️호감 💙친구 💗뜨밤 💚칭찬 · 종류마다 2개, 오늘 총 8개.' },
      { icon: '✅', title: '수락되면', desc: '연락처를 나눌 수 있어요. 채팅방은 자동으로 안 생겨요.' },
    ],
    video: [6],
  },
  {
    id: 'settings',
    emoji: '⚙️',
    label: '설정',
    title: '닉네임·관심사는 내 설정',
    color: 'from-slate-500 to-cyan-600',
    tips: [
      { icon: '🏷️', title: '닉네임·관심사', desc: '오른쪽 아래 MY → 내 설정 → 프로필 편집에서 고쳐요.' },
      { icon: '📷', title: '사진·아바타', desc: '같은 내 설정에서 사진 올리거나 아바타를 골라요.' },
      { icon: '📅', title: '생월·연락처', desc: '생월일은 내 설정 또는 내 운세. 연락처도 내 설정.' },
    ],
    video: [1, 2],
  },
  {
    id: 'chat-1',
    emoji: '💬',
    label: '채팅1',
    title: '채팅 열기 · 스티커',
    color: 'from-blue-500 to-indigo-500',
    tips: [
      { icon: '💬', title: '여는 곳', desc: '카드의 채팅, 또는 MY → 내 채팅. 하트와 별개예요.' },
      { icon: '😊', title: '스티커·이모지', desc: '입력창 왼쪽 😊 → 이모지 / 스티커 팩' },
    ],
    video: [3],
  },
  {
    id: 'chat-2',
    emoji: '⚡',
    label: '채팅2',
    title: '사진 · 빠른메시지 · 공유',
    color: 'from-indigo-500 to-blue-600',
    tips: [
      { icon: '📷', title: '사진', desc: '카메라 버튼으로 이미지를 보내요.' },
      { icon: '⚡', title: '빠른 메시지', desc: '⚡ 로 자주 쓰는 한 줄을 바로 보내요.' },
      { icon: '📱', title: '연락처·궁합', desc: '채팅방 위 공유로 연락처, 🔮 로 궁합.' },
    ],
    video: [4],
  },
  {
    id: 'chat-3',
    emoji: '✨',
    label: '채팅3',
    title: '스와이프 · 길게 누르기',
    color: 'from-violet-500 to-indigo-600',
    tips: [
      { icon: '👉', title: '스와이프 답장', desc: '메시지를 옆으로 밀면 그 말에 답장이 걸려요.' },
      { icon: '👆', title: '길게 누르기', desc: '길게 누르면 답장·복사, 내 메시지는 삭제도 돼요.' },
    ],
    video: [5],
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
    fill: { emoji: '🔑', title: '입장 핀 ≠ 고유번호', desc: '입장 때 누른 4자리와 내 상태의 고유번호는 다른 번호예요.' },
  },
  {
    id: 'hidden-1',
    emoji: '👀',
    label: '숨은기능1',
    title: '카드 뒤집기 · 칭찬',
    color: 'from-violet-500 to-purple-600',
    tips: [
      { icon: '🔄', title: '카드 뒤집기', desc: '참여자 사진을 탭하면 그 사람의 이상형이 뒷면에 나와요.' },
      { icon: '💚', title: '칭찬 하트', desc: '💚은 칭찬만 전달돼요. 수락해도 연락처 공유가 안 떠요.' },
    ],
    fill: { emoji: '💚', title: '칭찬은 가볍게', desc: '호감·연락처가 아니라 “잘한다”만 전하는 하트예요.' },
  },
  {
    id: 'hidden-2',
    emoji: '📷',
    label: '숨은기능2',
    title: 'QR · 차단 · 숨기기',
    color: 'from-fuchsia-500 to-violet-600',
    tips: [
      { icon: '📷', title: '연락처 QR', desc: 'MY → 내 상태의 연락처 QR을 보여주고, 상대는 QR 찍기로 저장해요.' },
      { icon: '🚫', title: '차단·숨기기', desc: '카드 ⋯ → 차단은 서로 안 보임. 👻 나를 못 보게는 상대만 나를 못 봄.' },
    ],
    fill: { emoji: '👻', title: '안 보이게 vs 차단', desc: '숨기기는 나만 빠지고, 차단은 서로 카드가 사라져요.' },
  },
  {
    id: 'hidden-3',
    emoji: '👁',
    label: '숨은기능3',
    title: '방문자 · 운세',
    color: 'from-purple-500 to-pink-500',
    tips: [
      { icon: '👁', title: '방문자', desc: 'MY → 내 상태에서 내 프로필을 열어본 사람을 볼 수 있어요.' },
      { icon: '🔮', title: '내 운세', desc: 'MY → 내 운세에서 타로·사주·궁합. 사주는 생월일이 필요해요.' },
    ],
    fill: { emoji: '🔮', title: '궁합은 채팅에서도', desc: '채팅방 위 🔮 버튼으로 상대와 바로 볼 수도 있어요.' },
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

        <div className="flex-1 min-h-0 overflow-hidden px-3 py-2 flex flex-col gap-2">
          {hasVideo && topic.video ? (
            <>
              <div className={`grid gap-1.5 flex-shrink-0 ${topic.tips.length > 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
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
              <div className="flex-1 min-h-0 overflow-hidden">
                <TutorialVideo
                  key={`${mode}-${topic.id}`}
                  embedded
                  compact
                  sceneIndices={topic.video}
                  onClose={() => setShowVideo(false)}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col gap-2">
              {topic.tips.map((tip) => (
                <div key={tip.title} className={`flex-1 min-h-0 flex gap-3 rounded-2xl border px-3 py-2.5 ${panel}`}>
                  <span className="text-2xl leading-none mt-0.5 flex-shrink-0">{tip.icon}</span>
                  <div className="min-w-0 flex flex-col justify-center">
                    <p className={`text-[14px] font-black leading-tight ${text}`}>{tip.title}</p>
                    <p className={`text-[12px] leading-snug mt-1 ${muted}`}>{tip.desc}</p>
                  </div>
                </div>
              ))}
              {topic.fill && (
                <div className={`flex-shrink-0 flex items-center gap-3 rounded-2xl px-3 py-3 bg-gradient-to-br ${topic.color}`}>
                  <span className="text-3xl leading-none flex-shrink-0">{topic.fill.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-white font-black text-[13px] leading-tight">{topic.fill.title}</p>
                    <p className="text-white/80 text-[11px] leading-snug mt-0.5">{topic.fill.desc}</p>
                  </div>
                </div>
              )}
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
