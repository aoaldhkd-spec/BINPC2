export const DISPLAY_SCALE_KEY = 'binpc2-display-scale-v1';
export const DISPLAY_SCALE_EVENT = 'binpc2:display-scale';
export const DISPLAY_SCALE_STEPS = [0.95, 1, 1.05, 1.1] as const;
export function normalizeDisplayScale(value: unknown): number {
  const parsed = Number(value);
  return DISPLAY_SCALE_STEPS.find(s => Math.abs(s - parsed) < 0.001) ?? 1;
}
export function readDisplayScale(): number {
  try { return normalizeDisplayScale(localStorage.getItem(DISPLAY_SCALE_KEY)); } catch { return 1; }
}
export function applyDisplayScale(value = readDisplayScale()): number {
  const scale = normalizeDisplayScale(value);
  document.documentElement.style.setProperty('--binpc-user-scale', String(scale));
  return scale;
}
export function saveDisplayScale(value: number): number {
  const scale = applyDisplayScale(value);
  try { localStorage.setItem(DISPLAY_SCALE_KEY, String(scale)); } catch { /* still applies this session */ }
  window.dispatchEvent(new Event(DISPLAY_SCALE_EVENT));
  return scale;
}
