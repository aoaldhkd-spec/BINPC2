import { randomBytes } from "node:crypto";
import {
  DEFAULT_PRIVACY_POLICY,
  draftPrivacyPlan,
  type PrivacyPolicy,
  type PrivacySnapshot,
  type PrivacyPlan,
  type HubApplication,
  type HubEvent,
} from "@workspace/api-zod";
import { HubStore, HubTx, fail, digest } from "./event-hub-store.js";
import type { HubOwner, HubMember, HubThread } from "./event-hub-service.js";
import type { CompanionDraft } from "./companion-records.js";
import type { CompanionLinkRequest } from "./companion-submission.js";
import {recordPrivacyErasure} from './event-hub-privacy-restore.js';

const submittedReferenceOnly = (draft: CompanionDraft) =>
  !!draft.applicationId && !!draft.removedAt &&
  Object.keys(draft.basic).length === 0 && !draft.inviteHash;

function companionReference(draft: CompanionDraft, applicationId: string, at: string): CompanionDraft {
  return {
    id: draft.id, basic: {}, applicationId,
    submittedAt: draft.submittedAt, providedAt: draft.providedAt,
    permissionToProvideAt: draft.permissionToProvideAt,
    changedAt: submittedReferenceOnly(draft) ? draft.changedAt : at,
    removedAt: draft.removedAt ?? at,
  };
}

/** Removing the representative's personal copy must not cascade into a friend's ledger. */
async function scrubCompanionDrafts(tx: HubTx, own: HubOwner, eventId: string, at: string) {
  const group = own.companionDrafts?.[eventId];
  if (!group) return;
  const retained: CompanionDraft[] = [];
  for (const draft of group.items) {
    const application = draft.applicationId
      ? await tx.get<HubApplication>("application", draft.applicationId) : undefined;
    if (!application || application.sponsorOwner !== own.id ||
      application.companionDraftId !== draft.id || application.eventId !== eventId)
      continue;
    retained.push(companionReference(draft, application.id, at));
  }
  if (!retained.length) delete own.companionDrafts![eventId];
  else if (JSON.stringify(group.items) !== JSON.stringify(retained))
    own.companionDrafts![eventId] = { revision: group.revision + 1, items: retained };
}

/** The person's erasure also covers their exact submitted copy, never the sponsor's other friends. */
async function scrubSponsorCopy(tx: HubTx, application: HubApplication, at: string, retainReference: boolean) {
  if (!application.sponsorOwner || !application.companionDraftId) return;
  const sponsor = await tx.get<HubOwner>("owner", application.sponsorOwner);
  const group = sponsor?.companionDrafts?.[application.eventId];
  if (!sponsor || !group) return;
  const matches = (draft: CompanionDraft) =>
    draft.id === application.companionDraftId && draft.applicationId === application.id;
  if (!group.items.some(matches)) return;
  const items = group.items.flatMap(draft => !matches(draft) ? [draft] :
    retainReference ? [companionReference(draft, application.id, at)] : []);
  if (JSON.stringify(group.items) === JSON.stringify(items)) return;
  sponsor.companionDrafts![application.eventId] = { revision: group.revision + 1, items };
  await tx.put("owner", sponsor.id, sponsor);
}

/** Only the erased owner's pending requests; another person's request is never a deletion target. */
async function clearPendingCompanionLinks(tx: HubTx, own: HubOwner, eventId?: string) {
  const rows = await tx.db.query("SELECT id FROM event_hub_records WHERE kind='settings' AND id LIKE 'companion-link:%'");
  for (const row of rows.rows) {
    const request = await tx.get<CompanionLinkRequest>("settings", row.id);
    if (request?.owner === own.id && request.status === "pending" &&
      (!eventId || request.eventId === eventId))
      await tx.db.query("DELETE FROM event_hub_records WHERE kind='settings' AND id=$1", [row.id]);
  }
  for (const [event, request] of Object.entries(own.companionLinkRequests ?? {})) {
    if (request.status === "pending" && (!eventId || event === eventId))
      delete own.companionLinkRequests![event];
  }
}

export async function privacySnapshot(
  tx: HubTx,
  owner: string,
): Promise<PrivacySnapshot> {
  const own = await tx.get<HubOwner>("owner", owner);
  if (!own) fail("OWNER", "대상을 찾을 수 없습니다.", 404);
  const events = await tx.all<HubEvent>("event");
  const eventEnd=(id:string)=>{
    const e=events.find(value=>value.id===id);
    if(!e)return "";
    const value=Date.parse(`${e.date}T${e.end}:00+09:00`)+(e.end<=e.start?86400000:0);
    return Number.isFinite(value)?new Date(value).toISOString():"";
  };
  const latest=(values:(string|undefined)[])=>values.filter((value):value is string=>!!value&&Number.isFinite(Date.parse(value))).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1);
  const apps = (await tx.all<HubApplication>("application")).filter(
    (a) => a.owner === owner,
  );
  const member = (await tx.all<HubMember>("member")).find(
    (m) => m.owner === owner,
  );
  const thread = await tx.get<HubThread>("thread", owner);
  const requests = await tx.db.query(
    "SELECT id,data FROM event_hub_records WHERE kind='request' ORDER BY id",
  );
  const receiptIds: string[] = [];
  for (const row of requests.rows) {
    const r = await tx.get<{
      owner?: string;
      result?: { id?: string; profile?: { event_hub_owner?: string } };
    }>("request", row.id);
    if (
      r?.owner === owner ||
      apps.some((a) => a.id === r?.result?.id) ||
      r?.result?.profile?.event_hub_owner === owner
    )
      receiptIds.push(row.id);
  }
  const errors = (await tx.all<{ id: string; owner?: string }>("error")).filter(
    (e) => e.owner === owner,
  );
  return {
    owner,
    basicDrafts: [
      ...Object.entries(own.basicDrafts ?? {}).map(([id, d]) => ({ id, revision: d.revision, updatedAt: d.updatedAt,eventEnd:eventEnd(id) })),
      ...Object.entries(own.companionDrafts ?? {})
        .filter(([, group]) => group.items.some(draft => !submittedReferenceOnly(draft)))
        .map(([id,g])=>({id:`companion:${id}`,revision:g.revision,updatedAt:g.items.map(d=>d.changedAt).sort().at(-1)??own.createdAt,eventEnd:eventEnd(id)})),
      ...Object.values(own.companionLinkRequests ?? {})
        .filter(request => request.status === "pending")
        .map(request => ({ id: `companion-link:${request.eventId}`, revision: request.revision, updatedAt: request.at,eventEnd:eventEnd(request.eventId) })),
    ],
    caseRevision: own.privacyCase?.revision ?? 0,
    hold: own.privacyHold,
    applications: await Promise.all(
      apps.map(async (a) => {
          return {
            id: a.id,
            revision: a.revision,
            eventEnd:eventEnd(a.eventId),
            financeAt:latest([a.approvedAt,a.reportedAt,...Object.values(a.prizeGivenAt??{}),...(a.manualResults??[]).flatMap(result=>[result.paidAt,result.receivedAt]),...a.history.filter(item=>item.action==='admin.application.prize').map(item=>item.at)])??a.confirmedAt,
            paid: a.payment!=="none"||!!a.approvedAt||a.prizesGiven.length>0||!!a.manualResults?.some(result=>result.paidAt||result.receivedAt),
            erasedAt:a.erasedAt,
            ...(a.rewardPhone?{rewardPhone:{confirmedAt:a.rewardPhoneRetainFrom??a.rewardPhoneRequest?.retentionStartedAt}}:{}),
            publicProfile:
              !!a.profileId &&
              !!(
                await tx.db.query(
                  "SELECT row_id FROM app_kv_rows WHERE table_name='profiles' AND row_id=$1",
                  [a.profileId],
                )
              ).rows.length,
          };
        }),
    ),
    member: member
      ? {
          id: member.id,
          lastAt: member.lastActivityAt ?? latest(member.history.filter(item=>['member.consent','member.setup.consent','member.nickname.change','member.login'].includes(item.action)).map(item=>item.at)) ?? "",
        }
      : undefined,
    thread: thread
      ? {
          id: thread.id,
          lastAt: thread.messages.at(-1)?.at ?? thread.readUserAt,
          status:thread.status,
          resolvedAt:thread.status==='resolved'?(thread.resolvedAt??thread.history.filter(item=>item.action==='thread.resolved').at(-1)?.at):undefined,
        }
      : undefined,
    receiptIds,
    errorIds: errors.map((e) => e.id),
  };
}
export async function planPrivacy(
  tx: HubTx,
  owner: string,
  now: Date,
): Promise<PrivacyPlan> {
  const snapshot = await privacySnapshot(tx, owner),
    policy =
      (await tx.get<PrivacyPolicy>("settings", "privacy-policy")) ??
      DEFAULT_PRIVACY_POLICY;
  return {
    ...draftPrivacyPlan(snapshot, policy, now),
    fingerprint: digest(JSON.stringify({ snapshot, policy })),
  };
}
/** Deliberately unavailable to HTTP routes and background timers. Tests use a separate disposable DB. */
export async function executePrivacyPlanForIsolatedTest(
  store: HubStore,
  owner: string,
  fingerprint: string,
  options: {
    mode: "isolated-test";
    policyConfirmed: boolean;
    identityConfirmed: boolean;
    backupConfirmed: boolean;
  },
  now = new Date(),
) {
  if (
    process.env.NODE_ENV !== "test" ||
    options.mode !== "isolated-test" ||
    !options.policyConfirmed ||
    !options.identityConfirmed ||
    !options.backupConfirmed
  )
    fail(
      "PRIVACY_EXECUTION_DISABLED",
      "운영 파기는 승인 전 비활성 상태입니다.",
      403,
    );
  return store.transaction(async (tx) => {
    const database = String(
      (await tx.db.query("SELECT current_database() AS name")).rows[0]?.name,
    );
    if (database !== "binpc2_hub_test_resume")
      fail(
        "PRIVACY_EXECUTION_DISABLED",
        "전용 파기 테스트 DB만 허용합니다.",
        403,
      );
    const plan = await planPrivacy(tx, owner, now);
    if (plan.fingerprint !== fingerprint)
      fail(
        "REVISION",
        "원본 또는 정책이 변경되었습니다. 계획을 다시 확인하세요.",
        409,
      );
    const policy =
      (await tx.get<PrivacyPolicy>("settings", "privacy-policy")) ??
      DEFAULT_PRIVACY_POLICY;
    const snapshot = await privacySnapshot(tx, owner);
    if (
      snapshot.hold &&
      (!snapshot.hold.until || !Number.isFinite(Date.parse(snapshot.hold.until)) || Date.parse(snapshot.hold.until) > now.getTime())
    )
      fail("PRIVACY_HOLD", "보관 보류 중입니다.", 409);
    if (
      !policy.backupProcedure.trim() ||
      Object.values(policy.rules).some((r) => !r.days || !r.basis.trim()) ||
      snapshot.applications.some((a) => a.publicProfile)
    )
      fail(
        "PRIVACY_POLICY_INCOMPLETE",
        "기준일·근거·백업·현장 데이터 범위를 확인하세요.",
        409,
      );
    for (const item of plan.items) {
      if (
        item.kind === "backup" ||
        item.kind === "onsite" ||
        item.action === "keep"
      )
        continue;
      if (item.kind === "basic-draft") {
        const draftOwner = await tx.get<HubOwner>("owner", owner);
        if (draftOwner && item.action === "erase") {
          if(item.id.startsWith('companion:')){
            const eventId=item.id.slice('companion:'.length);
            await scrubCompanionDrafts(tx, draftOwner, eventId, now.toISOString());
            const invitations=await tx.db.query("SELECT id FROM event_hub_records WHERE kind='settings' AND id LIKE 'companion-invite:%'");
            for(const row of invitations.rows){const invitation=await tx.get<{sponsorOwner:string;eventId:string}>('settings',row.id);if(invitation?.sponsorOwner===owner&&invitation.eventId===eventId)await tx.db.query("DELETE FROM event_hub_records WHERE kind='settings' AND id=$1",[row.id]);}
          }else if(item.id.startsWith('companion-link:')){
            await clearPendingCompanionLinks(tx, draftOwner, item.id.slice('companion-link:'.length));
          }else if(draftOwner.basicDrafts)delete draftOwner.basicDrafts[item.id];
          await tx.put("owner", owner, draftOwner);
        }
      } else if (item.kind === "application") {
        const a = await tx.get<HubApplication>("application", item.id);
        if (!a) continue;
        await scrubSponsorCopy(tx, a, now.toISOString(), item.action !== "erase");
        if (a.screeningPhoto) {
          await tx.db.query(
            "DELETE FROM event_hub_records WHERE kind='settings' AND id=$1",
            [`screening:${a.screeningPhoto.id}`],
          );
          a.screeningPhoto = undefined;
        }
        if(!plan.items.some(entry=>entry.kind==='reward-phone'&&entry.id===a.id&&entry.action==='keep')){
          a.rewardPhone = undefined;a.rewardPhoneRequest = undefined;a.rewardPhoneRetainFrom=undefined;
        }
        if (a.lateArrival) a.lateArrival={...a.lateArrival,reason:"",reviewReason:undefined};
        if (a.manualResults) a.manualResults=a.manualResults.map(r=>({...r,reason:"",label:"수동 지급 기록"}));
        a.eligibility = undefined;
        a.benefitContact = undefined;
        if (item.action === "erase")
          await tx.db.query(
            "DELETE FROM event_hub_records WHERE kind='application' AND id=$1",
            [item.id],
          );
        else {
          a.basic = {
            ...a.basic,
            nickname: "삭제된 신청자",
            birthYear: 1900,
            location: "",
            residence: undefined,
            phone: "",
            depositor: "",
          };
          a.profile = { lastStep: 1 };
          a.consent = undefined;
          a.history = a.history.map((h) => ({ ...h, reason: undefined }));
          a.erasedAt = now.toISOString();
          a.revision++;
          await tx.put("application", a.id, a);
        }
      } else if(item.kind==='reward-phone'&&item.action==='erase'){
        if(plan.items.some(entry=>entry.kind==='application'&&entry.id===item.id&&entry.action==='erase'))continue;
        const a=await tx.get<HubApplication>('application',item.id);
        if(a){a.rewardPhone=undefined;a.rewardPhoneRequest=undefined;a.rewardPhoneRetainFrom=undefined;a.revision++;await tx.put('application',a.id,a);}
      } else if (item.kind === "request") {
        const r = await tx.get<Record<string, unknown>>("request", item.id);
        if (r) {
          r.result = { saved: true, erased: true };
          delete r.owner;
          await tx.put("request", item.id, r);
        }
      } else if (item.action === "erase")
        await tx.db.query(
          "DELETE FROM event_hub_records WHERE kind=$1 AND id=$2",
          [item.kind, item.id],
        );
    }
    const own = await tx.get<HubOwner>("owner", owner);
    if (own) {
      const retained = plan.items.some(
        (i) =>
          i.action === "keep" &&
          ["application", "basic-draft", "member", "thread"].includes(i.kind),
      );
      if (!retained) {
        own.basicDrafts = undefined;
        for (const eventId of Object.keys(own.companionDrafts ?? {}))
          await scrubCompanionDrafts(tx, own, eventId, now.toISOString());
        if (!Object.keys(own.companionDrafts ?? {}).length) own.companionDrafts = undefined;
        await clearPendingCompanionLinks(tx, own);
        own.companionOrigins = undefined;
        own.erasedAt = now.toISOString();
        // A unique, unissued tombstone cannot collide with another erased owner.
        own.recoveryHash = digest(randomBytes(32).toString("base64url"));
        own.marketingConsent = {
          enabled: false,
          at: now.toISOString(),
          version: "withdrawn",
        };
        own.restricted = undefined;
      }
      own.history = (own.history ?? []).map((h) => ({
        ...h,
        reason: undefined,
      }));
      if (own.privacyCase) {
        own.privacyCase.history = own.privacyCase.history.map((h) => ({
          ...h,
          reason: undefined,
        }));
        own.privacyCase.publicMessage = undefined;
        own.privacyCase.status = retained ? "reviewed" : "completed";
        own.privacyCase.updatedAt = now.toISOString();
        own.privacyCase.revision++;
      }
      await tx.put("owner", own.id, own);
    }
    await recordPrivacyErasure(tx,owner,plan.items.filter(item=>['application','basic-draft','member','thread','request','reward-phone'].includes(item.kind)&&['erase','minimize'].includes(item.action)).map(item=>({kind:item.kind as 'application'|'basic-draft'|'member'|'thread'|'request'|'reward-phone',id:item.id,action:item.action as 'erase'|'minimize'})),now.toISOString());
    return { applied: true, scope: "isolated-test", fingerprint };
  });
}
