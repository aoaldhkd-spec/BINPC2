/**
 * Legacy multi-theme cleanup only.
 * Visual themes (default/y2k/dark-neon/minimal) were removed.
 * App dark mode uses localStorage key "dark_mode" in App.tsx — do not touch it here.
 */
const LEGACY_THEME_KEY = 'app_theme_mode_v1';
const ALL_THEME_VARS = ['--t-bg', '--t-surface', '--t-text', '--t-accent', '--t-border'] as const;

/** Strip leftover multi-theme artifacts without changing dark_mode. */
export function clearLegacyThemeArtifacts(): void {
  if (typeof document === 'undefined') return;
  try {
    const html = document.documentElement;
    html.removeAttribute('data-theme');
    ALL_THEME_VARS.forEach((k) => html.style.removeProperty(k));
  } catch { /* ignore */ }
  try {
    localStorage.removeItem(LEGACY_THEME_KEY);
  } catch { /* ignore */ }
}
