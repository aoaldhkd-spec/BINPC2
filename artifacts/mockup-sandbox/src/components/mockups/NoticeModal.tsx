import { ShieldAlert, X } from 'lucide-react';

const ITEMS = [
  {
    emoji: '🔋', bg: 'bg-red-500/10', border: 'border-red-500/20',
    title: '절전 모드 해제',
    desc: '저전력 모드에서는 앱이 갑자기 튕길 수 있어요.',
    tip: '설정 → 배터리 → 저전력 모드 OFF',
    tipColor: 'text-amber-400',
  },
  {
    emoji: '🕵️', bg: 'bg-purple-500/10', border: 'border-purple-500/20',
    title: '일반 브라우저로 접속',
    desc: '시크릿·개인정보 보호 모드는 로그인 정보가 사라져요.',
    tip: 'Safari / Chrome 일반 탭으로 접속',
    tipColor: 'text-purple-300',
  },
  {
    emoji: '📵', bg: 'bg-blue-500/10', border: 'border-blue-500/20',
    title: '화면 자동 꺼짐 방지',
    desc: '화면이 꺼지면 세션이 초기화될 수 있어요.',
    tip: '화면 자동 잠금 시간을 길게 설정',
    tipColor: 'text-blue-300',
  },
  {
    emoji: '🔖', bg: 'bg-teal-500/10', border: 'border-teal-500/20',
    title: 'URL 북마크 저장',
    desc: '앱이 튕겨도 같은 URL로 재접속하면 프로필이 복구돼요.',
    tip: '지금 이 페이지를 북마크해 두세요',
    tipColor: 'text-teal-300',
  },
];

export default function NoticeModal() {
  return (
    <div className="min-h-screen bg-black/80 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-700/80 overflow-hidden shadow-2xl">
        {/* 헤더 */}
        <div className="relative px-5 pt-5 pb-4 text-center">
          <button className="absolute top-4 right-4 w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
            <X className="w-3.5 h-3.5 text-slate-400" />
          </button>
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mx-auto mb-3">
            <ShieldAlert className="w-6 h-6 text-amber-400" />
          </div>
          <h3 className="text-white font-black text-base">입장 전 주의사항</h3>
          <p className="text-slate-500 text-[11px] mt-0.5">앱이 튕기지 않으려면 꼭 확인하세요</p>
        </div>

        {/* 항목 목록 */}
        <div className="px-4 pb-4 space-y-2">
          {ITEMS.map(item => (
            <div key={item.title} className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl ${item.bg} border ${item.border}`}>
              <span className="text-2xl flex-shrink-0 leading-none">{item.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-[13px] leading-tight">{item.title}</p>
                <p className="text-slate-400 text-[11px] leading-snug mt-0.5">{item.desc}</p>
                <p className={`text-[10px] font-semibold mt-1 ${item.tipColor}`}>→ {item.tip}</p>
              </div>
            </div>
          ))}
        </div>

        {/* 확인 버튼 */}
        <div className="px-4 pb-5">
          <button className="w-full py-3 bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-black rounded-2xl text-sm">
            확인했어요!
          </button>
        </div>
      </div>
    </div>
  );
}
