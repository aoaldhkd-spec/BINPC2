import { useState } from 'react';
import { Check } from 'lucide-react';
import { useTheme, type ThemeMode } from '../lib/theme';

const THEMES: {
  mode: ThemeMode;
  emoji: string;
  label: string;
  desc: string;
  fab: { bg: string; text: string; border: string; glow: string };
  panel: { bg: string; border: string; header: string; headerText: string };
  item: { active: string; hover: string; activeText: string; text: string; subText: string };
  dot: { bg: string; accent: string };
}[] = [
  {
    mode: 'default',
    emoji: '🌙',
    label: 'Default',
    desc: '기본 다크 UI',
    fab: { bg: 'linear-gradient(135deg,#0f172a,#1e293b)', text: '#5eead4', border: '#14b8a6', glow: 'rgba(20,184,166,0.45)' },
    panel: { bg: '#0f172a', border: 'rgba(20,184,166,0.3)', header: 'rgba(20,184,166,0.08)', headerText: '#5eead4' },
    item: { active: 'rgba(20,184,166,0.15)', hover: 'rgba(255,255,255,0.05)', activeText: '#5eead4', text: '#e2e8f0', subText: '#64748b' },
    dot: { bg: '#1e293b', accent: '#14b8a6' },
  },
  {
    mode: 'y2k',
    emoji: '💖',
    label: 'Y2K 서울',
    desc: '트렌디 팝 네오브루탈',
    fab: { bg: '#6ee7b7', text: '#18181b', border: '#18181b', glow: 'rgba(110,231,183,0.5)' },
    panel: { bg: '#ffffff', border: '#18181b', header: '#f4f4f5', headerText: '#18181b' },
    item: { active: 'rgba(110,231,183,0.2)', hover: '#f4f4f5', activeText: '#059669', text: '#18181b', subText: '#71717a' },
    dot: { bg: '#FCFCFB', accent: '#6ee7b7' },
  },
  {
    mode: 'dark-neon',
    emoji: '🔥',
    label: 'Dark Neon',
    desc: '틱톡/릴스 다크 네온',
    fab: { bg: 'linear-gradient(135deg,#ec4899,#8b5cf6)', text: '#ffffff', border: '#f472b6', glow: 'rgba(236,72,153,0.55)' },
    panel: { bg: '#09090b', border: 'rgba(236,72,153,0.35)', header: 'rgba(236,72,153,0.08)', headerText: '#f472b6' },
    item: { active: 'rgba(236,72,153,0.15)', hover: 'rgba(255,255,255,0.04)', activeText: '#f472b6', text: '#f4f4f5', subText: '#52525b' },
    dot: { bg: '#09090b', accent: '#ec4899' },
  },
  {
    mode: 'minimal',
    emoji: '☕',
    label: 'Minimal Chic',
    desc: '감성 매거진 미니멀',
    fab: { bg: '#09090b', text: '#F9F8F6', border: '#09090b', glow: 'rgba(9,9,11,0.25)' },
    panel: { bg: '#F9F8F6', border: '#09090b', header: '#e5e5e0', headerText: '#09090b' },
    item: { active: 'rgba(9,9,11,0.08)', hover: '#f0ede8', activeText: '#09090b', text: '#09090b', subText: '#71717a' },
    dot: { bg: '#F9F8F6', accent: '#09090b' },
  },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  const current = THEMES.find(t => t.mode === theme) ?? THEMES[0];
  const isY2k = theme === 'y2k';
  const isMinimal = theme === 'minimal';

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-[9997]" onClick={() => setOpen(false)} />
      )}

      {/* Panel */}
      {open && (
        <div
          className="theme-switcher-panel fixed bottom-[4.5rem] left-3 z-[9998] w-64 overflow-hidden"
          style={{
            background: current.panel.bg,
            border: `${isY2k || isMinimal ? '2px' : '1px'} solid ${current.panel.border}`,
            borderRadius: isMinimal ? '0' : '1rem',
            boxShadow: isY2k
              ? `4px 4px 0px 0px #18181b`
              : isMinimal
              ? 'none'
              : `0 20px 60px -10px rgba(0,0,0,0.7), 0 0 0 1px ${current.panel.border}`,
          }}
        >
          {/* Header */}
          <div
            className="px-4 py-2.5 flex items-center gap-2"
            style={{ background: current.panel.header, borderBottom: `1px solid ${current.panel.border}40` }}
          >
            <span style={{ fontSize: '13px' }}>{current.emoji}</span>
            <p
              className="text-[10px] font-black uppercase tracking-widest"
              style={{ color: current.panel.headerText }}
            >
              디자인 모드
            </p>
          </div>

          {/* Items */}
          <div className="p-1.5 space-y-0.5">
            {THEMES.map(t => {
              const active = theme === t.mode;
              return (
                <button
                  key={t.mode}
                  onClick={() => { setTheme(t.mode); setOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all duration-100"
                  style={{
                    background: active ? t.item.active : 'transparent',
                    borderRadius: isMinimal ? '0' : '0.625rem',
                    border: active && isY2k ? '1px solid #18181b' : '1px solid transparent',
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = t.item.hover; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = active ? t.item.active : 'transparent'; }}
                >
                  {/* Swatch */}
                  <div
                    className="w-8 h-8 flex-shrink-0 flex items-center justify-center"
                    style={{
                      background: t.dot.bg,
                      border: `2px solid ${t.dot.accent}`,
                      borderRadius: isMinimal ? '0' : '0.5rem',
                      boxShadow: t.mode === 'dark-neon' ? `0 0 8px ${t.dot.accent}60` : 'none',
                    }}
                  >
                    <span style={{ fontSize: '14px', lineHeight: 1 }}>{t.emoji}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold leading-tight" style={{ color: active ? t.item.activeText : current.item.text }}>
                      {t.label}
                    </p>
                    <p className="text-[10px] leading-tight mt-0.5 truncate" style={{ color: current.item.subText }}>
                      {t.desc}
                    </p>
                  </div>

                  {active && (
                    <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.item.activeText }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* FAB — 테마별 스타일 */}
      <button
        onClick={() => setOpen(p => !p)}
        className="theme-switcher-btn fixed bottom-5 left-3 z-[9998] flex items-center gap-1.5 transition-all duration-150 active:scale-90"
        style={{
          background: current.fab.bg,
          color: current.fab.text,
          border: `${isY2k || isMinimal ? '2px' : '1.5px'} solid ${current.fab.border}`,
          borderRadius: isMinimal ? '0' : '9999px',
          padding: '7px 14px 7px 10px',
          boxShadow: isY2k
            ? `2px 2px 0px 0px #18181b`
            : isMinimal
            ? 'none'
            : `0 0 16px ${current.fab.glow}, 0 2px 8px rgba(0,0,0,0.3)`,
          fontSize: '12px',
          fontWeight: 800,
          letterSpacing: isMinimal ? '0.08em' : '0',
          textTransform: isMinimal ? 'uppercase' : 'none',
        }}
        aria-label="디자인 모드 변경"
      >
        <span style={{ fontSize: '15px', lineHeight: 1 }}>{current.emoji}</span>
        <span>테마</span>
      </button>
    </>
  );
}
