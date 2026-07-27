import React, { useState, useEffect } from 'react';

const WELCOME_RULES = [
  '술강요가 없는 자유로운 분위기입니다',
  '정치·종교·지역감정·패드립은 허용되지 않습니다',
  '욕설·반말 등은 영구밴이 될 수 있습니다',
  '화장실·담배는 함께 이동해 주세요',
  '급하신 분은 먼저 허락을 받고 이동해 주세요',
  '모든 저작권은 범일NPC에 있습니다. 불법 복제·도용 시 민형사상 책임을 질 수 있습니다',
];

const TECH_NOTICES = [
  { icon: '🔋', title: '절전 모드 해제', desc: '저전력 모드에서는 백그라운드 처리가 막혀 앱이 튕길 수 있어요. 설정 → 배터리 → 저전력 모드 OFF 후 사용해 주세요.' },
  { icon: '🕵️', title: '시크릿·개인정보 보호 모드 금지', desc: 'Safari/Chrome 시크릿 모드는 로컬 저장소가 차단돼 닉네임·프로필이 사라집니다. 일반 탭으로 접속해 주세요.' },
  { icon: '📵', title: '화면 자동 꺼짐 방지', desc: '화면이 꺼지면 브라우저가 세션을 초기화할 수 있어요. 화면 잠금 시간을 길게 설정하거나 주기적으로 깨워주세요.' },
  { icon: '🔖', title: 'URL 북마크 추천', desc: '앱이 튕겨도 같은 URL로 재접속하면 프로필이 자동 복구됩니다. 주소창에서 북마크해 두세요.' },
];

export function WelcomeNoticeModal({ onClose }: { onClose: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 50); return () => clearTimeout(t); }, []);
  return (
    <div className={`fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-4 transition-all duration-300 ${visible ? 'bg-black/75 backdrop-blur-sm' : 'bg-transparent'}`}>
      <div className={`w-full max-w-sm transition-all duration-400 ${visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>
        <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]">
          <div className="bg-gradient-to-r from-cyan-500 to-teal-500 px-6 pt-6 pb-5 text-center relative flex-shrink-0">
            <div className="text-4xl mb-1">🥂</div>
            <h2 className="text-2xl font-black text-white leading-tight">환영합니다!</h2>
            <p className="text-xs text-white/80 mt-1 font-medium">범일NPC 술번개에 오신 걸 환영해요</p>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-5 space-y-5">
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">이용 규칙</p>
              <ol className="space-y-2.5">
                {WELCOME_RULES.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-cyan-500 text-white text-[10px] font-black flex items-center justify-center mt-0.5">{i + 1}</span>
                    <span className="text-[13px] text-gray-700 leading-snug">{item}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="bg-gradient-to-r from-cyan-50 to-teal-50 border border-cyan-100 rounded-2xl p-4 space-y-2.5">
              <p className="text-[11px] font-black text-cyan-600 uppercase tracking-widest mb-1">오늘 할 수 있는 것들 🎉</p>
              {[
                { icon: '❤️', text: '마음에 드는 분께 하트 보내기 (종류별 8개)' },
                { icon: '💬', text: '매칭 성사 시 1:1 채팅 + 연락처 교환' },
                { icon: '🪜', text: '사다리타기 · 돌림판 미니게임 (테이블별)' },
                { icon: '🎲', text: '밸런스·OX·이미지 게임 (운영진 진행)' },
                { icon: '🔮', text: '프로필에서 사주 · 궁합 확인' },
                { icon: '🍺', text: '음료 요청 · 건의함 이용' },
              ].map(({ icon, text }) => (
                <div key={text} className="flex items-start gap-2.5">
                  <span className="text-base flex-shrink-0 leading-none mt-0.5">{icon}</span>
                  <span className="text-[13px] text-gray-700 leading-snug">{text}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100" />

            <div>
              <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-3">⚠️ 앱 사용 전 주의사항</p>
              <div className="space-y-3">
                {TECH_NOTICES.map((n, i) => (
                  <div key={i} className="flex gap-3 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                    <span className="text-xl flex-shrink-0 leading-none mt-0.5">{n.icon}</span>
                    <div>
                      <p className="text-[12px] font-black text-gray-800 mb-0.5">{n.title}</p>
                      <p className="text-[11px] text-gray-500 leading-relaxed">{n.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <p className="text-[11px] text-slate-500 leading-relaxed text-center">직접 만든 앱이라 서버가 가끔 불안정할 수 있습니다.<br/>불편하시더라도 양해 부탁드립니다 🙏</p>
            </div>
          </div>

          <div className="px-5 pb-6 pt-3 flex-shrink-0">
            <button
              onClick={onClose}
              className="w-full py-4 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-white font-black text-base rounded-2xl transition-all shadow-lg shadow-cyan-500/30 active:scale-[0.98]"
            >
              확인했어요! 🍻
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
