import {
  quoteFor,
  paymentSatisfied,
  type HubEvent,
  type HubApplication,
} from "@workspace/api-zod";
import { type HubTx, fail } from "./event-hub-store.js";
/** Shared manual succession engine. Original ranks and finalized financial snapshots are immutable. */
export async function benefitSuccession(
  tx: HubTx,
  m: {
    action: string;
    target: string;
    revision?: number;
    data: Record<string, unknown>;
  },
  now: string,
) {
  const reason = String(m.data.reason ?? "").trim();
  const e = await tx.get<HubEvent>("event", m.target);
  if (!e) fail("CAMPAIGN", "행사 정책을 확인해 주세요.", 404);
  if (m.revision !== e.revision)
    fail("REVISION", "최신 행사 상태를 확인해 주세요.", 409);
  if (!reason || m.data.confirmed !== true)
    fail("CONFIRM", "관리자 확인과 처리 사유가 필요합니다.");
  if (m.action === "campaign.succeed" && !e.benefitsEnabled)
    fail(
      "MODULE_DISABLED",
      "선착순 혜택이 OFF입니다. 기존 혜택·금액 기록은 보존됩니다.",
      403,
    );
  const applications = (await tx.all<HubApplication>("application"))
    .filter((a) => a.eventId === e.id)
    .sort((a, b) => a.rank - b.rank);
  if (m.action === "campaign.priority") {
    const a = applications.find((a) => a.id === m.data.applicationId);
    if (!a) fail("APPLICATION", "대상을 확인해 주세요.");
    const kind = String(m.data.kind);
    if (["exclude", "restore"].includes(kind)) {
      // A payment report needs bank/contact review, never automatic exclusion.
      if (
        kind === "exclude" &&
        (paymentSatisfied(a) || a.payment === "reported") &&
        m.data.bankAndContactReviewed !== true
      )
        fail(
          "BANK_REVIEW",
          "정상 송금자 보호를 위해 은행·연락 상태 확인이 필요합니다.",
        );
      a.benefitExcluded = kind === "exclude";
    } else if (
      ["무응답", "입금 지연", "대상 확인", "입금·연락 확인"].includes(kind)
    )
      a.benefitContact = kind;
    else fail("ACTION", "지원하지 않는 혜택 처리입니다.");
    a.revision++;
    a.history.push({
      at: now,
      actor: "admin",
      action: `admin.priority.${kind}`,
      reason,
    });
    await tx.put("application", a.id, a);
  } else if (m.action === "campaign.succeed") {
    let rank = 0;
    for (const a of applications) {
      a.benefitRank = a.benefitExcluded ? 0 : ++rank;
      const proposed = quoteFor(
        e,
        a.benefitExcluded ? 1000000 : a.benefitRank,
        new Date(a.history[0]?.at ?? now),
        a.halloweenRecognition?.kind,
      );
      if (a.quote && proposed.fee !== a.quote.fee) {
        // All finalized amounts remain frozen. An operator must review any difference.
        if (a.confirmedAt || paymentSatisfied(a))
          a.differenceReview = {
            previous: a.quote.fee,
            proposed: proposed.fee,
            at: now,
          };
        else a.quote = proposed;
      }
      a.revision++;
      a.history.push({
        at: now,
        actor: "admin",
        action: "fee:benefit.succession",
        reason,
      });
      await tx.put("application", a.id, a);
    }
  } else fail("ACTION", "지원하지 않는 행사 처리입니다.");
  e.revision++;
  e.history.push({ at: now, actor: "admin", action: m.action, reason });
  await tx.put("event", e.id, e);
  return { id: e.id };
}
