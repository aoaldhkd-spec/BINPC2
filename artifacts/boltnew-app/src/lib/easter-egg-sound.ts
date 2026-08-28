/** Web Audio party gag: gentle balloon pop + tiny cash-register ding. No TTS. */

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
  master.gain.exponentialRampToValueAtTime(0.5, t0 + 0.006);
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
  master.connect(ctx.destination);

  const sources: AudioScheduledSourceNode[] = [];

  const popLen = Math.floor(ctx.sampleRate * 0.045);
  const popBuf = ctx.createBuffer(1, popLen, ctx.sampleRate);
  const popData = popBuf.getChannelData(0);
  for (let i = 0; i < popLen; i++) {
    const env = 1 - i / popLen;
    popData[i] = (Math.random() * 2 - 1) * env * env * env;
  }

  const pop = ctx.createBufferSource();
  pop.buffer = popBuf;
  const popFilter = ctx.createBiquadFilter();
  popFilter.type = 'bandpass';
  popFilter.frequency.setValueAtTime(820, t0);
  popFilter.Q.setValueAtTime(0.9, t0);
  const popGain = ctx.createGain();
  popGain.gain.setValueAtTime(0.0001, t0);
  popGain.gain.exponentialRampToValueAtTime(0.55, t0 + 0.004);
  popGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
  pop.connect(popFilter);
  popFilter.connect(popGain);
  popGain.connect(master);
  pop.start(t0);
  pop.stop(t0 + 0.06);
  sources.push(pop);

  const dingAt = t0 + 0.045;
  const ding = ctx.createOscillator();
  const dingGain = ctx.createGain();
  ding.type = 'sine';
  ding.frequency.setValueAtTime(2093, dingAt);
  dingGain.gain.setValueAtTime(0.0001, dingAt);
  dingGain.gain.exponentialRampToValueAtTime(0.08, dingAt + 0.003);
  dingGain.gain.exponentialRampToValueAtTime(0.0001, dingAt + 0.09);
  ding.connect(dingGain);
  dingGain.connect(master);
  ding.start(dingAt);
  ding.stop(dingAt + 0.1);
  sources.push(ding);

  const stop = () => {
    for (const s of sources) {
      try { s.stop(); } catch { /* already stopped */ }
    }
    void ctx.close();
  };

  return { stop };
}
