import { z } from "zod";
export const PRIVACY_PURPOSES = [
  "application",
  "finance",
  "member",
  "inquiry",
  "audit",
  "recovery",
  "backup",
] as const;
export type PrivacyPurpose = (typeof PRIVACY_PURPOSES)[number];
const Rule = z.object({
  days: z.number().int().min(1).max(3650).nullable(),
  basis: z.string().trim().max(2000),
});
export const PrivacyPolicyInput = z.object({
  status: z.literal("draft"),
  policyVersion:z.string().trim().max(100).optional(),
  controllerName:z.string().trim().max(200).optional(),
  contact:z.string().trim().max(300).optional(),
  photoRule:Rule.optional(),
  photoNotice:z.string().trim().max(4000).optional(),
  notice: z.string().trim().max(10000),
  backupProcedure: z.string().trim().max(4000),
  rules: z.object({
    application: Rule,
    finance: Rule,
    member: Rule,
    inquiry: Rule,
    audit: Rule,
    recovery: Rule,
    backup: Rule,
  }),
});
export type PrivacyPolicy = Omit<z.infer<typeof PrivacyPolicyInput>,"status"> & {
  status:"draft"|"approved";
  approvedAt?:string;
  publicationFingerprint?:string;
  revision: number;
  updatedAt?: string;
  history?: { at: string; actor: string; action: string; reason?: string }[];
};
export const DEFAULT_PRIVACY_POLICY: PrivacyPolicy = {
  revision: 0,
  status: "draft",
  notice:
    "운영 주체·목적별 보관기간·법정 예외·백업 파기 절차는 검토 중입니다. 실제 개인정보 수집 전 고지 원문을 확정해야 합니다.",
  backupProcedure: "",
  rules: Object.fromEntries(
    PRIVACY_PURPOSES.map((p) => [p, { days: null, basis: "" }]),
  ) as PrivacyPolicy["rules"],
};
export type PrivacyCase = {
  id: string;
  revision: number;
  status: "requested" | "hold" | "reviewed" | "cancelled" | "completed";
  createdAt: string;
  updatedAt: string;
  publicMessage?: string;
  identityConfirmed?: boolean;
  history: { at: string; actor: string; action: string; reason?: string }[];
};
export type PrivacySnapshot = {
  owner: string;
  caseRevision: number;
  hold?: { reason: string; until?: string };
  applications: {
    id: string;
    revision: number;
    eventEnd: string;
    financeAt?: string;
    paid: boolean;
    publicProfile: boolean;
  }[];
  member?: { id: string; lastAt: string };
  thread?: { id: string; lastAt: string };
  receiptIds: string[];
  errorIds: string[];
};
export type PrivacyPlan = {
  owner: string;
  policyRevision: number;
  createdAt: string;
  fingerprint: string;
  blocked: string[];
  items: {
    purpose: PrivacyPurpose;
    kind: string;
    id: string;
    action: "keep" | "minimize" | "erase" | "external-review";
    reason: string;
  }[];
};
/** No law or retention period is invented. Null/unknown policy always blocks execution. */
export function draftPrivacyPlan(
  s: PrivacySnapshot,
  p: PrivacyPolicy,
  now: Date,
): Omit<PrivacyPlan, "fingerprint"> {
  const blocked = [
    "운영 보관·파기 정책이 검토 초안입니다. 운영 파기는 승인 전 실행하지 않습니다.",
  ];
  if (s.hold && (!s.hold.until || Date.parse(s.hold.until) > now.getTime()))
    blocked.push("관리자 보관 보류가 설정되어 있습니다.");
  if (!p.backupProcedure.trim())
    blocked.push("백업·복제본 처리 절차가 미확정입니다.");
  const due = (purpose: PrivacyPurpose, at: string) => {
    const r = p.rules[purpose];
    if (!r.days || !r.basis.trim() || !Number.isFinite(Date.parse(at))) {
      if (!blocked.includes(`${purpose}: 보관기간·근거·기준일 확인 필요`))
        blocked.push(`${purpose}: 보관기간·근거·기준일 확인 필요`);
      return false;
    }
    return Date.parse(at) + r.days * 86400000 <= now.getTime();
  };
  const items: PrivacyPlan["items"] = [];
  for (const a of s.applications) {
    const operation = due("application", a.eventEnd),
      finance = !a.paid || due("finance", a.financeAt ?? "");
    items.push({
      purpose: "application",
      kind: "application",
      id: a.id,
      action: operation ? (finance ? "erase" : "minimize") : "keep",
      reason: operation
        ? finance
          ? "운영·금융 보관기간 경과 후보"
          : "프로필·연락정보 최소화 후보; 금융 기록 별도 보류"
        : "운영 보관기간 또는 근거 확인 필요",
    });
    if (a.publicProfile) {
      items.push({
        purpose: "application",
        kind: "onsite",
        id: a.id,
        action: "external-review",
        reason:
          "연결된 현장 프로필은 기존 운영 데이터 처리 승인이 별도로 필요합니다.",
      });
      blocked.push("연결된 현장 데이터의 처리 범위 확인 필요");
    }
  }
  if (s.member)
    items.push({
      purpose: "member",
      kind: "member",
      id: s.member.id,
      action: due("member", s.member.lastAt) ? "erase" : "keep",
      reason: "선택적 재사용 동의·최종 이용일·보유 근거 검토",
    });
  if (s.thread)
    items.push({
      purpose: "inquiry",
      kind: "thread",
      id: s.thread.id,
      action: due("inquiry", s.thread.lastAt) ? "erase" : "keep",
      reason: "문의 보관기간·분쟁 보류 검토",
    });
  for (const id of s.receiptIds)
    items.push({
      purpose: "recovery",
      kind: "request",
      id,
      action: "minimize",
      reason: "중복 방지 영수증의 개인정보 복사본 제거 후보",
    });
  for (const id of s.errorIds)
    items.push({
      purpose: "audit",
      kind: "error",
      id,
      action: "keep",
      reason: "오류·감사 보유 근거 검토",
    });
  items.push({
    purpose: "backup",
    kind: "backup",
    id: s.owner,
    action: "external-review",
    reason: "스냅샷·백업·복제본 파기 절차를 별도 확인해야 합니다.",
  });
  return {
    owner: s.owner,
    policyRevision: p.revision,
    createdAt: now.toISOString(),
    blocked: [...new Set(blocked)],
    items,
  };
}
