import { createHash } from "node:crypto";
import { PRIVACY_PURPOSES, type PrivacyPolicy } from "@workspace/api-zod";
import { productionHubBlocked } from "./private-preview.js";
import type { HubTx } from "./event-hub-store.js";
export function policyCompletionIssue(
  p: PrivacyPolicy | undefined,
): string | null {
  if (
    !p ||
    !p.policyVersion?.trim() ||
    !p.controllerName?.trim() ||
    !p.contact?.trim() ||
    !p.notice.trim() ||
    !p.backupProcedure.trim()
  )
    return "정책 버전·책임 주체·문의처·고지 원문·백업 절차를 확정하세요.";
  if (
    PRIVACY_PURPOSES.some((k) => !p.rules[k].days || !p.rules[k].basis.trim())
  )
    return "목적별 보관기간과 근거·예외를 모두 확정하세요.";
  return null;
}
export function policyFingerprint(p: PrivacyPolicy): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        policyVersion: p.policyVersion,
        controllerName: p.controllerName,
        contact: p.contact,
        notice: p.notice,
        backupProcedure: p.backupProcedure,
        rules: PRIVACY_PURPOSES.map((k) => [
          k,
          p.rules[k].days,
          p.rules[k].basis,
        ]),
        photoRule: p.photoRule ?? null,
        photoNotice: p.photoNotice ?? "",
      }),
    )
    .digest("hex");
}
export function publicationPolicyIssue(
  p: PrivacyPolicy | undefined,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const issue = policyCompletionIssue(p);
  if (issue) return issue;
  if (p?.status !== "approved") return "운영 개인정보 정책이 아직 초안입니다.";
  if (env.EVENT_HUB_PRODUCTION_RELEASE !== "approved-v6")
    return "기존 사이트 운영 반영·모집 공개 승인이 아직 설정되지 않았습니다.";
  if (env.EVENT_HUB_RELEASE_POLICY_SHA256 !== policyFingerprint(p))
    return "승인한 정책 지문과 현재 정책이 다릅니다. 재검토 전 신규 접수를 차단합니다.";
  return null;
}
export async function publicationBlockedForTx(tx: HubTx): Promise<boolean> {
  if (!productionHubBlocked()) return false;
  return (
    publicationPolicyIssue(
      await tx.get<PrivacyPolicy>("settings", "privacy-policy"),
    ) !== null
  );
}
export async function photoPublicationBlockedForTx(
  tx: HubTx,
): Promise<boolean> {
  if (!productionHubBlocked()) return false;
  const p = await tx.get<PrivacyPolicy>("settings", "privacy-policy");
  return (
    publicationPolicyIssue(p) !== null ||
    process.env.EVENT_HUB_PHOTO_RELEASE !== "approved-photo" ||
    !p?.photoRule?.days ||
    !p.photoRule.basis.trim() ||
    !p.photoNotice?.trim()
  );
}
export function publicPolicyNotice(p: PrivacyPolicy | undefined) {
  if (!p || p.status !== "approved" || policyCompletionIssue(p))
    return undefined;
  return {
    policyVersion: p.policyVersion,
    controllerName: p.controllerName,
    contact: p.contact,
    notice: p.notice,
    periods: PRIVACY_PURPOSES.map((purpose) => ({
      purpose,
      days: p.rules[purpose].days,
    })),
    fingerprint: policyFingerprint(p),
  };
}
