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
    if (theme === 'default') {
      html.removeAttribute('data-theme');
    } else {
      html.setAttribute('data-theme', theme);
    }
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
