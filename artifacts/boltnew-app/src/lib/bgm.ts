/**
 * bgm.ts — 전역 배경음악 싱글턴 (메인 앱 전용)
 * 입장대기 화면은 별도 로컬 오디오 사용 → 겹치지 않음
 */

export const BGM_TRACKS = [
  { id: 'ballad',     emoji: '🎵', label: '케이팝 발라드',  desc: '설레고 따뜻한',   src: '/waiting-bgm.mp3' },
  { id: 'lofi',       emoji: '☕', label: '로파이 힙합',    desc: '잔잔하고 아늑한', src: '/bgm-lofi.mp3' },
  { id: 'citypop',    emoji: '🌆', label: '시티팝',          desc: '레트로 감성',     src: '/bgm-citypop.mp3' },
  { id: 'acoustic',   emoji: '🎸', label: '어쿠스틱 팝',   desc: '포근하고 감성적', src: '/bgm-acoustic.mp3' },
  { id: 'futurebass', emoji: '⚡', label: '퓨처베이스',     desc: '신나고 에너지',   src: '/bgm-futurebass.mp3' },
] as const;

export type BgmTrackId = typeof BGM_TRACKS[number]['id'];

const TRACK_KEY   = 'bgm_track';
const VOLUME_KEY  = 'bgm_volume';
const MUTED_KEY   = 'bgm_muted';
const DEFAULT_VOL = 0.45;

let _audio: HTMLAudioElement | null = null;

function _savedTrackId(): BgmTrackId {
  try {
    const v = localStorage.getItem(TRACK_KEY);
    return BGM_TRACKS.find(t => t.id === v) ? (v as BgmTrackId) : 'ballad';
  } catch { return 'ballad'; }
}

function _savedVol(): number {
  try {
    const v = parseFloat(localStorage.getItem(VOLUME_KEY) ?? '');
    return isNaN(v) ? DEFAULT_VOL : Math.max(0, Math.min(1, v));
  } catch { return DEFAULT_VOL; }
}

function _get(): HTMLAudioElement {
  if (_audio) return _audio;
  const track = BGM_TRACKS.find(t => t.id === _savedTrackId()) ?? BGM_TRACKS[0];
  _audio = new Audio(track.src);
  _audio.loop = true;
  _audio.volume = _savedVol();
  try { _audio.muted = localStorage.getItem(MUTED_KEY) === '1'; } catch {}
  return _audio;
}

export function play(): void  { _get().play().catch(() => {}); }
export function pause(): void { _audio?.pause(); }
export function isPlaying(): boolean { return !!_audio && !_audio.paused; }

export function getVolume(): number  { return _get().volume; }
export function getMuted(): boolean  { return _get().muted; }
export function getTrackId(): BgmTrackId { return _savedTrackId(); }

export function setVolume(v: number): void {
  const a = _get();
  a.volume = Math.max(0, Math.min(1, v));
  a.muted = v === 0;
  try {
    localStorage.setItem(VOLUME_KEY, String(a.volume));
    localStorage.setItem(MUTED_KEY, v === 0 ? '1' : '0');
  } catch {}
  if (v > 0 && a.paused) a.play().catch(() => {});
}

export function toggleMute(): void {
  const a = _get();
  a.muted = !a.muted;
  try { localStorage.setItem(MUTED_KEY, a.muted ? '1' : '0'); } catch {}
  if (!a.muted && a.paused) a.play().catch(() => {});
}

/** 트랙 전환 — 재생 중이면 즉시 새 트랙으로 교체 */
export function setTrack(id: BgmTrackId): void {
  const track = BGM_TRACKS.find(t => t.id === id);
  if (!track) return;
  const wasPlaying = _audio && !_audio.paused;
  const vol = _audio?.volume ?? _savedVol();
  const muted = _audio?.muted ?? false;
  if (_audio) { _audio.pause(); _audio.src = ''; _audio = null; }
  try { localStorage.setItem(TRACK_KEY, id); } catch {}
  const a = _get();
  a.volume = vol;
  a.muted = muted;
  if (wasPlaying) a.play().catch(() => {});
}
