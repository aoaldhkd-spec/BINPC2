import { afterEach, describe, expect, it, vi } from 'vitest';
import { raceSettingsWithDelayedFallback } from './ready-bootstrap-settings';
afterEach(() => vi.useRealTimers());
describe('settings fallback keeps failures independent without duplicate fast reads', () => {
  it('fast valid settings win without starting SELECT', async () => {
    vi.useFakeTimers(); const fallback = vi.fn(); const value = { session_active: false };
    expect(await raceSettingsWithDelayedFallback(Promise.resolve(value), fallback)).toBe(value);
    await vi.advanceTimersByTimeAsync(1000); expect(fallback).not.toHaveBeenCalled();
  });
  it('slow /ready triggers one hedge and SELECT may win before /ready timeout', async () => {
    vi.useFakeTimers(); const fallback = vi.fn().mockResolvedValue({ session_active: false });
    const result = raceSettingsWithDelayedFallback(new Promise(() => {}), fallback);
    await vi.advanceTimersByTimeAsync(499); expect(fallback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(await result).toEqual({ session_active: false });
    expect(fallback).toHaveBeenCalledTimes(1);
  });
  it('failed /ready starts SELECT immediately and both failures return null', async () => {
    vi.useFakeTimers(); const fallback = vi.fn().mockRejectedValue(new Error('offline'));
    expect(await raceSettingsWithDelayedFallback(Promise.reject(new Error('offline')), fallback)).toBeNull();
    expect(fallback).toHaveBeenCalledTimes(1);
  });
  it('a failed hedge does not suppress a later authoritative /ready result', async () => {
    vi.useFakeTimers(); let complete!: (v: Record<string, unknown>) => void;
    const primary = new Promise<Record<string, unknown>>(resolve => { complete = resolve; });
    const result = raceSettingsWithDelayedFallback(primary, () => Promise.resolve(null));
    await vi.advanceTimersByTimeAsync(500); complete({ session_active: false });
    expect(await result).toEqual({ session_active: false });
  });
});
