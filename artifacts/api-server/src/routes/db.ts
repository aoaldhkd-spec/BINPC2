import '../lib/dns-ipv4-first.js';
import { Router, type Request, type Response } from 'express';
import pg from 'pg';
import { VAPID_PUBLIC_KEY, sendPush, type PushPayload } from '../lib/push';
import { resolvePin, pinPoolParams, collectUsedPinCodes } from '../lib/pin';
import {
  collectUsedPresetAvatarIds,
  extractPresetAvatarId,
  resolveEntryAvatar,
} from '../lib/avatar-pool';
import { NPC_TEXT_AVATAR_SENTINEL } from '../lib/npc-text-avatar';
import { logger } from '../lib/logger';
import { buildPgOptions } from '../lib/pg-options.js';
import { createImageAccessPolicy } from '../lib/image-access';
import {
  MAX_IMAGE_DATAURL_BYTES,
  dataUrlMimeAndMagic,
  parseDataUrlForResponse,
} from '../lib/db-image-magic';
import {
  sanitizeRow,
  sanitizeProfile,
  sanitizeProfileForViewer,
  sanitizeSettings,
} from '../lib/db-sanitize';
import {
  chatPairKey,
  deterministicSignalId,
} from '../lib/db-chat-ids';
import { collectBroadcastTargets as collectBroadcastTargetsImpl } from '../lib/db-broadcast-targets';
import {
  collectIntegrityDiagnostics,
  clampIntegrityScanMaxRows,
  clampIntegrityScanIntervalMs,
  writeReferencesFor,
  type IntegrityDiagnostics,
} from '../lib/db-integrity';
import {
  RATE_MAP_MAX_SIZE,
  LOGIN_RATE_MAX,
  LOGIN_RATE_MAX_PER_IP,
  LOGIN_RATE_WINDOW_MS,
  UPLOAD_RATE_MAX,
  UPLOAD_RATE_MAX_PER_IP,
  UPLOAD_RATE_WINDOW_MS,
  loginRateMap as _loginRateMap,
  uploadRateMap as _uploadRateMap,
  broadcastRateMap as _broadcastRateMap,
  pruneRateMap,
  consumeRateLimit,
  consumePinBucket as consumePinBucketPure,
  PIN_WINDOW_MS_DEFAULT,
  venueLoginRateKeys,
  venueUploadRateKeys,
  resetRateLimit,
  buildDistributedRateSlotSql,
  buildDistributedMinuteQuotaSql,
  buildRateLimitsPruneSql,
} from '../lib/db-rate-limit';
import {
  mergeDbRowsIntoMemory,
  shouldBroadcastBulkResync,
  HOT_TABLES,
  REALTIME_MERGE_TABLES,
  FULL_RESYNC_TABLES,
  RESYNC_TABLE_LIMIT,
  HOT_RESYNC_TABLES,
  HOT_RESYNC_LIMITS,
  RESYNC_DEFAULT_LIMIT,
  resyncLimitFor,
  shouldThrottleDbMerge,
  groupKvDataRowsByTable,
  buildFullResyncUnionSql,
  buildLoadHotKvTablesSql,
  buildLoadRemainingKvTablesSql,
} from '../lib/db-store-merge';
import {
  type FilterSpec,
  applyFilters,
} from '../lib/db-op-filters';
import {
  PANEL_DEFAULT_PASSWORD,
  isDefaultPanelPassword,
  secretMatches,
  panelSecretsForRuntime,
  panelAdminSecrets,
  panelTestSecrets,
} from '../lib/db-panel-secrets';
import {
  createSseRing,
  SSE_RING_MAX_DEFAULT,
  SSE_RING_TTL_MS_DEFAULT,
} from '../lib/db-sse-ring';
import { createMergedIdMap, resolveMergedIdViaRows } from '../lib/db-merged-id-map';
import {
  ALLOWED_OP_TABLES,
  CRITICAL_PERSIST_TABLES,
  ACTIVE_KV_TABLES,
  isCriticalWriteLog,
  buildKvUpsertSql,
  buildKvDeleteRowSql,
  buildKvDeleteRowsSql,
  buildKvDeleteTableSql,
  buildImageUpsertSql,
  buildErrorLogCounterUpsertSql,
  buildEnsureKvRowsTableSql,
  buildEnsureImageStoreTableSql,
  buildKvTableUpdatedIndexSql,
  buildPublicTableRlsSql,
  buildLoadImagesSql,
  buildKvSelectByRowIdsSql,
  buildKvSelectByTableRowIdSql,
  buildKvSelectLatestLimitedSql,
  buildAppSettingsLatestSql,
  buildGroupParticipantLookupSql,
  buildMessagesByChatIdsSql,
  buildErrorLogCounterDeleteSql,
  buildAuditLogUpsertSql,
  buildImageDeleteByPathsSql,
  buildImageSelectByPathSql,
} from '../lib/db-table-policy';
import {
  planSmartBroadcastLocal,
  REALTIME_TRACE_TABLES,
  realtimeTraceMeta,
  sseCapacityReject,
  planSseIpCount,
  shouldRejectAnonSse,
  sseAnonLimitReject,
  planSseRingReplay,
  shouldEvictOldestSseConn,
  SSE_RING_REPLAY_MAX_DEFAULT,
  SSE_ADMIN_MAX_CONN_DEFAULT,
  planNotifyOtherInstances, planSseUserTokenGate, planNotifyQueueEnqueue,
  planNotifyInboundApply,
  applyNotifyMemoryUpsert, applyNotifyMemoryDelete, applyNotifyTombstoneDelete, applyNotifyRefetchedRow,
  countSseLiveConnections, countSseHealthConnections,
} from '../lib/db-sse-fanout-policy';
import {
  normalizeOpFilters,
  sanitizeConflictCols,
  sanitizeOpOrders,
  validateOpScalars,
  opBusyReject,
  opDeletePersistFailedReject,
  opInternalErrorReject,
  opInvalidBodyReject,
  opInvalidTableReject,
  opNicknameDuplicateReject,
  opPayloadRequiredReject,
  opPersistFailedReject,
  opPinExhaustedReject,
  opUnauthenticatedRequesterReject,
  opUnknownOperationReject,
  planBindRequesterId,
  shouldBlockUnauthenticatedRequester,
  opAdminOnlyReject,
  opFunctionsLockedReject,
} from '../lib/db-op-request';
import {
  orderLimitShape,
  sanitizeBroadcastValue,
  sortRowsByOrders,
} from '../lib/db-op-result-shape';
import {
  attachGroupMemberCounts,
  collapseRowsById,
  contactSharesSelectSource,
  dedupeParticipantChatRows,
  likesSelectKeepsLikerId,
  profileViewsSelectKeepsViewerId,
  redactLikerId,
  redactViewerId,
  scopeBlockedUsersRows,
  scopeContactShareEventsRows,
  scopeProfileViewsRows,
  scopeSignalSendsRows,
} from '../lib/db-op-select-scope';
import {
  applyChatReadsSiblingScope,
  chatReadsSiblingIdsForEqFilter,
  collectMyGroupIds,
  expandMessagesChatIdInVals,
  findChatIdEqFilter,
  findChatIdInFilter,
  findIllegalMessagesInChatId,
  isChatRowParticipant,
  mapMessagesOntoCanonicalChatId,
  messagesSelectInNonParticipantReject,
  messagesSelectMissingChatIdFilterReject,
  messagesSelectNonParticipantReject,
  remapGroupIdFilters,
  scopeChatReadsForRequester,
  scopeGroupMessageRows,
  scopeGroupParticipantRows,
  selectAuthRequiredReject,
} from '../lib/db-op-select-access';
import {
  likesHeartLimitReject,
  likesPairIntervalBlocked,
  likesRateLimitReject,
  likesSameTypeLimitReached,
  matchesLikeTriple,
  planLikesMinuteBucketConsume,
} from '../lib/db-op-likes-limits';
import {
  maskNicknameForPinConfirm,
  pinLookupNotFoundReject,
  pinNicknameMismatchReject,
  pinRateLimitedReject, pinLookupInvalidBodyReject, pinLookupInternalReject,
  validateByPinBody,
} from '../lib/db-pin-lookup';
import {
  planStorageUploadAuthPath,
  planStorageUploadContent,
  planStorageRemove,
  planStorageImageAuth,
  storageUploadInternalReject,
  storageRemoveInternalReject,
} from '../lib/db-storage-path';
import {
  validateBroadcastBody,
  broadcastForbiddenReject, broadcastRateLimitedReject, broadcastInternalReject,
  clientIpFromXForwardedFor,
} from '../lib/db-broadcast-validate';
import {
  ALLOWED_RPCS,
  adminPhoneMismatch,
  adminPhoneMismatchReject,
  buildAdminProfilePatchFromArgs,
  panelMapFullReject,
  panelPasswordUnauthorizedReject,
  panelRateLimitedReject,
  pickAdminTokenKey,
  planCheckAdminPassword,
  planCheckTestPassword,
  planVerifyPanelPasswordArgs,
  rpcInvalidBodyReject,
  rpcUnknownReject,
  validateRpcName,
  rpcSessionPersistFailedReject,
  rpcSettingsPersistFailedReject,
  shouldPersistBootstrapPanelPassword,
} from '../lib/db-rpc-allowlist';
import {
  checkUpdateRowOwnership,
  forceUpdateOwnershipPatch,
  planGroupParticipantsUpdate,
  signalSendsUpdateReject,
  updateMissingRequesterReject,
} from '../lib/db-op-update-ownership';
import {
  checkDeleteRowOwnership,
  deleteMissingRequesterReject,
} from '../lib/db-op-delete-ownership';
import {
  chatReadsInsertNonParticipantReject,
  groupChatsInsertReject,
  groupMessagesInsertNonParticipantReject,
  groupParticipantsMissingGroupReject,
  messagesInsertBlockedReject,
  messagesInsertNonParticipantReject,
  planBlockedUsersInsertOwnership,
  planChatReadsInsertOwnership,
  planChatsInsertOwnership,
  planContactShareEventsInsertOwnership,
  planContactSharesInsertOwnership,
  planGroupMessagesInsertOwnership,
  planGroupParticipantsInsertOwnership,
  planLikesInsertOwnership,
  planMessagesInsertOwnership,
  planNormalizeChatPairRow,
  planProfileViewsInsertOwnership,
  planSignalSendsInsertOwnership,
  signalSendsInsertBlockedReject,
  buildInsertedRow,
  findExistingChatPairRow,
  findRowByClientId,
  messageReceiverIdFromChat,
  planSignalSendsExistingRow,
  groupParticipantsLimitReject,
  buildGroupParticipantInsertRow,
  withMessageChatPairFields,
  peerIdFromChat,
  isChatRowParticipantOf,
} from '../lib/db-op-insert-ownership';
import {
  checkUpsertChatReadsReader,
  checkUpsertConflictOwner,
  chatReadsUpsertNonParticipantReject,
  planChatReadsUpsertOwnership,
  planUpsertRelationshipRow,
  relationshipOwnerField,
  signalSendsUpsertReject,
  upsertRelationshipMissingRequesterReject,
  UPSERT_RELATIONSHIP_TABLES,
} from '../lib/db-op-upsert-ownership';
import {
  ADMIN_FIXED_NICKNAME,
  BIRTH_MD_EDIT_MAX,
  adminPhoneDigitsFromSettings,
  findAdminProfileInRows,
  isAdminProfilePhone as isAdminProfilePhonePure,
  isAdminProfileRow as isAdminProfileRowPure,
  withFixedAdminNickname as withFixedAdminNicknamePure,
  planBirthMdEditPatch,
} from '../lib/db-admin-identity';
import {
  planClearAdminNpcRelationships,
  planApplyAdminNpcRelStore,
  ADMIN_EVENT_END_CLEAR_TABLES,
  planWipeTableBroadcast,
  TEST_WIPE_ALL_TABLES,
  ADMIN_EVENT_END_PRESERVE_TABLES,
} from '../lib/db-admin-wipe-plan';
import {
  buildSalesReport,
  salesReportMarkdown,
  SALES_REPORT_LIMIT,
  SALES_REPORT_TABLE,
  isSalesReport,
  type SalesReport,
} from '../lib/db-sales-reports';
import {
  buildAdminSeedProfile,
  planEnsureAdminProfile,
  planRestoreAdminProfileAfterWipe,
} from '../lib/db-admin-ensure-plan';
import {
  PRODUCTION_QR_BASE,
  SECRET_SETTING_KEYS,
  explicitSecretKeys,
  mergeAppSettings as mergeAppSettingsPure,
  overlaySecretsFromDbRow,
  sanitizeAdminSettingsPayload,
  filterTestSettingsPayload,
} from '../lib/db-app-settings-merge';
import {
  appSettingsCoreFieldsBroken,
  buildDefaultAppSettings,
  planAppSettingsSecretsPatch,
} from '../lib/db-app-settings-boot';
import {
  deriveAdminToken,
  deriveTestToken,
  verifyAdminPanelToken,
  verifyTestPanelToken,
  clearDbErrorsInvalidBodyReject, planClearDbErrorsAuth, clearDbErrorsInternalReject,
} from '../lib/db-panel-tokens';
import {
  createImageStore,
  IMAGE_STORE_MAX_ENTRIES_DEFAULT,
  IMAGE_STORE_MAX_CHARS_DEFAULT,
} from '../lib/db-image-store';
import {
  MAX_GROUPS_PER_USER,
  UNLIMITED_GROUP_MEMBERS,
  GROUP_LIMIT_MESSAGE,
  OPT_IN_GROUP_ROOMS,
  AUTO_ROOM_AGE_DECADE,
  AUTO_ROOM_BIRTH_YEAR,
  VISIBLE_AGE_BANDS,
  matchesAfterpartySpec,
  matchesVisibleAgeBand,
  birthYearOfGroup,
  isRetiredAgeRoom,
  optKeyForGroup as optKeyForGroupPure,
  isLeftoverInterestRoom,
  groupLimitSlotKey,
  buildAutoRoomRow,
  patchExistingAutoRoom,
  shouldSkipAutoRoomJoin,
  buildGroupParticipantRow,
  planAutoMatchJoinSpecs,
  planGroupParticipantMerge,
  applyGroupParticipantMergeAction,
  remapRowsGroupId,
  filterRowsByGroupId,
  groupNeedsUnlimitedMaxMembers,
  planVisibleAgeBandRoomSpec,
  planBirthYearRoomSpec,
  collectBirthYearRoomGroups,
} from '../lib/db-group-room-plan';
import {
  hasGroupOptOut as hasGroupOptOutPure,
  participantRowsToLeave as participantRowsToLeavePure,
  countUserGroupSlots as countUserGroupSlotsPure,
  planGroupParticipantsDeleteExpand, buildGroupOptOutRow, planClearGroupOptOutRows,
} from '../lib/db-group-leave-plan';
import {
  profileBirthYearRejected as profileBirthYearRejectedPure,
  profileAvatarColorRejected as profileAvatarColorRejectedPure,
  profileNpcAvatarRejected as profileNpcAvatarRejectedPure,
} from '../lib/db-profile-reject';
import {
  stampChatReadAt as stampChatReadAtPure,
  isChatPairBlocked as isChatPairBlockedPure,
} from '../lib/db-chat-read-block';
import {
  sendReferenceFailure,
  mergeRefreshedRows as mergeRefreshedRowsPure,
  missingWriteRefsByTable,
  evaluateWriteReferences,
  type ReferenceCheck,
} from '../lib/db-reference-check';
import {
  SYSTEM_KV_TABLES,
  mergeKvRowsIntoStore as mergeKvRowsIntoStorePure,
  seedLikesLastInsertMap as seedLikesLastInsertMapPure,
  countRowsCreatedSince,
} from '../lib/db-kv-hydrate';
import {
  HEALTH_LOSS_ALARM_THRESHOLD,
  PIN_WARN_USED_RATIO_DEFAULT,
  planPinPoolStats,
  buildHealthAlarms,
  buildHealthBody,
  shouldWarnPinPool,
  buildPinPoolWarningPush,
  buildAdminDbFailurePush,
  healthUnauthorizedReject,
  healthInternalReject,
  resolveAdminPushRecipient, shouldThrottleEvent, buildHealthRecentCountSql,
} from '../lib/db-health-plan';
import {
  issueSessionToken as issueSessionTokenPure,
  verifySessionToken as verifySessionTokenPure,
  issueSseToken as issueSseTokenPure,
  classifySseToken as classifySseTokenPure,
  verifySseToken as verifySseTokenPure,
  type SseTokenState,
  authLoginDeviceMismatchReject,
  authLoginInternalReject,
  authLoginMapFullReject,
  authLoginRateLimitedReject,
  authLoginUnknownUserReject,
  planAuthLoginDecision,
  validateAuthLoginBody,
  authSseTokenUnauthReject,
  authSseTokenInternalReject,
  planAuthSseTokenUser,
  planProfileDeviceSecretBind, buildDeviceSecretRow,
  resolveAuthUserIdFromParts, buildLoginSuccessBody,
  hashDeviceSecret, deviceSecretHashesEqual,
} from '../lib/db-session-tokens';
import {
  computeUnreadCountsForUser,
  unreadCountsUserIdRequiredReject, unreadCountsUnauthorizedReject, unreadCountsInternalReject,
  readUnreadCountsCache, writeUnreadCountsCache, pruneUnreadCountsCache,
} from '../lib/db-unread-counts';
import {
  planPushForEvent,
  pushSubscribeUnauthorizedReject, validatePushSubscribeBody, planPushSubscribeStore,
  validatePushNotifyRequest, pushNotifyInternalReject,
} from '../lib/db-push-plan';
import {
  isChatParticipant as isChatParticipantPure,
  countMessagesForChat as countMessagesForChatPure,
  chatIdsForPair as chatIdsForPairPure,
  pickCanonicalChatRow as pickCanonicalChatRowPure,
  groupChatsByPair, messageMergeAction, planCanonicalMessageChatId,
  planChatDedupeMergeSteps, planChatReadsForDedupe,
  messagesToRemapOnDedupe, applyIncomingMessageRows,
  applyChatReadDedupeAction,
} from '../lib/db-chat-pair-plan';
import {
  FUNCTIONS_LOCKED_ERROR,
  FUNCTIONS_LOCKED_INSERT_TABLES,
  FUNCTIONS_LOCKED_UPDATE_TABLES,
  publicAppSettingsView,
  settingsFunctionsLocked,
  tableFingerprint,
  planAppSettingsFromDbRows,
  buildReadyPayload,
} from '../lib/db-app-settings-view';
import {
  LEGACY_APP_SETTINGS_KEYS,
  LEGACY_KV_TABLES,
  UNKNOWN_LEGACY_LEFTOVERS,
  settingsHaveLegacyKeys,
  stripLegacySessionHistoryKeys,
  stripLegacySettingsKeys,
  buildLegacyKvLeftoverCountSql,
  buildLegacySettingsLeftoverCountSql,
  buildLegacyHistoryLeftoverCountSql,
  buildLegacySettingsStripSql,
  buildLegacyHistoryStripSql,
  parseLegacyLeftoverCounts,
} from '../lib/db-legacy-cleanup';
import {
  recordExpiredSseToken,
  recordMissingSseToken,
  recordSseAccepted,
  recordSseClosed,
  recordUploadAccepted,
  recordUploadRejected,
  snapshotHttpMetrics,
} from '../lib/http-metrics';

// express-session의 SessionData에 userId 필드 추가
declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

const router = Router();

/** Admin identity: ../lib/db-admin-identity.ts (re-import; store wrappers below). */
function adminPhoneFromSettings(settings?: Record<string, unknown> | null): string {
  return adminPhoneDigitsFromSettings(
    settings ?? (getTable('app_settings')[0] as Record<string, unknown> | undefined),
  );
}

function isAdminProfilePhone(phone: unknown, adminPhoneDigits?: string): boolean {
  return isAdminProfilePhonePure(phone, adminPhoneDigits ?? adminPhoneFromSettings());
}

function isAdminProfileRow(row: Record<string, unknown>, adminPhoneDigits?: string): boolean {
  return isAdminProfileRowPure(row, adminPhoneDigits ?? adminPhoneFromSettings());
}

function withFixedAdminNickname(
  row: Record<string, unknown>,
  adminPhoneDigits?: string,
): Record<string, unknown> {
  return withFixedAdminNicknamePure(row, adminPhoneDigits ?? adminPhoneFromSettings());
}

function findAdminProfileRow(adminPhoneDigits?: string): Record<string, unknown> | undefined {
  const digits = adminPhoneDigits ?? adminPhoneFromSettings();
  return findAdminProfileInRows(getTable('profiles'), digits);
}

/** 범일NPC와의 하트·1:1 채팅·연락처 공유만 제거 (다른 유저 관계는 유지). */
async function clearAdminNpcRelationships(adminId: string): Promise<void> {
  const plan = planClearAdminNpcRelationships(String(adminId), {
    chats: getTable('chats') ?? [],
    messages: getTable('messages') ?? [],
    chat_reads: getTable('chat_reads') ?? [],
    likes: getTable('likes') ?? [],
    contact_shares: getTable('contact_shares') ?? [],
    contact_share_events: getTable('contact_share_events') ?? [],
  });
  if (!plan) return;
  const {
    adminId: aid,
    chatRows,
    msgRows,
    readRows,
    likeRows,
    shareRows,
    shareEventRows,
  } = plan;

  const storePatch = planApplyAdminNpcRelStore({
    plan,
    messages: getTable('messages') ?? [],
    chat_reads: getTable('chat_reads') ?? [],
    chats: getTable('chats') ?? [],
    likes: getTable('likes') ?? [],
    contact_shares: getTable('contact_shares') ?? [],
    contact_share_events: getTable('contact_share_events') ?? [],
    likeRateKeys: _likesLastInsert.keys(),
  });
  if (storePatch.messages) store['messages'] = storePatch.messages;
  if (storePatch.chat_reads) {
    store['chat_reads'] = storePatch.chat_reads;
    unreadCountsCache.clear();
  }
  if (storePatch.chats) store['chats'] = storePatch.chats;
  if (storePatch.likes) {
    store['likes'] = storePatch.likes;
    for (const key of storePatch.likeRateKeysToDelete) _likesLastInsert.delete(key);
  }
  if (storePatch.contact_shares) store['contact_shares'] = storePatch.contact_shares;
  if (storePatch.contact_share_events) store['contact_share_events'] = storePatch.contact_share_events;

  const persistDeletes: Promise<void>[] = [];
  for (const m of msgRows) {
    broadcastAll({ type: 'change', table: 'messages', event: 'DELETE', newRow: null, oldRow: m });
    if (m.id != null) persistDeletes.push(dbDeleteRow('messages', String(m.id)));
  }
  for (const r of readRows) {
    broadcastAll({ type: 'change', table: 'chat_reads', event: 'DELETE', newRow: null, oldRow: r });
    if (r.id != null) persistDeletes.push(dbDeleteRow('chat_reads', String(r.id)));
  }
  for (const c of chatRows) {
    broadcastAll({ type: 'change', table: 'chats', event: 'DELETE', newRow: null, oldRow: c });
    if (c.id != null) persistDeletes.push(dbDeleteRow('chats', String(c.id)));
  }
  for (const l of likeRows) {
    smartBroadcast('likes', l, { type: 'change', table: 'likes', event: 'DELETE', newRow: null, oldRow: l });
    if (l.id != null) persistDeletes.push(dbDeleteRow('likes', String(l.id)));
  }
  for (const s of shareRows) {
    smartBroadcast('contact_shares', s, {
      type: 'change', table: 'contact_shares', event: 'DELETE', newRow: null, oldRow: s,
    });
    if (s.id != null) persistDeletes.push(dbDeleteRow('contact_shares', String(s.id)));
  }
  for (const e of shareEventRows) {
    smartBroadcast('contact_share_events', e, {
      type: 'change', table: 'contact_share_events', event: 'DELETE', newRow: null, oldRow: e,
    });
    if (e.id != null) persistDeletes.push(dbDeleteRow('contact_share_events', String(e.id)));
  }

  if (persistDeletes.length) {
    await Promise.all(persistDeletes).catch(err => {
      logger.error({ err, adminId: aid }, '[db] clearAdminNpcRelationships persist failed');
    });
  }
  if (msgRows.length || chatRows.length || likeRows.length || shareRows.length || shareEventRows.length) {
    logger.info({
      adminId: aid,
      messages: msgRows.length,
      chats: chatRows.length,
      likes: likeRows.length,
      contactShares: shareRows.length,
      contactShareEvents: shareEventRows.length,
    }, '[db] clearAdminNpcRelationships');
  }
}

/** 범일NPC 프로필이 profiles에 항상 1행 존재하도록 보장 (부팅·리셋 후). */
async function ensureAdminProfile(): Promise<Record<string, unknown> | null> {
  const settings = (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
  const profiles = getTable('profiles');
  const now = ts();
  const plan = planEnsureAdminProfile({
    settings,
    profiles,
    now,
    npcAvatarSentinel: NPC_TEXT_AVATAR_SENTINEL,
  });
  if (plan.action === 'skip') return null;
  if (plan.action === 'keep') return plan.row;
  if (plan.action === 'repair') {
    getTable('profiles')[plan.profileIndex] = plan.fixed;
    try {
      await dbPersistRow('profiles', plan.fixed);
    } catch (e) {
      logger.error({ err: e }, '[db] ensureAdminProfile nickname/avatar repair failed');
    }
    broadcastAll({
      type: 'change',
      table: 'profiles',
      event: 'UPDATE',
      newRow: sanitizeProfile(plan.fixed),
      oldRow: sanitizeProfile(plan.existing),
    });
    return plan.fixed;
  }

  const tableData = getTable('profiles');
  const usedPins = collectUsedPinCodes(tableData);
  const { use5Digit, poolSize } = pinPoolParams(tableData.length);
  const pinResult = resolvePin(usedPins, poolSize, use5Digit, null);
  if (!pinResult.ok) {
    logger.error('[db] ensureAdminProfile: PIN pool exhausted');
    return null;
  }

  const row = buildAdminSeedProfile({
    adminPhoneDigits: plan.adminPhoneDigits,
    phoneDisplay: plan.phoneDisplay,
    now,
    fallbackId: crypto.randomUUID(),
    pin: pinResult.pin,
    npcAvatarSentinel: NPC_TEXT_AVATAR_SENTINEL,
  });
  tableData.push(row);
  try {
    await dbPersistRow('profiles', row);
  } catch (e) {
    tableData.pop();
    logger.error({ err: e }, '[db] ensureAdminProfile seed persist failed');
    return null;
  }
  broadcastAll({
    type: 'change',
    table: 'profiles',
    event: 'INSERT',
    newRow: sanitizeProfile(row),
    oldRow: null,
  });
  logger.info({ id: row.id }, '[db] ensureAdminProfile: seeded 범일NPC');
  return row;
}

/** 회식 종료·참여자 전체 초기화 후 범일NPC 1행 복원 (인메모리 + PG persist + SSE). */
async function restoreAdminProfileAfterWipeInStore(
  oldProfiles: Record<string, unknown>[],
  settingsRow: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString();
  const plan = planRestoreAdminProfileAfterWipe({
    oldProfiles,
    settingsRow,
    now,
    fallbackId: crypto.randomUUID(),
    npcAvatarSentinel: NPC_TEXT_AVATAR_SENTINEL,
  });
  if (plan.action === 'ensure_fallback') {
    await ensureAdminProfile();
    return;
  }
  const restored = plan.row;
  if (!restored['pin_code']) {
    const { use5Digit, poolSize } = pinPoolParams(1);
    const pinResult = resolvePin(new Set(), poolSize, use5Digit, null);
    if (pinResult.ok) restored['pin_code'] = pinResult.pin;
  }
  store['profiles'] = [restored];
  try {
    await dbPersistRow('profiles', restored);
  } catch (e) {
    logger.error({ err: e }, '[db] restore admin profile after wipe failed');
  }
  broadcastAll({
    type: 'change',
    table: 'profiles',
    event: 'INSERT',
    newRow: sanitizeProfile(restored),
    oldRow: null,
  });
}

/** 관리자/테스트 전체 초기화 — reset_signal persist + SSE (유저·테스트 대시보드 동기화). */
async function bumpResetSignalAndBroadcast(): Promise<string> {
  const signal = new Date().toISOString();
  const current = (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
  const merged = mergeAppSettings(current, { reset_signal: signal, updated_at: signal });
  const updated = await overlayDbSecrets(merged, new Set());
  store['app_settings'] = [updated];
  try {
    await dbPersistRow('app_settings', updated);
  } catch (e) {
    store['app_settings'] = [current];
    logger.error({ err: e }, '[db] bumpResetSignal persist failed');
    throw e;
  }
  smartBroadcast('app_settings', updated, {
    type: 'change', table: 'app_settings', event: 'UPDATE',
    newRow: updated, oldRow: current,
  });
  const adminRow = await ensureAdminProfile();
  if (adminRow?.id != null) {
    await clearAdminNpcRelationships(String(adminRow.id));
  }
  return signal;
}

class RpcAuthError extends Error {
  statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = 'RpcAuthError';
  }
}

// ─── Admin token — HMAC 기반 (서버 재시작 후에도 유효, in-memory Set 불필요) ──
// 토큰 = HMAC-SHA256(key = SESSION_SECRET + adminPassword, data = 'admin-session')
// 서버는 현재 admin_password를 읽어 HMAC을 재계산한 뒤 timingSafeEqual로 비교
// → 비밀번호 변경 시 자동 무효화, 재시작 후에도 동일 토큰 검증 가능

/** Thin wrappers — HMAC verify lives in db-panel-tokens; getTable stays local. */
function verifyAdminToken(provided: string | null | undefined): boolean {
  const settings = (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
  const secrets = panelAdminSecrets(String(settings.admin_password ?? ''));
  return verifyAdminPanelToken(provided, secrets);
}

function verifyTestToken(provided: string | null | undefined): boolean {
  const settings = (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
  const secrets = panelTestSecrets(String(settings.test_password ?? ''));
  return verifyTestPanelToken(provided, secrets);
}

// 관리자 SSE 연결 집합 — 일반 sseUserMap과 분리해 모든 이벤트(private 포함) 수신
const sseAdminClients = new Set<Response>();

// ─── PostgreSQL connection pool ────────────────────────────────────────────────
import { pgPool as pool } from '../lib/pg-pool.js';

// 인스턴스마다 고유 ID — 자신이 보낸 NOTIFY를 수신해도 중복 처리 방지
const INSTANCE_ID = crypto.randomUUID();

// ─── In-memory cache (loaded from DB on startup, write-through on every change)
const store: Record<string, Record<string, unknown>[]> = {};
const WIPE_PRESERVED_TABLES = new Set<string>(ADMIN_EVENT_END_PRESERVE_TABLES);
/** RAM 캐시. 넘치면 오래된 항목부터 지우고, 조회 시 Postgres에서 다시 채움. */
// imageStore: ../lib/db-image-store.ts
const IMAGE_STORE_MAX_ENTRIES = IMAGE_STORE_MAX_ENTRIES_DEFAULT;
const IMAGE_STORE_MAX_CHARS = IMAGE_STORE_MAX_CHARS_DEFAULT;
const _imageStore = createImageStore({ maxEntries: IMAGE_STORE_MAX_ENTRIES, maxChars: IMAGE_STORE_MAX_CHARS });
const imageStoreGet = _imageStore.get;
const imageStoreSet = _imageStore.set;

// ALLOWED_OP_TABLES: ../lib/db-table-policy.ts

// ─── SSE Event Ring Buffer — implementation in ../lib/db-sse-ring.ts ───────────
// TTL 초과 단절은 onSseReconnect → loadMessages 전체 리로드로 폴백.
const SSE_RING_MAX = SSE_RING_MAX_DEFAULT;           // ~1000 × ~1 KB ≈ 1 MB 상한 [Part1-Fix1]
const SSE_RING_TTL_MS = SSE_RING_TTL_MS_DEFAULT; // 20분 — Last-Event-ID 복구 커버 [Part1-Fix1]
const _sseRing = createSseRing({ max: SSE_RING_MAX, ttlMs: SSE_RING_TTL_MS });
const _ringAdd = _sseRing.add;
const _ringGetSince = _sseRing.getSince;

// sanitize helpers: ../lib/db-sanitize.ts

// ─── Concurrency limiter — graceful 503 when too many concurrent /op requests ──
// /op는 in-memory 서빙이지만 Node.js 이벤트 루프 포화 방지용 상한선
let _activeOpCount = 0;
const MAX_CONCURRENT_OPS = Number(process.env.MAX_CONCURRENT_OPS ?? 300);

// ─── Per-IP rate limiters: ../lib/db-rate-limit.ts ─────────────────────────────
setInterval(() => {
  const now = Date.now();
  pruneRateMap(_loginRateMap, now);
  pruneRateMap(_uploadRateMap, now);
}, 2 * 60 * 1000).unref();

// /events (SSE): IP당 최대 동시 연결. 인증된 재연결은 NAT 공인 IP 한도를 넘어도 per-user cap 적용.
const _sseConnPerIp = new Map<string, number>();
const SSE_MAX_CONN_PER_IP = Number(process.env.SSE_MAX_CONN_PER_IP ?? 200);
const SSE_MAX_TOTAL = Number(process.env.SSE_MAX_TOTAL ?? 4000);
const SSE_MAX_CONN_PER_USER = Number(process.env.SSE_MAX_CONN_PER_USER ?? 4);

// Image magic / MIME: ../lib/db-image-magic.ts

// ─── Per-user global likes rate limit (독립 조합 스팸 방지) ──────────────────────
const LIKES_MAX_PER_USER_PER_MIN = 20; // 1분에 20개 초과 시 429
const _userLikeMinuteBuckets = new Map<string, { count: number; resetAt: number }>();

/**
 * 멀티 인스턴스 공용 rate limit — app_kv_rows 로 직렬화.
 * 테스트/DB 장애 시에는 in-memory 로 폴백.
 */
async function claimDistributedRateSlot(
  rowId: string,
  minIntervalMs: number,
): Promise<boolean> {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return true;
  try {
    const { rows } = await pool.query(
      buildDistributedRateSlotSql(),
      [rowId, minIntervalMs],
    );
    return rows.length > 0;
  } catch (e) {
    logger.warn({ err: e, rowId }, '[db] distributed rate slot failed — memory fallback');
    return true; // 호출측 memory 가드가 처리
  }
}

async function claimDistributedMinuteQuota(
  rowId: string,
  maxPerMinute: number,
): Promise<boolean> {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return true;
  try {
    const { rows } = await pool.query(
      buildDistributedMinuteQuotaSql(),
      [rowId, maxPerMinute],
    );
    return rows.length > 0;
  } catch (e) {
    logger.warn({ err: e, rowId }, '[db] distributed minute quota failed — memory fallback');
    return true;
  }
}

// ─── DB persist error tracking ────────────────────────────────────────────────
let _dbPersistErrors = 0;
interface PersistErrorEntry { table: string; time: number; msg: string }
const _dbPersistErrorLog: PersistErrorEntry[] = [];

// ─── Admin DB failure push throttle ──────────────────────────────────────────
// At most 1 admin alert push every 5 minutes to avoid spamming on cascading failures.
const ADMIN_DB_PUSH_THROTTLE_MS = 5 * 60 * 1000;
let _lastAdminDbPushAt = 0;

// ─── Admin PIN pool warning push throttle ─────────────────────────────────────
// At most 1 PIN pool warning push per hour to avoid repeat noise.
const ADMIN_PIN_PUSH_THROTTLE_MS = 60 * 60 * 1000;
let _lastAdminPinPushAt = 0;
// 85% used = 15% remaining triggers the alert.

/** Helper: send a push notification to the admin.
 *  Returns false if no push subscription is found. */
async function _sendAdminPush(payload: PushPayload): Promise<boolean> {
  const recipient = resolveAdminPushRecipient(
    (store['app_settings'] ?? [])[0] as Record<string, unknown> | undefined,
    store['profiles'] ?? [],
  );
  if (!recipient) return false;
  const adminId = recipient.adminId;
  const subs = (store['push_subscriptions'] ?? []).filter(s => s['user_id'] === adminId);
  if (!subs.length) return false;
  const results = await Promise.all(
    subs.map(sub => sendPush(
      { endpoint: sub['endpoint'] as string, keys: { auth: sub['auth'] as string, p256dh: sub['p256dh'] as string } },
      payload,
    ).then(ok => ({ id: sub['id'] as string, ok })).catch(() => ({ id: sub['id'] as string, ok: false }))),
  );
  const expired = results.filter(r => !r.ok).map(r => r.id);
  if (expired.length) {
    store['push_subscriptions'] = (store['push_subscriptions'] ?? []).filter(s => !expired.includes(s['id'] as string));
    dbDeleteRows('push_subscriptions', expired).catch(e => logger.error({ err: e }, '[db] background task error'));
  }
  return results.some(r => r.ok);
}

/** Send a push notification to the admin for a DB persist failure.
 *  Throttled to at most once every 5 minutes.
 *  Errors are swallowed — we must not recurse into dbPersistRow. */
async function notifyAdminDbFailure(tableName: string, errMsg: string): Promise<void> {
  const now = Date.now();
  if (shouldThrottleEvent(now, _lastAdminDbPushAt, ADMIN_DB_PUSH_THROTTLE_MS)) return;
  _lastAdminDbPushAt = now;
  try {
    const sent = await _sendAdminPush(buildAdminDbFailurePush(tableName, errMsg));
    if (sent) logger.info({ tableName }, '[db] Admin DB failure push sent');
  } catch (e) {
    logger.error({ err: e, tableName }, '[db] Failed to send admin DB failure push');
  }
}

/** Send a push notification to the admin when the PIN pool crosses the 85% usage mark.
 *  Throttled to at most once per hour.
 *  Errors are swallowed. */
async function checkAndNotifyAdminPinPool(): Promise<void> {
  const pinPool = planPinPoolStats(getTable('profiles'));
  if (!shouldWarnPinPool(pinPool, PIN_WARN_USED_RATIO_DEFAULT)) return; // below threshold — no alert

  const now = Date.now();
  if (shouldThrottleEvent(now, _lastAdminPinPushAt, ADMIN_PIN_PUSH_THROTTLE_MS)) return;
  _lastAdminPinPushAt = now;

  try {
    const payload = buildPinPoolWarningPush(pinPool);
    const sent = await _sendAdminPush(payload);
    if (sent) {
      logger.info({
        usedCount: pinPool.total - pinPool.remaining,
        poolSize: pinPool.total,
        pct: payload.pct,
      }, '[db] Admin PIN pool warning push sent');
    }
  } catch (e) {
    logger.error({ err: e }, '[db] Failed to send admin PIN pool warning push');
  }
}

/** Write the current error counter to DB directly on the pool.
 *  Must NOT call dbPersistRow (infinite recursion risk).
 *  Errors from this write are swallowed — the DB may be down. */
async function flushErrorStateToDB(): Promise<void> {
  try {
    await pool.query(
      buildErrorLogCounterUpsertSql(),
      [JSON.stringify({ count: _dbPersistErrors, log: _dbPersistErrorLog })],
    );
  } catch (e) {
    logger.error({ err: e }, '[db] Failed to persist error state');
  }
}

// ─── Shutdown broadcast — 서버 재시작 전 모든 SSE 클라이언트에 즉시 알림 ────────
// 클라이언트가 {"type":"shutdown"} 수신 시 백오프 없이 즉시 재연결하므로
// 서버 재시작이 사용자에게 거의 투명하게 보임 (60s 대기 → <1s 재연결)
//
// retry:100 — 브라우저 내장 EventSource에게도 100ms 후 재시도 지시
// res.end() Promise 집합을 기다렸다가 모두 drain된 후 process.exit() 실행해
// 클라이언트가 shutdown 이벤트를 실제로 수신함을 보장
function broadcastShutdownToAllSseClients(): Promise<void> {
  // retry:100 필드 → 브라우저 내장 EventSource가 100ms 후 재연결 시도
  const payload = 'retry: 100\ndata: {"type":"shutdown"}\n\n';
  const allRes: Response[] = [];
  for (const conns of sseUserMap.values()) for (const r of conns) allRes.push(r);
  for (const r of sseAnonClients) allRes.push(r);
  for (const r of sseAdminClients) allRes.push(r);
  const drainPromises = allRes.map(r => new Promise<void>(resolve => {
    try {
      r.write(payload, () => {
        try { r.end(resolve); } catch { resolve(); }
      });
    } catch {
      try { r.end(resolve); } catch { resolve(); }
    }
  }));
  // 최대 200ms 대기 — 네트워크 버퍼 drain 보장
  return Promise.race([
    Promise.all(drainPromises).then(() => {}),
    new Promise<void>(resolve => setTimeout(resolve, 200)),
  ]);
}

/** index.ts SIGTERM/SIGINT — SSE shutdown 알림 + 에러 카운터 flush */
export async function prepareForShutdown(): Promise<void> {
  await broadcastShutdownToAllSseClients();
  await flushErrorStateToDB();
}

// SSE clients — userId별 연결 관리 (보안: 민감 이벤트는 당사자에게만 전송)
const sseUserMap = new Map<string, Set<Response>>();   // userId → 연결 집합
const sseAnonClients = new Set<Response>();             // userId 미등록 연결 (폴백)

// ─── Likes time-bucket rate limiter ──────────────────────────────────────────
// JavaScript is single-threaded so in-memory checks are inherently race-free,
// but this adds an explicit 500 ms cooldown per (liker_id, liked_id) pair as a
// belt-and-suspenders guard against rapid-fire bursts (e.g. 100 VUs hammering
// the same endpoint simultaneously — each VU blocked before it even hits the
// type-dedup check).
const _likesLastInsert = new Map<string, number>(); // `${liker}:${liked}` → epoch ms
const LIKES_MIN_INTERVAL_MS = 500;
setInterval(() => {
  const cutoff = Date.now() - 10_000;
  for (const [k, t] of _likesLastInsert) if (t < cutoff) _likesLastInsert.delete(k);
}, 10_000).unref();

// Fix #1: _userLikeMinuteBuckets 만료 버킷 5분마다 정리 — 무한 메모리 누수 방지
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of _userLikeMinuteBuckets) if (b.resetAt < now) _userLikeMinuteBuckets.delete(k);
}, 5 * 60 * 1000).unref();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function genId(): string {
  return crypto.randomUUID();
}

function ts(): string {
  return new Date().toISOString();
}

/** Thin wrapper — ts() stays local. */
function stampChatReadAt(row: Record<string, unknown>): void {
  stampChatReadAtPure(row, ts());
}

function getTable(name: string): Record<string, unknown>[] {
  if (!store[name]) store[name] = [];
  return store[name];
}

/** Thin wrapper — getTable stays local. */
function isChatPairBlocked(userA: string, userB: string): boolean {
  return isChatPairBlockedPure(getTable('blocked_users'), userA, userB);
}

/** Thin wrapper — merge lives in db-reference-check. */
function mergeRefreshedRows(table: string, rows: Array<{ data?: unknown }>): void {
  mergeRefreshedRowsPure(getTable(table), rows);
}

/** RAM miss only: make one narrow PG read for the referenced row ids. */
async function refreshReferencedRows(table: string, ids: string[]): Promise<boolean> {
  const wanted = [...new Set(ids.map(String).filter(Boolean))];
  if (!wanted.length) return true;
  try {
    const { rows } = await pool.query(
      buildKvSelectByRowIdsSql(),
      [table, wanted],
    );
    mergeRefreshedRows(table, rows);
    return true;
  } catch (e) {
    logger.warn({ err: e, table }, '[integrity] targeted reference refresh failed');
    return false;
  }
}

async function ensureWriteReferences(
  sourceTable: string,
  row: Record<string, unknown>,
): Promise<ReferenceCheck> {
  const refs = writeReferencesFor(sourceTable, row);
  const hasRow = (table: string, id: string) =>
    getTable(table).some(candidate => String(candidate.id) === id);
  const missingByTable = missingWriteRefsByTable(refs, hasRow);
  for (const [table, ids] of missingByTable) {
    if (!(await refreshReferencedRows(table, ids))) return { ok: false, unavailable: true };
  }
  return evaluateWriteReferences(refs, hasRow);
}

/** Membership can arrive through NOTIFY after the room row, so refresh this pair once on a miss. */
async function refreshGroupParticipant(groupId: string, userId: string): Promise<'found' | 'missing' | 'unavailable'> {
  try {
    const { rows } = await pool.query(
      buildGroupParticipantLookupSql(),
      [groupId, userId],
    );
    mergeRefreshedRows('group_participants', rows);
    return getTable('group_participants').some(
      row => String(row.group_id) === groupId && String(row.user_id) === userId,
    ) ? 'found' : 'missing';
  } catch (e) {
    logger.warn({ err: e, table: 'group_participants' }, '[integrity] targeted membership refresh failed');
    return 'unavailable';
  }
}

const INTEGRITY_SCAN_MAX_ROWS = clampIntegrityScanMaxRows(
  Number(process.env.INTEGRITY_SCAN_MAX_ROWS ?? 20_000),
);
const INTEGRITY_SCAN_INTERVAL_MS = clampIntegrityScanIntervalMs(
  Number(process.env.INTEGRITY_SCAN_INTERVAL_MS ?? 5 * 60 * 1000),
);
let _integrityDiagnostics: IntegrityDiagnostics = collectIntegrityDiagnostics(store, INTEGRITY_SCAN_MAX_ROWS);
let _integrityDiagnosticsStarted = false;

function runIntegrityDiagnostics(): void {
  _integrityDiagnostics = collectIntegrityDiagnostics(store, INTEGRITY_SCAN_MAX_ROWS);
  logger.info({ integrity: _integrityDiagnostics }, '[integrity] bounded orphan counts');
}

function startIntegrityDiagnostics(): void {
  if (_integrityDiagnosticsStarted) return;
  _integrityDiagnosticsStarted = true;
  runIntegrityDiagnostics();
  setInterval(runIntegrityDiagnostics, INTEGRITY_SCAN_INTERVAL_MS).unref();
}

// chatPairKey / deterministicChatId: ../lib/db-chat-ids.ts

/** 채팅 쌍 생성 직렬화 — 인스턴스 간 race 를 PG advisory lock 으로 차단 */
async function withChatPairLock<T>(pairKey: string, fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ h: number }>('SELECT hashtext($1)::int AS h', [pairKey]);
    const lockId = rows[0]?.h ?? 0;
    await client.query('SELECT pg_advisory_lock($1)', [lockId]);
    try {
      return await fn();
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [lockId]).catch(() => {});
    }
  } finally {
    client.release();
  }
}

/** CRITICAL_PERSIST_TABLES: ../lib/db-table-policy.ts */

/** SSE 타겟 수집 (테스트·브로드캐스트 공용) — 구현은 db-broadcast-targets.ts */
export function collectBroadcastTargets(
  table: string,
  row: Record<string, unknown> | null,
  findChat: (chatId: string) => Record<string, unknown> | undefined = (id) =>
    getTable('chats').find(c => String(c['id']) === String(id)),
): string[] {
  return collectBroadcastTargetsImpl(
    table,
    row,
    findChat,
    (gid) => getTable('group_participants').filter(p => String(p.group_id) === String(gid)),
  );
}

/** Chat pair / dedupe / message-merge planners: ../lib/db-chat-pair-plan.ts (re-import). */

/** Thin wrapper — resolveMergedChatId + getTable stay local. */
function isChatParticipant(chatId: unknown, userId: string): boolean {
  return isChatParticipantPure(
    chatId,
    userId,
    (id) => getTable('chats').find(c => String(c.id) === id),
    resolveMergedChatId,
  );
}

function countMessagesForChat(chatId: string): number {
  return countMessagesForChatPure(chatId, getTable('messages'));
}

/** 동일 user 쌍의 모든 chat id (메시지 조회·병합용) */
function chatIdsForPair(u1: string, u2: string): string[] {
  return chatIdsForPairPure(u1, u2, getTable('chats'));
}

/** 병합된 옛 방 id → canonical (프로세스 동안 SELECT 리다이렉트) — db-merged-id-map */
const _mergedChatIds = createMergedIdMap(2000);
const rememberMergedChat = _mergedChatIds.remember;
const resolveMergedChatId = _mergedChatIds.resolve;

/** 방 단위로 PG에서 메시지를 메모리에 합침 — 전역 LIMIT 때문에 옛 대화가 비는 것 방지 */
async function mergeMessagesForChatIds(chatIds: string[]): Promise<void> {
  const ids = [...new Set(chatIds.map(String).filter(Boolean))];
  if (!ids.length) return;
  try {
    const { rows } = await pool.query(
      buildMessagesByChatIdsSql(),
      [ids],
    );
    if (!rows.length) return;
    applyIncomingMessageRows(
      getTable('messages'),
      rows.map(r => r.data as Record<string, unknown>),
    );
  } catch (e) {
    logger.warn({ err: e }, '[db] mergeMessagesForChatIds failed');
  }
}

function pickCanonicalChatRow(group: Record<string, unknown>[]): Record<string, unknown> {
  return pickCanonicalChatRowPure(group, countMessagesForChat);
}

/** 중복 1:1 채팅방 병합 — 메시지·읽음을 canonical 방으로 이전 */
async function dedupeChatsInStore(): Promise<number> {
  const chats = getTable('chats');
  if (chats.length < 2) return 0;
  const steps = planChatDedupeMergeSteps(chats, countMessagesForChat);
  let merged = 0;
  for (const { canonicalId, dupId } of steps) {
    for (const msg of messagesToRemapOnDedupe(getTable('messages'), dupId)) {
      msg.chat_id = canonicalId;
      void dbPersistRow('messages', msg);
    }
    const reads = getTable('chat_reads');
    for (const action of planChatReadsForDedupe(reads, dupId, canonicalId)) {
      for (const effect of applyChatReadDedupeAction(reads, action, { canonicalId, dupId })) {
        if (effect.kind === 'persist') void dbPersistRow('chat_reads', effect.row);
        else void dbDeleteRow('chat_reads', effect.id);
      }
    }
    const idx = chats.findIndex(c => String(c.id) === dupId);
    if (idx >= 0) chats.splice(idx, 1);
    void dbDeleteRow('chats', dupId);
    rememberMergedChat(dupId, canonicalId);
    merged++;
  }
  if (merged > 0) {
    logger.info({ merged }, '[db] dedupeChatsInStore merged duplicate chat rooms');
  }
  return merged;
}

// ─── PostgreSQL persistence helpers ───────────────────────────────────────────
// [Part1-Fix4] Per-(table, row_id) write serialization — 동시 upsert 순서 역전 방지
// 동일 키의 새 write는 이전 promise 완료 후 실행 → 오래된 스냅샷이 최신 데이터를 덮어쓰지 않음
const _dbWriteLocks = new Map<string, Promise<void>>();
async function dbPersistRow(tableName: string, row: Record<string, unknown>): Promise<void> {
  const rowId = String(row.id ?? genId());
  const key = `${tableName}:${rowId}`;

  // 동일 key의 in-flight write가 있으면 chain — 완료 순서를 호출 순서와 일치시킴
  const prev = _dbWriteLocks.get(key) ?? Promise.resolve();
  const next: Promise<void> = prev.then(() => _execDbPersistRow(tableName, rowId, row)).finally(() => {
    // 이 Promise가 여전히 최신이면 Map에서 삭제 (메모리 해제)
    if (_dbWriteLocks.get(key) === next) _dbWriteLocks.delete(key);
  });
  _dbWriteLocks.set(key, next);
  return next;
}

async function _execDbPersistRow(tableName: string, rowId: string, row: Record<string, unknown>): Promise<void> {
  const sql = buildKvUpsertSql();
  const params = [tableName, rowId, JSON.stringify(row)];
  try {
    await pool.query(sql, params);
  } catch {
    // 1회 재시도 — 일시적 연결 오류(ECONNRESET, idle timeout) 자동 복구
    await new Promise<void>(r => setTimeout(r, 500));
    try {
      await pool.query(sql, params);
    } catch (e) {
      _dbPersistErrors++;
      _dbPersistErrorLog.push({ table: tableName, time: Date.now(), msg: String(e) });
      if (_dbPersistErrorLog.length > 100) _dbPersistErrorLog.shift();
      await flushErrorStateToDB();
      notifyAdminDbFailure(tableName, String(e)).catch(e2 => logger.error({ err: e2 }, '[db] notifyAdminDbFailure failed'));
      throw e;
    }
  }
  if (REALTIME_TRACE_TABLES.has(tableName)) {
    logger.info(realtimeTraceMeta(tableName, row), '[realtime] db-save');
  }
}

async function dbDeleteRow(tableName: string, rowId: string): Promise<void> {
  try {
    await pool.query(
      buildKvDeleteRowSql(),
      [tableName, rowId],
    );
  } catch (e) {
    logger.error({ err: e, tableName, rowId }, '[db] dbDeleteRow failed');
  }
}

// ── 배치 삭제: N+1 쿼리 제거 ──────────────────────────────────────────────────
async function dbDeleteRows(tableName: string, rowIds: string[]): Promise<void> {
  if (!rowIds.length) return;
  try {
    await pool.query(
      buildKvDeleteRowsSql(),
      [tableName, rowIds],
    );
  } catch (e) {
    logger.error({ err: e, tableName, count: rowIds.length }, '[db] dbDeleteRows (batch) failed');
    throw e;
  }
}

async function dbDeleteTable(tableName: string): Promise<void> {
  try {
    await pool.query(buildKvDeleteTableSql(), [tableName]);
  } catch (e) {
    logger.error({ err: e, tableName }, '[db] dbDeleteTable failed');
  }
}

async function dbPersistImage(path: string, dataUrl: string): Promise<void> {
  try {
    await pool.query(
      buildImageUpsertSql(),
      [path, dataUrl],
    );
  } catch (e) {
    logger.error({ err: e, path }, '[db] dbPersistImage failed');
    throw e; // 호출자(storage-upload)가 catch로 처리할 수 있도록 다시 던짐
  }
}

// ─── Startup: initialize storage schema and load data ────────────────────────
/** Supabase PostgREST(anon key)로 public 테이블이 노출되지 않도록 RLS + revoke. postgres(DATABASE_URL)는 owner라 bypass. */
async function ensurePublicTableRls(): Promise<void> {
  try {
    await pool.query(buildPublicTableRlsSql());
    logger.info('[db] public schema RLS enabled (anon/authenticated revoked)');
  } catch (e) {
    logger.error({ err: e }, '[db] ensurePublicTableRls failed — run scripts/sql/enable-rls-public-tables.sql manually');
  }
}

async function ensureStorageSchema(): Promise<void> {
  await pool.query(buildEnsureKvRowsTableSql());
  await pool.query(buildEnsureImageStoreTableSql());
  await pool.query(buildKvTableUpdatedIndexSql());
  await ensurePublicTableRls();
}

async function loadImagesFromDb(): Promise<void> {
  try {
    const imgs = await pool.query(buildLoadImagesSql());
    for (const img of imgs.rows) {
      imageStoreSet(img.path, img.data_url);
    }
  } catch (e) {
    logger.warn({ err: e }, '[db] image preload failed');
  }
}

/** Thin wrapper — pure hydrate lives in db-kv-hydrate. */
function mergeKvRowsIntoStore(rows: Array<{ table_name: string; row_id: string; data: unknown }>): void {
  mergeKvRowsIntoStorePure(rows, store, {
    systemTables: SYSTEM_KV_TABLES,
    legacyTables: LEGACY_KV_TABLES,
    onErrorLogCounter: (saved) => {
      if (typeof saved.count === 'number') _dbPersistErrors = saved.count;
      if (Array.isArray(saved.log)) {
        _dbPersistErrorLog.length = 0;
        _dbPersistErrorLog.push(...saved.log.slice(-100));
      }
    },
    stripSessionHistory: stripLegacySessionHistoryKeys,
  });
}

/** Thin wrapper — pure seed lives in db-kv-hydrate; logger stays local. */
function seedLikesLastInsertFromStore(): void {
  const count = seedLikesLastInsertMapPure(store['likes'] ?? [], _likesLastInsert, Date.now());
  if (count > 0) {
    logger.info({ count }, '[db] Seeded _likesLastInsert from DB on startup');
  }
}

/** HOT_TABLES: ../lib/db-store-merge.ts */

async function loadHotTablesFromDb(): Promise<void> {
  try {
    const { rows } = await pool.query(
      buildLoadHotKvTablesSql(),
      [HOT_TABLES],
    );
    mergeKvRowsIntoStore(rows);
  } catch (e) {
    logger.error({ err: e }, '[db] Failed to load hot tables from DB');
  }
}

async function loadRemainingTablesFromDb(): Promise<void> {
  try {
    const { rows } = await pool.query(
      buildLoadRemainingKvTablesSql(),
      [HOT_TABLES],
    );
    mergeKvRowsIntoStore(rows);
    seedLikesLastInsertFromStore();
  } catch (e) {
    logger.error({ err: e }, '[db] Failed to load remaining tables from DB');
  }
}

// ─── Seed data (only if DB is empty) ─────────────────────────────────────────
/** Thin wrapper — pure builder lives in db-app-settings-boot. */
function defaultAppSettings(): Record<string, unknown> {
  return buildDefaultAppSettings({
    now: ts(),
    bootstrapAdmin: process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim(),
    bootstrapTest: process.env.BOOTSTRAP_TEST_PASSWORD?.trim(),
    panelDefault: PANEL_DEFAULT_PASSWORD,
    productionQrBase: PRODUCTION_QR_BASE,
  });
}

/** Postgres leftover 잔량 — 값/PII 없이 개수만. -1 은 아직 클린업 전. */
let _legacyLeftovers = { ...UNKNOWN_LEGACY_LEFTOVERS };

/** Thin wrapper — pure merge lives in db-app-settings-merge. */
function mergeAppSettings(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return mergeAppSettingsPure(current, patch, defaultAppSettings(), ts());
}

/** 비비밀번호 설정 저장이 Postgres에 이미 있는 패널 비밀번호를 덮어쓰지 않게 함 */
async function overlayDbSecrets(
  row: Record<string, unknown>,
  explicit: Set<string>,
): Promise<Record<string, unknown>> {
  try {
    const { rows } = await pool.query(
      buildAppSettingsLatestSql(),
    );
    const db = rows[0]?.data as Record<string, unknown> | undefined;
    if (!db || typeof db !== 'object') return row;
    return overlaySecretsFromDbRow(row, db, explicit);
  } catch (e) {
    logger.warn({ err: e }, '[db] overlayDbSecrets failed — using in-memory secrets');
    return row;
  }
}

/** 로그인·검증은 Postgres KV를 우선. 인메모리만 보면 다른 인스턴스의 변경이 무시됨 */
async function hydrateAppSettingsFromDb(): Promise<Record<string, unknown>> {
  try {
    const { rows } = await pool.query(
      buildAppSettingsLatestSql(),
    );
    const data = rows[0]?.data as Record<string, unknown> | undefined;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const cleaned = stripLegacySettingsKeys(data);
      store['app_settings'] = [cleaned];
      return cleaned;
    }
  } catch (e) {
    logger.warn({ err: e }, '[db] hydrate app_settings from DB failed — using memory');
  }
  return (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
}

/** publicAppSettingsView: ../lib/db-app-settings-view.ts */

function resetPanelLoginLimiter(req: Request): void {
  const ip = String(req.ip ?? req.socket.remoteAddress ?? 'unknown');
  resetRateLimit(_loginRateMap, `panel:${ip}`);
}

/** FUNCTIONS_LOCKED_* / settingsFunctionsLocked: ../lib/db-app-settings-view.ts */

/** Thin wrapper — getTable stays local. */
function isFunctionsLocked(): boolean {
  return settingsFunctionsLocked(getTable('app_settings')[0] as Record<string, unknown> | undefined);
}

/** DB에 id/session_active 등 핵심 필드가 빠진 app_settings를 자동 복구 */
async function repairAppSettingsIfNeeded(): Promise<void> {
  const row = getTable('app_settings')[0];
  if (!row) {
    const settings = defaultAppSettings();
    store['app_settings'] = [settings];
    await dbPersistRow('app_settings', settings);
    logger.warn('[db] app_settings missing — seeded defaults');
    return;
  }
  if (!appSettingsCoreFieldsBroken(row)) return;
  const repaired = mergeAppSettings(row, {});
  store['app_settings'] = [repaired];
  await dbPersistRow('app_settings', repaired);
  logger.warn('[db] app_settings repaired (missing core fields)');
}

/** Render BOOTSTRAP_* env — redeploy/resync 후 DB 비밀번호가 어긋나면 자동 복구 */
async function ensureAppSettingsSecrets(): Promise<void> {
  const row = getTable('app_settings')[0];
  if (!row) return;

  const { patch, shouldApply } = planAppSettingsSecretsPatch(row, {
    bootstrapAdmin: process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim(),
    bootstrapTest: process.env.BOOTSTRAP_TEST_PASSWORD?.trim(),
    panelDefault: PANEL_DEFAULT_PASSWORD,
  });
  if (!shouldApply) return;

  const merged = mergeAppSettings(row, patch);
  const updated = await overlayDbSecrets(merged, explicitSecretKeys(patch));
  store['app_settings'] = [updated];
  await dbPersistRow('app_settings', updated);
  logger.warn('[db] app_settings secrets/qr synced from bootstrap env');
}

async function seedIfNeeded(): Promise<void> {
  await ensureStorageSchema();
  await loadHotTablesFromDb();
  await repairAppSettingsIfNeeded();
  await ensureAppSettingsSecrets();
  if (!getTable('app_settings').length) {
    const settings = defaultAppSettings();
    store['app_settings'] = [settings];
    await dbPersistRow('app_settings', settings);
  }
  await ensureAdminProfile();
  await ensureOptInGroupRooms();
}

// ─── 기능 삭제 후 남은 레거시 테이블 자동 정리 ──────────────────────────────────
// ACTIVE_KV_TABLES inventory: ../lib/db-table-policy.ts (re-import).

async function countLegacyLeftovers(): Promise<{ kv_tables: number; settings_rows: number; history_rows: number }> {
  const [kv, settings, hist] = await Promise.all([
    pool.query<{ n: number }>(buildLegacyKvLeftoverCountSql()),
    pool.query<{ n: number }>(buildLegacySettingsLeftoverCountSql()),
    pool.query<{ n: number }>(buildLegacyHistoryLeftoverCountSql()),
  ]);
  return parseLegacyLeftoverCounts({
    kv: kv.rows[0]?.n,
    settings: settings.rows[0]?.n,
    history: hist.rows[0]?.n,
  });
}

async function cleanupLegacyTables(): Promise<void> {
  try {
    // 지정 leftover 테이블만 삭제 — 미등록 테이블 전체 삭제(inversion)는 병렬 기능 데이터를 지울 수 있어 하지 않음
    for (const t of LEGACY_KV_TABLES) {
      const res = await pool.query(
        buildKvDeleteTableSql(), [t],
      );
      delete store[t];
      if ((res.rowCount ?? 0) > 0) {
        logger.info({ table: t, deleted: res.rowCount }, '[db] cleanupLegacyTables: 레거시 테이블 삭제');
      }
    }

    // jsonb - text 체인 — $1::text[] 바인딩 실패 시 키가 PG에 남는 것을 방지
    const settingsStrip = await pool.query(buildLegacySettingsStripSql());
    if ((settingsStrip.rowCount ?? 0) > 0) {
      const mem = getTable('app_settings')[0];
      if (mem && settingsHaveLegacyKeys(mem)) {
        store['app_settings'] = [stripLegacySettingsKeys(mem)];
      }
      logger.info({ stripped: settingsStrip.rowCount, keys: [...LEGACY_APP_SETTINGS_KEYS] }, '[db] cleanupLegacyTables: app_settings 레거시 키 삭제');
    }

    const histStrip = await pool.query(buildLegacyHistoryStripSql());
    if ((histStrip.rowCount ?? 0) > 0) {
      const histRows = store['session_history'];
      if (Array.isArray(histRows)) {
        store['session_history'] = histRows.map(r => stripLegacySessionHistoryKeys(r));
      }
      logger.info({ stripped: histStrip.rowCount }, '[db] cleanupLegacyTables: session_history 좌석맵 키 삭제');
    }

    _legacyLeftovers = await countLegacyLeftovers();
    logger.info({ ..._legacyLeftovers, activeTables: ACTIVE_KV_TABLES.size }, '[db] cleanupLegacyTables: leftover remaining');
  } catch (e) {
    logger.warn({ err: e }, '[db] cleanupLegacyTables 실패');
  }
}

/** Group room match/opt-in planners: ../lib/db-group-room-plan.ts (re-import). */

function collapseDuplicateGroupChatIds(): void {
  const rows = getTable('group_chats');
  const collapsed = collapseRowsById(rows);
  if (collapsed !== rows) store['group_chats'] = collapsed;
}

const _mergedGroupIds = createMergedIdMap(2000);
const rememberMergedGroup = _mergedGroupIds.remember;
function resolveMergedGroupId(groupId: string): string {
  return resolveMergedIdViaRows(
    groupId,
    (id) => _mergedGroupIds.resolve(id),
    rememberMergedGroup,
    (cur) => {
      const row = getTable('group_chats').find(g => String(g.id) === cur);
      return row ? String(row.merged_into ?? '') : '';
    },
  );
}

async function mergeGroupInto(dupId: string, canonicalId: string): Promise<void> {
  if (!dupId || dupId === canonicalId) return;
  rememberMergedGroup(dupId, canonicalId);
  const parts = getTable('group_participants');
  for (const action of planGroupParticipantMerge(parts, dupId, canonicalId)) {
    const effect = applyGroupParticipantMergeAction(parts, action, canonicalId);
    if (!effect) continue;
    if (effect.kind === 'delete') {
      void dbDeleteRow('group_participants', effect.oldId);
    } else {
      void dbPersistRow('group_participants', effect.row);
      if (effect.deleteOldId) void dbDeleteRow('group_participants', effect.oldId);
    }
  }
  for (const m of remapRowsGroupId(getTable('group_messages'), dupId, canonicalId)) {
    void dbPersistRow('group_messages', m);
  }
  for (const r of remapRowsGroupId(getTable('group_opt_outs'), dupId, canonicalId)) {
    void dbPersistRow('group_opt_outs', r);
  }
}

async function deleteDuplicateGroupChat(g: Record<string, unknown>): Promise<void> {
  const groupId = String(g.id ?? '');
  if (!groupId) return;
  const rows = getTable('group_chats');
  for (let i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i].id) === groupId) rows.splice(i, 1);
  }
  try {
    await dbDeleteRow('group_chats', groupId);
  } catch (e) {
    logger.error({ err: e, groupId }, '[ensureOptInGroupRooms] dup delete persist failed');
  }
  smartBroadcast('group_chats', g, {
    type: 'change', table: 'group_chats', event: 'DELETE', newRow: null, oldRow: g,
  });
}

async function mergeMatchesIntoCanonical(
  matches: Record<string, unknown>[],
  canonical: Record<string, unknown>,
): Promise<void> {
  const canonicalId = String(canonical.id);
  const seen = new Set<string>();
  for (const dup of matches) {
    const dupId = String(dup.id ?? '');
    if (!dupId || dupId === canonicalId || seen.has(dupId)) continue;
    seen.add(dupId);
    await mergeGroupInto(dupId, canonicalId);
    await deleteDuplicateGroupChat(dup);
  }
}

async function upsertCanonicalGroupRoom(spec: {
  id: string; name: string; interest_tag: string; room_kind: string; age_group?: string | null;
}): Promise<Record<string, unknown> | null> {
  const groups = getTable('group_chats');
  let room = groups.find(g => String(g.id) === spec.id);
  if (!room) {
    room = {
      ...buildAutoRoomRow({
        id: spec.id,
        name: spec.name,
        interest_tag: spec.interest_tag,
        age_group: spec.age_group === undefined ? null : spec.age_group,
        room_kind: spec.room_kind,
        created_at: ts(),
      }),
      merged_into: null,
    };
    groups.push(room);
    try {
      await dbPersistRow('group_chats', room);
      smartBroadcast('group_chats', room, {
        type: 'change', table: 'group_chats', event: 'INSERT', newRow: room, oldRow: null,
      });
    } catch (e) {
      store['group_chats'] = getTable('group_chats').filter(g => String(g.id) !== spec.id);
      logger.error({ err: e, groupId: spec.id }, '[ensureOptInGroupRooms] seed persist failed');
      return null;
    }
    return room;
  }
  Object.assign(room, patchExistingAutoRoom(room, {
    name: spec.name,
    interest_tag: spec.interest_tag,
    room_kind: spec.room_kind,
    age_group: spec.age_group !== undefined
      ? spec.age_group
      : (room.age_group === undefined ? null : (room.age_group as string | null)),
  }));
  try {
    await dbPersistRow('group_chats', room);
  } catch (e) {
    logger.error({ err: e, groupId: spec.id }, '[ensureOptInGroupRooms] existing room persist failed');
  }
  return room;
}

/** 카탈로그 방만 보장. 참여자를 자동으로 넣지 않음. 2차·N대 중복은 canonical 으로 이전 후 삭제. */
let ensureOptInGroupRoomsInFlight: Promise<void> | null = null;
async function ensureOptInGroupRooms(): Promise<void> {
  if (ensureOptInGroupRoomsInFlight) return ensureOptInGroupRoomsInFlight;
  ensureOptInGroupRoomsInFlight = ensureOptInGroupRoomsWork().finally(() => {
    ensureOptInGroupRoomsInFlight = null;
  });
  return ensureOptInGroupRoomsInFlight;
}

async function ensureOptInGroupRoomsWork(): Promise<void> {
  try {
    collapseDuplicateGroupChatIds();
    const groups = getTable('group_chats');
    for (const g of groups) {
      if (!groupNeedsUnlimitedMaxMembers(g)) continue;
      g.max_members = UNLIMITED_GROUP_MEMBERS;
      try {
        await dbPersistRow('group_chats', g);
      } catch (e) {
        logger.error({ err: e, groupId: g.id }, '[ensureOptInGroupRooms] max_members persist failed');
      }
    }
    for (const spec of OPT_IN_GROUP_ROOMS) {
      const canonical = await upsertCanonicalGroupRoom(spec);
      if (!canonical) continue;
      const matches = getTable('group_chats').filter(g => matchesAfterpartySpec(g, spec));
      await mergeMatchesIntoCanonical(matches, canonical);
    }
    // 보이는 N대 방은 20대·30대만. 같은 이름 중복은 canonical 으로 합친다. 10대/40~70대는 시드하지 않는다.
    for (const band of VISIBLE_AGE_BANDS) {
      const canonical = await upsertCanonicalGroupRoom(planVisibleAgeBandRoomSpec(band));
      if (!canonical) continue;
      const matches = getTable('group_chats').filter(g => matchesVisibleAgeBand(g, band));
      await mergeMatchesIntoCanonical(matches, canonical);
    }
    for (const [year, rooms] of collectBirthYearRoomGroups(getTable('group_chats'))) {
      if (rooms.length < 2) continue;
      const canonical = await upsertCanonicalGroupRoom(planBirthYearRoomSpec(year));
      if (!canonical) continue;
      await mergeMatchesIntoCanonical(
        getTable('group_chats').filter(g => birthYearOfGroup(g) === year),
        canonical,
      );
    }
    await purgeRetiredAgeRooms();
  } catch (e) {
    logger.error({ err: e }, '[ensureOptInGroupRooms] 오류');
  }
}

async function purgeRetiredAgeRooms(): Promise<void> {
  const retired = getTable('group_chats').filter(g => isRetiredAgeRoom(g));
  for (const g of retired) {
    await deleteRetiredAgeRoom(g);
  }
}

async function deleteRetiredAgeRoom(g: Record<string, unknown>): Promise<void> {
  const groupId = String(g.id ?? '');
  if (!groupId) return;
  const msgs = filterRowsByGroupId(getTable('group_messages'), groupId);
  for (const m of msgs) {
    smartBroadcast('group_messages', m, { type: 'change', table: 'group_messages', event: 'DELETE', newRow: null, oldRow: m });
  }
  if (msgs.length) {
    const msgIds = msgs.map(m => String(m.id)).filter(Boolean);
    store['group_messages'] = getTable('group_messages').filter(m => String(m.group_id) !== groupId);
    await dbDeleteRows('group_messages', msgIds);
  }
  const parts = filterRowsByGroupId(getTable('group_participants'), groupId);
  for (const p of parts) {
    const uid = String(p.user_id ?? '');
    if (uid) await removeParticipant(uid, groupId, false);
    smartBroadcast('group_participants', p, { type: 'change', table: 'group_participants', event: 'DELETE', newRow: null, oldRow: p });
  }
  const outs = filterRowsByGroupId(getTable('group_opt_outs'), groupId);
  if (outs.length) {
    const outIds = outs.map(r => String(r.id)).filter(Boolean);
    store['group_opt_outs'] = getTable('group_opt_outs').filter(r => String(r.group_id) !== groupId);
    await dbDeleteRows('group_opt_outs', outIds);
  }
  store['group_chats'] = getTable('group_chats').filter(x => String(x.id) !== groupId);
  try {
    await dbDeleteRow('group_chats', groupId);
  } catch (e) {
    logger.error({ err: e, groupId }, '[deleteRetiredAgeRoom] group_chats persist failed');
  }
  smartBroadcast('group_chats', g, { type: 'change', table: 'group_chats', event: 'DELETE', newRow: null, oldRow: g });
}

/** Thin wrapper — pure reject helper. */
function profileBirthYearRejected(res: Response, birthYear: unknown): boolean {
  return profileBirthYearRejectedPure(res, birthYear);
}

/** Thin wrapper — pure reject helper. */
function profileAvatarColorRejected(res: Response, avatarColor: unknown): boolean {
  return profileAvatarColorRejectedPure(res, avatarColor);
}

/** Thin wrapper — adminPhoneFromSettings stays local. */
function profileNpcAvatarRejected(
  res: Response,
  photoUrl: unknown,
  profileRow: Record<string, unknown>,
  adminPhoneDigits?: string,
): boolean {
  return profileNpcAvatarRejectedPure(
    res,
    photoUrl,
    profileRow,
    adminPhoneDigits ?? adminPhoneFromSettings(),
  );
}

const autoMatchInFlight = new Map<string, Promise<void>>();

/** Thin wrapper — getTable stays local. */
function hasGroupOptOut(userId: string, optKey: string): boolean {
  return hasGroupOptOutPure(getTable('group_opt_outs'), userId, optKey);
}

/** Thin wrapper — resolveMergedGroupId stays local. */
function optKeyForGroup(group: Record<string, unknown> | undefined, groupId: string): string {
  return optKeyForGroupPure(group, groupId, resolveMergedGroupId);
}

/** Thin wrapper — getTable + resolveMergedGroupId stay local. */
function participantRowsToLeave(userId: string, groupId: string): Record<string, unknown>[] {
  return participantRowsToLeavePure(
    userId,
    groupId,
    getTable('group_participants'),
    getTable('group_chats'),
    resolveMergedGroupId,
  );
}

async function recordGroupOptOut(part: Record<string, unknown>): Promise<void> {
  const userId = String(part.user_id ?? '');
  const groupId = String(part.group_id ?? '');
  if (!userId || !groupId) return;
  const group = getTable('group_chats').find(g => String(g.id) === groupId);
  const optKey = optKeyForGroup(group, groupId);
  const row = buildGroupOptOutRow({
    userId,
    groupId,
    optKey,
    roomKind: String(group?.room_kind ?? ''),
    createdAt: ts(),
  });
  const outs = getTable('group_opt_outs');
  const idx = outs.findIndex(r => String(r.id) === String(row.id));
  if (idx >= 0) outs[idx] = row;
  else outs.push(row);
  try {
    await dbPersistRow('group_opt_outs', row);
  } catch (e) {
    logger.error({ err: e, userId, groupId }, '[recordGroupOptOut] persist failed');
  }
}

async function clearGroupOptOut(userId: string, groupId: string): Promise<void> {
  const group = getTable('group_chats').find(g => String(g.id) === groupId);
  const optKey = optKeyForGroup(group, groupId);
  const { gone, keep } = planClearGroupOptOutRows(getTable('group_opt_outs'), userId, groupId, optKey);
  if (!gone.length) return;
  store['group_opt_outs'] = keep;
  for (const r of gone) {
    void dbDeleteRow('group_opt_outs', String(r.id));
  }
}

/** Thin wrapper — getTable stays local. */
function countUserGroupSlots(userId: string): number {
  return countUserGroupSlotsPure(userId, getTable('group_participants'), getTable('group_chats'));
}

async function pruneNonCatalogMemberships(userId: string): Promise<void> {
  const mine = getTable('group_participants').filter(p => String(p.user_id) === userId);
  for (const p of mine) {
    const gid = String(p.group_id ?? '');
    const g = getTable('group_chats').find(row => String(row.id) === gid);
    if (groupLimitSlotKey(g, gid) == null) {
      await removeParticipant(userId, gid, false);
    }
  }
}

async function removeParticipant(userId: string, groupId: string, recordOptOut: boolean): Promise<void> {
  const parts = getTable('group_participants');
  const part = parts.find(p => String(p.group_id) === groupId && String(p.user_id) === userId);
  if (!part) return;
  store['group_participants'] = parts.filter(p => String(p.id) !== String(part.id));
  try {
    await dbDeleteRow('group_participants', String(part.id));
  } catch (e) {
    logger.error({ err: e, userId, groupId }, '[removeParticipant] persist failed');
  }
  if (recordOptOut) await recordGroupOptOut(part);
}

async function joinOrCreateAutoRoom(userId: string, spec: {
  room_kind: string;
  name: string;
  interest_tag: string;
  age_group: string | null;
  optKey: string;
  canonicalId?: string;
}): Promise<void> {
  const groups = getTable('group_chats');
  let room = groups.find(g => spec.canonicalId && String(g.id) === spec.canonicalId)
    ?? groups.find(g => String(g.name) === spec.name && String(g.hidden ?? '') !== 'true' && g.hidden !== true);
  if (!room) {
    room = buildAutoRoomRow({
      id: spec.canonicalId || genId(),
      name: spec.name,
      interest_tag: spec.interest_tag,
      age_group: spec.age_group,
      room_kind: spec.room_kind,
      created_at: ts(),
    });
    groups.push(room);
    try {
      await dbPersistRow('group_chats', room);
      smartBroadcast('group_chats', room, {
        type: 'change', table: 'group_chats', event: 'INSERT', newRow: room, oldRow: null,
      });
    } catch (e) {
      store['group_chats'] = groups.filter(g => String(g.id) !== String(room!.id));
      logger.error({ err: e, userId }, '[autoMatchGroupChat] room persist failed');
      return;
    }
  } else {
    Object.assign(room, patchExistingAutoRoom(room, {
      name: spec.name,
      interest_tag: spec.interest_tag,
      age_group: spec.age_group,
      room_kind: spec.room_kind,
    }));
    try {
      await dbPersistRow('group_chats', room);
    } catch (e) {
      logger.error({ err: e, userId, groupId: String(room.id) }, '[autoMatchGroupChat] room update persist failed');
    }
  }
  const parts = getTable('group_participants');
  if (shouldSkipAutoRoomJoin({
    hasOptOut: hasGroupOptOut(userId, spec.optKey),
    roomKind: String(room.room_kind ?? ''),
    alreadyMember: parts.some(p => String(p.group_id) === String(room.id) && String(p.user_id) === userId),
    slotsUsed: countUserGroupSlots(userId),
    maxSlots: MAX_GROUPS_PER_USER,
  })) return;
  if (hasGroupOptOut(userId, spec.optKey)) return;
  const part = buildGroupParticipantRow(String(room.id), userId, ts());
  parts.push(part);
  try {
    await dbPersistRow('group_participants', part);
    if (hasGroupOptOut(userId, spec.optKey)) {
      await removeParticipant(userId, String(room.id), false);
      return;
    }
    smartBroadcast('group_participants', part, {
      type: 'change', table: 'group_participants', event: 'INSERT', newRow: part, oldRow: null,
    });
  } catch (e) {
    store['group_participants'] = getTable('group_participants').filter(p => String(p.id) !== part.id);
    logger.error({ err: e, userId }, '[autoMatchGroupChat] join persist failed');
  }
}

/** 년생 + N대 두 방만 자동 입장. 관심사 이름 없음. 2차는 넣지 않음. 명시적 나가기는 재입장하지 않음. */
async function autoMatchGroupChat(userId: string, profile: Record<string, unknown>): Promise<void> {
  if (!userId) return;
  try {
    await ensureOptInGroupRooms();
    const parts = getTable('group_participants').filter(p => String(p.user_id) === userId);
    for (const p of parts) {
      const g = getTable('group_chats').find(row => String(row.id) === String(p.group_id));
      if (g && isLeftoverInterestRoom(g)) {
        await removeParticipant(userId, String(p.group_id), false);
      }
    }
    for (const spec of planAutoMatchJoinSpecs(profile)) {
      await joinOrCreateAutoRoom(userId, spec);
    }
    const mine = getTable('group_participants').filter(p => String(p.user_id) === userId);
    for (const p of mine) {
      const gid = String(p.group_id ?? '');
      const g = getTable('group_chats').find(row => String(row.id) === gid);
      if (hasGroupOptOut(userId, optKeyForGroup(g, gid))) {
        await removeParticipant(userId, gid, false);
      }
    }
  } catch (e) {
    logger.error({ err: e, userId }, '[autoMatchGroupChat] 오류');
  }
}

async function autoMatchGroupChatGuarded(userId: string, profile: Record<string, unknown>): Promise<void> {
  const running = autoMatchInFlight.get(userId);
  if (running) {
    await running;
    return;
  }
  const pending = autoMatchGroupChat(userId, profile).finally(() => autoMatchInFlight.delete(userId));
  autoMatchInFlight.set(userId, pending);
  await pending;
}

// Seed must finish before /api/db handles traffic. LISTEN/NOTIFY is background-only —
// blocking requests on Postgres LISTEN connect hung chat INSERT + SSE on Render boot.
// cleanupLegacyTables는 부팅 경로에서 제외 — 콜드스타트·재배포 직후 채팅/하트 503 대기 시간 단축.
const dbReadyPromise = seedIfNeeded();

dbReadyPromise
  .then(() => cleanupLegacyTables())
  .then(() => loadRemainingTablesFromDb())
  .then(() => ensureAdminProfile())
  .then(() => ensureOptInGroupRooms())
  .then(() => {
    startIntegrityDiagnostics();
    return setupListenClient();
  })
  .then(() => loadImagesFromDb())
  .catch(e => logger.error({ err: e }, '[db] startup initialization failed'));

// redeploy·resync 후에도 BOOTSTRAP env → DB 비밀번호 자동 동기화
// leftover JSON 키는 부팅 cleanup이 실패해도 이 주기로 재시도 (재배포 없이 PG에서 제거)
setInterval(() => {
  ensureAppSettingsSecrets()
    .then(() => cleanupLegacyTables())
    .catch(e => logger.error({ err: e }, '[db] periodic secret/legacy sync failed'));
}, 5 * 60 * 1000).unref();

router.use(async (_req, res, next) => {
  try {
    await dbReadyPromise;
    next();
  } catch (e) {
    logger.error({ err: e }, '[db] init gate failed');
    if (!res.headersSent) {
      res.status(503).json({ data: null, error: { message: 'Database initializing, retry shortly' } });
    }
  }
});

// 120초마다 DB 재동기화 — merge-by-id, 클라이언트 전체 리로드(_bulk_resync)는 쏘지 않음
// FORBIDDEN: resyncAllFromNativeDb('forced') 로 바꾸지 말 것. forced 는 전원 탭에
// _bulk_resync 를 쏴 2분마다 재연결 폭풍이 된다. longevity-guards 테스트가 이 문자열을 고정한다.
setInterval(() => { resyncAllFromNativeDb('periodic').catch(e => logger.error({ err: e }, '[db] resync failed')); }, 120_000).unref();
// 분산 rate_limits KV 가 행사 내내 쌓여 PG 가 느려지지 않게 만료 행 정리
setInterval(() => { pruneDistributedRateLimits().catch(e => logger.warn({ err: e }, '[db] rate_limits prune failed')); }, 5 * 60 * 1000).unref();
// 25초마다 hot 테이블 재동기화 — 다중 Render 인스턴스 split-brain 완화
setInterval(() => { resyncHotTablesFromDb().catch(e => logger.warn({ err: e }, '[db] hot resync failed')); }, 25_000).unref();

/** tableFingerprint: ../lib/db-app-settings-view.ts */

// ─── Cross-instance sync via PostgreSQL LISTEN/NOTIFY ─────────────────────────
// autoscale 환경에서 여러 인스턴스가 뜰 때 store + SSE를 동기화한다.
// 각 인스턴스는 data_change 채널을 LISTEN하고, 쓰기 시 NOTIFY로 전파한다.
// 자신이 보낸 NOTIFY는 INSTANCE_ID로 걸러서 중복 브로드캐스트를 방지한다.

let _listenClient: pg.Client | null = null;
/** Serializes LISTEN connect/retry so error+catch timers cannot open parallel clients. */
let _listenSetupGen = 0;
let _listenSetupInFlight: Promise<void> | null = null;
let _listenReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _listenReconnectScheduledGen: number | null = null;

/** Schedule one reconnect for a LISTEN generation; error/end must not race into duplicates. */
function scheduleListenReconnect(gen: number, delayMs: number, reason: string): void {
  if (gen !== _listenSetupGen || _listenReconnectScheduledGen === gen) return;
  _listenReconnectScheduledGen = gen;
  _listenReconnectTimer = setTimeout(() => {
    _listenReconnectTimer = null;
    _listenReconnectScheduledGen = null;
    if (gen !== _listenSetupGen) return;
    setupListenClient()
      .then(() => resyncHotTablesFromDb())
      .catch(e => logger.error({ err: e, reason }, '[db] LISTEN reconnect failed'));
  }, delayMs);
}

async function setupListenClient(): Promise<void> {
  if (_listenSetupInFlight) return _listenSetupInFlight;
  const gen = ++_listenSetupGen;
  _listenSetupInFlight = _setupListenClientInner(gen).finally(() => {
    if (_listenSetupInFlight && gen === _listenSetupGen) _listenSetupInFlight = null;
  });
  return _listenSetupInFlight;
}

async function _setupListenClientInner(gen: number): Promise<void> {
  // try 외부에 선언 — catch 블록에서 client.end()로 커넥션 누수 방지
  let client: pg.Client | null = null;
  try {
    // Drop a prior live client before opening another (stale reconnect timer safety).
    if (_listenClient) {
      const prev = _listenClient;
      _listenClient = null;
      await prev.end().catch(() => {});
    }
    if (gen !== _listenSetupGen) return;
    client = new pg.Client(buildPgOptions());
    await client.connect();
    if (gen !== _listenSetupGen) {
      await client.end().catch(() => {});
      return;
    }
    await client.query('LISTEN data_change');
    client.on('notification', (msg) => {
      if (!msg.payload) return;
      let env: {
        src: string; table: string; ev: string; id?: unknown; _tombstone?: boolean;
        newRow?: Record<string, unknown> | null; oldRow?: Record<string, unknown> | null;
      };
      try { env = JSON.parse(msg.payload); } catch { return; }

      // Inbound plan + memory apply: ../lib/db-sse-fanout-policy.ts
      const plan = planNotifyInboundApply(env, INSTANCE_ID, SECRET_SETTING_KEYS);
      if (plan.action === 'skip') return;

      if (plan.action === 'tombstone_delete') {
        if (!store[plan.table]) return;
        applyNotifyTombstoneDelete(store[plan.table], plan.id);
        _smartBroadcastLocal(plan.table, null, {
          type: 'change', table: plan.table, event: 'DELETE', newRow: null, oldRow: { id: plan.id },
        });
        return;
      }

      if (plan.action === 'refetch') {
        const { table: tbl, id, ev, reason } = plan;
        pool.query(
          buildKvSelectByTableRowIdSql(),
          [tbl, id],
        ).then(result => {
          const row = (result.rows[0]?.data ?? null) as Record<string, unknown> | null;
          if (!row) return;
          if (!store[tbl]) store[tbl] = [];
          applyNotifyRefetchedRow(store[tbl], row, { reason, tombstoneId: id });
          if (reason === 'settings_secrets') return;
          _smartBroadcastLocal(tbl, row, { type: 'change', table: tbl, event: ev, newRow: row, oldRow: null });
        }).catch(e => logger.warn({ err: e }, reason === 'settings_secrets'
          ? '[db] app_settings NOTIFY refetch failed'
          : '[db] tombstone DB refetch failed'));
        return;
      }

      if (plan.action === 'memory_upsert') {
        if (!store[plan.table]) store[plan.table] = [];
        applyNotifyMemoryUpsert(store[plan.table], plan.mode, plan.newRow);
        _smartBroadcastLocal(plan.table, plan.newRow ?? plan.oldRow, {
          type: 'change', table: plan.table, event: plan.ev, newRow: plan.newRow, oldRow: plan.oldRow,
        });
        return;
      }

      if (plan.action === 'memory_delete') {
        if (!store[plan.table]) store[plan.table] = [];
        applyNotifyMemoryDelete(store[plan.table], plan.oldRow);
        _smartBroadcastLocal(plan.table, plan.oldRow, {
          type: 'change', table: plan.table, event: 'DELETE', newRow: null, oldRow: plan.oldRow,
        });
        return;
      }

      _smartBroadcastLocal(plan.table, plan.newRow ?? plan.oldRow, {
        type: 'change', table: plan.table, event: plan.ev, newRow: plan.newRow, oldRow: plan.oldRow,
      });
    });
    client.on('error', (err) => {
      logger.error({ err }, '[db] LISTEN client error — reconnecting in 5 s');
      if (_listenClient === client) _listenClient = null;
      // client는 이 시점에 반드시 연결된 상태 (error 이벤트는 connect 이후에만 발생)
      client!.end().catch(() => {});
      // 재연결 후 핫 테이블 재동기화: 5초 gap 중 누락된 변경 복구
      scheduleListenReconnect(gen, 5000, 'error');
    });
    client.on('end', () => {
      // 일부 DB/proxy 종료는 error 없이 end만 내보낸다. active client일 때만
      // 재연결하고, deliberate shutdown/replacement는 generation guard로 무시한다.
      if (_listenClient !== client) return;
      _listenClient = null;
      logger.warn('[db] LISTEN client ended — reconnecting in 5 s');
      scheduleListenReconnect(gen, 5000, 'end');
    });
    if (gen !== _listenSetupGen) {
      await client.end().catch(() => {});
      return;
    }
    _listenClient = client;
    logger.info({ instance: INSTANCE_ID.slice(0, 8) }, '[db] LISTEN data_change ready');
  } catch (err) {
    logger.error({ err }, '[db] setupListenClient failed — retry in 10 s');
    // connect() 성공 후 LISTEN 실패 시 반드시 종료 — pg.Client 커넥션 누수 방지
    if (client) client.end().catch(() => {});
    if (gen !== _listenSetupGen) return;
    scheduleListenReconnect(gen, 10000, 'setup');
  }
}

// NOTIFY 직렬 큐 — 동시 쓰기 시 pool 과부하 방지.
// 같은 row의 대기 이벤트는 최신 상태로 합쳐 유실 가능성과 큐 사용량을 줄입니다.
const _notifyQueue: string[] = [];
const NOTIFY_QUEUE_MAX = 256;
let _notifyBusy = false;
function _drainNotifyQueue() {
  if (_notifyBusy || _notifyQueue.length === 0) return;
  _notifyBusy = true;
  const payload = _notifyQueue.shift()!;
  pool.query("SELECT pg_notify('data_change', $1)", [payload])
    .catch((e) => logger.warn({ err: e }, '[db] NOTIFY failed'))
    .finally(() => { _notifyBusy = false; _drainNotifyQueue(); });
}

function enqueueNotify(msg: string, table: string, rowId: unknown): void {
  // Coalesce/push plan: ../lib/db-sse-fanout-policy.ts
  const plan = planNotifyQueueEnqueue(_notifyQueue, msg, table, rowId, NOTIFY_QUEUE_MAX);
  if (plan.action === 'replace') {
    _notifyQueue[plan.index] = plan.msg;
    return;
  }
  if (plan.dropOldest) _notifyQueue.shift();
  _notifyQueue.push(plan.msg);
  _drainNotifyQueue();
}

/** 다른 인스턴스에 변경 사항 전파. 이미지 테이블 제외. 8 KB 초과 시 tombstone 전송 — plan: db-sse-fanout-policy */
function notifyOtherInstances(table: string, ev: string, newRow: Record<string, unknown> | null, oldRow: Record<string, unknown> | null): void {
  // app_settings 비밀번호는 NOTIFY 페이로드에 넣지 않고 DB에서 다시 읽는다.
  const plan = planNotifyOtherInstances({
    table, ev, newRow, oldRow, instanceId: INSTANCE_ID,
  });
  if (plan.action === 'skip') return;
  enqueueNotify(plan.msg, plan.table, plan.rowId);
}

/** pickLatestAppSettingsRow / planAppSettingsFromDbRows: ../lib/db-app-settings-view.ts */

/** DB resync 시 오래된 session_active가 메모리를 덮어쓰지 않도록 updated_at 기준 병합 */
function applyAppSettingsFromDbRows(dbRows: Record<string, unknown>[]): boolean {
  const memRow = (getTable('app_settings')[0] ?? null) as Record<string, unknown> | null;
  const plan = planAppSettingsFromDbRows(memRow, dbRows, {
    stripLegacy: stripLegacySettingsKeys,
    hasLegacy: settingsHaveLegacyKeys,
    secretKeys: SECRET_SETTING_KEYS,
  });
  if (plan.action === 'empty') return false;
  store['app_settings'] = [plan.row];
  if (plan.action === 'replace' && plan.persistLegacy) {
    dbPersistRow('app_settings', plan.row).catch(e => logger.warn({ err: e }, '[db] persist stripped app_settings'));
  }
  return plan.changed;
}

/** hot 테이블(profiles·app_settings)을 app_kv_rows에서 재동기화 — LISTEN gap 보정 전용 */
/** REALTIME_MERGE_TABLES / DB_MERGE_THROTTLE_MS: ../lib/db-store-merge.ts */
const _lastDbMerge = new Map<string, number>();

/** SELECT 직전 인스턴스 간 split-brain 완화 — PG 최신 행을 in-memory store에 병합 */
async function mergeTableFromDbIfStale(table: string, force = false): Promise<void> {
  const now = Date.now();
  const last = _lastDbMerge.get(table) ?? 0;
  if (!force && shouldThrottleDbMerge(last, now)) return;
  _lastDbMerge.set(table, now);
  try {
    const limit = resyncLimitFor(table);
    const { rows } = await pool.query(
      buildKvSelectLatestLimitedSql(),
      [table, limit],
    );
    if (!rows.length) return;
    if (!store[table]) store[table] = [];
    mergeDbRowsIntoMemory(
      store[table],
      rows.map(r => r.data as Record<string, unknown>),
    );
    if (table === 'chats') await dedupeChatsInStore();
  } catch (e) {
    logger.warn({ err: e, table }, '[db] mergeTableFromDbIfStale failed');
  }
}

async function resyncHotTablesFromDb(): Promise<void> {
  try {
    // messages/likes/chats 는 절대 wholesale replace 하지 않음 — LIMIT 때문에 오래된 방이 메모리에서 증발함
    await Promise.all(HOT_RESYNC_TABLES.map(async (tbl) => {
      const limit = HOT_RESYNC_LIMITS[tbl] ?? 5000;
      const { rows } = await pool.query(
        buildKvSelectLatestLimitedSql(),
        [tbl, limit],
      );
      if (!rows.length) return;
      if (tbl === 'app_settings') {
        applyAppSettingsFromDbRows(rows.map(r => r.data as Record<string, unknown>));
        return;
      }
      if (!store[tbl]) store[tbl] = [];
      mergeDbRowsIntoMemory(
        store[tbl],
        rows.map(r => r.data as Record<string, unknown>),
      );
    }));
    await dedupeChatsInStore();
    logger.info({}, '[db] hot-table resync complete (merge-by-id)');
  } catch (e) {
    logger.warn({ err: e }, '[db] hot-table resync failed');
  }
}

// 관리자·테스트 패널이 Supabase 네이티브 테이블에 직접 쓸 때 api-server 인메모리와 어긋남
// → 30초마다 네이티브 테이블에서 전체 재동기화해 최대 30초 안에 자동 복구
/** FULL_RESYNC_TABLES / RESYNC_TABLE_LIMIT: ../lib/db-store-merge.ts */
let _fullResyncRunning = false;

async function pruneDistributedRateLimits(): Promise<void> {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return;
  try {
    await pool.query(buildRateLimitsPruneSql());
  } catch (e) {
    logger.warn({ err: e }, '[db] rate_limits prune failed');
  }
}

async function resyncAllFromNativeDb(reason: 'periodic' | 'forced' = 'periodic'): Promise<void> {
  if (_fullResyncRunning) return; // 이전 리싱크가 아직 실행 중이면 skip
  _fullResyncRunning = true;
  try {
    // [Fix] 테이블별 LIMIT 적용 — 대용량 세션에서 전체 행 적재로 인한 메모리/지연 방지
    // ROW_NUMBER() OVER(PARTITION BY table_name ORDER BY updated_at DESC) 로 최근 N개만 조회
    const limitSql = buildFullResyncUnionSql(FULL_RESYNC_TABLES, RESYNC_TABLE_LIMIT, RESYNC_DEFAULT_LIMIT);
    const { rows } = await pool.query(limitSql);
    const grouped = groupKvDataRowsByTable(rows as Array<{ table_name: string; data: unknown }>);
    const notifyClients = shouldBroadcastBulkResync(reason);
    for (const { tbl } of FULL_RESYNC_TABLES) {
      if (grouped[tbl] === undefined) continue;
      const prev = store[tbl];
      const prevFp = tableFingerprint(prev ?? []);
      if (tbl === 'app_settings') {
        const settingsChanged = applyAppSettingsFromDbRows(grouped[tbl]);
        if (settingsChanged) {
          const latest = getTable('app_settings')[0] as Record<string, unknown>;
          broadcastAll({ type: 'change', table: 'app_settings', event: 'UPDATE',
            newRow: sanitizeSettings(latest),
            oldRow: sanitizeSettings((prev?.[0] ?? {}) as Record<string, unknown>),
          });
        }
        continue;
      }
      // wholesale replace(LIMIT)는 오래된 likes/chats 를 메모리에서 지우고
      // fingerprint 가 바뀔 때마다 전원 클라이언트 리로드 폭풍을 만든다.
      if (!store[tbl]) store[tbl] = [];
      mergeDbRowsIntoMemory(store[tbl], grouped[tbl]);
      const nextFp = tableFingerprint(store[tbl]);
      if (notifyClients && prevFp !== nextFp) {
        broadcastAll({
          type: 'change', table: tbl, event: 'UPDATE',
          newRow: { _bulk_resync: true, count: store[tbl].length },
          oldRow: { count: prev?.length ?? 0 },
        });
      }
    }
    logger.info({ reason }, '[db] full resync complete (via app_kv_rows)');
    // resync가 app_settings를 덮어쓴 뒤 비밀번호·QR URL 자동 복구
    await repairAppSettingsIfNeeded();
    await ensureAppSettingsSecrets();
  } catch (e) {
    logger.warn({ err: e }, '[db] resyncAllFromNativeDb 실패');
  } finally {
    _fullResyncRunning = false;
  }
}

// ─── SSE broadcast ─────────────────────────────────────────────────────────────
// SSE 연결별 keepalive interval 정리 함수 보관 — write 실패 시에도 인터벌 즉시 해제
const _sseCleanup = new Map<Response, () => void>();

function _send(client: Response, conns: Set<Response>, payload: string) {
  try { client.write(payload); } catch {
    conns.delete(client);
    // write 실패 = 클라이언트 연결 끊김 → keepalive interval 즉시 정리 (req.close 미발화 대비)
    _sseCleanup.get(client)?.();
    _sseCleanup.delete(client);
    try { client.end(); } catch { /* ignore */ }
  }
  if (conns.size === 0) {
    for (const [uid, s] of sseUserMap) { if (s === conns) { sseUserMap.delete(uid); break; } }
  }
}

const SSE_BROADCAST_SYNC_MAX = Number(process.env.SSE_BROADCAST_SYNC_MAX ?? 400);
const SSE_BROADCAST_CHUNK = Number(process.env.SSE_BROADCAST_CHUNK ?? 100);

/** 모든 클라이언트에게 전송 (공개 이벤트: profiles, app_settings, games 등) */
function broadcastAll(event: Record<string, unknown>) {
  const json = JSON.stringify(event);
  const seq = _ringAdd(json, 'all');
  const payload = `id: ${seq}\ndata: ${json}\n\n`;
  const batch: Array<[Response, Set<Response>]> = [];
  for (const [, conns] of sseUserMap) for (const c of conns) batch.push([c, conns]);
  for (const c of sseAnonClients) batch.push([c, sseAnonClients]);
  for (const c of sseAdminClients) batch.push([c, sseAdminClients]);
  // 행사장 규모(≤400 연결)는 한 틱에 전송 — 관리자 잠금/회의 시작 지연을 청킹이 키우지 않게
  if (batch.length <= SSE_BROADCAST_SYNC_MAX) {
    for (const [c, conns] of batch) _send(c, conns, payload);
    return;
  }
  const doChunk = (i: number) => {
    const end = Math.min(i + SSE_BROADCAST_CHUNK, batch.length);
    for (let j = i; j < end; j++) _send(batch[j][0], batch[j][1], payload);
    if (end < batch.length) setImmediate(() => doChunk(end));
  };
  doChunk(0);
}

/** 특정 사용자들에게만 전송 (비공개 이벤트: messages, likes, chats 등) */
function broadcastToUsers(userIds: string[], event: Record<string, unknown>) {
  const json = JSON.stringify(event);
  const seq = _ringAdd(json, userIds);
  const payload = `id: ${seq}\ndata: ${json}\n\n`;
  const seen = new Set<Response>();
  for (const uid of userIds) {
    const conns = sseUserMap.get(uid);
    if (!conns) continue;
    for (const c of conns) {
      if (seen.has(c)) continue;
      seen.add(c);
      _send(c, conns, payload);
    }
  }
  // 관리자 클라이언트: 모든 프라이빗 이벤트도 수신 (감사·모니터링 목적)
  for (const c of sseAdminClients) {
    if (seen.has(c)) continue;
    seen.add(c);
    _send(c, sseAdminClients, payload);
  }
}

/** 관리자 SSE 연결에만 전송 (익명 신고 등) */
function broadcastAdminOnly(event: Record<string, unknown>) {
  const json = JSON.stringify(event);
  const seq = _ringAdd(json, []);
  const payload = `id: ${seq}\ndata: ${json}\n\n`;
  for (const c of sseAdminClients) _send(c, sseAdminClients, payload);
}

/** 테이블 종류에 따라 자동으로 수신자 판단 — 로컬 SSE 전송 전용 (NOTIFY 없음) */
function _smartBroadcastLocal(table: string, row: Record<string, unknown> | null, event: Record<string, unknown>) {
  const plan = planSmartBroadcastLocal(table, row, event, {
    sanitizeProfile,
    sanitizeSettings,
    collectTargets: collectBroadcastTargets,
  });
  if (plan.kind === 'admin') {
    broadcastAdminOnly(plan.event);
    return;
  }
  if (plan.kind === 'all') {
    broadcastAll(plan.event);
    return;
  }
  if (plan.kind === 'users') {
    broadcastToUsers(plan.targets, plan.event);
    return;
  }
  // drop — 프라이빗 테이블인데 수신자를 특정 못한 경우 → 관측 가능하게 경고
  if (row) {
    logger.warn({ table: plan.table, rowId: plan.rowId, chatId: plan.chatId }, '[sse] private event dropped — no targets');
  }
}

/** 로컬 SSE 전송 + 다른 인스턴스에 NOTIFY 전파 */
function smartBroadcast(table: string, row: Record<string, unknown> | null, event: Record<string, unknown>) {
  if (row && REALTIME_TRACE_TABLES.has(table)) {
    logger.info({
      ...realtimeTraceMeta(table, row),
      event: typeof event.event === 'string' ? event.event : null,
    }, '[realtime] emit');
  }
  _smartBroadcastLocal(table, row, event);
  notifyOtherInstances(
    table,
    event['event'] as string,
    event['newRow'] as Record<string, unknown> | null,
    event['oldRow'] as Record<string, unknown> | null,
  );
}

// ─── Web Push: 메시지/하트 삽입 시 수신자에게 알림 전송 ──────────────────────
/** Push recipient/payload plan: ../lib/db-push-plan.ts (re-import). */
async function sendPushForEvent(
  table: string,
  row: Record<string, unknown>,
  actorId?: string | null,
): Promise<void> {
  const planned = planPushForEvent(
    table,
    row,
    actorId,
    (chatId) => getTable('chats').find(c => String(c.id) === String(chatId)),
    (userId) => getTable('profiles').find(p => p.id === userId),
  );
  if (!planned) return;
  const { recipientId, payload } = planned;

  const subs = getTable('push_subscriptions').filter(s => s.user_id === recipientId);

  // 병렬 전송 — 직렬 await 제거로 다수 구독 시 지연 최소화
  const results = await Promise.all(
    subs.map(sub => sendPush(
      { endpoint: sub.endpoint as string, keys: { auth: sub.auth as string, p256dh: sub.p256dh as string } },
      payload,
    ).then(ok => ({ id: sub.id as string, ok })).catch(() => ({ id: sub.id as string, ok: false }))),
  );

  const expired = results.filter(r => !r.ok).map(r => r.id);
  if (expired.length) {
    store['push_subscriptions'] = (store['push_subscriptions'] ?? []).filter(s => !expired.includes(s.id as string));
    dbDeleteRows('push_subscriptions', expired).catch(e => logger.error({ err: e }, '[db] background task error'));
  }
}

// ─── Wipe-surviving aggregate sales reports ───────────────────────────────────
// Reports live in app_kv_rows under a dedicated table_name. The event-end and
// test wipe plans only delete their explicit app tables, so these rows survive.
function salesReportAdminToken(req: Request): string {
  const token = req.headers['x-admin-token'];
  return typeof token === 'string' ? token : '';
}

function salesReportId(id: string): string | null {
  return /^[A-Za-z0-9_-]{1,100}$/.test(id) ? id : null;
}

function salesReportUnauthorized(res: Response): Response {
  return res.status(401).json({ data: null, error: { message: '관리자 인증이 필요합니다.' } });
}

async function loadSalesReports(limit = SALES_REPORT_LIMIT): Promise<SalesReport[]> {
  const { rows } = await pool.query<{ data: unknown }>(
    buildKvSelectLatestLimitedSql(),
    [SALES_REPORT_TABLE, Math.max(1, Math.min(limit, SALES_REPORT_LIMIT))],
  );
  return rows
    .map(row => row.data)
    .filter(isSalesReport);
}

async function loadSalesReport(id: string): Promise<SalesReport | null> {
  const { rows } = await pool.query<{ data: unknown }>(
    buildKvSelectByTableRowIdSql(),
    [SALES_REPORT_TABLE, id],
  );
  const report = rows[0]?.data;
  return isSalesReport(report) ? report : null;
}

router.post('/sales-reports', async (req: Request, res: Response) => {
  if (!verifyAdminToken(salesReportAdminToken(req))) return salesReportUnauthorized(res);
  try {
    const report = buildSalesReport({
      id: crypto.randomUUID(),
      now: ts(),
      profiles: getTable('profiles'),
      likes: getTable('likes'),
      chats: getTable('chats'),
      messages: getTable('messages'),
      groupChats: getTable('group_chats'),
      groupMessages: getTable('group_messages'),
      groupParticipants: getTable('group_participants'),
      adminSseConnections: sseAdminClients.size,
      persistErrors: _dbPersistErrors,
      excludeProfile: isAdminProfileRow,
    });
    await dbPersistRow(SALES_REPORT_TABLE, report as unknown as Record<string, unknown>);
    return res.status(201).json({ data: report, error: null });
  } catch (e) {
    logger.error({ err: e }, '[sales-reports] create failed');
    return res.status(500).json({ data: null, error: { message: '성과 리포트 저장에 실패했습니다.' } });
  }
});

router.get('/sales-reports', async (req: Request, res: Response) => {
  if (!verifyAdminToken(salesReportAdminToken(req))) return salesReportUnauthorized(res);
  try {
    return res.json({ data: await loadSalesReports(), error: null });
  } catch (e) {
    logger.error({ err: e }, '[sales-reports] list failed');
    return res.status(500).json({ data: null, error: { message: '성과 리포트 조회에 실패했습니다.' } });
  }
});

router.get('/sales-reports/:id/download', async (req: Request, res: Response) => {
  if (!verifyAdminToken(salesReportAdminToken(req))) return salesReportUnauthorized(res);
  const id = salesReportId(String(req.params.id ?? ''));
  if (!id) return res.status(400).json({ data: null, error: { message: '잘못된 리포트 ID입니다.' } });
  try {
    const report = await loadSalesReport(id);
    if (!report) return res.status(404).json({ data: null, error: { message: '리포트를 찾을 수 없습니다.' } });
    const format = String(req.query.format ?? 'md').toLowerCase();
    const isJson = format === 'json';
    if (!isJson && format !== 'md') {
      return res.status(400).json({ data: null, error: { message: '지원하지 않는 다운로드 형식입니다.' } });
    }
    const ext = isJson ? 'json' : 'md';
    res.setHeader('Content-Disposition', `attachment; filename="binpc2-sales-report-${id}.${ext}"`);
    res.setHeader('Cache-Control', 'no-store');
    if (isJson) return res.type('application/json').send(JSON.stringify(report, null, 2));
    return res.type('text/markdown').send(salesReportMarkdown(report));
  } catch (e) {
    logger.error({ err: e, id }, '[sales-reports] download failed');
    return res.status(500).json({ data: null, error: { message: '성과 리포트 다운로드에 실패했습니다.' } });
  }
});

router.get('/sales-reports/:id', async (req: Request, res: Response) => {
  if (!verifyAdminToken(salesReportAdminToken(req))) return salesReportUnauthorized(res);
  const id = salesReportId(String(req.params.id ?? ''));
  if (!id) return res.status(400).json({ data: null, error: { message: '잘못된 리포트 ID입니다.' } });
  try {
    const report = await loadSalesReport(id);
    if (!report) return res.status(404).json({ data: null, error: { message: '리포트를 찾을 수 없습니다.' } });
    return res.json({ data: report, error: null });
  } catch (e) {
    logger.error({ err: e, id }, '[sales-reports] get failed');
    return res.status(500).json({ data: null, error: { message: '성과 리포트 조회에 실패했습니다.' } });
  }
});

// ─── DB operation endpoint ────────────────────────────────────────────────────
router.post('/op', async (req: Request, res: Response) => {
  const requestId = String(req.headers['x-request-id'] ?? req.id ?? '');
  if (requestId) res.setHeader('x-request-id', requestId);

  // 동시 요청이 상한선을 초과하면 503 반환 — 클라이언트가 지수 백오프 후 재시도
  if (_activeOpCount >= MAX_CONCURRENT_OPS) {
    const rej = opBusyReject();
    res.status(rej.status).setHeader('Retry-After', rej.retryAfter ?? '1');
    logger.warn({ requestId, code: 'BUSY' }, '[op] concurrent cap');
    return res.json(rej.body);
  }
  _activeOpCount++;

  // ─ requesterId 세션 바인딩 — 구조분해 이전에 실행해야 local const에 올바른 값이 들어감 ─
  // 인증된 세션이 있는 경우: body requesterId와 불일치하면 즉시 차단, 일치하거나 null이면 세션값으로 확정
  {
    const bodyRec = req.body as Record<string, unknown>;
    const _authId = resolveAuthUserId(req, bodyRec);
    const bind = planBindRequesterId(_authId, bodyRec.requesterId);
    if (!bind.ok) {
      _activeOpCount--;
      logger.warn({ ip: req.ip, session: _authId, claimed: bodyRec.requesterId }, bind.reject.logMsg ?? '[SECURITY] requesterId body-spoof attempt blocked');
      return res.status(bind.reject.status).json(bind.reject.body);
    }
    if (bind.setRequesterId) bodyRec.requesterId = bind.setRequesterId;
  }

  // ─ req.body 타입 방어: JSON 파싱 실패·비객체 전송 시 safe fallback ─────────
  if (req.body == null || typeof req.body !== 'object' || Array.isArray(req.body)) {
    _activeOpCount--;
    const rej = opInvalidBodyReject();
    return res.status(rej.status).json(rej.body);
  }
  const {
    table,
    op,
    filters = [],
    orders = [],
    limit,
    single,
    maybeSingle,
    payload,
    conflictCols = [],
    selectAfterWrite,
    requesterId,
    adminToken,
    testToken,
  } = req.body as {
    table: string; op: string;
    filters: FilterSpec[]; orders: { col: string; asc: boolean }[];
    limit?: number; single?: boolean; maybeSingle?: boolean;
    payload?: unknown; conflictCols?: string[]; selectAfterWrite?: boolean;
    requesterId?: string | null;
    adminToken?: string | null;
    testToken?: string | null;
  };

  // 관리자 토큰 검증 — HMAC 재계산으로 검증 (서버 재시작 후에도 유효)
  const isAdmin = verifyAdminToken(adminToken);
  const isTestSession = verifyTestToken(testToken);
  const canReadPrivateTables = isAdmin || isTestSession;
  const sessionUserId = resolveAuthUserId(req, req.body as Record<string, unknown>);

  // requesterId는 인증 수단이 아니라 세션 사용자와의 일치 검사용입니다.
  // 테스트 환경의 기존 단위 테스트만 메모리 세션 없이 직접 가드를 검증합니다.
  if (shouldBlockUnauthenticatedRequester({
    nodeEnv: process.env.NODE_ENV,
    requesterId,
    sessionUserId,
    isAdmin,
    isTestSession,
  })) {
    _activeOpCount--;
    const rej = opUnauthenticatedRequesterReject();
    logger.warn({ requesterId, ip: req.ip }, rej.logMsg ?? '[SECURITY] unauthenticated requesterId blocked');
    return res.status(rej.status).json(rej.body);
  }

  // ─ 페이로드/스칼라 검증 + filter/order/conflict normalize (db-op-request) ─
  {
    const issue = validateOpScalars({ table, op, single, maybeSingle, selectAfterWrite, limit });
    if (issue) {
      _activeOpCount--;
      return res.status(issue.status).json(issue.body);
    }
  }

  // 핵심 쓰기 작업만 requestId 로깅 (관측용, 본문/비밀 제외)
  if (isCriticalWriteLog(op, table)) {
    logger.info({ requestId, op, table }, '[op] critical-write');
  }

  const safeOrders = sanitizeOpOrders(orders);
  const safeConflictCols = sanitizeConflictCols(conflictCols);
  // Fix: {op:'eq'} 우회 → type 정규화; unknown types must not become no-op pass-alls
  const normalizedFilters: FilterSpec[] = normalizeOpFilters(filters);

  // ─ Table allowlist: reject unknown/internal tables immediately
  if (!ALLOWED_OP_TABLES.has(table)) {
    _activeOpCount--;
    const rej = opInvalidTableReject();
    return res.status(rej.status).json(rej.body);
  }

  if (!store[table]) store[table] = [];
  let tableData = store[table];

  try {
    const sendReject = (
      rej: { status: number; body: unknown; logMsg?: string; retryAfter?: string },
      logCtx: Record<string, unknown> = { ip: req.ip },
    ) => {
      if (rej.retryAfter) res.setHeader('Retry-After', rej.retryAfter);
      if (rej.logMsg) logger.warn(logCtx, rej.logMsg);
      return res.status(rej.status).json(rej.body);
    };
    // ── SELECT ──────────────────────────────────────────────────────────────
    if (op === 'select') {
      if (REALTIME_MERGE_TABLES.has(table)) {
        await mergeTableFromDbIfStale(table);
        tableData = store[table];
      }
      // ─ IDOR guard (강화): messages SELECT
      //   규칙 1: requesterId 없으면 메시지 접근 불가 (비인증 요청 차단)
      //   규칙 2: chat_id 필터 없으면 메시지 전체 덤프 불가
      //   규칙 3: 해당 채팅방 참여자가 아니면 접근 불가
      //   규칙 4: 존재하지 않는 chat_id로 요청 시 빈 배열 반환 (정보 노출 차단)
      if (table === 'messages') {
        if (!canReadPrivateTables) {
          if (!requesterId) {
          return sendReject(selectAuthRequiredReject('[SECURITY] IDOR: messages SELECT without requesterId blocked'), { ip: req.ip });
          }
          // chat_id 필터 탐색: eq(단일 채팅방) 또는 in(채팅 목록 일괄 조회) 모두 허용 — db-op-select-access
          const chatIdEqF = findChatIdEqFilter(normalizedFilters);
          const chatIdInF = findChatIdInFilter(normalizedFilters);

          if (!chatIdEqF && !chatIdInF) {
            const rej = messagesSelectMissingChatIdFilterReject();
            logger.warn({ requesterId, ip: req.ip }, rej.logMsg);
            return res.status(rej.status).json(rej.body);
          }

          if (chatIdEqF) {
            // 단일 채팅방 접근 — 참여자 검증 (+ 동일 쌍 중복 방 메시지 통합)
            await mergeTableFromDbIfStale('chats');
            const wantId = resolveMergedChatId(String(chatIdEqF.val));
            const chat = getTable('chats').find(c => String(c.id) === wantId);
            if (!chat) {
              return res.json({ data: [], error: null }); // 존재하지 않는 채팅방 → 빈 배열
            }
            if (!isChatRowParticipant(chat, String(requesterId))) {
              const rej = messagesSelectNonParticipantReject();
              logger.warn({ requesterId, chatId: chatIdEqF.val, ip: req.ip }, rej.logMsg);
              return res.status(rej.status).json(rej.body);
            }
            const siblingIds = chatIdsForPair(String(chat.user1_id), String(chat.user2_id));
            const lookupIds = [...new Set([wantId, ...siblingIds])];
            await mergeMessagesForChatIds(lookupIds);
            const scoped = mapMessagesOntoCanonicalChatId(getTable('messages'), wantId, lookupIds);
            const otherFilters = normalizedFilters.filter(f => !(f.type === 'eq' && f.col === 'chat_id'));
            const scopedResult = applyFilters(scoped, otherFilters);
            const scopedData = orderLimitShape(scopedResult, safeOrders, {
              limit: limit != null ? Math.floor(limit) : undefined,
              single,
              maybeSingle,
            });
            return res.json({ data: scopedData, error: null });
          }

          if (chatIdInF) {
            // 복수 채팅방 일괄 조회 (loadChatList) — 요청자가 참여하지 않는 채팅방 ID 차단
            const chats = getTable('chats');
            const illegalChatId = findIllegalMessagesInChatId(chats, chatIdInF.vals, String(requesterId));
            if (illegalChatId) {
              const rej = messagesSelectInNonParticipantReject();
              logger.warn({ requesterId, chatId: illegalChatId, ip: req.ip }, rej.logMsg);
              return res.status(rej.status).json(rej.body);
            }
            // sibling 방 메시지까지 포함 — 목록 lastMessage/미읽음이 옛 chat_id 행을 놓치지 않게
            const expanded = expandMessagesChatIdInVals(chats, chatIdInF.vals, chatIdsForPair);
            chatIdInF.vals = expanded;
            await mergeMessagesForChatIds(expanded);
          }
        }
        // isAdmin: 모든 메시지 조회 허용 (관리자 감사용)
      }

      // ─ IDOR guard: chats SELECT ───────────────────────────────────────────
      // 누구든 자신이 참여한 채팅방 목록만 볼 수 있어야 함.
      // requesterId 없이 chats를 전체 덤프하면 모든 채팅 참여자가 노출됨 → 차단.
      // 관리자는 전체 채팅방 조회 허용 (감사 목적).
      if (table === 'chats') {
        if (canReadPrivateTables) {
          // 관리자: 필터/정렬/페이지 그대로 적용하되 참여자 스코프 제한 없음
          const adminResult = applyFilters(tableData, normalizedFilters);
          const result2 = orderLimitShape(adminResult, safeOrders, {
            limit: limit != null ? Math.floor(limit) : undefined,
            single,
            maybeSingle,
          });
          return res.json({ data: result2, error: null });
        }
        if (!requesterId) {
          return sendReject(selectAuthRequiredReject('[SECURITY] IDOR: chats SELECT without requesterId blocked'), { ip: req.ip });
        }
        // 서버 측에서 참여자 검증 — 클라이언트 필터 우회 공격 차단
        // ⚠️ tableData는 store 배열 참조 → splice 금지. 별도 변수로 필터링.
        const dedupedScope = dedupeParticipantChatRows(tableData, String(requesterId), pickCanonicalChatRow);
        const scopedResult = applyFilters(dedupedScope, normalizedFilters);
        const singleScope = orderLimitShape(scopedResult, safeOrders, {
          limit: limit != null ? Math.floor(limit) : undefined,
          single,
          maybeSingle,
        });
        return res.json({ data: singleScope, error: null });
      }

      // ─ IDOR guard: likes SELECT ────────────────────────────────────────────
      // 좋아요 조회는 requesterId 필수 — 익명 스크래핑 차단.
      // 인증된 사용자는 전체 좋아요 조회 가능 (랭킹 집계 목적).
      if (table === 'likes' && !canReadPrivateTables) {
        if (!requesterId) {
          return sendReject(selectAuthRequiredReject('[SECURITY] IDOR: likes SELECT without requesterId blocked'), { ip: req.ip });
        }
      }

      // ─ IDOR guard: signal_sends SELECT ─────────────────────────────────────
      // 보낸 사람은 자신의 발신(send+pass)만. 받은 사람은 incoming send만 (pass 비공개).
      if (table === 'signal_sends' && !canReadPrivateTables) {
        if (!requesterId) {
          return sendReject(selectAuthRequiredReject('[SECURITY] IDOR: signal_sends SELECT without requesterId blocked'), { ip: req.ip });
        }
        tableData = scopeSignalSendsRows(tableData, String(requesterId));
      }

      // ─ IDOR guard: profile_views SELECT ───────────────────────────────────
      // 내 프로필 방문자(viewed_id=me) 또는 내가 본 기록(viewer_id=me)만.
      if (table === 'profile_views' && !canReadPrivateTables) {
        if (!requesterId) {
          return sendReject(selectAuthRequiredReject('[SECURITY] IDOR: profile_views SELECT without requesterId blocked'), { ip: req.ip });
        }
        tableData = scopeProfileViewsRows(tableData, String(requesterId));
      }

      // ─ IDOR guard: blocked_users / contact_share_events SELECT ───────────
      // 관계 당사자만 읽을 수 있고 관리자·테스트 감사 세션만 전체 조회 가능.
      if ((table === 'blocked_users' || table === 'contact_share_events') && !canReadPrivateTables) {
        if (!requesterId) {
          return sendReject(selectAuthRequiredReject('[SECURITY] IDOR: relationship SELECT without requesterId blocked'), { table, ip: req.ip });
        }
        tableData = table === 'blocked_users'
          ? scopeBlockedUsersRows(tableData, String(requesterId))
          : scopeContactShareEventsRows(tableData, String(requesterId));
      }

      // ─ IDOR guard: contact_shares SELECT ─────────────────────────────────
      // liker_id/liked_id 필터 있음 → 당사자만 전체 필드. 없음 → 통계 집계(created_at만, 익명).
      if (table === 'contact_shares' && !canReadPrivateTables) {
        if (!requesterId) {
          return sendReject(selectAuthRequiredReject('[SECURITY] IDOR: contact_shares SELECT without requesterId blocked'), { ip: req.ip });
        }
        const csSource = contactSharesSelectSource(tableData, String(requesterId), normalizedFilters);
        const csResult = applyFilters(csSource, normalizedFilters);
        const csData = orderLimitShape(csResult, safeOrders, {
          limit: limit != null ? Math.floor(limit) : undefined,
          single,
          maybeSingle,
        });
        return res.json({ data: csData, error: null });
      }

      // ─ IDOR guard: chat_reads SELECT ──────────────────────────────────────
      // 자신의 읽음 기록 + 내가 참여한 1:1 방의 상대 읽음 기록만 허용.
      // 타인 방 스크래핑은 차단하되, 상대 read_at 폴링('1' 표시)은 동작해야 함.
      if (table === 'chat_reads' && !isAdmin) {
        if (!requesterId) {
          return sendReject(selectAuthRequiredReject('[SECURITY] IDOR: chat_reads SELECT without requesterId blocked'), { ip: req.ip });
        }
        // 같은 1:1 방 상대의 read_at 만 허용 — 프론트 '1' 폴링에 필요 (db-op-select-access)
        const crScope = scopeChatReadsForRequester(
          tableData,
          String(requesterId),
          (raw, resolved) => getTable('chats').find(c => String(c.id) === resolved || String(c.id) === raw),
          resolveMergedChatId,
        );
        const { chatIdEq: chatIdEqCr, siblingIds } = chatReadsSiblingIdsForEqFilter(
          normalizedFilters,
          resolveMergedChatId,
          (ids) => getTable('chats').find(c => ids.has(String(c.id))),
          chatIdsForPair,
        );
        const { rows: crScoped, filters: crFilters } = applyChatReadsSiblingScope(
          crScope,
          normalizedFilters,
          chatIdEqCr,
          siblingIds,
        );
        const crResult = applyFilters(crScoped, crFilters);
        const crData = orderLimitShape(crResult, safeOrders, {
          limit: limit != null ? Math.floor(limit) : undefined,
          single,
          maybeSingle,
        });
        return res.json({ data: crData, error: null });
      }

      // ─ IDOR guard: group_messages / group_participants SELECT ───────────────
      if ((table === 'group_messages' || table === 'group_participants') && !canReadPrivateTables) {
        if (!requesterId) {
          return sendReject(selectAuthRequiredReject('[SECURITY] IDOR: group SELECT without requesterId blocked'), { table, ip: req.ip });
        }
        if (table === 'group_participants') {
          const me = getTable('profiles').find(p => String(p.id) === String(requesterId));
          if (me) await autoMatchGroupChatGuarded(String(requesterId), me);
          tableData = store['group_participants'];
        }
        const myGroupIds = collectMyGroupIds(
          getTable('group_participants'),
          String(requesterId),
          resolveMergedGroupId,
        );
        if (table === 'group_participants') {
          const gpScope = scopeGroupParticipantRows(tableData, myGroupIds);
          const gpResult = applyFilters(gpScope, normalizedFilters);
          const gpData = orderLimitShape(gpResult, safeOrders, {
            limit: limit != null ? Math.floor(limit) : undefined,
            single,
            maybeSingle,
          });
          return res.json({ data: gpData, error: null });
        }
        // group_messages: 참여 중인 방만 (병합된 옛 id 포함) — db-op-select-access
        const gmScope = scopeGroupMessageRows(tableData, myGroupIds, resolveMergedGroupId);
        const gmFilters = remapGroupIdFilters(normalizedFilters, resolveMergedGroupId);
        const gmResult = applyFilters(gmScope, gmFilters);
        const gmData = orderLimitShape(gmResult, safeOrders, {
          limit: limit != null ? Math.floor(limit) : undefined,
          single,
          maybeSingle,
        });
        return res.json({ data: gmData, error: null });
      }

      if (table === 'group_chats') {
        await ensureOptInGroupRooms();
        if (requesterId) {
          const me = getTable('profiles').find(p => String(p.id) === String(requesterId));
          if (me) await autoMatchGroupChatGuarded(String(requesterId), me);
        }
        tableData = store['group_chats'];
      }
      let result = applyFilters(tableData, normalizedFilters);
      sortRowsByOrders(result, safeOrders);
      if (limit != null) result = result.slice(0, limit);
      // 카탈로그 목록용 인원 수 — user_id 없이 숫자만 첨부
      if (table === 'group_chats') {
        result = attachGroupMemberCounts(result, getTable('group_participants'));
      }
      // ─ app_settings: 비밀번호 원문은 관리자에게도 내려주지 않음. 관리자는 *_set 플래그만.
      if (table === 'app_settings') {
        result = result.map(r => publicAppSettingsView(r, isAdmin));
      }
      if (table === 'profiles' && !isAdmin) {
        result = result.map(r => sanitizeProfileForViewer(r, requesterId));
      }
      // likes: 랭킹/통계 덤프는 liked_id·heart_type·status만 필요.
      // 보낸 사람(liker_id)은 본인 발신(liker_id=me) 또는 본인 수신함(liked_id=me) 조회 때만 노출.
      if (table === 'likes' && !isAdmin && !likesSelectKeepsLikerId(normalizedFilters, requesterId)) {
        result = redactLikerId(result);
      }
      // profile_views: 방문자(viewer_id)는 본인 방문 기록 또는 내 프로필 방문자 조회 때만 노출.
      // 좋아요 inbox(liker_id)와 동일 — 무필터 덤프에서 viewer_id를 지우면 방문자 목록이 비어 보임.
      if (table === 'profile_views' && !isAdmin && !profileViewsSelectKeepsViewerId(normalizedFilters, requesterId)) {
        result = redactViewerId(result);
      }
      if (single) {
        if (!result.length) return res.json({ data: null, error: { message: 'Row not found', code: 'PGRST116' } });
        return res.json({ data: result[0], error: null });
      }
      if (maybeSingle) return res.json({ data: result[0] ?? null, error: null });
      return res.json({ data: result, error: null });
    }

    // ── INSERT ──────────────────────────────────────────────────────────────
    if (op === 'insert') {
      if (payload == null) return sendReject(opPayloadRequiredReject());
      if (!isAdmin && isFunctionsLocked() && FUNCTIONS_LOCKED_INSERT_TABLES.has(table)) {
        return sendReject(opFunctionsLockedReject(FUNCTIONS_LOCKED_ERROR));
      }
      if (table === 'chats') {
        // 동일 유저 쌍 생성을 인스턴스 간에 직렬화
        const raw0 = (Array.isArray(payload) ? payload[0] : payload) as Record<string, unknown> | null;
        const lockKey = raw0?.user1_id != null && raw0?.user2_id != null
          ? chatPairKey(String(raw0.user1_id), String(raw0.user2_id))
          : null;
        const prepChats = async () => {
          await mergeTableFromDbIfStale('chats', true);
          await dedupeChatsInStore();
        };
        if (lockKey) await withChatPairLock(lockKey, prepChats);
        else await prepChats();
        tableData = store[table];
      }
      const inputs = Array.isArray(payload) ? payload as Record<string, unknown>[] : [payload as Record<string, unknown>];
      const inserted: Record<string, unknown>[] = [];
      // Fix #4: O(n²) → O(n) — profiles 삽입 시 루프 밖에서 Set 1회만 빌드
      const _insertNickSet = table === 'profiles' ? new Set(tableData.map(r => r.nickname).filter(Boolean)) : null;
      const _insertPinSet  = table === 'profiles' ? collectUsedPinCodes(tableData) : null;
      const _insertAvatarSet = table === 'profiles' ? collectUsedPresetAvatarIds(tableData) : null;
      const _pinParams     = table === 'profiles' ? pinPoolParams(tableData.length) : null;
      for (const row of inputs) {
        if (!row) continue;
        if (table === 'profiles' && _insertNickSet!.has(row.nickname) && row.nickname != null) {
          return sendReject(opNicknameDuplicateReject());
        }
        // const row는 재할당 불가이므로 effectiveRow로 분리; 텍스트 필드 sanitization 적용
        let effectiveRow: Record<string, unknown> = sanitizeRow(table, row);

        // ─ IDOR: INSERT ownership (db-op-insert-ownership) ────────────────
        if (table === 'messages') {
          const plan = planMessagesInsertOwnership(effectiveRow, requesterId);
          if (!plan.ok) {
            if (!requesterId) {
              logger.warn({ ip: req.ip }, plan.reject.logMsg);
            } else if (plan.reject.logMsg.includes('sender_id mismatch')) {
              logger.warn({ requesterId, sender_id: effectiveRow.sender_id, ip: req.ip }, plan.reject.logMsg);
            } else if (plan.reject.logMsg) {
              logger.warn({ requesterId, ip: req.ip }, plan.reject.logMsg);
            }
            return res.status(plan.reject.status).json(plan.reject.body);
          }
          effectiveRow = plan.row;
          effectiveRow = { ...effectiveRow, chat_id: resolveMergedChatId(String(effectiveRow.chat_id)) };
          const referenceCheck = await ensureWriteReferences(table, effectiveRow);
          if (!referenceCheck.ok && referenceCheck.unavailable) return sendReferenceFailure(res, referenceCheck);
          effectiveRow = {
            ...effectiveRow,
            chat_id: planCanonicalMessageChatId(
              String(effectiveRow.chat_id),
              getTable('chats'),
              chatPairKey,
              pickCanonicalChatRow,
            ),
          };
          const targetChat = getTable('chats').find(c => String(c.id) === String(effectiveRow.chat_id));
          if (!isChatRowParticipantOf(targetChat, String(requesterId))) {
            const rej = messagesInsertNonParticipantReject();
            logger.warn({ requesterId, chatId: effectiveRow.chat_id, ip: req.ip }, rej.logMsg);
            return res.status(rej.status).json(rej.body);
          }
          const peerId = peerIdFromChat(targetChat!, String(requesterId));
          if (isChatPairBlocked(String(requesterId), peerId)) {
            const rej = messagesInsertBlockedReject();
            logger.warn({ requesterId, peerId, chatId: effectiveRow.chat_id, ip: req.ip }, rej.logMsg);
            return res.status(rej.status).json(rej.body);
          }
          effectiveRow = withMessageChatPairFields(effectiveRow, targetChat!);
        }
        if (table === 'chats') {
          const plan = planChatsInsertOwnership(effectiveRow, requesterId);
          if (!plan.ok) {
            if (plan.reject.logMsg) {
              logger.warn({ requesterId, u1: String(effectiveRow.user1_id ?? ''), u2: String(effectiveRow.user2_id ?? ''), ip: req.ip }, plan.reject.logMsg);
            }
            return res.status(plan.reject.status).json(plan.reject.body);
          }
        }
        if (table === 'group_messages') {
          const plan = planGroupMessagesInsertOwnership(effectiveRow, requesterId);
          if (!plan.ok) return res.status(plan.reject.status).json(plan.reject.body);
          effectiveRow = plan.row;
          effectiveRow = { ...effectiveRow, group_id: resolveMergedGroupId(String(effectiveRow.group_id)) };
          const groupReference = await ensureWriteReferences(table, effectiveRow);
          if (!groupReference.ok && groupReference.unavailable) return sendReferenceFailure(res, groupReference);
          let isParticipant = getTable('group_participants').some(
            p => String(p.group_id) === String(effectiveRow.group_id) && String(p.user_id) === String(requesterId),
          );
          if (!isParticipant) {
            const refreshed = await refreshGroupParticipant(String(effectiveRow.group_id), String(requesterId));
            if (refreshed === 'unavailable') {
              return sendReferenceFailure(res, { ok: false, unavailable: true });
            }
            isParticipant = refreshed === 'found';
          }
          if (!isParticipant) {
            const rej = groupMessagesInsertNonParticipantReject();
            logger.warn({ requesterId, groupId: effectiveRow.group_id, ip: req.ip }, rej.logMsg);
            return res.status(rej.status).json(rej.body);
          }
        }
        if (table === 'group_participants') {
          const plan = planGroupParticipantsInsertOwnership(effectiveRow, requesterId);
          if (!plan.ok) {
            if (plan.reject.logMsg.includes('user_id mismatch')) {
              logger.warn({ requesterId, user_id: effectiveRow.user_id, ip: req.ip }, plan.reject.logMsg);
            } else if (plan.reject.logMsg) {
              logger.warn({ ip: req.ip }, plan.reject.logMsg);
            }
            return res.status(plan.reject.status).json(plan.reject.body);
          }
          effectiveRow = plan.row;
          const groupId = resolveMergedGroupId(String(effectiveRow.group_id));
          effectiveRow = { ...effectiveRow, group_id: groupId, user_id: requesterId };
          const groupReference = await ensureWriteReferences(table, effectiveRow);
          if (!groupReference.ok && groupReference.unavailable) return sendReferenceFailure(res, groupReference);
          const groupExists = getTable('group_chats').some(g => String(g.id) === groupId);
          if (!groupExists) {
            const rej = groupParticipantsMissingGroupReject();
            return res.status(rej.status).json(rej.body);
          }
          const already = getTable('group_participants').find(
            p => String(p.group_id) === groupId && String(p.user_id) === String(requesterId),
          );
          if (already) {
            if (selectAfterWrite) return res.json({ data: single ? already : [already], error: null });
            return res.json({ data: null, error: null });
          }
          await pruneNonCatalogMemberships(String(requesterId));
          if (countUserGroupSlots(String(requesterId)) >= MAX_GROUPS_PER_USER) {
            const rej = groupParticipantsLimitReject(GROUP_LIMIT_MESSAGE);
            return res.status(rej.status).json(rej.body);
          }
          effectiveRow = buildGroupParticipantInsertRow(effectiveRow, groupId, String(requesterId), ts());
          await clearGroupOptOut(String(requesterId), groupId);
        }
        if (table === 'group_chats') {
          const rej = groupChatsInsertReject(isAdmin, process.env.NODE_ENV === 'test');
          if (rej) {
            logger.warn({ requesterId, ip: req.ip }, rej.logMsg);
            return res.status(rej.status).json(rej.body);
          }
        }
        if (table === 'chat_reads') {
          const plan = planChatReadsInsertOwnership(effectiveRow, requesterId);
          if (!plan.ok) return res.status(plan.reject.status).json(plan.reject.body);
          effectiveRow = plan.row;
          if (effectiveRow.chat_id != null) {
            effectiveRow = { ...effectiveRow, chat_id: resolveMergedChatId(String(effectiveRow.chat_id)) };
            effectiveRow.id = `${effectiveRow.chat_id}__${requesterId}`;
          }
          const referenceCheck = await ensureWriteReferences(table, effectiveRow);
          if (!referenceCheck.ok && referenceCheck.unavailable) return sendReferenceFailure(res, referenceCheck);
          if (!isChatParticipant(effectiveRow.chat_id, requesterId!)) {
            const rej = chatReadsInsertNonParticipantReject();
            logger.warn({ requesterId, chatId: effectiveRow.chat_id, ip: req.ip }, rej.logMsg);
            return res.status(rej.status).json(rej.body);
          }
          stampChatReadAt(effectiveRow);
        }
        if (table === 'likes') {
          const plan = planLikesInsertOwnership(effectiveRow, requesterId);
          if (!plan.ok) {
            logger.warn({ ip: req.ip }, plan.reject.logMsg);
            return res.status(plan.reject.status).json(plan.reject.body);
          }
          effectiveRow = plan.row;
        }
        if (table === 'signal_sends') {
          const plan = planSignalSendsInsertOwnership(effectiveRow, requesterId);
          if (!plan.ok) {
            if (plan.reject.logMsg) logger.warn({ ip: req.ip }, plan.reject.logMsg);
            return res.status(plan.reject.status).json(plan.reject.body);
          }
          effectiveRow = plan.row;
          const receiverId = String(effectiveRow.receiver_id);
          const action = effectiveRow.action === 'pass' ? 'pass' : 'send';
          if (isChatPairBlocked(String(requesterId), receiverId)) {
            const rej = signalSendsInsertBlockedReject();
            logger.warn({ requesterId, receiverId, ip: req.ip }, rej.logMsg);
            return res.status(rej.status).json(rej.body);
          }
          const detId = deterministicSignalId(String(requesterId), receiverId);
          const existingSig = tableData.find(r => String(r.id) === detId)
            ?? tableData.find(r => String(r.sender_id) === String(requesterId) && String(r.receiver_id) === receiverId);
          const existingPlan = planSignalSendsExistingRow({ existing: existingSig, action });
          if (existingPlan.kind === 'return_existing') {
            if (selectAfterWrite) return res.json({ data: single ? existingSig : [existingSig], error: null });
            return res.json({ data: null, error: null });
          }
          if (existingPlan.kind === 'upgrade') {
            const oldRow = { ...existingSig! };
            const upgraded = existingPlan.upgraded;
            const sigIdx = tableData.findIndex(r => String(r.id) === String(existingSig!.id));
            if (sigIdx >= 0) tableData[sigIdx] = upgraded;
            try {
              await dbPersistRow(table, upgraded);
            } catch (e) {
              if (sigIdx >= 0) tableData[sigIdx] = oldRow;
              logger.error({ err: e, table, rowId: upgraded.id }, '[db] signal pass→send upgrade persist failed');
              return sendReject(opPersistFailedReject());
            }
            smartBroadcast(table, upgraded, { type: 'change', table, event: 'UPDATE', newRow: upgraded, oldRow });
            sendPushForEvent(table, upgraded, requesterId).catch(err => logger.error({ err }, '[db] background task error'));
            if (selectAfterWrite) return res.json({ data: single ? upgraded : [upgraded], error: null });
            return res.json({ data: null, error: null });
          }
          effectiveRow = { ...effectiveRow, sender_id: requesterId, receiver_id: receiverId, action, id: detId };
          const referenceCheck = await ensureWriteReferences(table, effectiveRow);
          if (!referenceCheck.ok) return sendReferenceFailure(res, referenceCheck);
        }
        if (table === 'profile_views') {
          const plan = planProfileViewsInsertOwnership(effectiveRow, requesterId);
          if (!plan.ok) {
            if (plan.earlyEmpty) {
              if (selectAfterWrite) return res.json({ data: single ? null : [], error: null });
              return res.json({ data: null, error: null });
            }
            if (plan.reject!.logMsg) logger.warn({ ip: req.ip }, plan.reject!.logMsg);
            return res.status(plan.reject!.status).json(plan.reject!.body);
          }
          effectiveRow = plan.row;
          const referenceCheck = await ensureWriteReferences(table, effectiveRow);
          if (!referenceCheck.ok) return sendReferenceFailure(res, referenceCheck);
        }
        if (table === 'blocked_users' && !isAdmin) {
          const existingById = effectiveRow.id == null
            ? undefined
            : tableData.find(r => String(r.id) === String(effectiveRow.id));
          const plan = planBlockedUsersInsertOwnership(effectiveRow, requesterId, existingById);
          if (!plan.ok) return res.status(plan.reject.status).json(plan.reject.body);
          effectiveRow = plan.row;
        }
        if (table === 'contact_shares' && !isAdmin) {
          const existingById = effectiveRow.id == null
            ? undefined
            : tableData.find(r => String(r.id) === String(effectiveRow.id));
          const plan = planContactSharesInsertOwnership(effectiveRow, requesterId, existingById);
          if (!plan.ok) return res.status(plan.reject.status).json(plan.reject.body);
          effectiveRow = plan.row;
          const referenceCheck = await ensureWriteReferences(table, effectiveRow);
          if (!referenceCheck.ok) return sendReferenceFailure(res, referenceCheck);
        }
        if (table === 'contact_share_events' && !isAdmin) {
          const existingById = effectiveRow.id == null
            ? undefined
            : tableData.find(r => String(r.id) === String(effectiveRow.id));
          const plan = planContactShareEventsInsertOwnership(effectiveRow, requesterId, existingById);
          if (!plan.ok) return res.status(plan.reject.status).json(plan.reject.body);
          effectiveRow = plan.row;
          const referenceCheck = await ensureWriteReferences(table, effectiveRow);
          if (!referenceCheck.ok) return sendReferenceFailure(res, referenceCheck);
        }

        if (table === 'profiles') {
          if (profileBirthYearRejected(res, effectiveRow.birth_year)) return;
          const { use5Digit, poolSize } = _pinParams!;
          const usedPins = _insertPinSet!; // 루프 밖 빌드 Set 재사용 — O(1) 조회
          // PIN 슬롯 전체 소진 — 신규 등록 불가 (503) [resolvePin handles exhaustion + collision]
          const pinResult = resolvePin(usedPins, poolSize, use5Digit, effectiveRow.pin_code as string | null | undefined);
          if (!pinResult.ok) {
            return sendReject(opPinExhaustedReject());
          }
          effectiveRow = withFixedAdminNickname({ ...effectiveRow, pin_code: pinResult.pin });
          if (profileAvatarColorRejected(res, effectiveRow.avatar_color)) return;
          if (profileNpcAvatarRejected(res, effectiveRow.photo_url, effectiveRow)) return;
          // 입장 시 카탈로그 프리셋 아바타를 중복 없이 랜덤 배정 (동시 입장 race → advisory lock)
          if (!isAdminProfileRow(effectiveRow)) {
          await withChatPairLock('entry_avatar_assign', async () => {
            await mergeTableFromDbIfStale('profiles', true);
            const usedAvatars = collectUsedPresetAvatarIds(getTable('profiles'));
            for (const id of _insertAvatarSet!) usedAvatars.add(id);
            const avatarResult = resolveEntryAvatar(
              usedAvatars,
              effectiveRow.photo_url as string | null | undefined,
            );
            if (avatarResult.ok && avatarResult.assigned) {
              effectiveRow = { ...effectiveRow, photo_url: avatarResult.path };
              _insertAvatarSet!.add(avatarResult.id);
            }
          });
          }
        }
        // chats 테이블: ID 정규화(sort) — planNormalizeChatPairRow
        if (table === 'chats' && effectiveRow.user1_id != null && effectiveRow.user2_id != null) {
          const { uid1, uid2, detId, row: normalized } = planNormalizeChatPairRow(effectiveRow);
          effectiveRow = { ...normalized, id: effectiveRow.id ?? detId, user1_id: uid1, user2_id: uid2 };
          const existing = findExistingChatPairRow(tableData, uid1, uid2, detId);
          if (existing) {
            if (selectAfterWrite) return res.json({ data: single ? existing : [existing], error: null });
            return res.json({ data: null, error: null });
          }
          effectiveRow = { ...effectiveRow, id: detId };
        }
        if (table === 'messages' || table === 'group_messages') {
          const dupMsg = findRowByClientId(tableData, effectiveRow.client_id);
          if (dupMsg) return res.json({ data: single ? dupMsg : [dupMsg], error: null });
        }
        // likes 테이블: 동일 liker+liked+heart_type 중복 방지 (빠른 연속 클릭으로 인한 중복 하트 삽입 방지)
        if (table === 'likes' && effectiveRow.liker_id != null && effectiveRow.liked_id != null && effectiveRow.heart_type != null) {
          await ensureAdminProfile();
          const likeLiker = String(effectiveRow.liker_id);
          const likeLiked = String(effectiveRow.liked_id);
          const likeType = String(effectiveRow.heart_type);
          const likeTriple = (r: Record<string, unknown>) =>
            matchesLikeTriple(r, likeLiker, likeLiked, likeType);
          const dupLike = tableData.find(likeTriple);
          if (dupLike) return res.json({ data: single ? dupLike : [dupLike], error: null }); // 멱등: 기존 row 반환
          const referenceCheck = await ensureWriteReferences(table, effectiveRow);
          if (!referenceCheck.ok) return sendReferenceFailure(res, referenceCheck);

          // 타입별 글로벌 한도: 동일 heart_type을 최대 2명에게만 보낼 수 있음 (db-op-likes-limits)
          if (likesSameTypeLimitReached(tableData, likeLiker, likeType)) {
            // 400: HEART_LIMIT을 429로 주면 클라이언트가 NAT 429로 재시도해 지연·이중전송처럼 보임
            return sendReject(likesHeartLimitReject());
          }

          // Time-bucket rate limiter: at most 1 like per 500 ms per (liker, liked, type) triple
          // Keyed on all three dimensions so different heart types can still be sent concurrently;
          // only the exact same (liker, liked, type) combination is throttled within the window.
          const rateKey = `${likeLiker}:${likeLiked}:${likeType}`;
          const lastMs = _likesLastInsert.get(rateKey) ?? 0;
          if (likesPairIntervalBlocked(lastMs, Date.now(), LIKES_MIN_INTERVAL_MS)) {
            // Rapid duplicate — return existing row if any (never silent null success)
            const recent = tableData.find(likeTriple);
            if (recent) return res.json({ data: single ? recent : [recent], error: null });
            return sendReject(likesRateLimitReject());
          }
          // 멀티 인스턴스: PG 공용 슬롯 (로컬 Map 만으로는 인스턴스별 우회 가능)
          const distributedOk = await claimDistributedRateSlot(`like_pair:${rateKey}`, LIKES_MIN_INTERVAL_MS);
          if (!distributedOk) {
            const recent = tableData.find(likeTriple);
            if (recent) return res.json({ data: single ? recent : [recent], error: null });
            return sendReject(likesRateLimitReject());
          }
          _likesLastInsert.set(rateKey, Date.now());

          const liker = String(effectiveRow.liker_id);
          const nowMs = Date.now();
          const minutePlan = planLikesMinuteBucketConsume(
            _userLikeMinuteBuckets.get(liker),
            nowMs,
            LIKES_MAX_PER_USER_PER_MIN,
          );
          _userLikeMinuteBuckets.set(liker, minutePlan.bucket);
          if (!minutePlan.allowed) {
            return sendReject(likesRateLimitReject());
          }
          const minuteBucket = Math.floor(nowMs / 60_000);
          const minuteOk = await claimDistributedMinuteQuota(
            `like_min:${liker}:${minuteBucket}`,
            LIKES_MAX_PER_USER_PER_MIN,
          );
          if (!minuteOk) {
            return sendReject(likesRateLimitReject());
          }
        }
        const referenceCheck = await ensureWriteReferences(table, effectiveRow);
        if (!referenceCheck.ok) return sendReferenceFailure(res, referenceCheck);
        const newRow = buildInsertedRow(
          effectiveRow,
          (effectiveRow.id as string | undefined) ?? genId(),
          ts(),
          table,
        );

        // 프로필 생성 시 device secret을 원자적으로 바인딩 — TOFU 레이스 윈도우 제거
        // 클라이언트가 _device_secret 필드를 포함해 INSERT하면 서버가 HMAC 해시를 저장하고
        // 해당 필드를 프로필 데이터에서 제거합니다(공개 쿼리에 노출되지 않음).
        {
          const bind = planProfileDeviceSecretBind(table, newRow, (secret) =>
            hashDeviceSecret(secret, SSE_TOKEN_SECRET),
          );
          if (bind.action === 'bind') {
            if (!getTable('device_secrets').find(r => r.user_id === bind.profileId)) {
              const dsRow = buildDeviceSecretRow({
                id: genId(),
                userId: bind.profileId,
                secretHash: bind.secretHash,
                createdAt: ts(),
              });
              getTable('device_secrets').push(dsRow);
              dbPersistRow('device_secrets', dsRow).catch(e => logger.error({ err: e }, '[db] background task error'));
            }
            delete newRow._device_secret; // 프로필 응답·DB에서 제거
          }
        }

        tableData.push(newRow);
        inserted.push(newRow);
        // 배치 삽입 시 다음 항목의 중복 검사가 정확하도록 Set 증분 업데이트
        if (table === 'profiles') {
          if (newRow.nickname) _insertNickSet!.add(newRow.nickname as string);
          if (newRow.pin_code) _insertPinSet!.add(newRow.pin_code as string);
          const avId = extractPresetAvatarId(newRow.photo_url as string | null | undefined);
          if (avId) _insertAvatarSet!.add(avId);
        }

        // 핵심 테이블: DB 저장 성공 후에만 SSE 전파 — "전달됐는데 저장 안 됨" 방지
        if (CRITICAL_PERSIST_TABLES.has(table)) {
          try {
            await dbPersistRow(table, newRow);
          } catch (e) {
            const idx = tableData.findIndex(r => r.id === newRow.id);
            if (idx >= 0) tableData.splice(idx, 1);
            const iidx = inserted.findIndex(r => r.id === newRow.id);
            if (iidx >= 0) inserted.splice(iidx, 1);
            logger.error({ err: e, table, rowId: newRow.id }, '[db] critical persist failed — rolled back memory');
            return sendReject(opPersistFailedReject());
          }
          smartBroadcast(table, newRow, { type: 'change', table, event: 'INSERT', newRow, oldRow: null });
        } else {
          smartBroadcast(table, newRow, { type: 'change', table, event: 'INSERT', newRow, oldRow: null });
          dbPersistRow(table, newRow).catch(e => logger.error({ err: e }, '[db] background task error'));
        }
        // #33: 신규 프로필 등록 시 PIN 풀 사용량 확인 — 85% 초과 시 관리자 푸시 알림
        if (table === 'profiles') {
          checkAndNotifyAdminPinPool().catch(e => logger.error({ err: e }, '[db] background task error'));
          await autoMatchGroupChatGuarded(String(newRow.id), newRow);
        }
        // chat_reads 삽입 시 해당 유저 unread 캐시 즉시 무효화
        if (table === 'chat_reads' && newRow.reader_id) {
          unreadCountsCache.delete(String(newRow.reader_id));
        }
        // Fix #8: 메시지 삽입 시 수신자 unread 캐시 즉시 무효화 (TTL 2s 대기 없음)
        if (table === 'messages' && newRow.sender_id && newRow.chat_id) {
          const _msgChat = getTable('chats').find(c => String(c.id) === String(newRow.chat_id));
          const _receiverId = messageReceiverIdFromChat(_msgChat, newRow.sender_id);
          if (_receiverId) unreadCountsCache.delete(_receiverId);
        }
        // 메시지·하트·채팅방 생성 시 수신자 핸드폰으로 푸시 알림 전송
        if (table === 'messages' || table === 'likes' || table === 'chats' || (table === 'signal_sends' && newRow.action === 'send')) {
          sendPushForEvent(table, newRow, requesterId).catch(e => logger.error({ err: e }, '[db] background task error'));
        }
      }
      if (selectAfterWrite) return res.json({ data: single ? inserted[0] ?? null : inserted, error: null });
      return res.json({ data: null, error: null });
    }

    // ── UPDATE ──────────────────────────────────────────────────────────────
    if (op === 'update') {
      if (table === 'app_settings' && !isAdmin) {
        return sendReject(opAdminOnlyReject());
      }
      if (!isAdmin && isFunctionsLocked() && FUNCTIONS_LOCKED_UPDATE_TABLES.has(table)) {
        return sendReject(opFunctionsLockedReject(FUNCTIONS_LOCKED_ERROR));
      }
      let patch = sanitizeRow(table, payload as Record<string, unknown>);
      const rowsToUpdate = applyFilters(tableData, normalizedFilters);
      for (const existingRow of rowsToUpdate) {
        const referenceCheck = await ensureWriteReferences(table, { ...existingRow, ...patch });
        if (!referenceCheck.ok) return sendReferenceFailure(res, referenceCheck);
      }

      // ─ IDOR guard: UPDATE ownership (db-op-update-ownership) ───────────
      {
        const authReject = updateMissingRequesterReject(table, isAdmin, requesterId);
        if (authReject) {
          if (authReject.logMsg.includes('relationship')) {
            logger.warn({ table, ip: req.ip }, authReject.logMsg);
          } else {
            logger.warn({ ip: req.ip }, authReject.logMsg);
          }
          return res.status(authReject.status).json(authReject.body);
        }
      }
      if (!isAdmin && requesterId) {
        patch = forceUpdateOwnershipPatch(table, patch, String(requesterId));
      }
      {
        const sigReject = signalSendsUpdateReject(table, isAdmin);
        if (sigReject) return res.status(sigReject.status).json(sigReject.body);
      }
      if (table === 'group_participants') {
        const gpPlan = planGroupParticipantsUpdate(patch, requesterId);
        if (!gpPlan.ok) {
          if (gpPlan.reject.logMsg) logger.warn({ ip: req.ip }, gpPlan.reject.logMsg);
          return res.status(gpPlan.reject.status).json(gpPlan.reject.body);
        }
        patch = gpPlan.patch;
      }
      // requesterId가 있는 경우, 자신 소유의 행만 수정 가능하도록 검증
      if (requesterId) {
        for (const existingRow of rowsToUpdate) {
          const ownReject = checkUpdateRowOwnership(table, existingRow, String(requesterId), isAdmin);
          if (ownReject) {
            logger.warn({ requesterId, rowId: existingRow.id }, ownReject.logMsg);
            return res.status(ownReject.status).json(ownReject.body);
          }
        }
      }
      // profiles 테이블에서 pin_code를 UPDATE할 때 서버 레벨 유일성 보장
      // (레거시 사용자 핀 자동 부여 시 경쟁 조건 방지)
      if (table === 'profiles' && patch.pin_code != null) {
        const usedPins = collectUsedPinCodes(tableData);
        const { use5Digit, poolSize } = pinPoolParams(tableData.length);
        const pinResult = resolvePin(usedPins, poolSize, use5Digit, patch.pin_code as string);
        if (!pinResult.ok) {
          return sendReject(opPinExhaustedReject());
        }
        patch = { ...patch, pin_code: pinResult.pin };
      }
      if (table === 'profiles' && 'birth_year' in patch) {
        if (profileBirthYearRejected(res, patch.birth_year)) return;
      }
      if (table === 'profiles' && 'avatar_color' in patch) {
        if (profileAvatarColorRejected(res, patch.avatar_color)) return;
      }
      if (table === 'profiles' && 'photo_url' in patch) {
        for (const existingRow of rowsToUpdate) {
          const merged = { ...existingRow, ...patch };
          if (profileNpcAvatarRejected(res, patch.photo_url, merged)) return;
        }
      }
      if (table === 'profiles' && !isAdmin) {
        if ('birth_md_edit_count' in patch) delete patch.birth_md_edit_count;
        const touchesBirthMd = 'birth_month' in patch || 'birth_day' in patch;
        if (touchesBirthMd) {
          for (const existingRow of rowsToUpdate) {
            const bmPlan = planBirthMdEditPatch(existingRow, patch);
            if (!bmPlan.ok) return res.status(bmPlan.reject.status).json(bmPlan.reject.body);
            patch = bmPlan.patch;
          }
        }
      }
      if (table === 'chat_reads') stampChatReadAt(patch);
      const updated: Record<string, unknown>[] = [];
      for (let i = 0; i < tableData.length; i++) {
        if (applyFilters([tableData[i]], normalizedFilters).length) {
          const oldRow = { ...tableData[i] };
          let newRow = { ...oldRow, ...patch };
          if (table === 'profiles') newRow = withFixedAdminNickname(newRow);
          tableData[i] = newRow;
          updated.push(newRow);
          if (CRITICAL_PERSIST_TABLES.has(table)) {
            try {
              await dbPersistRow(table, newRow);
            } catch (e) {
              tableData[i] = oldRow; // rollback
              const uidx = updated.findIndex(r => r.id === newRow.id);
              if (uidx >= 0) updated.splice(uidx, 1);
              logger.error({ err: e, table, rowId: newRow.id }, '[db] critical UPDATE persist failed');
              return sendReject(opPersistFailedReject());
            }
            smartBroadcast(table, newRow, { type: 'change', table, event: 'UPDATE', newRow, oldRow });
          } else {
            smartBroadcast(table, newRow, { type: 'change', table, event: 'UPDATE', newRow, oldRow });
            dbPersistRow(table, newRow).catch(e => logger.error({ err: e }, '[db] background task error'));
          }
          // chat_reads 갱신 시 해당 유저 unread 캐시 즉시 무효화
          if (table === 'chat_reads' && newRow.reader_id) {
            unreadCountsCache.delete(String(newRow.reader_id));
          }
        }
      }
      if (table === 'profiles') {
        for (const row of updated) {
          await autoMatchGroupChatGuarded(String(row.id), row);
        }
      }
      if (selectAfterWrite) return res.json({ data: single ? updated[0] ?? null : updated, error: null });
      return res.json({ data: null, error: null });
    }

    // ── UPSERT ──────────────────────────────────────────────────────────────
    if (op === 'upsert') {
      {
        const sigReject = signalSendsUpsertReject(table, isAdmin);
        if (sigReject) return res.status(sigReject.status).json(sigReject.body);
      }
      const inputs = (Array.isArray(payload) ? payload as Record<string, unknown>[] : [payload as Record<string, unknown>])
        .map(row => sanitizeRow(table, row)); // XSS 방어: UPSERT payload도 sanitize
      const upserted: Record<string, unknown>[] = [];

      // ─ IDOR guard: UPSERT ownership (db-op-upsert-ownership) ───────────
      {
        const missing = upsertRelationshipMissingRequesterReject(table, isAdmin, requesterId);
        if (missing) return res.status(missing.status).json(missing.body);
      }
      if (!isAdmin && UPSERT_RELATIONSHIP_TABLES.has(table) && requesterId) {
        for (let i = 0; i < inputs.length; i++) {
          const row = inputs[i];
          if (!row) continue;
          const existingById = row.id == null ? undefined : tableData.find(r => String(r.id) === String(row.id));
          const plan = planUpsertRelationshipRow(table, row, String(requesterId), existingById);
          if (!plan.ok) return res.status(plan.reject.status).json(plan.reject.body);
          inputs[i] = plan.row;
        }
      }
      if (table === 'chat_reads') {
        for (let i = 0; i < inputs.length; i++) {
          const row = inputs[i];
          if (!row) continue;
          const plan = planChatReadsUpsertOwnership(row, requesterId);
          if (!plan.ok) return res.status(plan.reject.status).json(plan.reject.body);
          let next = plan.row;
          if (next.chat_id != null) {
            next = { ...next, chat_id: resolveMergedChatId(String(next.chat_id)) };
            next.id = `${next.chat_id}__${requesterId}`;
          }
          const referenceCheck = await ensureWriteReferences(table, next);
          if (!referenceCheck.ok) return sendReferenceFailure(res, referenceCheck);
          if (!isChatParticipant(next.chat_id, requesterId!)) {
            const rej = chatReadsUpsertNonParticipantReject();
            logger.warn({ requesterId, chatId: next.chat_id }, rej.logMsg);
            return res.status(rej.status).json(rej.body);
          }
          stampChatReadAt(next);
          inputs[i] = next;
        }
      }
      if (requesterId) {
        for (const row of inputs) {
          if (!row) continue;
          const ownReject = checkUpsertChatReadsReader(table, row, String(requesterId));
          if (ownReject) {
            logger.warn({ requesterId, reader_id: row.reader_id }, ownReject.logMsg);
            return res.status(ownReject.status).json(ownReject.body);
          }
        }
      }
      for (const row of inputs) {
        if (!row) continue;
        const referenceCheck = await ensureWriteReferences(table, row);
        if (!referenceCheck.ok) return sendReferenceFailure(res, referenceCheck);
      }
      // Fix #7: O(n²) → O(n) — id 기반 UPSERT 시 Map 인덱스로 O(1) 조회
      const _idxById = !safeConflictCols.length ? new Map(tableData.map((r, i) => [r.id, i])) : null;
      for (const row of inputs) {
        let idx = -1;
        if (safeConflictCols.length) {
          idx = tableData.findIndex(r => safeConflictCols.every(c => String(r[c]) === String(row[c]) || r[c] === row[c]));
        } else if (row.id != null) {
          idx = _idxById!.get(row.id) ?? -1;
        }
        if (idx >= 0) {
          if (!isAdmin && requesterId && UPSERT_RELATIONSHIP_TABLES.has(table)) {
            const ownerField = relationshipOwnerField(table)!;
            const ownReject = checkUpsertConflictOwner(table, tableData[idx][ownerField], String(requesterId));
            if (ownReject) return res.status(ownReject.status).json(ownReject.body);
          }
          const oldRow = { ...tableData[idx] };
          const newRow = { ...oldRow, ...row };
          if (table === 'profiles' && 'birth_year' in row && profileBirthYearRejected(res, row.birth_year)) return;
          tableData[idx] = newRow;
          upserted.push(newRow);
          if (CRITICAL_PERSIST_TABLES.has(table)) {
            try {
              await dbPersistRow(table, newRow);
            } catch (e) {
              tableData[idx] = oldRow;
              upserted.pop();
              logger.error({ err: e, table, rowId: newRow.id }, '[db] critical UPSERT persist failed');
              return sendReject(opPersistFailedReject());
            }
            smartBroadcast(table, newRow, { type: 'change', table, event: 'UPDATE', newRow, oldRow });
          } else {
            smartBroadcast(table, newRow, { type: 'change', table, event: 'UPDATE', newRow, oldRow });
            dbPersistRow(table, newRow).catch(e => logger.error({ err: e }, '[db] background task error'));
          }
          // chat_reads 갱신 시 해당 유저 unread 캐시 즉시 무효화
          if (table === 'chat_reads' && newRow.reader_id) {
            unreadCountsCache.delete(String(newRow.reader_id));
          }
        } else {
          let base: Record<string, unknown> = { id: genId(), created_at: ts(), ...row };
          if (table === 'profiles') {
            if (profileBirthYearRejected(res, base.birth_year)) return;
            const usedPins = collectUsedPinCodes(tableData);
            const { use5Digit, poolSize } = pinPoolParams(tableData.length);
            const pinResult = resolvePin(usedPins, poolSize, use5Digit, base.pin_code as string | null | undefined);
            if (!pinResult.ok) {
              return sendReject(opPinExhaustedReject());
            }
            base = { ...base, pin_code: pinResult.pin };
            if (typeof base._device_secret === 'string') {
              const secretHash = hashDeviceSecret(base._device_secret as string, SSE_TOKEN_SECRET);
              const profileId = String(base.id);
              if (!getTable('device_secrets').find(r => r.user_id === profileId)) {
                const dsRow = { id: genId(), user_id: profileId, secret_hash: secretHash, created_at: ts() };
                getTable('device_secrets').push(dsRow);
                dbPersistRow('device_secrets', dsRow).catch(e => logger.error({ err: e }, '[db] background task error'));
              }
              delete base._device_secret;
            }
          }
          if (table === 'profiles' && base.birth_month == null) {
            base.birth_month = Math.ceil(Math.random() * 12);
            base.birth_day = Math.ceil(Math.random() * 28);
          }
          tableData.push(base);
          _idxById?.set(base.id, tableData.length - 1); // Map 갱신 (배치 내 후속 항목 O(1) 조회)
          upserted.push(base);
          if (CRITICAL_PERSIST_TABLES.has(table)) {
            try {
              await dbPersistRow(table, base);
            } catch (e) {
              const bi = tableData.findIndex(r => r.id === base.id);
              if (bi >= 0) tableData.splice(bi, 1);
              upserted.pop();
              logger.error({ err: e, table, rowId: base.id }, '[db] critical UPSERT insert persist failed');
              return sendReject(opPersistFailedReject());
            }
            smartBroadcast(table, base, { type: 'change', table, event: 'INSERT', newRow: base, oldRow: null });
          } else {
            smartBroadcast(table, base, { type: 'change', table, event: 'INSERT', newRow: base, oldRow: null });
            dbPersistRow(table, base).catch(e => logger.error({ err: e }, '[db] background task error'));
          }
          if (table === 'chat_reads' && base.reader_id) {
            unreadCountsCache.delete(String(base.reader_id));
          }
        }
      }
      if (table === 'profiles') {
        for (const row of upserted) {
          await autoMatchGroupChatGuarded(String(row.id), row);
        }
      }
      if (selectAfterWrite) return res.json({ data: upserted, error: null });
      return res.json({ data: null, error: null });
    }

    // ── DELETE ──────────────────────────────────────────────────────────────
    if (op === 'delete') {
      let toDelete = applyFilters(tableData, normalizedFilters);

      // ─ IDOR guard: DELETE ownership (db-op-delete-ownership) ───────────
      {
        const authReject = deleteMissingRequesterReject(table, isAdmin, requesterId);
        if (authReject) {
          logger.warn({ table, ip: req.ip }, authReject.logMsg);
          return res.status(authReject.status).json(authReject.body);
        }
      }

      // ─ IDOR guard: DELETE ownership check ──────────────────────────────
      if (requesterId && !isAdmin) {
        for (const existingRow of toDelete) {
          const ownReject = checkDeleteRowOwnership(table, existingRow, String(requesterId));
          if (ownReject) {
            logger.warn({ requesterId, rowId: existingRow.id }, ownReject.logMsg);
            return res.status(ownReject.status).json(ownReject.body);
          }
        }
      }

      if (table === 'group_participants' && requesterId && !isAdmin) {
        const gidF = normalizedFilters.find(f => f.type === 'eq' && f.col === 'group_id');
        const uidF = normalizedFilters.find(f => f.type === 'eq' && f.col === 'user_id');
        toDelete = planGroupParticipantsDeleteExpand({
          toDelete,
          groupIdEqVal: gidF && 'val' in gidF ? gidF.val : undefined,
          userIdEqVal: uidF && 'val' in uidF ? uidF.val : undefined,
          requesterId: String(requesterId),
          leaveRowsFor: participantRowsToLeave,
        });
      }

      const deleteIds = [...new Set(toDelete.map(r => String(r.id)).filter(Boolean))];
      const previousRows = [...toDelete];
      const deleteIdSet = new Set(deleteIds);
      store[table] = tableData.filter(r => {
        if (r.id != null && deleteIdSet.has(String(r.id))) return false;
        return !applyFilters([r], normalizedFilters).length;
      });

      if (deleteIds.length > 0) {
        if (CRITICAL_PERSIST_TABLES.has(table)) {
          try {
            await dbDeleteRows(table, deleteIds);
          } catch (e) {
            // persist 실패 시 메모리 롤백 — 응답/브로드캐스트 전에 복구
            for (const row of previousRows) {
              if (!store[table].some(r => String(r.id) === String(row.id))) {
                store[table].push(row);
              }
            }
            logger.error({ err: e, table, deleteIds }, '[db] critical DELETE persist failed — rolled back');
            return sendReject(opDeletePersistFailedReject());
          }
        } else {
          dbDeleteRows(table, deleteIds).catch(e => logger.error({ err: e }, '[db] background task error'));
        }
      }

      for (const row of toDelete) {
        if (table === 'group_participants') {
          await recordGroupOptOut(row);
        }
        smartBroadcast(table, row, { type: 'change', table, event: 'DELETE', newRow: null, oldRow: row });
      }
      return res.json({ data: null, error: null });
    }

    return sendReject(opUnknownOperationReject());
  } catch (e) {
    logger.error({ err: e }, '[db/op] Unexpected error');
    // 내부 오류 문자열을 클라이언트에 직접 노출하지 않음 — 스키마·스택 정보 유출 방지
    return res.status(200).json(opInternalErrorReject().body);
  } finally {
    // ─ 동시 요청 슬롯 반환 — try/catch 내부의 어떤 경로로 나가든 반드시 1회 실행
    _activeOpCount--;
  }
});

// ─── RPC allowlist: ../lib/db-rpc-allowlist.ts ─────────────────────────────────
// ─── RPC endpoint ─────────────────────────────────────────────────────────────
router.post('/rpc/:name', async (req: Request, res: Response) => {
  const { name } = req.params;

  // ─ name 타입·길이 방어 + 허용 목록 검증 ───────────────────────────────────
  {
    const nameRej = validateRpcName(name);
    if (nameRej) return res.status(nameRej.status).json(nameRej.body);
  }
  if (!ALLOWED_RPCS.has(name)) {
    logger.warn({ name, ip: req.ip }, '[SECURITY] Unknown RPC call rejected');
    const rej = rpcUnknownReject(String(name));
    return res.status(rej.status).json(rej.body);
  }

  // ─ req.body 타입 방어 ──────────────────────────────────────────────────────
  if (req.body != null && (typeof req.body !== 'object' || Array.isArray(req.body))) {
    const rej = rpcInvalidBodyReject();
    return res.status(rej.status).json(rej.body);
  }
  const args = (req.body ?? {}) as Record<string, unknown>;

  await hydrateAppSettingsFromDb();
  const settings = (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
  const adminSecrets = panelAdminSecrets(settings.admin_password as string | undefined);
  const testSecrets = panelTestSecrets(settings.test_password as string | undefined);

  function checkPassword() {
    const plan = planCheckAdminPassword({
      provided: (args.p_admin_password as string) ?? '',
      token: (args.adminToken as string) ?? '',
      adminSecrets,
      deriveAdminToken,
      secretMatches,
    });
    if (!plan.ok) throw new RpcAuthError(plan.message);
  }

  function checkTestPassword() {
    const plan = planCheckTestPassword({
      provided: String(args.p_test_password ?? '').trim(),
      testSecrets,
      secretMatches,
    });
    if (!plan.ok) throw new RpcAuthError(plan.message);
  }

  try {
    switch (name) {
      case 'admin_create_session': {
        // 관리자 비밀번호 서버 사이드 검증
        // (클라이언트가 app_settings.admin_password를 직접 읽는 것을 방지하기 위해 여기서만 검증)
        checkPassword();
        const adminPhoneSetting = (settings.admin_phone as string | undefined) ?? '';
        const providedPhone = (args.p_phone as string | undefined) ?? '';
        if (adminPhoneMismatch(adminPhoneSetting, providedPhone)) {
          const rej = adminPhoneMismatchReject();
          return res.status(rej.status).json(rej.body);
        }
        const providedPw = String(args.p_admin_password ?? '').trim();
        const adminTokenArg = String(args.adminToken ?? '').trim();
        const dbAdmin = String(settings.admin_password ?? '').trim();
        // 실제로 일치한 비밀번호로 토큰 생성 — bootstrap 로그인 시 DB/기본값 불일치 방지
        const tokenKey = pickAdminTokenKey({
          providedPw,
          adminTokenArg,
          dbAdmin,
          adminSecrets,
          secretMatches,
          deriveAdminToken,
        });
        const adminToken = deriveAdminToken(tokenKey);
        const bootstrapAdmin = process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim();
        if (shouldPersistBootstrapPanelPassword({
          provided: providedPw,
          bootstrap: bootstrapAdmin,
          dbValue: dbAdmin,
          isDefault: isDefaultPanelPassword,
        })) {
          const current = (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
          const updated = mergeAppSettings(current, { admin_password: bootstrapAdmin! });
          store['app_settings'] = [updated];
          dbPersistRow('app_settings', updated).catch(e => logger.error({ err: e }, '[db] persist bootstrap admin password'));
        }
        return res.json({ data: adminToken, error: null });
      }

      case 'admin_invalidate_session':
        checkPassword();
        return res.json({ data: null, error: null });

      case 'admin_auth_phone':
        checkPassword();
        return res.json({ data: null, error: null });

      case 'admin_toggle_session': {
        checkPassword();
        const active = args.p_active === true;
        const current = (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
        const merged = mergeAppSettings(current, { session_active: active });
        const updated = await overlayDbSecrets(merged, new Set());
        store['app_settings'] = [updated];
        try {
          await dbPersistRow('app_settings', updated);
        } catch (e) {
          logger.error({ err: e }, '[db] admin_toggle_session persist failed');
          const rej = rpcSessionPersistFailedReject();
          return res.status(rej.status).json(rej.body);
        }
        smartBroadcast('app_settings', updated, {
          type: 'change', table: 'app_settings', event: 'UPDATE',
          newRow: updated, oldRow: current,
        });
        return res.json({ data: { session_active: active }, error: null });
      }

      case 'admin_update_settings': {
        // 관리자 패널 → api-server 인메모리 app_settings 동기화
        // Supabase 직접 업데이트만으로는 api-server 메모리가 갱신되지 않아 유저에게 반영 안 됨
        checkPassword();
        const rawPayload = (args.p_payload as Record<string, unknown>) ?? {};
        // ─ XSS 방어: 관리자가 app_settings에 악성 스크립트를 주입하는 것을 차단 (db-app-settings-merge)
        const sanitizedSettingsPayload = sanitizeAdminSettingsPayload(rawPayload);
        const current = (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
        const merged = mergeAppSettings(current, sanitizedSettingsPayload);
        const updated = await overlayDbSecrets(merged, explicitSecretKeys(sanitizedSettingsPayload));
        store['app_settings'] = [updated];
        try {
          await dbPersistRow('app_settings', updated);
        } catch (e) {
          store['app_settings'] = [current];
          logger.error({ err: e }, '[db] admin_update_settings persist failed');
          const rej = rpcSettingsPersistFailedReject();
          return res.status(rej.status).json(rej.body);
        }
        smartBroadcast('app_settings', updated, {
          type: 'change', table: 'app_settings', event: 'UPDATE',
          newRow: updated, oldRow: current,
        });
        const prevReset = (current.reset_signal as string | null | undefined) ?? null;
        const nextReset = (updated.reset_signal as string | null | undefined) ?? null;
        if (nextReset && nextReset !== prevReset) {
          const adminRow = await ensureAdminProfile();
          if (adminRow?.id != null) {
            await clearAdminNpcRelationships(String(adminRow.id));
          }
        }
        resetPanelLoginLimiter(req);
        return res.json({ data: publicAppSettingsView(updated, true), error: null });
      }

      case 'test_verify_password': {
        checkTestPassword();
        const provided = String(args.p_test_password ?? '').trim();
        const bootstrapTest = process.env.BOOTSTRAP_TEST_PASSWORD?.trim();
        const dbTest = String(settings.test_password ?? '').trim();
        if (shouldPersistBootstrapPanelPassword({
          provided,
          bootstrap: bootstrapTest,
          dbValue: dbTest,
          isDefault: isDefaultPanelPassword,
        })) {
          const current = (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
          const updated = mergeAppSettings(current, { test_password: bootstrapTest! });
          store['app_settings'] = [updated];
          dbPersistRow('app_settings', updated).catch(e => logger.error({ err: e }, '[db] persist bootstrap test password'));
        }
        return res.json({ data: deriveTestToken(provided), error: null });
      }

      case 'test_resync': {
        checkTestPassword();
        resyncAllFromNativeDb('forced').catch(e => logger.error({ err: e }, '[rpc] test_resync 실패'));
        return res.json({ data: null, error: null });
      }

      case 'test_clear_hearts': {
        checkTestPassword();
        const allLikes = getTable('likes');
        store['likes'] = [];
        _likesLastInsert.clear();
        dbDeleteTable('likes').catch(e => logger.error({ err: e }, '[rpc] test_clear_hearts DB 삭제 실패'));
        for (const like of allLikes) {
          smartBroadcast('likes', like, {
            type: 'change',
            table: 'likes',
            event: 'DELETE',
            newRow: null,
            oldRow: like,
          });
        }
        logger.info({ count: allLikes.length }, '[rpc] test_clear_hearts: 하트 전체 삭제');
        return res.json({ data: { cleared: allLikes.length }, error: null });
      }

      case 'admin_force_resync_all': {
        // 관리자 패널 → 전체 테이블 강제 리싱크 (Supabase 직접 쓰기 후 즉시 반영용)
        checkPassword();
        resyncAllFromNativeDb('forced').catch(e => logger.error({ err: e }, '[rpc] admin_force_resync_all 실패'));
        return res.json({ data: null, error: null });
      }

      case 'test_update_settings': {
        checkTestPassword();
        const testPayload = (args.p_payload as Record<string, unknown>) ?? {};
        // 허용 필드 제한 — 테스트 대시보드는 세션·테이블 설정만 변경 가능 (db-app-settings-merge)
        const filteredPayload = filterTestSettingsPayload(testPayload);
        const currentSettings = (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
        const mergedSettings = { ...currentSettings, ...filteredPayload, updated_at: new Date().toISOString() };
        const updatedSettings = await overlayDbSecrets(mergedSettings, new Set());
        store['app_settings'] = [updatedSettings];
        smartBroadcast('app_settings', updatedSettings, {
          type: 'change',
          table: 'app_settings',
          event: 'UPDATE',
          newRow: updatedSettings,
          oldRow: currentSettings,
        });
        dbPersistRow('app_settings', updatedSettings).catch(e => logger.error({ err: e }, '[db] background task error'));
        return res.json({ data: null, error: null });
      }

      case 'admin_full_reset': {
        checkPassword();
        return res.json({ data: null, error: null });
      }

      case 'admin_event_end_reset': {
        checkPassword();
        const settingsRow = (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
        const oldProfiles = store['profiles'] ?? [];
        // tables + broadcast mode: db-admin-wipe-plan
        const persistDeletes: Promise<void>[] = [];
        for (const t of ADMIN_EVENT_END_CLEAR_TABLES) {
          if (WIPE_PRESERVED_TABLES.has(t)) continue;
          const old = store[t] ?? [];
          store[t] = [];
          if (t === 'chat_reads') unreadCountsCache.clear(); // 전체 리셋 시 캐시 전부 무효화
          const bplan = planWipeTableBroadcast(t, old);
          if (bplan.mode === 'reset') {
            // 행 데이터 없이 테이블 초기화 알림만 전송
            broadcastAll({ type: 'change', table: t, event: 'RESET', newRow: null, oldRow: null });
          } else if (bplan.mode === 'profile_delete') {
            // 프로필 DELETE는 민감 필드 제거 후 전송
            for (const row of bplan.rows) broadcastAll({ type: 'change', table: t, event: 'DELETE', newRow: null, oldRow: sanitizeProfile(row) });
          } else {
            for (const row of bplan.rows) broadcastAll({ type: 'change', table: t, event: 'DELETE', newRow: null, oldRow: row });
          }
          persistDeletes.push(dbDeleteTable(t).catch(e => logger.error({ err: e }, '[db] background task error')));
        }
        _mergedGroupIds.clear();
        _mergedChatIds.clear();
        autoMatchInFlight.clear();
        // PG wipe가 끝난 뒤 빈 카탈로그 방을 다시 심는다 (시드가 삭제 레이스에 지워지지 않게)
        await Promise.all(persistDeletes);
        await ensureOptInGroupRooms();
        await restoreAdminProfileAfterWipeInStore(oldProfiles, settingsRow);
        await bumpResetSignalAndBroadcast();
        return res.json({ data: null, error: null });
      }

      case 'admin_clear_profiles': {
        checkPassword();
        const settingsRow = (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
        const oldProfiles = [...(store['profiles'] ?? [])];
        store['profiles'] = [];
        for (const row of oldProfiles) {
          broadcastAll({
            type: 'change',
            table: 'profiles',
            event: 'DELETE',
            newRow: null,
            oldRow: sanitizeProfile(row),
          });
        }
        await dbDeleteTable('profiles');
        await restoreAdminProfileAfterWipeInStore(oldProfiles, settingsRow);
        await bumpResetSignalAndBroadcast();
        return res.json({ data: null, error: null });
      }

      case 'test_wipe_all': {
        checkTestPassword();
        const persistDeletes: Promise<void>[] = [];
        for (const t of TEST_WIPE_ALL_TABLES) {
          if (WIPE_PRESERVED_TABLES.has(t)) continue;
          const old = store[t] ?? [];
          store[t] = [];
          if (t === 'likes') _likesLastInsert.clear();
          if (t === 'profiles') {
            for (const row of old) {
              broadcastAll({
                type: 'change',
                table: t,
                event: 'DELETE',
                newRow: null,
                oldRow: sanitizeProfile(row),
              });
            }
          } else {
            for (const row of old) {
              smartBroadcast(t, row, { type: 'change', table: t, event: 'DELETE', newRow: null, oldRow: row });
            }
          }
          persistDeletes.push(dbDeleteTable(t).catch(e => logger.error({ err: e, table: t }, '[rpc] test_wipe_all DB delete failed')));
        }
        await Promise.all(persistDeletes);
        await bumpResetSignalAndBroadcast();
        return res.json({ data: null, error: null });
      }

      case 'verify_panel_password': {
        // 유저 화면 리셋/관리자 진입 — 클라이언트에 비번을 심지 않고 서버에서만 검증
        if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
          const ip = String(req.ip ?? req.socket.remoteAddress ?? 'unknown');
          const panelRate = consumeRateLimit(_loginRateMap, `panel:${ip}`, {
            windowMs: LOGIN_RATE_WINDOW_MS,
            max: LOGIN_RATE_MAX,
            maxMapSize: RATE_MAP_MAX_SIZE,
          });
          if (panelRate === 'map_full') {
            const rej = panelMapFullReject();
            return res.status(rej.status).json(rej.body);
          }
          if (panelRate === 'limited') {
            const rej = panelRateLimitedReject();
            return res.status(rej.status).json(rej.body);
          }
        }
        const planned = planVerifyPanelPasswordArgs(args.p_kind, args.p_password);
        if (!planned.ok) return res.status(planned.reject.status).json(planned.reject.body);
        const { kind, provided } = planned;
        let ok = false;
        if (kind === 'reset') {
          const secrets = panelSecretsForRuntime(settings.reset_password as string | undefined);
          ok = secretMatches(provided, secrets);
        } else if (kind === 'admin') {
          ok = secretMatches(provided, panelAdminSecrets(settings.admin_password as string | undefined));
        } else {
          ok = secretMatches(provided, panelTestSecrets(settings.test_password as string | undefined));
        }
        if (!ok) {
          const rej = panelPasswordUnauthorizedReject();
          return res.status(rej.status).json(rej.body);
        }
        resetPanelLoginLimiter(req);
        return res.json({ data: { ok: true }, error: null });
      }

      case 'admin_update_profile': {
        checkPassword(); // 관리자 비밀번호 없이 타인 프로필 수정 방지
        const profileId = args.p_profile_id as string;
        const profiles = getTable('profiles');
        const idx = profiles.findIndex(p => p.id === profileId);
        if (idx >= 0) {
          const oldRow = { ...profiles[idx] };
          const patch = buildAdminProfilePatchFromArgs(args);
          if ('birth_year' in patch && profileBirthYearRejected(res, patch.birth_year)) return;
          // XSS 방어: 관리자가 악성 스크립트 태그가 포함된 값을 주입하는 것을 차단
          const sanitizedPatch = sanitizeRow('profiles', patch);
          const newRow = withFixedAdminNickname({ ...oldRow, ...sanitizedPatch });
          profiles[idx] = newRow;
          // 민감 연락처 필드 제거 후 전체 브로드캐스트
          broadcastAll({ type: 'change', table: 'profiles', event: 'UPDATE', newRow: sanitizeProfile(newRow), oldRow: sanitizeProfile(oldRow) });
          dbPersistRow('profiles', newRow).catch(e => logger.error({ err: e }, '[db] background task error'));
        }
        return res.json({ data: null, error: null });
      }

      case 'admin_delete_profile': {
        checkPassword();
        const profileId = args.p_profile_id as string;
        const profiles = getTable('profiles');
        const oldProfile = profiles.find(p => p.id === profileId);
        store['profiles'] = profiles.filter(p => p.id !== profileId);
        if (oldProfile) {
          // 민감 연락처 필드 제거 후 전체 브로드캐스트
          broadcastAll({ type: 'change', table: 'profiles', event: 'DELETE', newRow: null, oldRow: sanitizeProfile(oldProfile) });
          dbDeleteRow('profiles', profileId).catch(e => logger.error({ err: e }, '[db] background task error'));
        }
        return res.json({ data: null, error: null });
      }

      default:
        // ALLOWED_RPCS 허용 목록에서 이미 차단됨 — 이 경로는 도달하지 않아야 함
        return res.status(404).json({ data: null, error: { message: `Unknown RPC: ${name}` } });
    }
  } catch (e) {
    if (e instanceof RpcAuthError) {
      return res.status(403).json({ data: null, error: { message: e.message } });
    }
    logger.error({ err: e, rpc: name }, '[rpc] Unexpected error');
    if (!res.headersSent) res.status(500).json({ data: null, error: { message: String(e) } });
    return;
  }
});

// ─── Broadcast endpoint (for channel.send()) ──────────────────────────────────
// 반드시 SESSION_SECRET 또는 admin RPC 비밀번호를 헤더로 전달해야 사용 가능
// IP별 레이트 리밋 (5초 윈도우, 최대 30회) — 스팸/악의적 남용 추가 방어
setInterval(() => {
  pruneRateMap(_broadcastRateMap);
}, 5 * 60 * 1000).unref();
router.post('/broadcast', (req: Request, res: Response) => {
  try {
  // ✅ 인증: 클라이언트 SSE 토큰(HMAC)으로 검증 — SESSION_SECRET 클라이언트 노출 없이 안전
  const token  = req.headers['x-broadcast-token']  as string | undefined;
  const userId = req.headers['x-broadcast-userid'] as string | undefined;
  if (!token || !userId || !verifySseToken(userId, token)) {
    const rej = broadcastForbiddenReject();
    res.status(rej.status).json(rej.body);
    return;
  }
  // x-forwarded-for는 Express가 배열로 파싱할 수 있음 — typeof 검사 후 안전하게 첫 IP 추출
  const ip = clientIpFromXForwardedFor(req.headers['x-forwarded-for'], req.socket?.remoteAddress);
  const broadcastRate = consumeRateLimit(_broadcastRateMap, ip, { windowMs: 5_000, max: 30 });
  if (broadcastRate !== 'ok') {
    const rej = broadcastRateLimitedReject();
    res.status(rej.status).json(rej.body);
    return;
  }
  // ─ body/channel/event validate (db-broadcast-validate)
  const parsed = validateBroadcastBody(req.body);
  if (!parsed.ok) {
    res.status(parsed.reject.status).json(parsed.reject.body);
    return;
  }
  const { channel, event, payload } = parsed;
  // ─ XSS 방어: broadcast payload 내 문자열 값 HTML 태그 제거 (db-op-result-shape)
  const sanitizedPayload = sanitizeBroadcastValue(payload);
  broadcastAll({ type: 'broadcast', channel, event, payload: sanitizedPayload });
  res.json({ ok: true });
  } catch (e) {
    logger.error({ err: e }, '[broadcast] Unexpected error');
    if (!res.headersSent) {
      const rej = broadcastInternalReject();
      res.status(rej.status).json(rej.body);
    }
  }
});

// ─── Image storage ────────────────────────────────────────────────────────────
// 허용 MIME 타입 (이미지만)
// ALLOWED_IMAGE_MIMES / MAX_IMAGE_DATAURL_BYTES: ../lib/db-image-magic.ts
const imageAccess = createImageAccessPolicy(getTable);

router.post('/storage-upload', async (req: Request, res: Response) => {
  try {
  const bodyRec = (req.body != null && typeof req.body === 'object' && !Array.isArray(req.body))
    ? req.body as Record<string, unknown>
    : null;
  const userId = bodyRec ? resolveAuthUserId(req, bodyRec) : null;
  // ─ Stage 1: body/auth/path (db-storage-path) — rate only after this passes
  const authPath = planStorageUploadAuthPath({
    body: req.body,
    userId,
    canUpload: (p, uid) => imageAccess.canUpload(p, uid),
  });
  if (!authPath.ok) {
    if (authPath.reject.rejectReason) recordUploadRejected(authPath.reject.rejectReason);
    return res.status(authPath.reject.status).json(authPath.reject.body);
  }
  // ─ Per-user + NAT IP burst: 이미지 스팸 방지 (공인 IP 한 줄로 전원 429 금지)
  const uploadIp = String(req.ip ?? req.socket.remoteAddress ?? 'unknown');
  const uploadKeys = venueUploadRateKeys(userId!, uploadIp);
  const uploadUserRate = consumeRateLimit(_uploadRateMap, uploadKeys.userKey, {
    windowMs: UPLOAD_RATE_WINDOW_MS,
    max: UPLOAD_RATE_MAX,
    maxMapSize: RATE_MAP_MAX_SIZE,
  });
  const uploadIpBurst = consumeRateLimit(_uploadRateMap, uploadKeys.ipBurstKey, {
    windowMs: UPLOAD_RATE_WINDOW_MS,
    max: UPLOAD_RATE_MAX_PER_IP,
    maxMapSize: RATE_MAP_MAX_SIZE,
  });
  // ─ Stage 2: rate + dataUrl MIME/magic/size
  const planned = planStorageUploadContent({
    path: authPath.path,
    dataUrl: bodyRec?.dataUrl,
    uploadUserRate,
    uploadIpBurst,
    dataUrlMimeAndMagic,
    maxDataUrlBytes: MAX_IMAGE_DATAURL_BYTES,
  });
  if (!planned.ok) {
    if (planned.reject.rejectReason) recordUploadRejected(planned.reject.rejectReason);
    if (planned.reject.status === 429) res.setHeader('Retry-After', '5');
    return res.status(planned.reject.status).json(planned.reject.body);
  }
  // 프로필 row가 이 경로를 저장하기 전에 이미지 자체가 durable해야 한다.
  // DB 저장 실패를 성공으로 응답하면 서버 재시작 후 깨진 프로필 사진이 남는다.
  await dbPersistImage(planned.path, planned.dataUrl);
  imageStoreSet(planned.path, planned.dataUrl);
  recordUploadAccepted();
  return res.json({ data: { path: planned.path }, error: null });
  } catch (e) {
    logger.error({ err: e }, '[storage-upload] Unexpected error');
    const rej = storageUploadInternalReject();
    return res.status(rej.status).json(rej.body);
  }
});

// 메시지 저장 실패·채팅방 전환 시 방금 업로드한 고아 이미지를 정리합니다.
router.post('/storage-remove', async (req: Request, res: Response) => {
  try {
    const body = (req.body != null && typeof req.body === 'object' && !Array.isArray(req.body))
      ? req.body as Record<string, unknown>
      : {};
    const userId = resolveAuthUserId(req, body);
    const planned = planStorageRemove({
      userId,
      paths: body.paths,
      canRemove: (p, uid) => imageAccess.canRemove(p, uid),
    });
    if (!planned.ok) return res.status(planned.reject.status).json(planned.reject.body);

    for (const p of planned.paths) _imageStore.delete(p);
    await pool.query(buildImageDeleteByPathsSql(), [planned.paths]);
    return res.json({ data: null, error: null });
  } catch (e) {
    logger.error({ err: e }, '[storage-remove] Unexpected error');
    const rej = storageRemoveInternalReject();
    return res.status(rej.status).json(rej.body);
  }
});

router.get('/storage-image', async (req: Request, res: Response): Promise<void> => {
  try {
  // ─ req.query.p 타입 방어: Express는 ?p=a&p=b 시 배열을 반환 → 명시적 string 검증
  const rawP = req.query.p;
  if (!rawP || typeof rawP !== 'string') {
    res.status(400).json({ error: 'Invalid path parameter' }); return;
  }
  const path = rawP;
  // Cookie session or query sessionToken (Netlify cookie gap for <img> tags)
  let userId = (req.session as { userId?: string })?.userId ?? null;
  const qUserId = typeof req.query.userId === 'string' ? req.query.userId : null;
  const qSessionToken = typeof req.query.sessionToken === 'string' ? req.query.sessionToken : null;
  if (!userId && qUserId && qSessionToken && verifySessionToken(qUserId, qSessionToken)) {
    userId = qUserId;
  }
  const adminToken = typeof req.query.adminToken === 'string' ? req.query.adminToken : null;
  const imageAuth = planStorageImageAuth({
    path,
    userId,
    adminOk: verifyAdminToken(adminToken),
    canRead: (p, uid) => imageAccess.canRead(p, uid),
  });
  if (!imageAuth.ok) {
    res.status(imageAuth.reject.status).json(imageAuth.reject.body);
    return;
  }
  let dataUrl: string | undefined = imageStoreGet(path);
  if (!dataUrl) {
    try {
      const { rows } = await pool.query(buildImageSelectByPathSql(), [path]);
      dataUrl = rows[0]?.data_url as string | undefined;
      if (dataUrl) imageStoreSet(path, dataUrl);
    } catch (e) {
      logger.warn({ err: e, path }, '[storage-image] lazy load failed');
    }
  }
  if (!dataUrl) { res.status(404).json({ error: 'Not found' }); return; }
  const parsedImg = parseDataUrlForResponse(dataUrl);
  if (parsedImg) {
    res.setHeader('Content-Type', parsedImg.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');   // prevent MIME sniffing
    res.setHeader('Content-Disposition', 'inline');        // don't treat as download
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(Buffer.from(parsedImg.base64, 'base64'));
    return;
  }
  res.send(dataUrl);
  } catch (e) {
    logger.error({ err: e }, '[storage-image] Unexpected error');
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Admin: clear DB error counter ───────────────────────────────────────────
router.post('/admin/clear-db-errors', async (req: Request, res: Response) => {
  try {
  if (req.body == null || typeof req.body !== 'object' || Array.isArray(req.body)) {
    const rej = clearDbErrorsInvalidBodyReject();
    return res.status(rej.status).json(rej.body);
  }
  const adminTokenHeader = typeof req.headers['x-admin-token'] === 'string'
    ? req.headers['x-admin-token']
    : null;
  const { adminPassword } = req.body as { adminPassword?: string };
  const tokenOk = verifyAdminToken(adminTokenHeader);
  const settings = (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
  const expectedPw = (settings.admin_password as string) ?? '';
  const authPlan = planClearDbErrorsAuth({
    tokenOk,
    adminPassword,
    expectedPassword: expectedPw,
  });
  if (!authPlan.ok) {
    return res.status(authPlan.reject.status).json(authPlan.reject.body);
  }

  _dbPersistErrors = 0;
  _dbPersistErrorLog.length = 0;

  // Remove the persisted counter from DB
  try {
    await pool.query(
      buildErrorLogCounterDeleteSql(),
    );
  } catch (e) {
    logger.error({ err: e }, '[db] Failed to clear error state from DB');
    return res.status(500).json({ ok: false, error: String(e) });
  }

  logger.info({}, '[db] DB persist error counter cleared by admin');
  // #38: 관리자 에러 초기화 감사 로그 — DB에 영구 기록
  try {
    await pool.query(
      buildAuditLogUpsertSql(),
      [
        `clear_db_errors_${Date.now()}`,
        JSON.stringify({ action: 'clear_db_errors', clearedAt: new Date().toISOString() }),
      ],
    );
  } catch (auditErr) {
    logger.warn({ err: auditErr }, '[db] 감사 로그 저장 실패 (non-critical)');
  }
  return res.json({ ok: true });
  } catch (e) {
    logger.error({ err: e }, '[admin/clear-db-errors] Unexpected error');
    if (!res.headersSent) {
      const rej = clearDbErrorsInternalReject();
      res.status(rej.status).json(rej.body);
    }
    return;
  }
});

// ─── DB Health endpoint ───────────────────────────────────────────────────────
// 10초 캐시: O(messages+likes+profiles) 전체 스캔 + 2 DB 쿼리를 연속 요청마다 반복하지 않도록
let _healthCache: { ts: number; body: unknown } | null = null;
const HEALTH_CACHE_TTL_MS = 10_000;

/** 공개 readiness — 로그인·채팅 핵심 기능 사전 점검 (인증 불필요) */
router.get('/ready', (_req: Request, res: Response) => {
  try {
    const settings = (getTable('app_settings')[0] ?? {}) as Record<string, unknown>;
    const adminSecrets = panelAdminSecrets(settings.admin_password as string | undefined);
    const testSecrets = panelTestSecrets(settings.test_password as string | undefined);
    // reset_password 는 공개 readiness에 노출하지 않음 (관리자 패널/RPC만)
    // leftover 잔량만 (키 값·비밀번호·PII 없음). 0 이면 PG에서 제거 완료. — legacy_leftovers
    res.json(buildReadyPayload({
      settings,
      adminConfigured: adminSecrets.length > 0,
      testConfigured: testSecrets.length > 0,
      resetConfigured: panelSecretsForRuntime(settings.reset_password as string | undefined).length > 0,
      legacyLeftovers: _legacyLeftovers,
      checkedAt: new Date().toISOString(),
    }));
  } catch (e) {
    logger.error({ err: e }, '[ready] Unexpected error');
    res.status(500).json({ ready: false, error: 'Ready check failed' });
  }
});

router.get('/health', async (req: Request, res: Response) => {
  try {
  const adminToken = typeof req.headers['x-admin-token'] === 'string'
    ? req.headers['x-admin-token']
    : null;
  if (!verifyAdminToken(adminToken)) {
    const rej = healthUnauthorizedReject();
    return res.status(rej.status).json(rej.body);
  }
  if (_healthCache && Date.now() - _healthCache.ts < HEALTH_CACHE_TTL_MS) {
    return res.json(_healthCache.body);
  }

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  // In-memory counts for last 5 minutes (db-kv-hydrate)
  const inMemMessages = countRowsCreatedSince(getTable('messages'), fiveMinAgo);
  const inMemLikes = countRowsCreatedSince(getTable('likes'), fiveMinAgo);

  // DB counts for last 5 minutes (best-effort)
  let dbMessages = -1;
  let dbLikes = -1;
  let dbQueryError: string | null = null;
  try {
    const [mRes, lRes] = await Promise.all([
      pool.query(buildHealthRecentCountSql('messages'), [fiveMinAgo]),
      pool.query(buildHealthRecentCountSql('likes'), [fiveMinAgo]),
    ]);
    dbMessages = parseInt(mRes.rows[0].count as string, 10);
    dbLikes = parseInt(lRes.rows[0].count as string, 10);
  } catch (e) {
    dbQueryError = e instanceof Error ? e.message : String(e);
    logger.warn({ err: e }, '[health] DB count query failed');
  }

  const sseTotal = countSseHealthConnections([...sseUserMap.values()].map(c => c.size), sseAnonClients.size);

  // Alarm thresholds / PIN pool / lag strings: ../lib/db-health-plan.ts
  const recentPersistErrors = _dbPersistErrorLog.filter(e => Date.now() - e.time < 5 * 60 * 1000).length;
  const messageLag = dbMessages >= 0 ? inMemMessages - dbMessages : null;
  const likeLag = dbLikes >= 0 ? inMemLikes - dbLikes : null;
  const pinPool = planPinPoolStats(getTable('profiles'));
  const alarms = buildHealthAlarms({
    recentPersistErrors,
    dbQueryError,
    inMemMessages,
    dbMessages,
    inMemLikes,
    dbLikes,
    messageLag,
    likeLag,
    lossAlarmThreshold: HEALTH_LOSS_ALARM_THRESHOLD,
    pinRemaining: pinPool.remaining,
    pinAlarmThreshold: pinPool.alarmThreshold,
    pinPoolTotal: pinPool.total,
  });

  // admin-token 전용 body — recentErrors 최근 10건 (운영 디버그용); db-health-plan
  const body = buildHealthBody({
    persistErrors: _dbPersistErrors,
    recentErrors: _dbPersistErrorLog.slice(-10),
    inMemMessages,
    inMemLikes,
    dbMessages,
    dbLikes,
    messageLag,
    likeLag,
    pinRemaining: pinPool.remaining,
    pinTotal: pinPool.total,
    alarms,
    sseConnections: sseTotal,
    likesMinIntervalMs: LIKES_MIN_INTERVAL_MS,
    integrity: _integrityDiagnostics,
    httpMetrics: snapshotHttpMetrics(),
    checkedAt: new Date().toISOString(),
    lossAlarmThreshold: HEALTH_LOSS_ALARM_THRESHOLD,
  });
  _healthCache = { ts: Date.now(), body };
  return res.json(body);
  } catch (e) {
    logger.error({ err: e }, '[health] Unexpected error');
    const rej = healthInternalReject();
    return res.status(rej.status).json(rej.body);
  }
});

// ─── Unread counts endpoint ───────────────────────────────────────────────────
// Returns per-chat unread message counts for a user, computed from DB truth.
// Used by client on visibilitychange and SSE reconnect to fix missed increments.
// 단기 캐시(2s): 탭 전환·재연결 폭발 시 동일 userId에 대한 중복 O(chats×msgs) 스캔 방지
const unreadCountsCache = new Map<string, { ts: number; data: Record<string, number> }>();
const UNREAD_CACHE_TTL_MS = 2_000;
// Fix #3: unreadCountsCache TTL 초과 항목 30초마다 정리 — userId 항목 무한 축적 방지
setInterval(() => {
  pruneUnreadCountsCache(unreadCountsCache, Date.now() - UNREAD_CACHE_TTL_MS);
}, 30_000).unref();

router.get('/unread-counts', (req: Request, res: Response) => {
  const userId = typeof req.query.userId === 'string' && req.query.userId ? req.query.userId : null;
  if (!userId) {
    const rej = unreadCountsUserIdRequiredReject();
    return res.status(rej.status).json(rej.body);
  }

  // ─ IDOR guard: 자신의 미읽음 카운트만 조회 가능 — SSE 토큰으로 소유자 확인 ──
  // 타인의 userId를 추측해 다른 사람의 채팅 존재 여부를 파악하는 공격을 차단
  // req.query.token은 동일 파라미터 반복 시 string[] — typeof 검사로 안전 추출
  const tokenQuery = req.query.token;
  const sseToken = (typeof tokenQuery === 'string' ? tokenQuery : null)
    ?? (typeof req.headers['x-sse-token'] === 'string' ? req.headers['x-sse-token'] : null);
  if (!sseToken || !verifySseToken(userId, sseToken)) {
    logger.warn({ userId, ip: req.ip }, '[SECURITY] IDOR: /unread-counts without valid SSE token blocked');
    const rej = unreadCountsUnauthorizedReject();
    return res.status(rej.status).json(rej.body);
  }

  try {
    // 캐시 히트 — db-unread-counts
    const cached = readUnreadCountsCache(unreadCountsCache, userId, Date.now(), UNREAD_CACHE_TTL_MS);
    if (cached) {
      return res.json({ data: cached, error: null });
    }

    // Unread computation: ../lib/db-unread-counts.ts
    const counts = computeUnreadCountsForUser(
      userId,
      getTable('chats'),
      getTable('messages'),
      getTable('chat_reads'),
      resolveMergedChatId,
      countMessagesForChat,
    );

    writeUnreadCountsCache(unreadCountsCache, userId, counts, Date.now(), 200);
    return res.json({ data: counts, error: null });
  } catch (e) {
    logger.error({ err: e }, '[unread-counts] Unexpected error');
    const rej = unreadCountsInternalReject();
    return res.status(rej.status).json(rej.body);
  }
});

// ─── PIN lookup ───────────────────────────────────────────────────────────────
// 행사장 NAT: IP 공용 한도는 넉넉히, 동일 PIN 무차별 대입은 별도 버킷으로 차단
const _pinAttempts = new Map<string, { count: number; resetAt: number }>();
const PIN_MAX_PER_IP = Number(process.env.PIN_MAX_PER_IP ?? 200);
const PIN_MAX_PER_PIN = Number(process.env.PIN_MAX_PER_PIN ?? 8);
const PIN_WINDOW_MS = PIN_WINDOW_MS_DEFAULT;

/** Thin wrapper — pure bucket lives in db-rate-limit. */
function consumePinBucket(key: string, max: number): boolean {
  return consumePinBucketPure(_pinAttempts, key, max, PIN_WINDOW_MS);
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of _pinAttempts) {
    if (rec.resetAt <= now) _pinAttempts.delete(ip);
  }
}, 5 * 60 * 1000).unref();

router.post('/by-pin', (req: Request, res: Response) => {
  try {
  const ip = String(req.ip ?? 'unknown');

  // ─ 페이로드 타입 방어
  if (req.body == null || typeof req.body !== 'object' || Array.isArray(req.body)) {
    const rej = pinLookupInvalidBodyReject();
    return res.status(rej.status).json(rej.body);
  }
  const body = req.body as Record<string, unknown>;
  const parsed = validateByPinBody(body.pin, body.nickname);
  if (!parsed.ok) {
    return res.status(parsed.reject.status).json(parsed.reject.body);
  }
  const { pin, nickname } = parsed;
  if (!consumePinBucket(`ip:${ip}`, PIN_MAX_PER_IP) || !consumePinBucket(`pin:${pin}`, PIN_MAX_PER_PIN)) {
    const rej = pinRateLimitedReject();
    return res.status(rej.status).json(rej.body);
  }

  const profiles = getTable('profiles');
  const found = profiles.find(p => String(p['pin_code']) === String(pin));
  if (!found) {
    const rej = pinLookupNotFoundReject();
    return res.status(rej.status).json(rej.body);
  }

  // 1단계: pin만 입력 → 마스킹된 닉네임 반환 (본인 확인용) — db-pin-lookup
  if (!nickname) {
    const masked = maskNicknameForPinConfirm(String(found['nickname'] ?? ''));
    return res.json({ data: { step: 'confirm', maskedNickname: masked }, error: null });
  }

  // 2단계: pin + nickname → 정확히 일치해야 통과
  if (String(found['nickname']) !== nickname) {
    const rej = pinNicknameMismatchReject();
    return res.status(rej.status).json(rej.body);
  }

  // 성공 — rate limit 리셋 (버킷 키는 consumePinBucket 과 동일)
  _pinAttempts.delete(`ip:${ip}`);
  _pinAttempts.delete(`pin:${pin}`);
  return res.json({ data: { id: found['id'] }, error: null });
  } catch (e) {
    logger.error({ err: e }, '[by-pin] Unexpected error');
    const rej = pinLookupInternalReject();
    return res.status(rej.status).json(rej.body);
  }
});

// ─── Push subscription endpoints ─────────────────────────────────────────────
router.get('/push/vapid-key', (_req: Request, res: Response) => {
  res.json({ key: VAPID_PUBLIC_KEY });
});

router.post('/push/subscribe', (req: Request, res: Response) => {
  try {
  const parsedSub = validatePushSubscribeBody(req.body);
  if (!parsedSub.ok) {
    return res.status(parsedSub.reject.status).json(parsedSub.reject.body);
  }
  const { userId, endpoint, auth, p256dh } = parsedSub;
  const subscription = { endpoint, keys: { auth, p256dh } };

  // SSE 토큰 검증 — 실제 userId 소유자만 구독 등록 가능
  const sseToken = req.headers['x-sse-token'] as string | undefined;
  if (!sseToken || !verifySseToken(userId, sseToken)) {
    logger.warn({ userId, ip: req.ip }, '[push/subscribe] Invalid or missing SSE token — 침입 탐지');
    const rej = pushSubscribeUnauthorizedReject();
    return res.status(rej.status).json(rej.body);
  }
  const subs = getTable('push_subscriptions');
  const storePlan = planPushSubscribeStore({
    subs,
    userId,
    endpoint: subscription.endpoint,
    auth: subscription.keys!.auth,
    p256dh: subscription.keys!.p256dh,
    now: ts(),
    newId: genId(),
  });
  if (storePlan.kind === 'update') {
    subs[storePlan.index] = storePlan.row;
    dbPersistRow('push_subscriptions', storePlan.row).catch(e => logger.error({ err: e }, '[db] background task error'));
  } else {
    // 사용자당 최대 5개 구독 — 초과 시 가장 오래된 것 제거 (슬라이딩 윈도우; db-push-plan)
    if (storePlan.evictIndex != null) subs.splice(storePlan.evictIndex, 1);
    subs.push(storePlan.row);
    dbPersistRow('push_subscriptions', storePlan.row).catch(e => logger.error({ err: e }, '[db] background task error'));
  }
  return res.json({ ok: true });
  } catch (e) {
    logger.error({ err: e }, '[push/subscribe] Unexpected error');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Push notify endpoint (서버 내부 또는 인증된 호출만 허용) ────────────────
const PUSH_NOTIFY_SECRET = process.env.SESSION_SECRET ?? 'internal';
router.post('/push/notify', async (req: Request, res: Response): Promise<void> => {
  try {
  // 클라이언트 직접 호출 남용 방지 — X-Internal-Secret 헤더 필요
  const secret = req.headers['x-internal-secret'];
  const parsedNotify = validatePushNotifyRequest({
    secretOk: secret === PUSH_NOTIFY_SECRET,
    body: req.body,
  });
  if (!parsedNotify.ok) {
    res.status(parsedNotify.reject.status).json(parsedNotify.reject.body);
    return;
  }
  const { recipientId, payload } = parsedNotify;

  const subs = getTable('push_subscriptions').filter(s => s.user_id === recipientId);
  if (!subs.length) { res.json({ ok: true, sent: 0 }); return; }

  // 병렬 전송 — 직렬 await 제거
  const pushResults = await Promise.all(
    subs.map(sub => sendPush(
      { endpoint: sub.endpoint as string, keys: { auth: sub.auth as string, p256dh: sub.p256dh as string } },
      payload,
    ).then(ok => ({ id: sub.id as string, ok })).catch(() => ({ id: sub.id as string, ok: false }))),
  );
  const expired = pushResults.filter(r => !r.ok).map(r => r.id);
  if (expired.length) {
    store['push_subscriptions'] = (store['push_subscriptions'] ?? []).filter(s => !expired.includes(s.id as string));
    dbDeleteRows('push_subscriptions', expired).catch(e => logger.error({ err: e }, '[db] background task error'));
  }
  res.json({ ok: true, sent: subs.length - expired.length });
  } catch (e) {
    logger.error({ err: e }, '[push/notify] Unexpected error');
    if (!res.headersSent) {
      const rej = pushNotifyInternalReject();
      res.status(rej.status).json(rej.body);
    }
  }
});

// ─── SSE/session token helpers: ../lib/db-session-tokens.ts (re-import) ─────────
// SESSION_SECRET는 app.ts에서 필수 검증하므로 여기서는 항상 유효한 값
const SSE_TOKEN_SECRET = process.env.SESSION_SECRET!;

/** Thin wrappers — HMAC issue/verify/classify live in db-session-tokens. */
function issueSessionToken(userId: string): { token: string; expiresAt: number } {
  return issueSessionTokenPure(userId, SSE_TOKEN_SECRET);
}

function verifySessionToken(userId: string, token: string): boolean {
  return verifySessionTokenPure(userId, token, SSE_TOKEN_SECRET);
}

/** Thin wrapper — cookie vs bearer resolve lives in db-session-tokens. */
function resolveAuthUserId(req: Request, body: Record<string, unknown>): string | null {
  const cookieId = (req.session as { userId?: string })?.userId ?? null;
  const token = typeof body.sessionToken === 'string' ? body.sessionToken : null;
  const claimed = typeof body.requesterId === 'string' ? body.requesterId : null;
  // Verified bearer wins over connect.sid — mobile Safari keeps stale cookies through
  // Netlify while sessionStorage holds the current user's sessionToken (PIN recovery·재등록).
  return resolveAuthUserIdFromParts({
    cookieUserId: cookieId,
    bodySessionToken: token,
    bodyRequesterId: claimed,
    sessionTokenValid: Boolean(token && claimed && verifySessionToken(claimed, token)),
  });
}

function finishLogin(res: Response, req: Request, userId: string) {
  req.session.userId = userId;
  return res.json(buildLoginSuccessBody(userId, issueSessionToken));
}

function issueSseToken(userId: string): { token: string; expiresAt: number } {
  return issueSseTokenPure(userId, SSE_TOKEN_SECRET);
}

function classifySseToken(userId: string, token: string): SseTokenState {
  return classifySseTokenPure(userId, token, SSE_TOKEN_SECRET);
}

function verifySseToken(userId: string, token: string): boolean {
  return verifySseTokenPure(userId, token, SSE_TOKEN_SECRET);
}

/**
 * POST /auth/login
 *
 * 클라이언트가 { userId, deviceSecret }을 제출합니다.
 * deviceSecret은 클라이언트 localStorage에만 저장된 무작위 UUID입니다.
 * 서버는 HMAC-SHA256(deviceSecret, SESSION_SECRET) 해시를 `device_secrets` 테이블에 저장합니다.
 *
 * - 첫 클레임(device_secrets에 해당 userId 없음): 해시를 저장하고 세션 수립
 * - 재인증(해시 있음): 제출한 secret이 저장된 해시와 일치하면 세션 수립, 불일치하면 401
 *
 * 결과적으로 userId를 알더라도 device secret 없이는 세션을 얻을 수 없습니다.
 */
router.post('/auth/login', (req: Request, res: Response) => {
  try {
  // ─ Per-IP rate limit: brute-force 방지 (단위 테스트는 제외)
  if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  const loginIp = String(req.ip ?? req.socket.remoteAddress ?? 'unknown');
  const claimedUser = (req.body != null && typeof req.body === 'object' && !Array.isArray(req.body)
    && typeof (req.body as { userId?: unknown }).userId === 'string')
    ? (req.body as { userId: string }).userId
    : '';
  const keys = venueLoginRateKeys(claimedUser || undefined, loginIp);
  const userRate = consumeRateLimit(_loginRateMap, keys.userKey, {
    windowMs: LOGIN_RATE_WINDOW_MS,
    max: LOGIN_RATE_MAX,
    maxMapSize: RATE_MAP_MAX_SIZE,
  });
  const ipBurst = consumeRateLimit(_loginRateMap, keys.ipBurstKey, {
    windowMs: LOGIN_RATE_WINDOW_MS,
    max: LOGIN_RATE_MAX_PER_IP,
    maxMapSize: RATE_MAP_MAX_SIZE,
  });
  if (userRate === 'map_full' || ipBurst === 'map_full') {
    res.setHeader('Retry-After', '5');
    const rej = authLoginMapFullReject();
    return res.status(rej.status).json(rej.body);
  }
  if (userRate === 'limited' || ipBurst === 'limited') {
    res.setHeader('Retry-After', '5');
    const rej = authLoginRateLimitedReject();
    return res.status(rej.status).json(rej.body);
  }
  }

  const parsed = validateAuthLoginBody(req.body);
  if (!parsed.ok) {
    return res.status(parsed.reject.status).json(parsed.reject.body);
  }
  const { userId, deviceSecret, pinCode, testToken } = parsed;
  // 프로필 존재 여부 확인
  const profiles = getTable('profiles');
  const profile = profiles.find(p => p.id === userId);
  if (!profile) {
    const rej = authLoginUnknownUserReject();
    return res.status(rej.status).json(rej.body);
  }
  // 제출된 deviceSecret의 HMAC 계산
  const submittedHash = hashDeviceSecret(deviceSecret, SSE_TOKEN_SECRET);
  const deviceSecrets = getTable('device_secrets');
  const existing = deviceSecrets.find(r => r.user_id === userId);
  const matched = Boolean(
    existing && deviceSecretHashesEqual(submittedHash, String(existing.secret_hash ?? '')),
  );
  const decision = planAuthLoginDecision({
    hasExistingSecret: Boolean(existing),
    secretMatched: matched,
    profilePin: String(profile.pin_code ?? '').trim(),
    providedPin: String(pinCode ?? '').trim(),
    testOk: verifyTestToken(testToken),
  });
  if (decision.action === 'first-claim') {
    // 첫 번째 기기 클레임 — id=userId로 안정적 row_id 사용 (ON CONFLICT UPDATE 보장)
    // (기존 사용자 마이그레이션: 프로필은 존재하지만 device_secret이 없는 경우)
    const newDs = { id: userId, user_id: userId, secret_hash: submittedHash };
    deviceSecrets.push(newDs);
    dbPersistRow('device_secrets', newDs).catch(e => logger.error({ err: e }, '[db] background task error'));
    logger.info({ userId }, '[auth] first-claim device registered');
    return finishLogin(res, req, userId);
  }
  if (decision.action === 'rebind') {
    const rebound = { id: userId, user_id: userId, secret_hash: submittedHash };
    const idx = deviceSecrets.findIndex(r => r.user_id === userId);
    if (idx >= 0) deviceSecrets[idx] = rebound; else deviceSecrets.push(rebound);
    dbPersistRow('device_secrets', rebound).catch(e => logger.error({ err: e }, '[db] device re-bind persist failed'));
    logger.info({ userId, via: decision.via }, '[auth] device re-bound');
    return finishLogin(res, req, userId);
  }
  if (decision.action === 'deny') {
    logger.warn({ userId, ip: req.ip }, '[auth] device secret mismatch — access denied (re-bind blocked)');
    const rej = authLoginDeviceMismatchReject();
    return res.status(rej.status).json(rej.body);
  }
  return finishLogin(res, req, userId);
  } catch (e) {
    logger.error({ err: e }, '[auth/login] Unexpected error');
    const rej = authLoginInternalReject();
    return res.status(rej.status).json(rej.body);
  }
});

// POST /auth/sse-token — 세션으로 인증된 userId에만 단기 SSE 토큰 발급
// 세션이 없거나 userId가 일치하지 않으면 401 반환
router.post('/auth/sse-token', (req: Request, res: Response) => {
  try {
    const body = (req.body != null && typeof req.body === 'object' && !Array.isArray(req.body))
      ? req.body as { userId?: string; sessionToken?: string }
      : {};
    const planned = planAuthSseTokenUser({
      sessionUserId: req.session?.userId ?? null,
      bodyUserId: body.userId,
      bodySessionToken: body.sessionToken,
      sessionTokenValid: Boolean(
        body.userId && body.sessionToken && verifySessionToken(body.userId, body.sessionToken),
      ),
    });
    if (!planned.ok) {
      const rej = authSseTokenUnauthReject();
      return res.status(rej.status).json(rej.body);
    }
    const { token, expiresAt } = issueSseToken(planned.userId);
    return res.json({ token, expiresAt });
  } catch (e) {
    logger.error({ err: e }, '[auth/sse-token] Unexpected error');
    const rej = authSseTokenInternalReject();
    return res.status(rej.status).json(rej.body);
  }
});

// ─── SSE endpoint ─────────────────────────────────────────────────────────────
router.get('/events', (req: Request, res: Response) => {
  try {
  const userId = typeof req.query.userId === 'string' && req.query.userId ? req.query.userId : null;
  const token = typeof req.query.token === 'string' ? req.query.token : null;
  const adminTokenParam = typeof req.query.adminToken === 'string' ? req.query.adminToken : null;

  // 관리자 토큰 검증 — HMAC 재계산으로 검증 (서버 재시작 후에도 유효)
  const isAdminSse = verifyAdminToken(adminTokenParam);

  // userId가 있으면 반드시 유효한 토큰 필요 — 없거나 만료/위조된 경우 거부 (db-sse-fanout-policy)
  {
    const tokenState = userId && token ? classifySseToken(userId, token) : null;
    const gate = planSseUserTokenGate({ userId, token, tokenState });
    if (gate.action === 'reject') {
      if (gate.metric === 'expired') {
        // 만료는 정상 수명 종료. 침입 warn 으로 남기면 5시간 로그가 401 스팸이 된다.
        recordExpiredSseToken();
        logger.debug({ userId, ip: req.ip }, '[sse] token expired — client should refresh');
      } else if (gate.metric === 'missing') {
        recordMissingSseToken();
        logger.warn({ userId, hasToken: false, ip: req.ip }, '[sse] 인증 실패: 유효하지 않은 토큰으로 SSE 접근 시도 — 침입 탐지');
      } else {
        logger.warn({ userId, hasToken: !!token, ip: req.ip }, '[sse] 인증 실패: 유효하지 않은 토큰으로 SSE 접근 시도 — 침입 탐지');
      }
      res.status(gate.reject.status).json(gate.reject.body);
      return;
    }
  }

  // 전역 SSE 상한 — 프로세스 메모리/FD 고갈 방지
  if (countSseLiveConnections(
    [...sseUserMap.values()].map(s => s.size),
    sseAnonClients.size,
    sseAdminClients.size,
  ) >= SSE_MAX_TOTAL) {
    const rej = sseCapacityReject();
    res.setHeader('Retry-After', rej.retryAfter ?? '3');
    res.status(rej.status).json(rej.body);
    return;
  }

  // ─ Per-IP SSE connection limit: 동일 IP 대량 연결 방지
  // 인증된 유저(유효 SSE 토큰)는 행사장 NAT에서 IP 한도를 넘겨도 접속 허용.
  // per-user cap + 전역 SSE_MAX_TOTAL 이 서버를 보호한다.
  const sseIp = String(req.ip ?? req.socket.remoteAddress ?? 'unknown');
  const currentConns = _sseConnPerIp.get(sseIp) ?? 0;
  const ipPlan = planSseIpCount({
    currentConns,
    maxPerIp: SSE_MAX_CONN_PER_IP,
    hasUserId: Boolean(userId),
  });
  if (!ipPlan.allow) {
    const rej = ipPlan.reject!;
    res.setHeader('Retry-After', rej.retryAfter ?? '5');
    res.status(rej.status).json(rej.body);
    return;
  }
  let countedIp = false;
  if (ipPlan.countIp) {
    _sseConnPerIp.set(sseIp, currentConns + 1);
    countedIp = true;
  }
  const _undoSseConnCount = () => {
    if (!countedIp) return;
    countedIp = false;
    const c = _sseConnPerIp.get(sseIp) ?? 1;
    if (c <= 1) _sseConnPerIp.delete(sseIp);
    else _sseConnPerIp.set(sseIp, c - 1);
  };

  // 익명 상한은 헤더 flush 전에 검사해야 429 JSON이 전달됨
  if (shouldRejectAnonSse({ isAdminSse, hasUserId: Boolean(userId), anonCount: sseAnonClients.size })) {
    _undoSseConnCount();
    const rej = sseAnonLimitReject();
    res.setHeader('Retry-After', rej.retryAfter ?? '5');
    res.status(rej.status).json(rej.body);
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  // CDN/프록시가 gzip으로 묶지 않도록 — SSE 청크 지연 방지
  res.setHeader('Content-Encoding', 'identity');
  res.flushHeaders();
  // Non-private process identifier lets the client detect a cross-instance reconnect.
  // It is deliberately sent before ring replay because event sequence numbers are process-local.
  try {
    res.write(`data: ${JSON.stringify({ type: 'instance', instanceId: INSTANCE_ID })}\n\n`);
  } catch {
    _undoSseConnCount();
    try { res.end(); } catch { /* ignore */ }
    return;
  }

  // ── 소켓 레벨 타임아웃 — 좀비 TCP 연결 방어 ─────────────────────────────────
  // keep-alive ping(15s) 기준으로 여유 있게 설정 (미수신 시 Node가 socket.destroy)
  // 브라우저가 즉시 EventSource.onerror를 받고 재연결을 시작하도록 강제
  // (TCP keep-alive만으로는 프록시/방화벽이 silent-drop 시 수십 분 좀비가 될 수 있음)
  const SOCKET_TIMEOUT_MS = 105_000; // 15s ping × 7
  // Task #153: cleanupConn이 아래에서 선언되므로 forward reference로 호출
  let _cleanupConnRef: () => void = () => {};
  req.socket.setTimeout(SOCKET_TIMEOUT_MS);
  req.socket.once('timeout', () => {
    _cleanupConnRef(); // sseUserMap/카운터/keepalive 정리 — 좀비 엔트리 방지
    try { req.socket.destroy(); } catch { /* ignore */ }
  });

  if (isAdminSse) {
    // 관리자 SSE — 모든 이벤트(private 포함) 수신, 최대 SSE_ADMIN_MAX_CONN_DEFAULT개 연결
    if (shouldEvictOldestSseConn(sseAdminClients.size, SSE_ADMIN_MAX_CONN_DEFAULT)) {
      const oldest = sseAdminClients.values().next().value;
      if (oldest) { _sseCleanup.get(oldest)?.(); _sseCleanup.delete(oldest); try { oldest.end(); } catch { /* ignore */ } sseAdminClients.delete(oldest); }
    }
    sseAdminClients.add(res);
  } else if (userId) {
    if (!sseUserMap.has(userId)) sseUserMap.set(userId, new Set());
    const userConns = sseUserMap.get(userId)!;
    // 탭 과다 방지: 사용자당 최대 4개 연결. 초과 시 가장 오래된 연결 종료
    if (shouldEvictOldestSseConn(userConns.size, SSE_MAX_CONN_PER_USER)) {
      const oldest = userConns.values().next().value;
      // keepalive interval도 반드시 해제 — 미해제 시 메모리 누수
      _sseCleanup.get(oldest)?.();
      _sseCleanup.delete(oldest);
      try { oldest.end(); } catch { /* ignore */ }
      userConns.delete(oldest);
    }
    userConns.add(res);
  } else {
    logger.debug({ ip: req.ip, anonCount: sseAnonClients.size }, '[sse] 익명 SSE 연결 (userId 없음) — 앱 외부 접근 의심');
    sseAnonClients.add(res);
  }
  recordSseAccepted();

  // ── Last-Event-ID 기반 미수신 이벤트 재전송 ──────────────────────────────────
  // 브라우저 EventSource는 이전 연결에서 수신한 마지막 id 값을 재연결 시
  // Last-Event-ID 헤더로 자동 전송 (RFC 8898 §9.2.4).
  // 서버는 해당 seq 이후의 ring buffer 항목을 필터링해 순서대로 재전송.
  // 클라이언트 측 applySseInsert/applyLoadMessages가 중복을 멱등하게 처리하므로 안전.
  {
    const rawLastId = req.headers['last-event-id']
      ?? (typeof req.query.lastEventId === 'string' ? req.query.lastEventId : null);
    const lastSeq = rawLastId ? parseInt(String(rawLastId), 10) : 0;
    if (lastSeq > 0 && Number.isFinite(lastSeq) && !isNaN(lastSeq)) {
      const missed = _ringGetSince(lastSeq, userId, isAdminSse);
      // 슬립 후 링 전체가 쏟아지면 채팅이 멈춘다. 소량은 재전송, 대량은 HTTP merge-by-id.
      if (planSseRingReplay(missed.length, SSE_RING_REPLAY_MAX_DEFAULT) === 'catchup') {
        const latest = _sseRing.latestSeq() || lastSeq;
        try {
          res.write(`id: ${latest}\ndata: ${JSON.stringify({ type: 'catchup', missed: missed.length })}\n\n`);
        } catch { /* ignore */ }
      } else {
        for (const entry of missed) {
          try { res.write(`id: ${entry.seq}\ndata: ${entry.json}\n\n`); } catch { break; }
        }
      }
    }
  }

  // Keep-alive every 15s — 프록시 idle 차단 방지, 5s 대비 서버 부하 감소
  const keepalive = setInterval(() => {
    // res.writable이 false면 이미 닫힌 소켓 — cleanupConn 호출 후 정리
    if (!res.writable || res.writableEnded) { clearInterval(keepalive); cleanupConn(); return; }
    try {
      const flushed = res.write('data: {"type":"ping"}\n\n');
      // write()가 false를 반환하면 TCP 송신 버퍼가 가득 찬 것 (backpressure)
      // 클라이언트가 읽지 못하는 좀비 연결이므로 정리 — sseUserMap에서도 제거
      if (!flushed) { clearInterval(keepalive); cleanupConn(); res.end(); }
    } catch {
      clearInterval(keepalive);
      cleanupConn(); // write 예외 시에도 sseUserMap에서 반드시 제거
    }
  }, 15_000);
  // _sseCleanup에 등록 — _send write 실패 시에도 keepalive 해제 + IP 카운터 감소 보장
  // (cleanupConn에서 _sseConnPerIp 감소를 제거하고 여기서 통합 처리)
  _sseCleanup.set(res, () => { clearInterval(keepalive); _undoSseConnCount(); });

  // _cleaned 플래그로 close·aborted 두 이벤트가 동시에 발생해도 정확히 1회만 실행
  let _cleaned = false;
  const cleanupConn = () => {
    if (_cleaned) return;
    _cleaned = true;
    recordSseClosed();
    _sseCleanup.get(res)?.();
    _sseCleanup.delete(res);
    if (isAdminSse) {
      sseAdminClients.delete(res);
    } else if (userId) {
      const conns = sseUserMap.get(userId);
      if (conns) { conns.delete(res); if (conns.size === 0) sseUserMap.delete(userId); }
    } else {
      sseAnonClients.delete(res);
    }
    // Per-IP connection count 해제: _sseCleanup fn으로 통합 — _undoSseConnCount() 중복 호출 방지
  };
  // Task #153: socket timeout forward reference 완성 — timeout 시 cleanupConn 정상 호출
  _cleanupConnRef = cleanupConn;
  req.on('close', cleanupConn);
  req.on('aborted', cleanupConn); // Node.js HTTP/1.1 강제 종료 대비
  req.socket.on('close', cleanupConn); // 프록시가 HTTP close 없이 소켓만 끊는 경우 teardown 지연 방지

  // Initial ping — cleanupConn 선언 이후에 write. 이미 닫힌 응답이면 즉시 정리.
  try { res.write('data: {"type":"ping"}\n\n'); } catch { cleanupConn(); }
  } catch (e) {
    logger.error({ err: e }, '[events] Unexpected error during SSE setup');
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Graceful shutdown helper (index.ts에서 SIGTERM·SIGINT 시 호출) ───────────
// DB 커넥션 풀과 LISTEN 클라이언트를 순서대로 종료한다.
export async function gracefulShutdown(): Promise<void> {
  // Invalidate in-flight / scheduled LISTEN reconnects before closing sockets.
  _listenSetupGen += 1;
  _listenSetupInFlight = null;
  if (_listenReconnectTimer) { clearTimeout(_listenReconnectTimer); _listenReconnectTimer = null; }
  _listenReconnectScheduledGen = null;
  // 1) LISTEN 클라이언트 종료 — NOTIFY 구독 해제
  if (_listenClient) {
    try { await _listenClient.end(); } catch { /* ignore */ }
    _listenClient = null;
  }
  // 2) 커넥션 풀 종료 — 진행 중인 쿼리가 완료된 후 모든 idle 연결 반환
  try { await pool.end(); } catch { /* ignore */ }
}

export default router;
