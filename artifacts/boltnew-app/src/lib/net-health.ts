/**
 * net-health.ts — 네트워크/SSE 연결 상태 단일 소스
 *
 * 목표:
 * - 순간 지연·단절 → UI 모달 없음, 조용히 자동복구
 * - reconnect 중 반복 모달 금지
 * - 실제 사용 불능이 지속될 때만 모달 1회
 */

import { diag, newCorrId } from './diag';

export type NetUiStatus = 'ok' | 'reconnecting' | 'error';

type Listener = (status: NetUiStatus) => void;

const QUIET_MS = 12_000;       // 이 시간 안에 복구되면 모달 없음
const ERROR_AFTER_MS = 40_000; // 재연결 표시 후 이만큼 더 실패하면 error 모달
const RECOVER_DEBOUNCE_MS = 400;

let _ui: NetUiStatus = 'ok';
let _rawDownSince: number | null = null;
let _quietTimer: ReturnType<typeof setTimeout> | null = null;
let _errorTimer: ReturnType<typeof setTimeout> | null = null;
let _recoverTimer: ReturnType<typeof setTimeout> | null = null;
let _episodeCorr: string | null = null;
let _errorModalShown = false;
const _listeners = new Set<Listener>();

function emit(next: NetUiStatus) {
  if (_ui === next) return;
  _ui = next;
  diag(next === 'ok' ? 'info' : next === 'error' ? 'error' : 'warn', 'net', `ui=${next}`, {
    corr: _episodeCorr ?? undefined,
  });
  _listeners.forEach((fn) => {
    try { fn(next); } catch { /* ignore */ }
  });
}

function clearTimers() {
  if (_quietTimer) { clearTimeout(_quietTimer); _quietTimer = null; }
  if (_errorTimer) { clearTimeout(_errorTimer); _errorTimer = null; }
  if (_recoverTimer) { clearTimeout(_recoverTimer); _recoverTimer = null; }
}

/** SSE/네트워크 단절 신호 (오탐 가능 — 즉시 모달 띄우지 않음) */
export function reportLinkDown(reason: string): void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    // 완전 오프라인은 바로 reconnecting 안내 (단, error는 유지 시간 후)
  }
  if (_rawDownSince == null) {
    _rawDownSince = Date.now();
    _episodeCorr = newCorrId('net');
    diag('warn', 'net', `down:${reason}`, { corr: _episodeCorr });
  }
  if (_quietTimer || _ui !== 'ok') return;
  _quietTimer = setTimeout(() => {
    _quietTimer = null;
    if (_rawDownSince == null) return; // 이미 복구됨
    emit('reconnecting');
    _errorModalShown = false;
    _errorTimer = setTimeout(() => {
      _errorTimer = null;
      if (_rawDownSince == null) return;
      if (!_errorModalShown) {
        _errorModalShown = true;
        emit('error');
      }
    }, ERROR_AFTER_MS);
  }, QUIET_MS);
}

/** 링크 복구 — 모달/타이머 즉시 해제 */
export function reportLinkUp(reason: string): void {
  if (_rawDownSince == null && _ui === 'ok') return;
  if (_recoverTimer) clearTimeout(_recoverTimer);
  _recoverTimer = setTimeout(() => {
    _recoverTimer = null;
    const wasDown = _rawDownSince != null || _ui !== 'ok';
    _rawDownSince = null;
    clearTimers();
    if (wasDown) {
      diag('info', 'net', `up:${reason}`, { corr: _episodeCorr ?? undefined });
    }
    _episodeCorr = null;
    _errorModalShown = false;
    emit('ok');
  }, RECOVER_DEBOUNCE_MS);
}

export function reportBrowserOffline(): void {
  reportLinkDown('browser-offline');
  // 오프라인은 조용 대기 없이 바로 재연결 UI
  clearTimers();
  emit('reconnecting');
  _errorTimer = setTimeout(() => {
    _errorTimer = null;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      emit('error');
    }
  }, ERROR_AFTER_MS);
}

export function reportBrowserOnline(): void {
  reportLinkUp('browser-online');
}

export function getNetUiStatus(): NetUiStatus {
  return _ui;
}

export function getNetEpisodeCorr(): string | null {
  return _episodeCorr;
}

export function subscribeNetUi(fn: Listener): () => void {
  _listeners.add(fn);
  fn(_ui);
  return () => { _listeners.delete(fn); };
}

/** 사용자가 수동 재시도 — error 모달에서만 */
export function resetNetUiForRetry(): void {
  _errorModalShown = false;
  _rawDownSince = Date.now();
  _episodeCorr = newCorrId('net');
  clearTimers();
  emit('reconnecting');
  _errorTimer = setTimeout(() => {
    _errorTimer = null;
    if (_rawDownSince != null) emit('error');
  }, ERROR_AFTER_MS);
}
