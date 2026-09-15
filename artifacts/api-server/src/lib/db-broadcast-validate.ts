/**
 * /broadcast channel+event validate — extracted from routes/db.ts.
 * Pure; auth / rate / sanitizeBroadcastValue / emit stay in db.ts.
 */

export type BroadcastValidateReject = { status: number; body: { ok: false; error: string } };

export type BroadcastValidateOk = {
  ok: true;
  channel: string;
  event: string;
  payload: unknown;
};

export type BroadcastValidateResult =
  | BroadcastValidateOk
  | { ok: false; reject: BroadcastValidateReject };

export function validateBroadcastBody(body: unknown): BroadcastValidateResult {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return {
      ok: false,
      reject: {
        status: 400,
        body: { ok: false, error: 'Request body must be a JSON object' },
      },
    };
  }
  const { channel, event, payload } = body as {
    channel?: unknown;
    event?: unknown;
    payload: unknown;
  };
  if (typeof channel !== 'string' || !channel.trim() || channel.length > 200) {
    return {
      ok: false,
      reject: { status: 400, body: { ok: false, error: 'Invalid channel' } },
    };
  }
  if (typeof event !== 'string' || !event.trim() || event.length > 200) {
    return {
      ok: false,
      reject: { status: 400, body: { ok: false, error: 'Invalid event' } },
    };
  }
  return { ok: true, channel, event, payload };
}

export function broadcastForbiddenReject(): BroadcastValidateReject {
  return { status: 403, body: { ok: false, error: 'Forbidden: invalid broadcast token' } };
}

export function broadcastRateLimitedReject(): BroadcastValidateReject {
  return { status: 429, body: { ok: false, error: 'Too many broadcasts' } };
}

export function broadcastInternalReject(): BroadcastValidateReject {
  return { status: 500, body: { ok: false, error: 'Internal server error' } };
}

/** First hop from X-Forwarded-For (Express may give string | string[]). */
export function clientIpFromXForwardedFor(
  xfwd: string | string[] | undefined,
  fallback: string | undefined,
): string {
  const raw = typeof xfwd === 'string' ? xfwd : Array.isArray(xfwd) ? xfwd[0] : fallback ?? 'unknown';
  return String(raw).split(',')[0].trim();
}

