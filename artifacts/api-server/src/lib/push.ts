import webpush from 'web-push';
import pino from 'pino';

const logger = pino({ name: 'push' });

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? '';
const vapidConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (vapidConfigured) {
  webpush.setVapidDetails(
    'mailto:admin@boltnew.app',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );
} else {
  logger.warn('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY missing — web push disabled');
}

export { VAPID_PUBLIC_KEY };

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

/**
 * 단일 구독에 푸시 전송.
 * 구독이 만료(410/404)된 경우 false 반환 → 호출 측에서 삭제.
 */
export async function sendPush(sub: PushSub, payload: PushPayload): Promise<boolean> {
  if (!vapidConfigured) return true;
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { auth: sub.keys.auth, p256dh: sub.keys.p256dh } },
      JSON.stringify(payload),
    );
    return true;
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'statusCode' in e) {
      const status = (e as { statusCode: number }).statusCode;
      if (status === 410 || status === 404) return false; // 만료된 구독
    }
    logger.error({ err: e }, 'sendPush error');
    return true; // 기타 오류는 구독 유지
  }
}
