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

  it('synthesizes balloon pop + sparkle (no horror tones)', () => {
    const oscTypes: OscillatorType[] = [];
    const filterTypes: BiquadFilterType[] = [];
    let bufferSources = 0;

    class MockOscillator {
      type: OscillatorType = 'sine';
      frequency = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
      connect = vi.fn();
      start = vi.fn();
      stop = vi.fn();
      constructor() {
        oscTypes.push(this.type);
      }
    }

    class MockBiquadFilter {
      private _type: BiquadFilterType = 'lowpass';
      set type(v: BiquadFilterType) {
        this._type = v;
        filterTypes.push(v);
      }
      get type() {
        return this._type;
      }
      frequency = { setValueAtTime: vi.fn() };
      Q = { setValueAtTime: vi.fn() };
      connect = vi.fn();
    }

    class MockBufferSource {
      buffer: AudioBuffer | null = null;
      connect = vi.fn();
      start = vi.fn();
      stop = vi.fn();
      constructor() {
        bufferSources += 1;
      }
    }

    class MockAudioContext {
      currentTime = 0;
      sampleRate = 44100;
      destination = {};
      createGain() {
        return {
          gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
        };
      }
      createOscillator() {
        return new MockOscillator();
      }
      createBiquadFilter() {
        return new MockBiquadFilter();
      }
      createBufferSource() {
        return new MockBufferSource();
      }
      createBuffer(_ch: number, len: number, _rate: number) {
        return { getChannelData: () => new Float32Array(len) };
      }
      resume = vi.fn().mockResolvedValue(undefined);
      close = vi.fn().mockResolvedValue(undefined);
    }

    vi.stubGlobal('window', { AudioContext: MockAudioContext });

    const handle = playEasterEggSting();
    expect(bufferSources).toBe(1);
    expect(filterTypes).toContain('bandpass');
    expect(oscTypes.every(t => t === 'sine')).toBe(true);
    expect(oscTypes).not.toContain('sawtooth');
    expect(oscTypes).not.toContain('square');
    expect(() => handle.stop()).not.toThrow();
  });
});
