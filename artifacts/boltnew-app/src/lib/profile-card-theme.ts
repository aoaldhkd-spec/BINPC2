import type { CSSProperties } from 'react';
import type { ThemeMode } from './theme';

/** MainScreen dark cards use slate-800/900 — match without neon glow */
const DARK_SHELL = 'bg-slate-900 border-slate-700';
const LIGHT_SHELL = 'bg-white border-gray-100';

export type ProfileCardSurfaces = {
  shellClass: string;
  metaClass: string;
  nickBarStyle: CSSProperties;
  nickTextClass: string;
  ageTextClass: string;
};

/**
 * ProfileCard surface dark gate — separate from app chrome `isDarkTheme`.
 * - default: always light card (even if App darkMode is on)
 * - dark-neon: always dark card
 * - y2k / minimal: dark only when App darkMode is on
 */
export function isProfileCardDark(theme: ThemeMode, darkMode = false): boolean {
  if (theme === 'default') return false;
  if (theme === 'dark-neon') return true;
  return darkMode;
}

/** Uses isProfileCardDark — not isDarkTheme (default chrome stays dark, cards stay white). */
export function profileCardSurfaces(theme: ThemeMode, darkMode = false): ProfileCardSurfaces {
  if (!isProfileCardDark(theme, darkMode)) {
    return {
      shellClass: LIGHT_SHELL,
      metaClass: 'bg-white',
      nickBarStyle: {
        background: 'rgba(255,255,255,0.94)',
        borderTop: '1px solid rgba(229,231,235,0.95)',
        boxShadow: '0 -2px 8px rgba(0,0,0,0.07)',
      },
      nickTextClass: 'text-gray-950',
      ageTextClass: 'text-gray-600',
    };
  }
  return {
    shellClass: DARK_SHELL,
    metaClass: 'bg-slate-900',
    nickBarStyle: {
      background: 'rgba(15,23,42,0.92)',
      borderTop: '1px solid rgba(51,65,85,0.9)',
      boxShadow: '0 -2px 8px rgba(0,0,0,0.28)',
    },
    nickTextClass: 'text-slate-100',
    ageTextClass: 'text-slate-400',
  };
}

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6 || Number.isNaN(Number.parseInt(h, 16))) return hex;
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

type ChipLike = { bg: string; border: string; text?: string; color?: string };

/** Pastel chip fills → muted translucent accents on dark card surfaces */
export function profileCardChipStyle(style: ChipLike, dark: boolean): CSSProperties {
  const accent = style.text ?? style.color ?? '#94a3b8';
  if (!dark) {
    return { backgroundColor: style.bg, color: accent, borderColor: style.border };
  }
  return {
    backgroundColor: withAlpha(accent, 0.18),
    color: style.border,
    borderColor: withAlpha(style.border, 0.55),
  };
}

export function profileCardShellIsWhite(theme: ThemeMode, darkMode = false): boolean {
  return profileCardSurfaces(theme, darkMode).shellClass.includes('bg-white');
}
