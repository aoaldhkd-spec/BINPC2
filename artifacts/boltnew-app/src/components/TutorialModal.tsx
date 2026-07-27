import React from 'react';
import { X } from 'lucide-react';
import type { TutorialSlide } from '../types/app';

export const TUTORIAL_SLIDES: TutorialSlide[] = [
  {
    emoji: '🥂',
    title: '범일NPC 술번개에 오신 걸 환영해요!',
    color: 'from-cyan-500 to-teal-500',
    renderBody: (darkMode) => (
      <div className="px-5 pt-3 pb-4 overflow-y-auto space-y-3" style={{ height: 210 }}>
        <p className={`text-[13px] font-bold text-center leading-snug ${darkMode ? 'text-slate-200' : 'text-gray-800'}`}>
          오늘 함께하게 되어 정말 반가워요! 🎉<br />
          <span className={`text-[11px] font-normal ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>이 앱으로 오늘 이런 것들을 즐길 수 있어요</span>
        </p>
        <div className="grid grid-cols-2 gap-2">
          {([
            { icon: '❤️', label: '하트 보내기', sub: '종류별 8개' },
            { icon: '💬', label: '1:1 채팅', sub: '매칭 성사 시 오픈' },
            { icon: '📱', label: '연락처 교환', sub: '채팅에서 공유' },
            { icon: '🪜', label: '미니게임', sub: '사다리·돌림판 등' },
            { icon: '🔮', label: '사주·궁합', sub: '운세 탭에서 확인' },
            { icon: '🍺', label: '음료 요청', sub: '건의함 버튼 클릭' },
          ] as { icon: string; label: string; sub: string }[]).map(({ icon, label, sub }) => (
            <div key={label} className={`flex items-center gap-2 px-3 py-2 rounded-xl ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-gradient-to-br from-cyan-50 to-teal-50 border border-cyan-100'}`}>
              <span className="text-xl leading-none">{icon}</span>
              <div>
                <p className={`text-[11px] font-black leading-none ${darkMode ? 'text-slate-200' : 'text-cyan-900'}`}>{label}</p>
                <p className={`text-[10px] leading-snug mt-0.5 ${darkMode ? 'text-slate-500' : 'text-cyan-600'}`}>{sub}</p>
              </div>
            </div>
          ))}
        </div>
        <p className={`text-[10px] text-center ${darkMode ? 'text-slate-600' : 'text-gray-400'}`}>👇 다음 슬라이드에서 공지사항·주의사항을 꼭 읽어주세요!</p>
      </div>
    ),
  },
  { emoji: '📋', title: '공지사항 (필독!)', desc: '① 술 강요가 없는 자유로운 분위기입니다\n② 정치, 종교, 지역감정, 패드립은 허용되지 않습니다\n③ 욕설, 반말 등은 영구밴이 될 수 있습니다\n④ 화장실, 담배는 함께 이동해 주세요\n⑤ 급하신 분은 먼저 허락을 받고 이동 부탁드립니다\n⑥ 모든 저작권은 범일NPC에게 있습니다. 불법 복제 및 도용은 민형사상 책임을 질 수 있습니다', color: 'from-teal-500 to-cyan-600' },
  { emoji: '⚠️', title: '주의사항 (필독!)', desc: '🔋 절전 모드 해제\n저전력 모드에서는 백그라운드 처리가 막혀 앱이 갑자기 튕길 수 있어요. 설정 → 배터리 → 저전력 모드 OFF 후 사용해 주세요.\n\n🕵️ 시크릿·개인정보 보호 모드 금지\n시크릿 모드는 로컬 저장소를 차단해 닉네임·프로필이 사라집니다. 반드시 일반 탭으로 접속해 주세요.\n\n📵 화면 자동 꺼짐 방지\n화면이 꺼지면 세션이 초기화될 수 있어요. 화면 잠금 시간을 길게 설정해 주세요.\n\n🔖 URL 북마크 추천\n앱이 튕겨도 같은 URL로 재접속하면 프로필이 자동 복구됩니다.', color: 'from-red-500 to-rose-600' },
  { emoji: '❤️', title: '하트 보내기', desc: '참여자 탭에서 마음에 드는 분에게 하트를 보내세요.\n\n❤️ 맘에 드는 사람\n💙 친구하고 싶어요\n🧡 뜨밤\n💚 칭찬 하트\n\n각각 2개씩 총 8개의 하트가 있어요. ❤️💙🧡은 상대방이 수락하면 연락처가 교환됩니다!', color: 'from-pink-500 to-rose-500' },
  { emoji: '💬', title: '채팅', desc: '하트를 수락하면 채팅방이 열려요.\n\n채팅 탭에서 대화를 시작하고, 연락처를 공유할 수 있어요. 채팅 상대에게만 내 연락처가 공개됩니다.', color: 'from-blue-500 to-indigo-500' },
  { emoji: '🗺️', title: '배치도', desc: '배치도 탭에서 지금 어느 자리에 누가 앉아 있는지 확인할 수 있어요.\n\n자리를 이동하면 운영진이 직접 배치해 드립니다.', color: 'from-emerald-500 to-teal-500' },
  { emoji: '🎮', title: '미니게임', desc: '게임 탭에서 다양한 미니게임을 즐길 수 있어요!\n\n🪜 사다리타기\n테이블 인원이 자동으로 참여하고, 결과가 동시에 공개돼요!\n\n🎡 돌림판\n항목을 직접 편집하고 돌려서 벌칙·상을 정해요.\n\n── 운영진이 진행하는 게임 ──\n\n🎲 밸런스 게임  •  ⭕❌ OX 게임\n🖼️ 이미지 투표  •  🎰 당첨자 추첨\n\n운영진 진행 게임은 화면에 알림으로 전달돼요!', color: 'from-violet-500 to-purple-500' },
  { emoji: '🔮', title: '운세 · 사주 · 궁합', desc: '게임 탭 → 운세 탭에서 확인할 수 있어요!\n\n🃏 타로\n오늘의 과거·현재·미래 카드를 뽑아보세요\n\n📅 사주\n생년월일 기반 오늘의 에너지 & 행운 아이템\n\n💕 궁합\n사주·수비학·오행·MBTI 4가지 방식으로 분석!\n마음에 드는 분과의 궁합을 확인해 보세요\n\n✨ 채팅방에서 상대방과의 사주·궁합도 바로 볼 수 있어요!', color: 'from-purple-500 to-pink-500' },
  { emoji: '🍺', title: '음료 요청 & 건의함', desc: '채팅·건의 탭의 건의함에서 음료를 요청하거나 운영진에게 의견을 전달할 수 있어요.\n\n맥주, 소주, 음료수 버튼을 누르면 바로 전달됩니다!\n\n오늘 즐거운 시간 보내세요! 🎉', color: 'from-amber-500 to-orange-500' },
];

export function TutorialModal({ page, onChangePage, onClose, darkMode }: {
  page: number;
  onChangePage: (p: number) => void;
  onClose: () => void;
  darkMode?: boolean;
}) {
  const slide = TUTORIAL_SLIDES[page];
  const isLast = page === TUTORIAL_SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center sm:items-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className={`relative w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden transition-all ${darkMode ? 'bg-slate-900' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/20 text-white hover:bg-black/40 transition-all">
          <X className="w-4 h-4" />
        </button>
        <div className={`bg-gradient-to-br ${slide.color} px-6 text-center flex flex-col items-center justify-center`} style={{ height: 130 }}>
          <div className="text-4xl mb-2">{slide.emoji}</div>
          <h2 className="text-base font-black text-white leading-snug">{slide.title}</h2>
        </div>
        <div className="flex justify-center gap-1.5 pt-3 px-6">
          {TUTORIAL_SLIDES.map((_, i) => (
            <button key={i} onClick={() => onChangePage(i)}
              className={`rounded-full transition-all ${i === page ? 'w-5 h-2 bg-cyan-500' : `w-2 h-2 ${darkMode ? 'bg-slate-600' : 'bg-gray-200'}`}`} />
          ))}
        </div>
        {slide.renderBody ? (
          <div style={{ height: 210, overflowY: 'auto' }}>{slide.renderBody(darkMode)}</div>
        ) : (
          <div className={`px-6 py-3 text-sm leading-loose whitespace-pre-line overflow-y-auto ${darkMode ? 'text-slate-300' : 'text-gray-600'}`} style={{ height: 210 }}>
            {slide.desc}
          </div>
        )}
        <div className="px-6 pb-6 flex gap-2">
          {page > 0 && (
            <button onClick={() => onChangePage(page - 1)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              이전
            </button>
          )}
          <button onClick={isLast ? onClose : () => onChangePage(page + 1)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all bg-gradient-to-r ${slide.color} hover:opacity-90 active:scale-95`}>
            {isLast ? '시작하기 🎉' : '다음'}
          </button>
        </div>
      </div>
    </div>
  );
}
