import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'default' | 'y2k' | 'dark-neon' | 'minimal';

const THEME_KEY = 'app_theme_mode_v1';

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'default',
  setTheme: () => {},
});

// CSS Custom Property 값 — JS에서 직접 주입해 !important 없이도 인라인 스타일 우선순위 확보
const THEME_VARS: Record<ThemeMode, Record<string, string>> = {
  default: {},
  y2k: {
    '--t-bg':      '#FCFCFB',
    '--t-surface': '#ffffff',
    '--t-text':    '#18181b',
    '--t-accent':  '#10b981',
    '--t-border':  '#e5e7eb',
  },
  'dark-neon': {
    '--t-bg':      '#000000',
    '--t-surface': '#09090b',
    '--t-text':    '#ffffff',
    '--t-accent':  '#f472b6',
    '--t-border':  '#27272a',
  },
  minimal: {
    '--t-bg':      '#F9F8F6',
    '--t-surface': '#ffffff',
    '--t-text':    '#09090b',
    '--t-accent':  '#18181b',
    '--t-border':  '#e5e7eb',
  },
};

const ALL_THEME_VARS = ['--t-bg', '--t-surface', '--t-text', '--t-accent', '--t-border'] as const;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'default' || saved === 'y2k' || saved === 'dark-neon' || saved === 'minimal') return saved as ThemeMode;
    } catch { /* ignore */ }
    return 'default';
  });

  useEffect(() => {
    const html = document.documentElement;
    // 1) data-theme 속성 (기존 CSS 셀렉터용)
    if (theme === 'default') html.removeAttribute('data-theme');
    else html.setAttribute('data-theme', theme);
    // 2) CSS Custom Properties — html 인라인 스타일로 직접 주입 (최고 우선순위)
    //    배경·표면색 등을 var(--t-bg) 형태로 CSS에서 참조 가능
    ALL_THEME_VARS.forEach(k => html.style.removeProperty(k));
    Object.entries(THEME_VARS[theme]).forEach(([k, v]) => html.style.setProperty(k, v));
  }, [theme]);

  const setTheme = (t: ThemeMode) => {
    setThemeState(t);
    try {
      localStorage.setItem(THEME_KEY, t);
      // dark_mode 동기화: 다크 계열 테마는 강제 다크, 라이트 계열은 강제 라이트
      const forceDark = t === 'dark-neon' || t === 'default';
      localStorage.setItem('dark_mode', forceDark ? '1' : '0');
      // App.tsx의 darkMode state가 반응하도록 storage 이벤트 발화
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'dark_mode',
        newValue: forceDark ? '1' : '0',
        storageArea: localStorage,
      }));
    } catch { /* ignore */ }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
