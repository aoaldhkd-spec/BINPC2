import { BIO_CATEGORIES, BIO_CATEGORY_GROUPS, getInterestTagStyle } from '../lib/interests';

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
  max = 5,
  darkMode = false,
}: {
  selected: string[];
  onToggle: (tag: string) => void;
  max?: number;
  darkMode?: boolean;
}) {
  const atMax = selected.length >= max;

  const renderCategory = (cat: (typeof BIO_CATEGORIES)[number]) => {
    const count = cat.tags.filter((tag) => selected.includes(tag)).length;
    return (
      <div
        key={cat.label}
        className={`rounded-xl border px-2.5 py-2 ${
          darkMode
            ? 'border-slate-600/70 bg-slate-800/45'
            : `${cat.color.border} bg-white shadow-sm shadow-gray-100/50`
        }`}
      >
        <div className="flex items-center justify-between gap-1 mb-1.5">
          <p className={`text-[10px] font-black tracking-tight ${darkMode ? 'text-slate-200' : cat.color.label}`}>
            {CAT_EMOJI[cat.label] ?? ''} {cat.label}
          </p>
          {count > 0 && (
            <span className={`text-[9px] font-bold tabular-nums ${darkMode ? 'text-cyan-400' : 'text-teal-600'}`}>
              {count}개
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {cat.tags.map((tag) => {
            const selectedTag = selected.includes(tag);
            const disabled = !selectedTag && atMax;
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={selectedTag}
                onClick={() => onToggle(tag)}
                disabled={disabled}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold leading-tight border whitespace-nowrap transition-all active:scale-95 ${
                  selectedTag
                    ? `${cat.color.selected} border-transparent shadow-sm`
                    : disabled
                      ? darkMode
                        ? 'bg-slate-800 text-slate-600 border-slate-700 cursor-not-allowed'
                        : 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                      : darkMode
                        ? `bg-slate-800/80 border-slate-600 ${cat.color.label} hover:border-current`
                        : cat.color.normal
                }`}
              >
                {tag === '뜨밤' && <span className="mr-0.5">🔥</span>}
                {tag}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2.5">
      {selected.length > 0 && (
        <div className={`flex flex-wrap gap-1.5 p-2.5 rounded-2xl border ${
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
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black border transition-all active:scale-95"
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

      {BIO_CATEGORY_GROUPS.map((group) => (
        <section key={group.label} className={`rounded-xl p-1.5 ${darkMode ? 'bg-slate-900/35' : 'bg-gray-50/80'}`}>
          <p className={`px-1 mb-1.5 text-[9px] font-black tracking-wide ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
            {group.label}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
            {group.categories.map((label) => {
              const cat = BIO_CATEGORIES.find((item) => item.label === label);
              return cat ? renderCategory(cat) : null;
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
