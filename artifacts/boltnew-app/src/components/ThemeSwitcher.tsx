import { useState } from 'react';
import { Palette, Check } from 'lucide-react';
import { useTheme, type ThemeMode } from '../lib/theme';

const THEMES: { mode: ThemeMode; emoji: string; label: string; desc: string; previewBg: string; previewAccent: string }[] = [
  {
    mode: 'default',
    emoji: '🌙',
    label: 'Default',
    desc: '기본 다크 UI',
    previewBg: '#1e293b',
    previewAccent: '#14b8a6',
  },
  {
    mode: 'y2k',
    emoji: '💖',
    label: 'Y2K 서울',
    desc: '트렌디 팝 네오브루탈',
    previewBg: '#FCFCFB',
    previewAccent: '#6ee7b7',
  },
  {
    mode: 'dark-neon',
    emoji: '🔥',
    label: 'Dark Neon',
    desc: '틱톡/릴스 다크 네온',
    previewBg: '#09090b',
    previewAccent: '#ec4899',
  },
  {
    mode: 'minimal',
    emoji: '☕',
    label: 'Minimal Chic',
    desc: '감성 매거진 미니멀',
    previewBg: '#F9F8F6',
    previewAccent: '#09090b',
  },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  const current = THEMES.find(t => t.mode === theme) ?? THEMES[0];

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[9997]"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Panel */}
      {open && (
        <div
          className="theme-switcher-panel fixed bottom-20 left-3 z-[9998] w-60 rounded-2xl border border-slate-700/80 bg-slate-900/95 backdrop-blur-xl shadow-2xl overflow-hidden"
          style={{ boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)' }}
        >
          <div className="px-4 py-3 border-b border-slate-700/60">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">디자인 모드 선택</p>
          </div>
          <div className="p-2 space-y-1">
            {THEMES.map(t => {
              const active = theme === t.mode;
              return (
                <button
                  key={t.mode}
                  onClick={() => { setTheme(t.mode); setOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 ${
                    active
                      ? 'bg-teal-500/15 border border-teal-500/30'
                      : 'hover:bg-slate-800 border border-transparent'
                  }`}
                >
                  {/* Color preview dot */}
                  <div
                    className="w-8 h-8 rounded-lg flex-shrink-0 border border-white/10 flex items-center justify-center text-sm"
                    style={{ background: t.previewBg }}
                  >
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ background: t.previewAccent }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold leading-tight ${active ? 'text-teal-300' : 'text-slate-200'}`}>
                      {t.emoji} {t.label}
                    </p>
                    <p className="text-[10px] text-slate-500 leading-tight mt-0.5 truncate">{t.desc}</p>
                  </div>
                  {active && <Check className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setOpen(p => !p)}
        className="theme-switcher-btn fixed bottom-6 left-3 z-[9998] w-11 h-11 rounded-full flex items-center justify-center shadow-xl transition-all duration-150 active:scale-90"
        style={{
          background: current.previewBg === '#FCFCFB' || current.previewBg === '#F9F8F6'
            ? '#18181b'
            : current.previewBg,
          border: `2px solid ${current.previewAccent}`,
          boxShadow: `0 0 12px ${current.previewAccent}60`,
        }}
        title="디자인 모드 변경"
        aria-label="디자인 모드 변경"
      >
        <Palette className="w-4.5 h-4.5" style={{ color: current.previewAccent }} />
      </button>
    </>
  );
}
