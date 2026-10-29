import { AsyncLocalStorage } from 'node:async_hooks';
import type { HubApplication } from '@workspace/api-zod';
import { fail, type HubTx } from './event-hub-store.js';

// Approval cancellation stops NEW social actions. It does not erase an identity,
// log the user out, hide their existing history, or close their support thread.
export const ONSITE_SOCIAL_WRITE_TABLES = new Set([
  'likes', 'chats', 'messages', 'group_chats', 'group_messages',
  'group_participants', 'contact_shares', 'contact_share_events', 'signal_sends',
]);
export const onsiteWriteActor = new AsyncLocalStorage<string | undefined>();

/** Called under the SAME advisory transaction as both approval changes and writes.
 * No module switch or cached session is an authorization source. A cancellation
 * of a different application/cycle must never revoke the current participant.
 */
export async function assertOnsiteSocialWrite(tx: HubTx, userId: string) {
  const rows = (await tx.db.query(
    "SELECT table_name,data FROM app_kv_rows WHERE (table_name='profiles' AND row_id=$1) OR table_name='app_settings' ORDER BY updated_at DESC",
    [userId],
  )).rows;
  const profile = rows.find(r => r.table_name === 'profiles')?.data;
  if (!profile || String(profile.id) !== userId)
    fail('EVENT_PROFILE_UNAVAILABLE', '현장 프로필을 확인하지 못해 전송하지 않았습니다. 기존 기록은 유지됩니다.', 403);
  if (!profile?.event_hub_application) return; // Existing legacy identities keep their policy.
  const settings = rows.find(r => r.table_name === 'app_settings')?.data;
  const a = await tx.get<HubApplication>('application', String(profile.event_hub_application));
  if (!a || a.profileId !== userId || a.owner !== profile.event_hub_owner)
    fail('EVENT_ACCESS_UNAVAILABLE', '참가 권한을 확인하지 못했습니다. 기록을 유지한 채 다시 시도해 주세요.', 503);
  if (!settings || settings.event_cycle_reset_complete || a.cycleId !== settings.event_cycle_archive_id)
    fail('EVENT_CYCLE_ENDED', '종료된 회차에서는 새 하트·메시지를 보낼 수 없습니다. 기존 기록은 유지됩니다.', 403);
  if (a.approvalRevokedAt)
    fail('EVENT_APPROVAL_REVOKED', '참가 승인이 취소되어 새 하트·메시지를 보낼 수 없습니다. 기존 기록은 유지되며 신청대기방에서 관리자에게 문의할 수 있습니다.', 403);
}
