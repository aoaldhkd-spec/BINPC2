/**
 * Optional foreground-only heart and direct-message chime.
 * Does not control Android/iOS background Web Push notification sounds.
 * Only real user gestures can unlock Web Audio.
 */
import { ls } from './storage';

const prefKey = (userId: string) => 'binpc2-foreground-sound:' + userId;
let audio: AudioContext | null = null;
let lastPlayedAt = 0;

export function getForegroundSoundOptIn(userId: string): boolean {
  return Boolean(userId) && ls.getItem(prefKey(userId)) === '1';
}

function ensureAudio(): AudioContext | null {
  if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') return null;
  try {
    if (!audio) audio = new window.AudioContext();
    return audio;
  } catch {
    return null;
  }
}

function unlockFromGesture(): boolean {
  const context = ensureAudio();
  if (!context) return false;
  if (context.state !== 'running') void context.resume().catch(() => {});
  return true;
}

/** Call synchronously from the user's checkbox gesture. Default is OFF. */
export function setForegroundSoundOptInFromClick(userId: string, enabled: boolean): boolean {
  if (!userId) return false;
  if (enabled && !unlockFromGesture()) return false;
  ls.setItem(prefKey(userId), enabled ? '1' : '0');
  return true;
}

/** Unlock the saved preference on an ordinary gesture after navigation/reload. */
export function armForegroundSoundOnGesture(userId: string): () => void {
  const unlock = () => {
    if (getForegroundSoundOptIn(userId)) unlockFromGesture();
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  return () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
}

/** No audio assets or network calls; never affect the underlying notification. */
export function playForegroundIncomingSound(userId: string): void {
  if (!getForegroundSoundOptIn(userId) || document.visibilityState !== 'visible') return;
  const now = Date.now();
  if (now - lastPlayedAt < 900) return;
  const context = audio;
  if (!context || context.state !== 'running') return;
  lastPlayedAt = now;
  const start = context.currentTime + 0.01;
  try {
    for (const [frequency, offset] of [[523.25, 0], [659.25, 0.13]]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      const at = start + offset;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.035, at + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.17);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(at);
      oscillator.stop(at + 0.18);
    }
  } catch {
    // Sound is optional; message delivery, UI and OS push must remain unaffected.
  }
}
