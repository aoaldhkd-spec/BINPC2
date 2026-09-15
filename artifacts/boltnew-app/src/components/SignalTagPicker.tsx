import React from 'react';

/** 이상형·나의 특징 공통 소분류 피커 */

type TagGroup = { readonly label: string; readonly tags: readonly string[] };
type SignalRole = 'ideal' | 'features';

const ROLE_OPTIONS: readonly { key: SignalRole; label: string; emoji: string; color: 'rose' | 'violet' }[] = [
  { key: 'ideal', label: '이상형', emoji: '💘', color: 'rose' },
  { key: 'features', label: '나는 어떤 사람인가요?', emoji: '🌟', color: 'violet' },
];

const ROLE_STYLE = {
  rose: {
    active: 'bg-rose-500 text-white border-rose-500 shadow-sm',
    idle: 'text-rose-600 border-rose-200 bg-white hover:bg-rose-50',
    selected: 'linear-gradient(135deg,#e11d48,#be185d)',
  },
  violet: {
    active: 'bg-violet-500 text-white border-violet-500 shadow-sm',
    idle: 'text-violet-600 border-violet-200 bg-white hover:bg-violet-50',
    selected: 'linear-gradient(135deg,#7c3aed,#6d28d9)',
  },
} as const;

export function SignalTagPicker({
  groups,
  idealSelected,
  featureSelected,
  onToggle,
  darkMode = false,
}: {
  groups: readonly TagGroup[];
  idealSelected: string[];
  featureSelected: string[];
  onToggle: (role: SignalRole, tag: string) => void;
  darkMode?: boolean;
}) {
  const [role, setRole] = React.useState<SignalRole>('ideal');
  const [activeGroup, setActiveGroup] = React.useState<string>(groups[0]?.label ?? '');
  const selected = role === 'ideal' ? idealSelected : featureSelected;
  const roleOption = ROLE_OPTIONS.find((option) => option.key === role) ?? ROLE_OPTIONS[0];
  const visibleGroups = groups.filter((group) => group.label === activeGroup);

  return (
    <div className="space-y-2.5">
      <div className={`space-y-1 ${darkMode ? 'border-b border-slate-700' : 'border-b border-gray-200'} pb-2`}>
        <div className="flex items-center gap-2 px-1 mb-1.5">
          <span className={`text-[10px] font-black tracking-wide ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>대분류</span>
        <span className={`min-w-0 truncate text-[10px] font-semibold ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
          먼저 이상형 또는 나는 어떤 사람인가요?를 선택하세요
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5" aria-label="성향 대분류 선택">
        {ROLE_OPTIONS.map((option) => {
          const active = role === option.key;
          const count = option.key === 'ideal' ? idealSelected.length : featureSelected.length;
          const style = ROLE_STYLE[option.color];
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={active}
              onClick={() => setRole(option.key)}
              className={`inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-black transition-all ${active ? style.active : darkMode ? 'border-slate-600 bg-slate-800 text-slate-300' : style.idle}`}
            >
              <span>{option.emoji}</span><span>{option.label}</span>
              {count > 0 && <span className="rounded-full bg-white/25 px-1 text-[9px]">{count}</span>}
            </button>
          );
        })}
      </div>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2 px-1 mb-1.5">
          <span className={`text-[10px] font-black tracking-wide ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>소분류</span>
        <span className={`min-w-0 truncate text-[10px] font-semibold ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
          선택한 대분류의 세부 조건
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5" aria-label="성향 소분류 선택">
        {groups.map((group) => {
          const active = activeGroup === group.label;
          const count = group.tags.filter((tag) => selected.includes(tag)).length;
          return (
            <button
              key={group.label}
              type="button"
              aria-pressed={active}
              onClick={() => setActiveGroup(group.label)}
              className={`rounded-lg border px-3 py-2 text-xs font-bold transition-all ${active ? 'border-cyan-500 bg-cyan-500 text-white shadow-sm' : darkMode ? 'border-slate-600 bg-slate-800 text-slate-300' : 'border-gray-200 bg-white text-gray-600 hover:border-cyan-300'}`}
            >
              {group.label}{count > 0 && <span className="ml-1 text-[9px]">{count}</span>}
            </button>
          );
        })}
        </div>
      </div>
      <p className={`px-1 text-[10px] ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
        {roleOption.label} · {activeGroup || '소분류'}
      </p>
      <div className={`rounded-xl border p-2.5 ${darkMode ? 'border-slate-600/70 bg-slate-800/35' : 'border-gray-200/90 bg-white shadow-sm shadow-gray-100/60'}`}>
        {visibleGroups.map((group) => {
          const picked = group.tags.filter((tag) => selected.includes(tag)).length;
          const dense = group.tags.length > 4;
          return (
            <div key={group.label} className={`px-1 py-1 ${darkMode ? 'border-slate-700' : 'border-gray-100'} ${visibleGroups.length > 1 ? 'border-b last:border-b-0' : ''}`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className={`text-[11px] font-bold tracking-tight ${darkMode ? 'text-slate-200' : 'text-gray-800'}`}>{group.label}</p>
                {picked > 0 && <span className={`text-[10px] font-bold tabular-nums ${darkMode ? 'text-cyan-400' : 'text-teal-600'}`}>{picked}개</span>}
              </div>
              <div className={`grid gap-1.5 ${dense ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {group.tags.map((tag) => {
                  const on = selected.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={on}
                      onClick={() => onToggle(role, tag)}
                      className={`min-h-[34px] px-2.5 py-1.5 rounded-lg text-[11px] font-semibold leading-tight border text-center transition-all active:scale-[0.97] ${on ? 'text-white border-transparent shadow-sm ring-2 ring-cyan-400/35' : darkMode ? 'text-slate-300 border-slate-600/80 bg-slate-800/60 hover:border-cyan-400/40' : 'text-gray-600 border-gray-200 bg-white hover:border-cyan-300 hover:bg-cyan-50/50'}`}
                      style={on ? { background: ROLE_STYLE[roleOption.color].selected } : undefined}
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
    </div>
  );
}
