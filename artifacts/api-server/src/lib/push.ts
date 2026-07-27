import webpush from 'web-push';

// VAPID 키 — 이 프로젝트 전용으로 생성된 키
const VAPID_PUBLIC_KEY =
  'BOaIcP3QYU_BLwEGQfGaAx0zzcIsF3OOztU-ow8aoVkEvL7iUMCNttcuF03SN_kYlLFcfoe1zi10HT6te-AGxcA';
const VAPID_PRIVATE_KEY = 'eLRUkrQDIiIEXRvlG4or45XbHPgqOr3qyLHHVDgvjv8';

webpush.setVapidDetails(
  'mailto:admin@boltnew.app',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
);

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
    console.error('[push] sendPush error:', e);
    return true; // 기타 오류는 구독 유지
  }
}
