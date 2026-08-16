import { BIO_CATEGORIES, getInterestTagStyle } from '../lib/interests';

const CAT_EMOJI: Record<string, string> = {
  '뜨밤 & 기타': '🔥',
  '스포츠/활동': '⚽',
  '음식/음주': '🍻',
  '취미/라이프': '🌿',
  '엔터/미디어': '🎬',
  '여가/사교': '🎉',
};

export function InterestPicker({
  selected,
  onToggle,
  filter,
  onFilter,
  max = 5,
  darkMode = false,
}: {
  selected: string[];
  onToggle: (tag: string) => void;
  filter: string;
  onFilter: (label: string) => void;
  max?: number;
  darkMode?: boolean;
}) {
  const atMax = selected.length >= max;
  const activeCat = BIO_CATEGORIES.find((c) => c.label === filter) ?? BIO_CATEGORIES[0];
  const activeSelected = activeCat.tags.filter((t) => selected.includes(t)).length;

  return (
    <div className="space-y-3">
      {selected.length > 0 && (
        <div className={`flex flex-wrap gap-2 p-3 rounded-2xl border ${
          darkMode ? 'bg-slate-800/70 border-slate-600' : 'bg-white border-cyan-100'
        }`}>
          <p className={`w-full text-[10px] font-black tracking-widest uppercase ${
            darkMode ? 'text-slate-500' : 'text-gray-400'
          }`}>선택한 관심사</p>
          {selected.map((tag) => {
            const style = getInterestTagStyle(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => onToggle(tag)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-black border transition-all active:scale-95"
                style={{ background: style.bg, color: style.text, borderColor: style.border }}
              >
                {tag === '뜨밤' && <span>🔥</span>}
                {tag}
                <span className="opacity-50 text-[10px] ml-0.5">×</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5 -mx-0.5 px-0.5">
        {BIO_CATEGORIES.map((cat) => {
          const active = filter === cat.label;
          const count = cat.tags.filter((t) => selected.includes(t)).length;
          return (
            <button
              key={cat.label}
              type="button"
              onClick={() => onFilter(cat.label)}
              className={`relative flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-black border transition-all whitespace-nowrap ${
                active
                  ? `${cat.color.selected} border-transparent shadow-sm`
                  : darkMode
                    ? `bg-slate-800 border-slate-600 ${cat.color.label}`
                    : `bg-white border-gray-200 ${cat.color.label}`
              }`}
            >
              <span>{CAT_EMOJI[cat.label] ?? ''}</span>
              {cat.label}
              {count > 0 && (
                <span className={`min-w-[16px] h-4 px-1 rounded-full text-[9px] font-black leading-4 text-center ${
                  active ? 'bg-white/25 text-white' : 'bg-cyan-500 text-white'
                }`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className={`rounded-2xl border overflow-hidden ${
        darkMode ? 'border-slate-600 bg-slate-800/40' : `${activeCat.color.border} bg-white`
      }`}>
        <div className={`flex items-center justify-between px-3.5 py-2 ${
          darkMode ? 'bg-slate-800' : activeCat.color.bg
        }`}>
          <span className={`text-[11px] font-black ${darkMode ? 'text-slate-300' : activeCat.color.label}`}>
            {CAT_EMOJI[activeCat.label]} {activeCat.label}
          </span>
          <span className={`text-[10px] font-bold ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
            {activeSelected > 0 ? `${activeSelected}개 선택` : '탭해서 선택'}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 p-3">
          {activeCat.tags.map((tag) => {
            const selectedTag = selected.includes(tag);
            const disabled = !selectedTag && atMax;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => onToggle(tag)}
                disabled={disabled}
                className={`px-3.5 py-2 rounded-full text-[13px] font-bold border transition-all active:scale-95 ${
                  selectedTag
                    ? `${activeCat.color.selected} border-transparent shadow-sm`
                    : disabled
                      ? darkMode
                        ? 'bg-slate-800 text-slate-600 border-slate-700 cursor-not-allowed'
                        : 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                      : darkMode
                        ? `bg-slate-800/80 border-slate-600 ${activeCat.color.label} hover:border-current`
                        : activeCat.color.normal
                }`}
              >
                {tag === '뜨밤' && <span className="mr-1">🔥</span>}
                {tag}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
