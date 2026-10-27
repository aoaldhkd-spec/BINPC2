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
  if (
    !a.confirmedAt ||
    a.payment !== "approved" ||
    a.attendance !== "confirmed" ||
    !a.checkin
  )
    return {
      code: "ATTENDANCE",
      message: "입금·참가 확정·현장 확인이 필요합니다.",
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
  const { rank, owner, quote, history, ...safe } = a;
  // Internal notes/restrictions are not participant notices. Preserve transparent fee changes.
  const visibleHistory = history
    .filter(
      (h) =>
        !h.action.startsWith("admin.") ||
        [
          "admin.application.payment",
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
  return {
    ...safe,
    history: visibleHistory,
    profileMissing: profileMissing(a.profile),
    ...(a.stage >= 3 && quote
      ? {
          quote,
          billing: {
            quote,
            account: e.account,
            deadline: e.deadline,
            included: e.included,
            deposit: Math.min(e.deposit, a.quote?.fee ?? 0),
          },
        }
      : {}),
    ...(a.payment === "approved"
      ? { venue: { address: e.address, mapUrl: e.mapUrl } }
      : {}),
  };
}
