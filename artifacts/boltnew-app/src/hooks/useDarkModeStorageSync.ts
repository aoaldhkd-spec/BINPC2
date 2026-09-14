/**
 * Keep App darkMode in sync with theme.tsx storage events.
 * No feature useState owned here — App passes setter only.
 */
import { useEffect } from 'react';

export function useDarkModeStorageSync(
  setDarkMode: (value: boolean) => void,
): void {
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'dark_mode') setDarkMode(e.newValue === '1');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [setDarkMode]);
}
