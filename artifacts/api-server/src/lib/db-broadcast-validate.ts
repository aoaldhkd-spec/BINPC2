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

