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

/** SSE ping(15s) + 느린 핸드셰이크보다 길게 — 한 번 재연결로는 배너 없음 */
export const NET_QUIET_MS = 20_000;
/** 재연결 배너 후 이만큼 더 실패하면 error 모달 */
export const NET_ERROR_AFTER_MS = 40_000;
/** navigator.offline 깜빡임 debounce (행사장 Wi‑Fi) */
export const NET_OFFLINE_QUIET_MS = 3_000;
/** CONNECTING이 이 시간 미만이면 UI 단절로 보지 않음 */
export const NET_SSE_CONNECTING_GRACE_MS = 20_000;

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

function armErrorTimer() {
  if (_errorTimer) { clearTimeout(_errorTimer); _errorTimer = null; }
  _errorTimer = setTimeout(() => {
    _errorTimer = null;
    if (_rawDownSince == null) return;
    if (!_errorModalShown) {
      _errorModalShown = true;
      emit('error');
    }
  }, NET_ERROR_AFTER_MS);
}

function armQuietTimer(ms: number) {
  if (_quietTimer) { clearTimeout(_quietTimer); _quietTimer = null; }
  _quietTimer = setTimeout(() => {
    _quietTimer = null;
    if (_rawDownSince == null) return; // 이미 복구됨
    emit('reconnecting');
    _errorModalShown = false;
    armErrorTimer();
  }, ms);
}

/**
 * 예상된 클라이언트/서버 오류는 네트워크 단절로 취급하지 않음.
 * seats 테이블 제거 400, NAT 429 등이 /op 경로에서 down으로 잘못 보고돼도 UI 금지.
 */
export function shouldIgnoreDownReason(reason: string): boolean {
  const r = reason.toLowerCase();
  return (
    r.includes('429') ||
    r.includes('rate_limit') ||
    r.includes('seats') ||
    r.includes('table_not_allowed')
  );
}

/**
 * EventSource readyState가 UI 단절 보고를 막아야 하는지.
 * 0 CONNECTING / 1 OPEN / 2 CLOSED (브라우저 EventSource와 동일)
 */
export function sseReadyStateBlocksNetDownUi(
  readyState: number | null | undefined,
  downForMs: number,
  connectingGraceMs = NET_SSE_CONNECTING_GRACE_MS,
): boolean {
  if (readyState === 1) return true; // OPEN — 첫 ping 대기 포함, 단절 아님
  if (readyState === 0 && downForMs < connectingGraceMs) return true; // 핸드셰이크 중
  return false;
}

/** SSE/네트워크 단절 신호 (오탐 가능 — 즉시 모달 띄우지 않음) */
export function reportLinkDown(reason: string): void {
  if (shouldIgnoreDownReason(reason)) {
    diag('debug', 'net', `ignore-down:${reason}`);
    return;
  }
  if (_rawDownSince == null) {
    _rawDownSince = Date.now();
    _episodeCorr = newCorrId('net');
    diag('warn', 'net', `down:${reason}`, { corr: _episodeCorr });
  }
  if (_quietTimer || _ui !== 'ok') return;
  armQuietTimer(NET_QUIET_MS);
}

/** 링크 복구 — quiet/error 타이머는 즉시 취소 (debounce 중 배너 오탐 방지) */
export function reportLinkUp(reason: string): void {
  if (_rawDownSince == null && _ui === 'ok') return;
  _rawDownSince = null;
  if (_quietTimer) { clearTimeout(_quietTimer); _quietTimer = null; }
  if (_errorTimer) { clearTimeout(_errorTimer); _errorTimer = null; }
  if (_recoverTimer) clearTimeout(_recoverTimer);
  _recoverTimer = setTimeout(() => {
    _recoverTimer = null;
    const wasDown = _ui !== 'ok';
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
  if (_ui !== 'ok') return;
  // 행사장 Wi‑Fi / 모바일 라디오가 offline을 깜빡여도 즉시 배너 금지.
  // 짧은 debounce 후에도 실제 오프라인이면 재연결 UI.
  if (_quietTimer) { clearTimeout(_quietTimer); _quietTimer = null; }
  _quietTimer = setTimeout(() => {
    _quietTimer = null;
    if (_rawDownSince == null) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === true) {
      reportLinkUp('offline-flicker');
      return;
    }
    emit('reconnecting');
    _errorModalShown = false;
    armErrorTimer();
  }, NET_OFFLINE_QUIET_MS);
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
  armErrorTimer();
}
