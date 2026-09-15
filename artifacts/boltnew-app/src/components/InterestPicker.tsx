import { useState } from 'react';
import { BIO_CATEGORIES, BIO_CATEGORY_GROUPS, getInterestTagStyle } from '../lib/interests';

const CAT_EMOJI: Record<string, string> = {
  '뜨밤 & 기타': '🔥',
  '스포츠/활동': '⚽',
  '음식/음주': '🍻',
  '취미/라이프': '🌿',
  '엔터/미디어': '🎬',
  '여가/사교': '🎉',
};

const GROUP_EMOJI: Record<string, string> = {
  '활동·라이프': '🏃',
  '엔터·사교·기타': '🎬',
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
  filter?: string;
  onFilter?: (label: string) => void;
  max?: number;
  darkMode?: boolean;
}) {
  const defaultGroup = BIO_CATEGORY_GROUPS[0];
  const [internalFilter, setInternalFilter] = useState(defaultGroup.label);
  const activeGroup = BIO_CATEGORY_GROUPS.find((group) => group.label === (filter ?? internalFilter)) ?? defaultGroup;
  const atMax = selected.length >= max;

  const selectGroup = (label: string) => {
    setInternalFilter(label);
    onFilter?.(label);
  };

  const renderCategory = (cat: (typeof BIO_CATEGORIES)[number]) => {
    const count = cat.tags.filter((tag) => selected.includes(tag)).length;
    return (
      <div key={cat.label} className={`px-1 pb-2 ${darkMode ? 'border-slate-700' : 'border-gray-100'} border-b last:border-b-0`}>
        <div className="flex items-center justify-between gap-1 mb-1">
          <p className={`text-[13px] font-black tracking-tight ${darkMode ? 'text-slate-200' : cat.color.label}`}>
            {CAT_EMOJI[cat.label] ?? ''} {cat.label}
          </p>
          {count > 0 && <span className={`text-[11px] font-bold tabular-nums ${darkMode ? 'text-cyan-400' : 'text-teal-600'}`}>{count}개</span>}
        </div>
        <div className="flex flex-wrap gap-1.5">
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
                className={`min-h-[42px] px-3 py-2 rounded-lg text-[13px] font-bold leading-tight border whitespace-nowrap transition-all active:scale-95 ${selectedTag ? `${cat.color.selected} border-transparent shadow-sm` : disabled ? darkMode ? 'bg-slate-800 text-slate-600 border-slate-700 cursor-not-allowed' : 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed' : darkMode ? `bg-slate-800/80 border-slate-600 ${cat.color.label} hover:border-current` : cat.color.normal}`}
              >
                {tag === '뜨밤' && <span className="mr-0.5">🔥</span>}{tag}
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
        <div className={`flex flex-wrap gap-1 p-2 rounded-xl border ${darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-cyan-50/40 border-cyan-100'}`}>
          <p className={`w-full text-[10px] font-black tracking-widest uppercase ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>선택한 관심사</p>
          {selected.map((tag) => {
            const style = getInterestTagStyle(tag);
            return (
              <button key={tag} type="button" onClick={() => onToggle(tag)} className="inline-flex items-center gap-1 min-h-[42px] px-3.5 py-2 rounded-full text-sm font-black border transition-all active:scale-95" style={{ background: style.bg, color: style.text, borderColor: style.border }}>
                {tag === '뜨밤' && <span>🔥</span>}{tag}<span className="opacity-50 text-[10px] ml-0.5">×</span>
              </button>
            );
          })}
        </div>
      )}

      <div className={`grid grid-cols-2 gap-1 rounded-xl p-1 ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-gray-100 border border-gray-200'}`} aria-label="관심사 대분류 선택">
        {BIO_CATEGORY_GROUPS.map((group) => {
          const active = group.label === activeGroup.label;
          const count = group.categories.flatMap((label) => BIO_CATEGORIES.find((cat) => cat.label === label)?.tags ?? []).filter((tag) => selected.includes(tag)).length;
          return (
            <button key={group.label} type="button" aria-pressed={active} onClick={() => selectGroup(group.label)} className={`flex min-h-[44px] items-center justify-center gap-1 rounded-lg px-2 py-2 text-[13px] font-black transition-all ${active ? 'bg-cyan-500 text-white shadow-sm' : darkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-gray-600 hover:bg-white'}`}>
              {GROUP_EMOJI[group.label] ?? ''} {group.label}{count > 0 && <span className="rounded-full bg-white/25 px-1 text-[9px]">{count}</span>}
            </button>
          );
        })}
      </div>

      <div className={`rounded-xl border overflow-hidden ${darkMode ? 'border-slate-700 bg-slate-800/35' : 'border-gray-200 bg-white'}`}>
        <div className={`flex items-center justify-between px-3 py-2 ${darkMode ? 'bg-slate-800/70' : 'bg-gray-50'}`}>
          <span className="text-sm font-black text-gray-800">{GROUP_EMOJI[activeGroup.label] ?? ''} {activeGroup.label}</span>
          <span className={`text-[10px] font-semibold ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>{selected.length}/{max}</span>
        </div>
        <div className="space-y-1 p-2">
          {activeGroup.categories.map((label) => {
            const cat = BIO_CATEGORIES.find((item) => item.label === label);
            return cat ? renderCategory(cat) : null;
          })}
        </div>
      </div>
    </div>
  );
}
