/** Web Audio dramatic sting for 술번개 3-click easter egg — no external assets. */

type EasterEggSoundHandle = { stop: () => void };

export function playEasterEggSting(): EasterEggSoundHandle {
  if (typeof window === 'undefined') return { stop: () => {} };

  const Ctx = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return { stop: () => {} };

  const ctx = new Ctx();
  void ctx.resume();

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.85, ctx.currentTime + 0.04);
  master.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 1.2);
  master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 4.5);
  master.connect(ctx.destination);

  const oscs: OscillatorNode[] = [];
  const nodes: AudioNode[] = [master];

  const addTone = (freq: number, type: OscillatorType, detune = 0, gain = 0.22, delay = 0) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
    osc.detune.setValueAtTime(detune, ctx.currentTime + delay);
    g.gain.setValueAtTime(gain, ctx.currentTime + delay);
    osc.connect(g);
    g.connect(master);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + 4.6);
    oscs.push(osc);
    nodes.push(g);
  };

  // Low rumble → dissonant cluster sting (horror reveal)
  addTone(55, 'sawtooth', 0, 0.28, 0);
  addTone(82.4, 'sawtooth', -8, 0.2, 0.02);
  addTone(110, 'square', 12, 0.14, 0.05);
  addTone(155.6, 'sawtooth', -5, 0.26, 0.08);
  addTone(233.1, 'sawtooth', 7, 0.24, 0.1);
  addTone(311.1, 'square', -12, 0.18, 0.12);
  addTone(415.3, 'triangle', 0, 0.12, 0.15);

  // Noise burst for shock
  const bufferSize = ctx.sampleRate * 0.35;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.setValueAtTime(900, ctx.currentTime);
  noiseFilter.Q.setValueAtTime(0.8, ctx.currentTime);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.0001, ctx.currentTime);
  noiseGain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.02);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(ctx.currentTime);
  nodes.push(noiseFilter, noiseGain);

  const stop = () => {
    for (const osc of oscs) {
      try { osc.stop(); } catch { /* already stopped */ }
    }
    try { noise.stop(); } catch { /* already stopped */ }
    void ctx.close();
  };

  return { stop };
}
