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
export async function privacySnapshot(
  tx: HubTx,
  owner: string,
): Promise<PrivacySnapshot> {
  const own = await tx.get<HubOwner>("owner", owner);
  if (!own) fail("OWNER", "대상을 찾을 수 없습니다.", 404);
  const events = await tx.all<HubEvent>("event");
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
    caseRevision: own.privacyCase?.revision ?? 0,
    hold: own.privacyHold,
    applications: await Promise.all(
      apps
        .filter((a) => !a.erasedAt)
        .map(async (a) => {
          const e = events.find((e) => e.id === a.eventId);
          return {
            id: a.id,
            revision: a.revision,
            eventEnd: e
              ? new Date(
                  Date.parse(`${e.date}T${e.end}:00+09:00`) +
                    (e.end <= e.start ? 86400000 : 0),
                ).toISOString()
              : "",
            financeAt: a.approvedAt ?? a.confirmedAt,
            paid: a.payment === "approved",
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
          lastAt: member.lastActivityAt ?? member.history.at(-1)?.at ?? "",
        }
      : undefined,
    thread: thread
      ? {
          id: thread.id,
          lastAt: thread.messages.at(-1)?.at ?? thread.readUserAt,
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
      (!snapshot.hold.until || Date.parse(snapshot.hold.until) > now.getTime())
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
      if (item.kind === "application") {
        const a = await tx.get<HubApplication>("application", item.id);
        if (!a) continue;
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
          ["application", "member", "thread"].includes(i.kind),
      );
      if (!retained) {
        own.erasedAt = now.toISOString();
        own.recoveryHash = "";
      }
      own.history = (own.history ?? []).map((h) => ({
        ...h,
        reason: undefined,
      }));
      if (own.privacyCase) {
        own.privacyCase.status = retained ? "reviewed" : "completed";
        own.privacyCase.updatedAt = now.toISOString();
        own.privacyCase.revision++;
      }
      await tx.put("owner", own.id, own);
    }
    return { applied: true, scope: "isolated-test", fingerprint };
  });
}
