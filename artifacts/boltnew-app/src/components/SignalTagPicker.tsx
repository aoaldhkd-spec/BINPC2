import React from 'react';

/** 이상형·나의 특징 공통 피커: 소분류를 고르고 태그를 입력한 뒤 하단 대분류로 전환 */
type TagGroup = { readonly label: string; readonly tags: readonly string[] };
type SignalRole = 'ideal' | 'features';

const ROLE_OPTIONS: readonly { key: SignalRole; label: string; emoji: string; color: 'rose' | 'violet' }[] = [
  { key: 'ideal', label: '이상형', emoji: '💘', color: 'rose' },
  { key: 'features', label: '나는 어떤 사람인가요?', emoji: '🌟', color: 'violet' },
];

const ROLE_STYLE = {
  rose: { active: 'bg-rose-500 text-white shadow-sm', selected: 'linear-gradient(135deg,#e11d48,#be185d)' },
  violet: { active: 'bg-violet-500 text-white shadow-sm', selected: 'linear-gradient(135deg,#7c3aed,#6d28d9)' },
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
  const active = groups.find((group) => group.label === activeGroup) ?? groups[0];
  const picked = active?.tags.filter((tag) => selected.includes(tag)).length ?? 0;
  const dense = (active?.tags.length ?? 0) > 4;

  return (
    <div className="space-y-3">
      {/* 대분류는 섹션 상단의 full-width segmented control */}
      <div>
        <p className={`mb-1.5 px-1 text-[11px] font-black ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>대분류</p>
        <div className={`grid grid-cols-2 gap-1 rounded-xl p-1 ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-gray-100 border border-gray-200'}`} aria-label="성향 대분류 선택">
          {ROLE_OPTIONS.map((option) => {
            const activeRole = role === option.key;
            const count = option.key === 'ideal' ? idealSelected.length : featureSelected.length;
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={activeRole}
                onClick={() => setRole(option.key)}
                className={`min-h-[44px] rounded-lg px-2 py-2 text-xs font-black transition-all ${activeRole ? ROLE_STYLE[option.color].active : darkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-gray-600 hover:bg-white'}`}
              >
                {option.emoji} <span>{option.label}</span>{count > 0 && <span className="ml-1 text-[9px] opacity-80">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>
      {/* 소분류는 plain navigation; 별도 카드 없음 */}
      <div>
        <p className={`mb-1.5 px-1 text-[11px] font-black ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>소분류</p>
        <div className="flex flex-wrap gap-1.5" aria-label="성향 소분류 선택">
          {groups.map((group) => {
            const count = group.tags.filter((tag) => selected.includes(tag)).length;
            const selectedGroup = activeGroup === group.label;
            return (
              <button
                key={group.label}
                type="button"
                aria-pressed={selectedGroup}
                onClick={() => setActiveGroup(group.label)}
                className={`rounded-lg border px-3 py-2 text-xs font-bold transition-all ${selectedGroup ? 'border-cyan-500 bg-cyan-500 text-white shadow-sm' : darkMode ? 'border-slate-600 bg-slate-800 text-slate-300' : 'border-gray-200 bg-white text-gray-600 hover:border-cyan-300'}`}
              >
                {group.label}{count > 0 && <span className="ml-1 text-[9px]">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* 태그 내용만 하나의 패널로 묶음 */}
      <div className={`rounded-2xl border p-3 ${darkMode ? 'border-slate-600/80 bg-slate-800/45' : 'border-gray-200 bg-white shadow-sm shadow-gray-100/60'}`}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className={`text-xs font-black ${darkMode ? 'text-slate-200' : 'text-gray-800'}`}>{active?.label ?? '소분류'}</p>
          {picked > 0 && <span className={`text-[10px] font-bold ${darkMode ? 'text-cyan-400' : 'text-teal-600'}`}>{picked}개 선택</span>}
        </div>
        <div className={`grid gap-1.5 ${dense ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {(active?.tags ?? []).map((tag) => {
            const on = selected.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(role, tag)}
                className={`min-h-[38px] rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold leading-tight text-center transition-all active:scale-[0.97] ${on ? 'text-white border-transparent shadow-sm ring-2 ring-cyan-400/35' : darkMode ? 'text-slate-300 border-slate-600/80 bg-slate-800/60 hover:border-cyan-400/40' : 'text-gray-600 border-gray-200 bg-white hover:border-cyan-300 hover:bg-cyan-50/50'}`}
                style={on ? { background: ROLE_STYLE[roleOption.color].selected } : undefined}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
}
