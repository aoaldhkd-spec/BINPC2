/** Web Audio surprise balloon-pop for 술번개 3-click easter egg — no external assets. */

type EasterEggSoundHandle = { stop: () => void };

export function playEasterEggSting(): EasterEggSoundHandle {
  if (typeof window === 'undefined') return { stop: () => {} };

  const Ctx = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return { stop: () => {} };

  const ctx = new Ctx();
  void ctx.resume();

  const t0 = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(0.95, t0 + 0.004);
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.65);
  master.connect(ctx.destination);

  const sources: AudioScheduledSourceNode[] = [];

  // Balloon pop — short band-passed noise burst
  const popLen = Math.floor(ctx.sampleRate * 0.06);
  const popBuf = ctx.createBuffer(1, popLen, ctx.sampleRate);
  const popData = popBuf.getChannelData(0);
  for (let i = 0; i < popLen; i++) {
    const env = 1 - i / popLen;
    popData[i] = (Math.random() * 2 - 1) * env * env;
  }
  const pop = ctx.createBufferSource();
  pop.buffer = popBuf;
  const popFilter = ctx.createBiquadFilter();
  popFilter.type = 'bandpass';
  popFilter.frequency.setValueAtTime(680, t0);
  popFilter.Q.setValueAtTime(1.2, t0);
  const popGain = ctx.createGain();
  popGain.gain.setValueAtTime(0.0001, t0);
  popGain.gain.exponentialRampToValueAtTime(0.85, t0 + 0.003);
  popGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
  pop.connect(popFilter);
  popFilter.connect(popGain);
  popGain.connect(master);
  pop.start(t0);
  pop.stop(t0 + 0.08);
  sources.push(pop);

  // Soft rubber snap — not a low horror rumble
  const thump = ctx.createOscillator();
  const thumpGain = ctx.createGain();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(180, t0);
  thump.frequency.exponentialRampToValueAtTime(55, t0 + 0.05);
  thumpGain.gain.setValueAtTime(0.0001, t0);
  thumpGain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.002);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
  thump.connect(thumpGain);
  thumpGain.connect(master);
  thump.start(t0);
  thump.stop(t0 + 0.1);
  sources.push(thump);

  // Confetti sparkle — brief high chirps
  const sparkleFreqs = [1400, 2200, 3100, 4200, 5200];
  for (let i = 0; i < sparkleFreqs.length; i++) {
    const freq = sparkleFreqs[i];
    const delay = 0.02 + i * 0.018;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t0 + delay);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.35, t0 + delay + 0.04);
    g.gain.setValueAtTime(0.0001, t0 + delay);
    g.gain.exponentialRampToValueAtTime(0.12, t0 + delay + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.07);
    osc.connect(g);
    g.connect(master);
    osc.start(t0 + delay);
    osc.stop(t0 + delay + 0.08);
    sources.push(osc);
  }

  const stop = () => {
    for (const s of sources) {
      try { s.stop(); } catch { /* already stopped */ }
    }
    void ctx.close();
  };

  return { stop };
}
