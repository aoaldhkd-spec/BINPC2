// ─── ProfileScoreBar ──────────────────────────────────────────────────────────
// 성향(포지션/돔섭) 점수를 가로 바로 표시하는 컴포넌트

function ProfileScoreBar({ label, score, getLabel, getBg, leftText, rightText }: {
  label: string; score: number | null;
  getLabel: (v: number | null) => string;
  getBg: (v: number | null) => string;
  leftText: string; rightText: string;
}) {
  const bg = getBg(score);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
        <span className="px-2.5 py-0.5 rounded-full text-white font-bold text-xs" style={{ background: bg }}>
          {getLabel(score)}
        </span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${score ?? 0}%`, background: bg }} />
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1 font-medium">
        <span>{leftText}</span>
        <span>{rightText}</span>
      </div>
    </div>
  );
}

export default ProfileScoreBar;
