/**
 * diag.ts — 운영용 경량 관측/진단 (브라우저 링버퍼)
 *
 * - correlation/request ID 로 사용자 동작 → API → 결과 추적
 * - 민감정보(토큰·비번·메시지 본문) 기록 금지
 * - 용량·중복 억제로 성능 부담 최소화
 */

export type DiagLevel = 'debug' | 'info' | 'warn' | 'error';

export type DiagEvent = {
  id: string;
  ts: number;
  level: DiagLevel;
  cat: string;
  msg: string;
  corr?: string;
  ms?: number;
  data?: Record<string, unknown>;
};

const MAX_EVENTS = 200;
const DEDUPE_MS = 2_500;
const _events: DiagEvent[] = [];
const _dedupe = new Map<string, number>();

let _seq = 0;

function nextId(): string {
  _seq = (_seq + 1) % 1_000_000;
  return `d${Date.now().toString(36)}_${_seq.toString(36)}`;
}

/** 짧은 상관 ID — 한 사용자 동작 단위 */
export function newCorrId(prefix = 'c'): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

/** API 요청용 request ID (서버 로그와 매칭) */
export function newRequestId(): string {
  return newCorrId('r');
}

const SENSITIVE_KEY = /pass|secret|token|authorization|cookie|kakao|phone|content|message|body|password/i;

function scrub(data?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!data) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (SENSITIVE_KEY.test(k)) {
      out[k] = '[redacted]';
      continue;
    }
    if (typeof v === 'string' && v.length > 120) {
      out[k] = `${v.slice(0, 40)}…(${v.length})`;
      continue;
    }
    out[k] = v;
  }
  return out;
}

export function diag(
  level: DiagLevel,
  cat: string,
  msg: string,
  opts?: { corr?: string; ms?: number; data?: Record<string, unknown> },
): string {
  const dedupeKey = `${level}|${cat}|${msg}|${opts?.corr ?? ''}`;
  const now = Date.now();
  const last = _dedupe.get(dedupeKey) ?? 0;
  if (now - last < DEDUPE_MS && level !== 'error') {
    return opts?.corr ?? '';
  }
  _dedupe.set(dedupeKey, now);
  if (_dedupe.size > 300) {
    for (const [k, t] of _dedupe) {
      if (now - t > 60_000) _dedupe.delete(k);
    }
  }

  const id = nextId();
  const ev: DiagEvent = {
    id,
    ts: now,
    level,
    cat,
    msg,
    corr: opts?.corr,
    ms: opts?.ms,
    data: scrub(opts?.data),
  };
  _events.push(ev);
  if (_events.length > MAX_EVENTS) _events.splice(0, _events.length - MAX_EVENTS);

  // 개발/진단: warn+ 만 콘솔 (남발 금지)
  if (level === 'error') {
    console.warn(`[diag:${cat}]`, msg, opts?.corr ?? '', opts?.data ? scrub(opts.data) : '');
  }
  return id;
}

export function getDiagEvents(limit = 80): DiagEvent[] {
  return _events.slice(-limit);
}

export function getDiagSummary(): {
  total: number;
  errors: number;
  warns: number;
  lastError?: DiagEvent;
  byCat: Record<string, number>;
} {
  const byCat: Record<string, number> = {};
  let errors = 0;
  let warns = 0;
  let lastError: DiagEvent | undefined;
  for (const e of _events) {
    byCat[e.cat] = (byCat[e.cat] ?? 0) + 1;
    if (e.level === 'error') {
      errors++;
      lastError = e;
    } else if (e.level === 'warn') warns++;
  }
  return { total: _events.length, errors, warns, lastError, byCat };
}

export function findDiagByCorr(corr: string): DiagEvent[] {
  return _events.filter((e) => e.corr === corr);
}

/** 집에서 디버그할 때 콘솔에서 호출 */
export function installDiagGlobal(): void {
  if (typeof window === 'undefined') return;
  (window as unknown as { __BINPC_DIAG__?: unknown }).__BINPC_DIAG__ = {
    events: getDiagEvents,
    summary: getDiagSummary,
    byCorr: findDiagByCorr,
  };
}
