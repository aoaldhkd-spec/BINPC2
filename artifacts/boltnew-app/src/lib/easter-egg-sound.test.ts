import { describe, it, expect, vi, beforeEach } from 'vitest';
import { playEasterEggSting } from './easter-egg-sound';

describe('playEasterEggSting', () => {
  beforeEach(() => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
  });

  it('returns no-op stop when AudioContext is unavailable', () => {
    const handle = playEasterEggSting();
    expect(() => handle.stop()).not.toThrow();
  });
});
