// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prefs = vi.hoisted(() => new Map<string, string>());
vi.mock('./storage', () => ({
  ls: {
    getItem: (key: string) => prefs.get(key) ?? null,
    setItem: (key: string, value: string) => { prefs.set(key, value); },
    removeItem: (key: string) => { prefs.delete(key); },
  },
}));

function stubSupportedAudio() {
  let started = 0;
  class TestAudioContext {
    state = 'running';
    currentTime = 1;
    destination = {};
    resume() { return Promise.resolve(); }
    createOscillator() {
      return {
        type: 'sine',
        frequency: { value: 0 },
        connect: () => {},
        disconnect: () => {},
        onended: null,
        start: () => { started++; },
        stop: () => {},
      };
    }
    createGain() {
      return {
        gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
        connect: () => {},
        disconnect: () => {},
      };
    }
  }
  vi.stubGlobal('AudioContext', TestAudioContext);
  return () => started;
}

beforeEach(() => {
  prefs.clear();
  vi.resetModules();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (document as Document & { visibilityState?: string }).visibilityState;
});

describe('optional foreground incoming notification chime', () => {
  it('is default OFF, account-scoped and needs an actual opt-in', async () => {
    stubSupportedAudio();
    const sound = await import('./notification-sound');
    expect(sound.getForegroundSoundOptIn('first')).toBe(false);
    expect(sound.getForegroundSoundOptIn('second')).toBe(false);
    expect(sound.setForegroundSoundOptInFromClick('first', true)).toBe(true);
    expect(sound.getForegroundSoundOptIn('first')).toBe(true);
    expect(sound.getForegroundSoundOptIn('second')).toBe(false);
    expect(sound.setForegroundSoundOptInFromClick('first', false)).toBe(true);
    expect(sound.getForegroundSoundOptIn('first')).toBe(false);
  });

  it('fails closed when Web Audio is unsupported', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const sound = await import('./notification-sound');
    expect(sound.setForegroundSoundOptInFromClick('first', true)).toBe(false);
    expect(sound.getForegroundSoundOptIn('first')).toBe(false);
  });

  it('plays only when enabled and visible, throttling repeated alerts', async () => {
    const getStarted = stubSupportedAudio();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(10_000);
    const sound = await import('./notification-sound');
    sound.playForegroundIncomingSound('first');
    expect(getStarted()).toBe(0);
    expect(sound.setForegroundSoundOptInFromClick('first', true)).toBe(true);
    sound.playForegroundIncomingSound('second');
    expect(getStarted()).toBe(0);
    sound.playForegroundIncomingSound('first');
    expect(getStarted()).toBe(2);
    sound.playForegroundIncomingSound('first');
    expect(getStarted()).toBe(2);
    now.mockReturnValue(11_000);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    sound.playForegroundIncomingSound('first');
    expect(getStarted()).toBe(2);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    sound.playForegroundIncomingSound('first');
    expect(getStarted()).toBe(4);
  });

  it('removes unlocking listeners when the logged-in user changes', async () => {
    stubSupportedAudio();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const sound = await import('./notification-sound');
    const cleanup = sound.armForegroundSoundOnGesture('first');
    expect(add).toHaveBeenCalledWith('pointerdown', expect.any(Function), { passive: true });
    expect(add).toHaveBeenCalledWith('keydown', expect.any(Function));
    cleanup();
    expect(remove).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
