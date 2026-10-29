import { paymentSatisfied } from "./event-campaign";
import {
  HUB_CONSENT_VERSION,
  profileMissing,
  type HubApplication,
  type HubEvent,
} from "./event-hub";
/** Shared by the real API and the removable, network-free training adapter. */
export function applicationAdmissionIssue(
  a: HubApplication,
  e: HubEvent,
): { code: string; message: string } | null {
  if (!a.confirmedAt || !paymentSatisfied(a))
    return {
      code: "ATTENDANCE",
      message: a.approvalRevokedAt
        ? "참가 승인이 취소되었습니다. 재입금하지 말고 관리자에게 문의해 주세요."
        : "관리자의 입금 확인 또는 무료 참가 승인이 필요합니다.",
    };
  if (a.eligibility && a.eligibility.status !== "approved")
    return {
      code: "ELIGIBILITY",
      message: "관리자 사전 참가 검토가 필요합니다.",
    };
  const missing = profileMissing(a.profile);
  if (missing.length)
    return {
      code: "PROFILE_INCOMPLETE",
      message: `입장하려면 프로필을 먼저 완성해야 합니다: ${missing.join(", ")}`,
    };
  if (
    a.consent?.version !== HUB_CONSENT_VERSION ||
    a.consent.noticeVersion !== e.noticeVersion
  )
    return { code: "CONSENT", message: "변경된 공지를 확인해 주세요." };
  return null;
}
export function participantApplication(a: HubApplication, e: HubEvent) {
  const {
    rank,
    owner,
    quote,
    history,
    manualResults,
    benefitRank,
    benefitExcluded,
    benefitContact,
    halloweenRecognition,
    ...safe
  } = a;
  // Internal notes/restrictions are not participant notices. Preserve transparent fee changes.
  const visibleHistory = history
    .filter(
      (h) =>
        !h.action.startsWith("admin.") ||
        [
          "admin.application.payment",
          "admin.application.revoke",
          "admin.application.attendance",
          "admin.application.checkin",
          "admin.application.prize",
          "admin.application.candy",
          "admin.application.reprice",
        ].includes(h.action),
    )
    .map((h) => ({
      ...h,
      reason:
        h.action.startsWith("fee:") || h.action === "admin.application.reprice"
          ? h.reason
          : undefined,
    }));
  const thanksLogo=e.logoVersions?.find(v=>v.id===e.thanksLogoVersionId&&v.role==="thanks");
  const selectedLogo=e.logoVersions?.find(v=>v.id===e.venueLogoVersionId&&v.role==="venue");
  return {
    ...safe,
    manualResults: manualResults?.map(({reason:_reason,...r})=>r),
    ...(a.stage >= 3 ? { benefitRank, benefitExcluded, halloweenRecognition } : {}),
    history: visibleHistory,
    profileMissing: profileMissing(a.profile),
    ...(a.stage >= 3 && quote
      ? {
          quote,
          billing: {
            quote,
            account: a.paymentAccount ? `${a.paymentAccount.bank} ${a.paymentAccount.number}${a.paymentAccount.holder ? ` ${a.paymentAccount.holder}` : ""}` : e.account,
            accounts: a.confirmedAt ? (a.paymentAccount ? [a.paymentAccount] : []) : e.accounts,
            deadline: e.deadline,
            included: e.included,
            deposit:
              e.campaign?.kind === "tour"
                ? (a.quote?.fee ?? 0)
                : Math.min(e.deposit, a.quote?.fee ?? 0),
          },
        }
      : {}),
    ...(paymentSatisfied(a)
      ? { venue: { address: e.address, addressRecord: e.addressRecord ? {roadOriginal:e.addressRecord.roadOriginal,parcelOriginal:e.addressRecord.parcelOriginal,floor:e.addressRecord.floor} : undefined, logoId: selectedLogo?undefined:e.venueLogoId, thanksLogo:thanksLogo?{url:thanksLogo.url,label:thanksLogo.label,width:thanksLogo.width,height:thanksLogo.height}:undefined, logo:selectedLogo?{url:selectedLogo.url,label:selectedLogo.label,width:selectedLogo.width,height:selectedLogo.height}:undefined, mapUrl: e.mapUrl } }
      : {}),
  };
}

/** Administrative triage reasons and tags are not participant-facing messages. */
export function participantThread<
  T extends { tags: string[]; history: unknown[] },
>(thread: T): T {
  return { ...thread, tags: [], history: [] };
}
