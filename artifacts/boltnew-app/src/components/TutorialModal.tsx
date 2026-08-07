import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { TutorialSlide } from '../types/app';
import { TutorialVideo } from './TutorialVideo';

// 슬라이드 단축 레이블 (탭 네비게이션용)
const SLIDE_SHORT_LABELS = ['환영', '공지', '주의', '하트', '채팅', '배치도', '운세', '💡팁'];

// 설명 + 방법 2단 구조 헬퍼
function SlideWithSteps({ desc, steps, darkMode }: { desc: string; steps: string[]; darkMode?: boolean }) {
  return (
    <div className="px-5 py-3 space-y-2.5">
      <p className={`text-[12px] leading-relaxed ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>{desc}</p>
      <div className={`rounded-xl p-3 space-y-1.5 ${darkMode ? 'bg-slate-800/80 border border-slate-700' : 'bg-slate-50 border border-slate-100'}`}>
        <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>📌 이렇게 사용해요</p>
        {steps.map((step, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="flex-shrink-0 w-[18px] h-[18px] rounded-full bg-cyan-500 text-white text-[9px] font-black flex items-center justify-center mt-0.5 leading-none">{i + 1}</span>
            <p className={`text-[11px] leading-snug ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>{step}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export const TUTORIAL_SLIDES: TutorialSlide[] = [
  /* 0 — 환영 */
  {
    emoji: '🥂',
    title: '범일NPC 술번개에 오신 걸 환영해요!',
    color: 'from-cyan-500 to-teal-500',
    renderBody: (darkMode) => (
      <div className="px-5 pt-3 pb-4 space-y-3">
        <p className={`text-[12px] font-bold text-center leading-snug ${darkMode ? 'text-slate-200' : 'text-gray-800'}`}>
          오늘 함께하게 되어 정말 반가워요! 🎉
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {([
            { icon: '❤️', label: '하트 보내기', sub: '종류별 2개, 총 8개' },
            { icon: '💬', label: '1:1 채팅', sub: '수락 시 자동 오픈' },
            { icon: '📱', label: '연락처 교환', sub: '채팅에서 공유' },
            { icon: '🔮', label: '사주·궁합', sub: '운세 탭에서 확인' },
          ] as { icon: string; label: string; sub: string }[]).map(({ icon, label, sub }) => (
            <div key={label} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-gradient-to-br from-cyan-50 to-teal-50 border border-cyan-100'}`}>
              <span className="text-lg leading-none">{icon}</span>
              <div>
                <p className={`text-[11px] font-black leading-none ${darkMode ? 'text-slate-200' : 'text-cyan-900'}`}>{label}</p>
                <p className={`text-[9px] leading-snug mt-0.5 ${darkMode ? 'text-slate-500' : 'text-cyan-600'}`}>{sub}</p>
              </div>
            </div>
          ))}
        </div>
        <p className={`text-[10px] text-center ${darkMode ? 'text-slate-600' : 'text-gray-400'}`}>👇 다음 슬라이드에서 공지·주의사항을 꼭 읽어주세요!</p>
      </div>
    ),
  },

  /* 1 — 공지사항 */
  {
    emoji: '📋',
    title: '공지사항 (필독!)',
    color: 'from-teal-500 to-cyan-600',
    desc:
      '① 술 강요가 없는 자유로운 분위기입니다\n' +
      '② 정치, 종교, 지역감정, 패드립은 허용되지 않습니다\n' +
      '③ 욕설, 반말 등은 영구밴이 될 수 있습니다\n' +
      '④ 화장실, 담배는 함께 이동해 주세요\n' +
      '⑤ 급하신 분은 먼저 허락을 받고 이동 부탁드립니다\n' +
      '⑥ 모든 저작권은 범일NPC에게 있습니다. 불법 복제 및 도용은 민형사상 책임을 질 수 있습니다',
  },

  /* 2 — 주의사항 */
  {
    emoji: '⚠️',
    title: '주의사항 (필독!)',
    color: 'from-red-500 to-rose-600',
    desc:
      '🔋 절전 모드 해제\n저전력 모드에서는 앱이 갑자기 튕길 수 있어요. 설정 → 배터리 → 저전력 모드 OFF\n\n' +
      '🕵️ 시크릿 모드 금지\n로컬 저장소를 차단해 프로필이 사라집니다. 일반 탭으로 접속해 주세요.\n\n' +
      '📵 화면 꺼짐 방지\n화면이 꺼지면 세션이 초기화될 수 있어요. 화면 잠금 시간을 길게 설정해 주세요.\n\n' +
      '🔖 URL 북마크 추천\n같은 URL로 재접속하면 프로필이 자동 복구됩니다.',
  },

  /* 3 — 하트 */
  {
    emoji: '❤️',
    title: '하트 보내기',
    color: 'from-pink-500 to-rose-500',
    renderBody: (darkMode) => (
      <SlideWithSteps darkMode={darkMode}
        desc="참여자 탭에서 마음에 드는 분에게 하트를 보내세요. 종류별 2개씩 총 8개를 사용할 수 있어요. ❤️💙🧡은 상대방이 수락하면 연락처 교환 & 채팅이 열려요."
        steps={[
          '참여자 탭 → 카드 오른쪽 위 🤍 버튼 터치',
          '하트 종류 선택\n❤️ 맘에 들어요  💙 친구해요  🧡 뜨밤  💚 칭찬해요',
          '상대방이 ❤️💙🧡를 수락하면 연락처 교환 & 채팅 오픈!',
          '💚 칭찬 하트는 수락 시 바로 확인 가능 (채팅 없음)',
        ]}
      />
    ),
  },

  /* 4 — 채팅 */
  {
    emoji: '💬',
    title: '채팅',
    color: 'from-blue-500 to-indigo-500',
    renderBody: (darkMode) => (
      <SlideWithSteps darkMode={darkMode}
        desc="하트를 수락하면 채팅방이 자동으로 열려요. 채팅에서 연락처(카카오·인스타·전화)를 공유할 수 있어요."
        steps={[
          '채팅 탭 → 대화 상대 선택',
          '메시지 입력 후 전송 / 📷 사진 첨부 가능',
          '채팅방 하단 연락처 공유 버튼 → 카카오·인스타·전화 공유',
          '운세 탭에서 채팅 상대와의 사주·궁합도 바로 확인!',
        ]}
      />
    ),
  },

  /* 5 — 운세·사주·궁합 */
  {
    emoji: '🔮',
    title: '운세 · 사주 · 궁합',
    color: 'from-purple-500 to-pink-500',
    renderBody: (darkMode) => (
      <SlideWithSteps darkMode={darkMode}
        desc="타로·사주·궁합으로 오늘의 운세와 오늘 만난 분과의 궁합을 확인해 보세요! 채팅방에서도 바로 볼 수 있어요."
        steps={[
          '운세 탭 → 타로 / 사주 / 궁합 선택',
          '사주를 보려면 내 상태 탭에서 생월·생일 먼저 입력',
          '궁합: 마음에 드는 분 선택 후 4가지 방식 분석 확인',
          '채팅방 ♀♂ 버튼으로 상대방과 궁합 바로 확인 가능',
        ]}
      />
    ),
  },

  /* 7 — 숨겨진 기능 TIP */
  {
    emoji: '💡',
    title: '알아두면 유용한 숨겨진 기능',
    color: 'from-violet-500 to-purple-600',
    renderBody: (darkMode) => (
      <div className="px-5 py-3 space-y-2">
        <p className={`text-[11px] leading-relaxed ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
          대부분의 사람들이 모르는 기능들이에요 👀
        </p>
        <div className="space-y-1.5">
          {([
            { icon: '🖼️', title: '내 상태 아바타 변경', desc: '내 상태 탭 → 프로필 사진 탭하면 아바타 스타일 변경 가능' },
            { icon: '📷', title: '사진 채팅', desc: '채팅방에서 📎 버튼으로 이미지 전송 가능' },
            { icon: '🔮', title: '궁합 확인', desc: '내 운세 탭 → 다른 참여자와 궁합 점수 보기' },
            { icon: '📱', title: '연락처 교환', desc: '채팅 중 📱 버튼 → 카카오·인스타 공유 가능' },
          ] as { icon: string; title: string; desc: string }[]).map(({ icon, title, desc }) => (
            <div key={title} className={`flex items-start gap-2.5 px-3 py-1.5 rounded-xl ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-violet-50 border border-violet-100'}`}>
              <span className="text-base leading-none mt-0.5 flex-shrink-0">{icon}</span>
              <div>
                <p className={`text-[11px] font-black leading-none ${darkMode ? 'text-slate-200' : 'text-violet-900'}`}>{title}</p>
                <p className={`text-[10px] leading-snug mt-0.5 ${darkMode ? 'text-slate-400' : 'text-violet-600/80'}`}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
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
    return <TutorialVideo darkMode={darkMode} onClose={() => setVideoMode(false)} />;
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center sm:items-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`relative w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden transition-all ${darkMode ? 'bg-slate-900' : 'bg-white'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 닫기 */}
        <button onClick={onClose} className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/20 text-white hover:bg-black/40 transition-all">
          <X className="w-4 h-4" />
        </button>

        {/* 동영상 버튼 */}
        <button
          onClick={() => setVideoMode(true)}
          className="absolute top-3 left-3 z-10 flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-black/30 hover:bg-black/50 transition-all"
        >
          <span className="text-white text-[10px]">▶</span>
          <span className="text-white text-[10px] font-bold">동영상</span>
        </button>

        {/* 헤더 그라데이션 */}
        <div className={`bg-gradient-to-br ${slide.color} px-6 text-center flex flex-col items-center justify-center`} style={{ height: 90 }}>
          <div className="text-2xl mb-1">{slide.emoji}</div>
          <h2 className="text-[12px] font-black text-white leading-snug px-6">{slide.title}</h2>
        </div>

        {/* ── 슬라이드 탭 네비게이션 (직접 이동) ── */}
        <div className={`border-b ${darkMode ? 'border-slate-700 bg-slate-900' : 'border-gray-100 bg-white'}`}>
          <div className="grid grid-cols-4 gap-0.5 px-1.5 py-1.5">
            {TUTORIAL_SLIDES.map((s, i) => (
              <button
                key={i}
                onClick={() => onChangePage(i)}
                className={`flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-xl transition-all ${
                  i === page
                    ? `bg-gradient-to-br ${s.color} shadow-sm`
                    : darkMode ? 'hover:bg-slate-800' : 'hover:bg-gray-50'
                }`}
              >
                <span className="text-sm leading-none">{s.emoji}</span>
                <span className={`text-[8px] font-bold leading-none text-center break-keep ${
                  i === page ? 'text-white' : darkMode ? 'text-slate-500' : 'text-gray-400'
                }`}>{SLIDE_SHORT_LABELS[i]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── 슬라이드 본문 (스크롤 가능) ── */}
        <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
          {slide.renderBody ? (
            slide.renderBody(darkMode)
          ) : (
            <div className={`px-6 py-3 text-[12px] leading-loose whitespace-pre-line ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
              {slide.desc}
            </div>
          )}
        </div>

        {/* ── 하단 버튼 영역 ── */}
        <div className={`px-5 py-4 pt-3 flex gap-2 border-t ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
          {page > 0 && (
            <button
              onClick={() => onChangePage(page - 1)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              이전
            </button>
          )}
          <button
            onClick={isLast ? onClose : () => onChangePage(page + 1)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all bg-gradient-to-r ${slide.color} hover:opacity-90 active:scale-95`}
          >
            {isLast ? '시작하기 🎉' : '다음'}
          </button>
        </div>
      </div>
    </div>
  );
}
