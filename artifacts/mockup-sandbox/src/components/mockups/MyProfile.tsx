import { Camera, QrCode } from 'lucide-react';

const posColor = '#06b6d4';
const domColor = '#a855f7';

export default function MyProfile() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-start p-4 gap-4">
      <div className="w-full max-w-sm rounded-3xl p-5 border border-slate-600 bg-gradient-to-br from-slate-800 to-slate-900 shadow-xl">
        <p className="text-[10px] font-black uppercase tracking-widest mb-3 text-slate-400">내 프로필</p>

        <div className="mb-2">
          <p className="text-lg font-black leading-tight text-white">A1</p>
          <span className="text-[10px] font-bold text-amber-400">🪑 3번 C테이블</span>
        </div>

        <div className="flex gap-3 items-start">
          {/* 사진 */}
          <div className="flex-shrink-0 flex flex-col items-center gap-1 pt-[17px]">
            <div className="relative w-32 h-32">
              <div className="w-full h-full rounded-2xl overflow-hidden border-2 border-cyan-500/50 bg-slate-700 flex items-center justify-center">
                <span className="text-5xl">🌙</span>
              </div>
              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-cyan-500 border-2 border-slate-900 flex items-center justify-center shadow">
                <Camera className="w-2.5 h-2.5 text-white" />
              </span>
            </div>
            <span className="text-[9px] font-bold text-slate-400">다크 엔젤</span>
          </div>

          {/* 오른쪽: 2×2 박스 */}
          <div className="flex-1 min-w-0">
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 ml-auto">

              {/* MBTI — 진한 teal 배경 + 흰 텍스트 */}
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] font-black text-white tracking-wide">MBTI</span>
                <div className="w-16 h-14 rounded-2xl flex items-center justify-center" style={{
                  background: 'linear-gradient(135deg,rgba(13,148,136,.85),rgba(6,182,212,.60))',
                  border: '1.5px solid rgba(20,184,166,.70)',
                  boxShadow: '0 0 14px rgba(20,184,166,.30)'
                }}>
                  <span className="text-xs font-black text-white drop-shadow">ENFJ</span>
                </div>
              </div>

              {/* 성향 — 진한 cyan 배경 + 흰 텍스트 */}
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] font-black text-white tracking-wide">성향</span>
                <div className="w-16 h-14 rounded-2xl flex items-center justify-center" style={{
                  background: `linear-gradient(135deg,${posColor}cc,${posColor}88)`,
                  border: `1.5px solid ${posColor}`,
                  boxShadow: `0 0 14px ${posColor}44`
                }}>
                  <span className="text-xs font-black text-white drop-shadow">올탑</span>
                </div>
              </div>

              {/* 돔/섭 — 진한 purple 배경 + 흰 텍스트 */}
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] font-black text-white tracking-wide">돔/섭</span>
                <div className="w-16 h-14 rounded-2xl flex items-center justify-center" style={{
                  background: `linear-gradient(135deg,${domColor}cc,${domColor}88)`,
                  border: `1.5px solid ${domColor}`,
                  boxShadow: `0 0 14px ${domColor}44`
                }}>
                  <span className="text-xs font-black text-white drop-shadow">일반</span>
                </div>
              </div>

              {/* 관심사 — 진한 pink 배경 + 흰 텍스트 */}
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] font-black text-white tracking-wide">관심사</span>
                <div className="w-16 h-14 rounded-2xl flex flex-col items-center justify-center gap-px" style={{
                  background: 'linear-gradient(135deg,rgba(219,39,119,.80),rgba(236,72,153,.55))',
                  border: '1.5px solid rgba(236,72,153,.80)',
                  boxShadow: '0 0 14px rgba(236,72,153,.30)'
                }}>
                  <span className="text-[10px] font-black text-white drop-shadow leading-tight">#운동</span>
                  <span className="text-[10px] font-black text-white drop-shadow leading-tight">#독서</span>
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
