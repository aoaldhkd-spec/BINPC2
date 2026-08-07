import React, { useState } from 'react';
import { X, ArrowLeft, ArrowRight } from 'lucide-react';
import type { TutorialSlide } from '../types/app';
import { TutorialVideo } from './TutorialVideo';

const SLIDE_SHORT_LABELS = ['환영', '공지', '하트', '채팅', '운세', '💡팁'];

// 고정 높이(h-60 = 240px) 안에서 딱 맞도록 공통 컨테이너
function Body({ children }: { children: React.ReactNode }) {
  return <div className="h-60 overflow-hidden">{children}</div>;
}

// 설명 + 단계 2단 구조
function SlideWithSteps({ desc, steps, color, darkMode }: {
  desc: string; steps: string[]; color: string; darkMode?: boolean;
}) {
  return (
    <Body>
      <div className="px-5 pt-3 pb-3 space-y-2.5 h-full flex flex-col justify-between">
        <p className={`text-[13px] leading-relaxed ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>{desc}</p>
        <div className={`rounded-2xl p-3 space-y-2 flex-1 ${darkMode ? 'bg-slate-800/80 border border-slate-700' : 'bg-slate-50 border border-slate-200'}`}>
          <p className={`text-[9px] font-black uppercase tracking-widest ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>📌 이렇게 사용해요</p>
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className={`flex-shrink-0 w-[18px] h-[18px] rounded-full text-white text-[9px] font-black flex items-center justify-center mt-0.5 leading-none bg-gradient-to-br ${color}`}>{i + 1}</span>
              <p className={`text-[13px] leading-snug ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>{step}</p>
            </div>
          ))}
        </div>
      </div>
    </Body>
  );
}

export const TUTORIAL_SLIDES: TutorialSlide[] = [
  /* 0 — 환영 */
  {
    emoji: '🥂',
    title: '범일NPC 술번개에 오신 걸 환영해요!',
    color: 'from-cyan-500 to-teal-500',
    renderBody: (darkMode) => (
      <Body>
        <div className="px-5 pt-3 pb-3 flex flex-col gap-2.5 h-full justify-between">
          <p className={`text-[13px] font-bold text-center ${darkMode ? 'text-slate-200' : 'text-gray-800'}`}>
            오늘 함께하게 되어 정말 반가워요! 🎉
          </p>
          <div className="grid grid-cols-2 gap-2 flex-1">
            {([
              { icon: '❤️', label: '하트 보내기', sub: '종류별 2개, 총 8개' },
              { icon: '💬', label: '1:1 채팅', sub: '수락 시 자동 오픈' },
              { icon: '📱', label: '연락처 교환', sub: '채팅에서 공유' },
              { icon: '🔮', label: '사주·궁합', sub: '운세 탭에서 확인' },
            ] as { icon: string; label: string; sub: string }[]).map(({ icon, label, sub }) => (
              <div key={label} className={`flex items-center gap-2.5 px-3 py-0 rounded-2xl ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-gradient-to-br from-cyan-50 to-teal-50 border border-cyan-100'}`}>
                <span className="text-xl leading-none flex-shrink-0">{icon}</span>
                <div>
                  <p className={`text-[13px] font-black leading-tight ${darkMode ? 'text-slate-200' : 'text-cyan-900'}`}>{label}</p>
                  <p className={`text-[11px] leading-snug mt-0.5 ${darkMode ? 'text-slate-500' : 'text-cyan-600'}`}>{sub}</p>
                </div>
              </div>
            ))}
          </div>
          <p className={`text-[11px] text-center ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
            👇 탭을 눌러 각 기능을 확인하세요
          </p>
        </div>
      </Body>
    ),
  },

  /* 1 — 공지사항 */
  {
    emoji: '📋',
    title: '공지사항 (필독!)',
    color: 'from-teal-500 to-cyan-600',
    renderBody: (darkMode) => (
      <Body>
        <div className="px-5 pt-3 pb-3 h-full">
          <div className={`rounded-2xl p-3 space-y-2 h-full ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-teal-50 border border-teal-100'}`}>
            {[
              '술 강요가 없는 자유로운 분위기입니다',
              '정치, 종교, 지역감정, 패드립은 허용되지 않습니다',
              '욕설, 반말 등은 영구밴이 될 수 있습니다',
              '화장실, 담배는 함께 이동해 주세요',
              '급하신 분은 먼저 허락을 받고 이동 부탁드립니다',
              '불법 복제·도용 시 민형사상 책임질 수 있습니다',
            ].map((text, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className={`flex-shrink-0 w-[18px] h-[18px] rounded-full text-[9px] font-black flex items-center justify-center mt-0.5 leading-none ${darkMode ? 'bg-teal-700 text-teal-200' : 'bg-teal-500 text-white'}`}>{i + 1}</span>
                <p className={`text-[13px] leading-snug ${darkMode ? 'text-slate-300' : 'text-teal-900'}`}>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </Body>
    ),
  },

  /* 2 — 하트 */
  {
    emoji: '❤️',
    title: '하트 보내기',
    color: 'from-pink-500 to-rose-500',
    renderBody: (darkMode) => (
      <SlideWithSteps darkMode={darkMode} color="from-pink-500 to-rose-500"
        desc="참여자 탭에서 마음에 드는 분에게 하트를 보내세요. 종류별 2개씩 총 8개 사용 가능."
        steps={[
          '참여자 탭 → 카드 오른쪽 위 🤍 버튼 터치',
          '하트 종류 선택 (❤️💙🧡💚)',
          '❤️💙🧡 수락 시 연락처 교환 & 채팅 오픈!',
          '💚 칭찬 하트는 수락 즉시 확인 (채팅 없음)',
        ]}
      />
    ),
  },

  /* 3 — 채팅 */
  {
    emoji: '💬',
    title: '채팅',
    color: 'from-blue-500 to-indigo-500',
    renderBody: (darkMode) => (
      <SlideWithSteps darkMode={darkMode} color="from-blue-500 to-indigo-500"
        desc="하트를 수락하면 채팅방이 자동으로 열려요. 채팅에서 연락처를 공유할 수 있어요."
        steps={[
          '채팅 탭 → 대화 상대 선택',
          '메시지 입력 후 전송 / 📷 사진 첨부 가능',
          '채팅방 하단 📱 버튼 → 카카오·인스타·전화 공유',
          '운세 탭에서 채팅 상대와의 궁합 바로 확인!',
        ]}
      />
    ),
  },

  /* 4 — 운세·사주·궁합 */
  {
    emoji: '🔮',
    title: '운세 · 사주 · 궁합',
    color: 'from-purple-500 to-pink-500',
    renderBody: (darkMode) => (
      <SlideWithSteps darkMode={darkMode} color="from-purple-500 to-pink-500"
        desc="타로·사주·궁합으로 오늘의 운세와 오늘 만난 분과의 궁합을 확인해 보세요!"
        steps={[
          '운세 탭 → 타로 / 사주 / 궁합 선택',
          '사주를 보려면 내 상태 탭에서 생월·생일 먼저 입력',
          '궁합: 마음에 드는 분 선택 후 4가지 방식 분석',
          '채팅방 ♀♂ 버튼으로 상대방과 궁합 바로 확인',
        ]}
      />
    ),
  },

  /* 5 — 숨겨진 기능 TIP */
  {
    emoji: '💡',
    title: '숨겨진 기능 팁',
    color: 'from-violet-500 to-purple-600',
    renderBody: (darkMode) => (
      <Body>
        <div className="px-5 pt-3 pb-3 h-full flex flex-col gap-2.5">
          <p className={`text-[12px] ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
            대부분 모르는 기능이에요 👀
          </p>
          <div className="flex flex-col gap-2 flex-1 justify-between">
            {([
              { icon: '🖼️', title: '아바타 변경', desc: '내 상태 탭 → 프로필 사진 탭 → 스타일 선택' },
              { icon: '📷', title: '사진 채팅', desc: '채팅방 📎 버튼으로 이미지 전송 가능' },
              { icon: '🔮', title: '궁합 확인', desc: '운세 탭 → 참여자 선택 → 4가지 방식 분석' },
            ] as { icon: string; title: string; desc: string }[]).map(({ icon, title, desc }) => (
              <div key={title} className={`flex items-center gap-3 px-4 py-0 rounded-2xl flex-1 ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-violet-50 border border-violet-100'}`}>
                <span className="text-xl flex-shrink-0">{icon}</span>
                <div>
                  <p className={`text-[13px] font-black leading-tight ${darkMode ? 'text-slate-200' : 'text-violet-900'}`}>{title}</p>
                  <p className={`text-[12px] leading-snug mt-0.5 ${darkMode ? 'text-slate-400' : 'text-violet-600/80'}`}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Body>
    ),
  },
];

export function TutorialModal({ page, onChangePage, onClose, darkMode }: {
  page: number;
  onChangePage: (p: number) => void;
  onClose: () => void;
  darkMode?: boolean;
}) {
  const [videoMode, setVideoMode] = useState(false);
  const slide = TUTORIAL_SLIDES[page];
  const isLast = page === TUTORIAL_SLIDES.length - 1;

  if (videoMode) {
    return <TutorialVideo onClose={() => setVideoMode(false)} />;
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-5 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`relative w-full max-w-sm rounded-3xl shadow-2xl flex flex-col overflow-hidden ${darkMode ? 'bg-slate-900' : 'bg-white'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* 닫기 */}
        <button onClick={onClose}
          className="absolute top-3.5 right-3.5 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/25 hover:bg-black/45 text-white transition-all">
          <X className="w-4 h-4" />
        </button>

        {/* 동영상 버튼 */}
        <button onClick={() => setVideoMode(true)}
          className="absolute top-3.5 left-3.5 z-10 flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-black/30 hover:bg-black/50 transition-all">
          <span className="text-white text-[10px]">▶</span>
          <span className="text-white text-[10px] font-bold">동영상</span>
        </button>

        {/* 헤더 */}
        <div className={`bg-gradient-to-br ${slide.color} px-6 py-5 text-center flex flex-col items-center justify-center flex-shrink-0`}>
          <div className="text-3xl mb-1.5">{slide.emoji}</div>
          <h2 className="text-[13px] font-black text-white leading-snug px-4">{slide.title}</h2>
        </div>

        {/* 탭 네비게이션 (2행 × 3열) */}
        <div className={`flex-shrink-0 border-b ${darkMode ? 'border-slate-700 bg-slate-900' : 'border-gray-100 bg-white'}`}>
          <div className="grid grid-cols-3 gap-1 px-2.5 py-2">
            {TUTORIAL_SLIDES.map((s, i) => (
              <button key={i} onClick={() => onChangePage(i)}
                className={`flex flex-col items-center gap-1 py-2 rounded-xl transition-all active:scale-95 ${
                  i === page
                    ? `bg-gradient-to-br ${s.color} shadow-sm`
                    : darkMode ? 'hover:bg-slate-800' : 'hover:bg-gray-50'
                }`}>
                <span className="text-sm leading-none">{s.emoji}</span>
                <span className={`text-[9px] font-bold leading-none text-center ${
                  i === page ? 'text-white' : darkMode ? 'text-slate-500' : 'text-gray-400'
                }`}>{SLIDE_SHORT_LABELS[i]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 슬라이드 본문 — 고정 높이 h-60, 스크롤 없음 */}
        {slide.renderBody ? slide.renderBody(darkMode) : (
          <Body>
            <div className={`px-5 py-4 h-full text-[12px] leading-relaxed whitespace-pre-line ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
              {slide.desc}
            </div>
          </Body>
        )}

        {/* 하단 버튼 */}
        <div className={`flex-shrink-0 px-5 py-4 flex gap-2.5 border-t ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
          {page > 0 ? (
            <button onClick={() => onChangePage(page - 1)}
              className={`flex-[2] flex items-center justify-center gap-1.5 py-3 rounded-2xl text-sm font-semibold border transition-all active:scale-95 ${darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <ArrowLeft className="w-4 h-4" /> 이전
            </button>
          ) : (
            <button onClick={onClose}
              className={`flex-[2] flex items-center justify-center gap-1.5 py-3 rounded-2xl text-sm font-semibold border transition-all active:scale-95 ${darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              닫기
            </button>
          )}
          <button
            onClick={isLast ? onClose : () => onChangePage(page + 1)}
            className={`flex-[3] flex items-center justify-center gap-1.5 py-3 rounded-2xl text-sm font-bold text-white transition-all active:scale-95 bg-gradient-to-r ${slide.color} hover:opacity-90 shadow-sm`}>
            {isLast ? '시작하기 🎉' : <>다음 <ArrowRight className="w-4 h-4" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
