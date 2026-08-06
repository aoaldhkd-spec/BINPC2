import { Camera, QrCode } from 'lucide-react';

const darkMode = true;

export default function MyProfile() {
  const posColor = '#06b6d4';
  const domColor = '#a855f7';

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-start p-4 gap-4">
      {/* 내 프로필 카드 */}
      <div className="w-full max-w-sm rounded-3xl p-5 border border-slate-600 bg-gradient-to-br from-slate-800 to-slate-900 shadow-xl">
        <p className="text-[10px] font-black uppercase tracking-widest mb-3 text-slate-400">내 프로필</p>

        {/* 사진(왼쪽) + 닉네임·2×2박스(오른쪽) */}
        <div className="flex gap-3">
          {/* 사진 */}
          <div className="flex-shrink-0 flex flex-col items-center gap-1">
            <div className="relative w-32 h-32">
              <div className="w-full h-full rounded-2xl overflow-hidden border-2 border-cyan-500/50 shadow-lg shadow-cyan-500/20 bg-slate-700 flex items-center justify-center">
                <span className="text-3xl">🌙</span>
              </div>
              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-cyan-500 border-2 border-slate-900 flex items-center justify-center shadow">
                <Camera className="w-2.5 h-2.5 text-white" />
              </span>
            </div>
            <span className="text-[9px] font-bold text-slate-400">다크 엔젤</span>
          </div>

          {/* 오른쪽: 닉네임 + 2×2 박스 */}
          <div className="flex-1 min-w-0 flex flex-col justify-between">
            {/* 닉네임 + 자리 */}
            <div>
              <p className="text-base font-black leading-tight text-white">A1</p>
              <span className="text-[10px] font-bold text-amber-400">🪑 3번 C테이블</span>
            </div>

            {/* 2×2 정보 박스 — 오른쪽 정렬, 촘촘하게 */}
            <div className="grid grid-cols-2 gap-1 self-end w-full">
              {/* MBTI */}
              <div className="rounded-lg px-2 py-1 border flex flex-col bg-teal-500/10 border-teal-500/25">
                <span className="text-[8px] font-black uppercase tracking-wide text-teal-400">MBTI</span>
                <span className="text-[11px] font-black leading-none text-teal-300">ENFJ</span>
              </div>

              {/* 성향 */}
              <div className="rounded-lg px-2 py-1 border flex flex-col"
                style={{ backgroundColor: posColor + '18', borderColor: posColor + '50' }}>
                <span className="text-[8px] font-black uppercase tracking-wide" style={{ color: posColor }}>성향</span>
                <span className="text-[11px] font-black leading-none" style={{ color: posColor }}>올탑</span>
              </div>

              {/* 돔/섭 */}
              <div className="rounded-lg px-2 py-1 border flex flex-col"
                style={{ backgroundColor: domColor + '18', borderColor: domColor + '50' }}>
                <span className="text-[8px] font-black uppercase tracking-wide" style={{ color: domColor }}>돔/섭</span>
                <span className="text-[11px] font-black leading-none" style={{ color: domColor }}>일반</span>
              </div>

              {/* 관심사 */}
              <div className="rounded-lg px-2 py-1 border flex flex-col gap-0.5 bg-pink-500/10 border-pink-500/25">
                <span className="text-[8px] font-black uppercase tracking-wide text-pink-400">관심사</span>
                <div className="flex flex-wrap gap-0.5">
                  <span className="text-[8px] font-bold px-1 py-px rounded bg-pink-500/20 text-pink-300">#운동</span>
                  <span className="text-[8px] font-bold px-1 py-px rounded bg-pink-500/20 text-pink-300">#독서</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* QR 버튼 행 */}
        <div className="mt-4 grid grid-cols-4 gap-2">
          <button className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-2xl border bg-cyan-500/15 border-cyan-500/30 text-cyan-400">
            <QrCode className="w-5 h-5" />
            <span className="text-[10px] leading-tight text-center">프로필<br/>QR</span>
          </button>
          <button className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-2xl border bg-violet-500/15 border-violet-500/30 text-violet-400">
            <QrCode className="w-5 h-5" />
            <span className="text-[10px] leading-tight text-center">연락처<br/>QR</span>
          </button>
          <button className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-2xl border bg-amber-500/15 border-amber-500/30 text-amber-400">
            <Camera className="w-5 h-5" />
            <span className="text-[10px] leading-tight text-center">QR<br/>찍기</span>
          </button>
          <div className="flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-2xl border-2 bg-amber-500/15 border-amber-500/40">
            <span className="text-[8px] font-black uppercase tracking-widest text-amber-400">🔑 고유번호</span>
            <span className="text-xl font-black tracking-[0.25em] text-amber-300">1234</span>
          </div>
        </div>
      </div>
    </div>
  );
}
