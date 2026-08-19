/** 이상형·나의 특징 칩 피커 — 그룹별 카드 + 2열 그리드 */

type TagGroup = { readonly label: string; readonly tags: readonly string[] };

type Accent = 'rose' | 'violet';

const ACCENT: Record<Accent, { grad: string; idleDark: string; idleLight: string; ring: string }> = {
  rose: {
    grad: 'linear-gradient(135deg,#e11d48,#be185d)',
    idleDark: 'text-slate-300 border-slate-600/80 bg-slate-800/60 hover:border-rose-400/40',
    idleLight: 'text-gray-600 border-gray-200 bg-white hover:border-rose-300 hover:bg-rose-50/50',
    ring: 'ring-rose-400/35',
  },
  violet: {
    grad: 'linear-gradient(135deg,#7c3aed,#6d28d9)',
    idleDark: 'text-slate-300 border-slate-600/80 bg-slate-800/60 hover:border-violet-400/40',
    idleLight: 'text-gray-600 border-gray-200 bg-white hover:border-violet-300 hover:bg-violet-50/50',
    ring: 'ring-violet-400/35',
  },
};

export function SignalTagPicker({
  groups,
  selected,
  onToggle,
  accent,
  darkMode,
}: {
  groups: readonly TagGroup[];
  selected: string[];
  onToggle: (tag: string) => void;
  accent: Accent;
  darkMode?: boolean;
}) {
  const pal = ACCENT[accent];

  return (
    <div className="space-y-2.5">
      {groups.map((group) => {
        const picked = group.tags.filter((t) => selected.includes(t)).length;
        const dense = group.tags.length > 4;
        return (
          <div
            key={group.label}
            className={`rounded-xl border px-3 py-2.5 ${
              darkMode ? 'border-slate-600/70 bg-slate-800/35' : 'border-gray-200/90 bg-white shadow-sm shadow-gray-100/60'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className={`text-[11px] font-bold tracking-tight ${darkMode ? 'text-slate-200' : 'text-gray-800'}`}>
                {group.label}
              </p>
              {picked > 0 && (
                <span className={`text-[10px] font-bold tabular-nums ${darkMode ? 'text-cyan-400' : 'text-teal-600'}`}>
                  {picked}개
                </span>
              )}
            </div>
            <div className={`grid gap-1.5 ${dense ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {group.tags.map((tag) => {
                const on = selected.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => onToggle(tag)}
                    className={`min-h-[34px] px-2.5 py-1.5 rounded-lg text-[11px] font-semibold leading-tight border text-center transition-all active:scale-[0.97] ${
                      on
                        ? `text-white border-transparent shadow-sm ring-2 ${pal.ring}`
                        : darkMode
                          ? pal.idleDark
                          : pal.idleLight
                    }`}
                    style={on ? { background: pal.grad } : undefined}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
