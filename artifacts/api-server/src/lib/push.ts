import webpush from 'web-push';
import pino from 'pino';
import {
  recordPushAttempt,
  recordPushError,
  recordPushExpired,
  recordPushRetry,
  recordPushSucceeded,
} from './http-metrics.js';

const logger = pino({ name: 'push' });

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? '';
const vapidConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (vapidConfigured) {
  webpush.setVapidDetails('mailto:admin@boltnew.app', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  logger.warn('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY missing — web push disabled');
}

export { VAPID_PUBLIC_KEY, vapidConfigured };

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

export interface PushSub {
  endpoint: string;
  keys: { auth: string; p256dh: string };
}

const RETRY_MS = [150, 500];

function statusCodeOf(err: unknown): number | null {
  if (!err || typeof err !== 'object' || !('statusCode' in err)) return null;
  const n = Number((err as { statusCode?: unknown }).statusCode);
  return Number.isFinite(n) ? n : null;
}

/**
 * true  = keep subscription
 * false = expired subscription (404/410), caller may prune
 */
export async function sendPush(sub: PushSub, payload: PushPayload): Promise<boolean> {
  if (!vapidConfigured) return true;

  recordPushAttempt();
  for (let attempt = 0; attempt <= RETRY_MS.length; attempt++) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { auth: sub.keys.auth, p256dh: sub.keys.p256dh } },
        JSON.stringify(payload),
      );
      recordPushSucceeded();
      return true;
    } catch (e: unknown) {
      const status = statusCodeOf(e);
      if (status === 404 || status === 410) {
        recordPushExpired();
        return false;
      }
      const transient = status == null || status === 429 || status >= 500;
      if (transient && attempt < RETRY_MS.length) {
        recordPushRetry();
        await new Promise(resolve => setTimeout(resolve, RETRY_MS[attempt]));
        continue;
      }
      recordPushError();
      logger.error({ err: e, status, attempt }, 'sendPush error');
      return true;
    }
  }
  recordPushError();
  return true;
}
