import { AsyncLocalStorage } from 'node:async_hooks';
import type { HubApplication } from '@workspace/api-zod';
import { fail, type HubTx } from './event-hub-store.js';
import { bossParticipationAllowed } from './boss-participation.js';

// Approval cancellation stops NEW social actions. It does not erase an identity,
// log the user out, hide their existing history, or close their support thread.
export const ONSITE_SOCIAL_WRITE_TABLES = new Set([
  'likes', 'chats', 'messages', 'group_chats', 'group_messages',
  'group_participants', 'contact_shares', 'contact_share_events', 'signal_sends',
]);
export const BOSS_SCOPED_WRITE_TABLES = new Set([...ONSITE_SOCIAL_WRITE_TABLES, 'profile_views']);
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
  const bossCycle = a.bossTestOnly === true && profile.boss_test_event === a.eventId && a.cycleId === `boss-test:${a.eventId}` && bossParticipationAllowed();
  if (!bossCycle && (!settings || settings.event_cycle_reset_complete || a.cycleId !== settings.event_cycle_archive_id))
    fail('EVENT_CYCLE_ENDED', '종료된 회차에서는 새 하트·메시지를 보낼 수 없습니다. 기존 기록은 유지됩니다.', 403);
  if (a.approvalRevokedAt)
    fail('EVENT_APPROVAL_REVOKED', '참가 승인이 취소되어 새 하트·메시지를 보낼 수 없습니다. 기존 기록은 유지되며 신청대기방에서 관리자에게 문의할 수 있습니다.', 403);
}

/** A test identity must never send hearts/messages to an operating participant,
 * including indirect/admin/background writes. It is separate from actor ownership. */
export async function assertBossTestSocialScope(tx: HubTx, table: string, row: Record<string, unknown>, actorId?: string) {
  const ids = new Set<string>();
  if (actorId) ids.add(actorId);
  for (const key of ['user_id','liker_id','liked_id','user1_id','user2_id','sender_id','receiver_id','from_user_id','to_user_id','requester_id','target_id','viewer_id','viewed_id'])
    if (typeof row[key] === 'string') ids.add(row[key]);
  if (row.chat_id) {
    const chat = (await tx.db.query("SELECT data FROM app_kv_rows WHERE table_name='chats' AND row_id=$1", [row.chat_id])).rows[0]?.data;
    if (chat) { ids.add(String(chat.user1_id)); ids.add(String(chat.user2_id)); }
  }
  const groupId = row.group_id ?? row.group_chat_id ?? (table==='group_chats' ? row.id : undefined);
  if (groupId) {
    const members=(await tx.db.query("SELECT data->>'user_id' AS id FROM app_kv_rows WHERE table_name='group_participants' AND (data->>'group_id'=$1 OR data->>'group_chat_id'=$1)",[groupId])).rows;
    for(const p of members)if(p.id)ids.add(p.id);
  }
  if (!ids.size) return;
  const profiles=(await tx.db.query("SELECT row_id,data->>'boss_test_event' AS event FROM app_kv_rows WHERE table_name='profiles' AND row_id=ANY($1::text[])",[[...ids]])).rows;
  const test=profiles.find(p=>p.event);
  if(test && groupId){
    const group=(await tx.db.query("SELECT data FROM app_kv_rows WHERE table_name='group_chats' AND row_id=$1",[groupId])).rows[0]?.data;
    if(group?.boss_test_event!==test.event)fail('BOSS_TEST_SCOPE','기존 단체방은 보존됩니다. 보스 확인용 참가자는 해당 시험 행사 대화방만 사용할 수 있습니다.',403);
  }
  if(test && (profiles.length!==ids.size || profiles.some(p=>p.event!==test.event)))
    fail('BOSS_TEST_SCOPE','보스 확인용 참가자는 같은 시험 행사 참가자끼리만 하트·대화를 사용할 수 있습니다. 기존 참가자 기록은 변경하지 않았습니다.',403);
}
