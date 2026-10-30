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
export type PrivacyPurpose = (typeof PRIVACY_PURPOSES)[number] | "rewardPhone";
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
  rewardPhoneRule: Rule.optional(),
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
/** Operator-approved purposes only. Applying these does not approve publication or disposal. */
export const APPROVED_PRIVACY_RETENTION_SUMMARY = [
  {id:"onsite",label:"현장 프로필·하트·채팅",period:"기존 행사 주기의 익일 17시 초기화"},
  {id:"application",label:"행사 신청·참가",period:"행사 종료 후 30일"},
  {id:"finance",label:"입금·정산·상품 지급 증빙",period:"최종 입금·정산·지급 확인 후 180일. 실제 법적 의무·분쟁 보류 우선"},
  {id:"inquiry",label:"운영자 1:1 문의",period:"처리 완료 후 90일. 다시 열린 문의는 완료 후부터 계산"},
  {id:"member",label:"본인 재사용 프로필",period:"최종 이용 후 1년 또는 재사용 동의 철회 시 삭제"},
  {id:"rewardPhone",label:"상품·상금 지급용 전화번호",period:"지급·정산 확인 후 원칙 30일 이내 삭제"},
] as const;
export const APPROVED_PRIVACY_RETENTION_NOTICE=APPROVED_PRIVACY_RETENTION_SUMMARY.map(v=>`${v.label}: ${v.period}`).join("\n");
export const APPROVED_PRIVACY_RETENTION_RULES={
  application:{days:30,basis:"행사 종료 후 30일. 신청·참가 처리 목적; 금융 증빙은 별도 보관."},
  finance:{days:180,basis:"최종 입금·정산·상품 지급 확인 후 180일. 실제 법적 의무와 분쟁 보류가 우선하며 근거 없는 법정기간을 추가하지 않음."},
  member:{days:365,basis:"본인 재사용 프로필의 최종 이용 후 1년 또는 동의 철회. 행사 신청·입금 이력과 분리."},
  inquiry:{days:90,basis:"운영자 1:1 문의 처리 완료 후 90일. 미처리·재개 문의는 완료 전 파기하지 않음."},
} as const;
export const APPROVED_REWARD_PHONE_RULE={days:30,basis:"실제 상품·상금 지급·정산 확인 후 원칙 30일 이내 삭제. 일반 신청·입장·할인에 전화번호를 요구하지 않음."} as const;
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
  basicDrafts?: { id: string; revision: number; updatedAt: string;eventEnd?:string }[];
  caseRevision: number;
  hold?: { reason: string; until?: string };
  applications: {
    id: string;
    revision: number;
    eventEnd: string;
    financeAt?: string;
    paid: boolean;
    publicProfile: boolean;
    erasedAt?:string;
    rewardPhone?:{confirmedAt?:string};
  }[];
  member?: { id: string; lastAt: string };
  thread?: { id: string; lastAt: string;status?:"open"|"resolved";resolvedAt?:string };
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
  const blocked = p.status==="approved"?[]:["운영 보관·파기 정책이 검토 초안입니다. 운영 파기는 승인 전 실행하지 않습니다."];
  const held=!!s.hold&&(!s.hold.until||!Number.isFinite(Date.parse(s.hold.until))||Date.parse(s.hold.until)>now.getTime());
  if (held)
    blocked.push("관리자 보관 보류가 설정되어 있습니다.");
  if (!p.backupProcedure.trim())
    blocked.push("백업·복제본 처리 절차가 미확정입니다.");
  for(const purpose of PRIVACY_PURPOSES)if(!p.rules[purpose]?.days||!p.rules[purpose].basis.trim())blocked.push(`${purpose}: 보관기간·근거 확인 필요`);
  const due = (purpose: PrivacyPurpose, at: string) => {
    const r = purpose==="rewardPhone"?p.rewardPhoneRule:p.rules[purpose];
    if (!r?.days || !r.basis.trim() || !Number.isFinite(Date.parse(at))) {
      if (!blocked.includes(`${purpose}: 보관기간·근거·기준일 확인 필요`))
        blocked.push(`${purpose}: 보관기간·근거·기준일 확인 필요`);
      return false;
    }
    return Date.parse(at) + r.days * 86400000 <= now.getTime();
  };
  const items: PrivacyPlan["items"] = [];
  for (const d of s.basicDrafts ?? []) items.push({
    purpose: "application", kind: "basic-draft", id: d.id,
    action: due("application", d.eventEnd??"") ? "erase" : "keep",
    reason: "작성 중 기본정보 · 해당 행사 종료일과 목적별 보관 근거 검토",
  });
  for (const a of s.applications) {
    const operation = due("application", a.eventEnd),
      finance = !a.paid || due("finance", a.financeAt ?? ""),
      phone = !a.rewardPhone || due("rewardPhone",a.rewardPhone.confirmedAt??"");
    items.push({
      purpose: "application",
      kind: "application",
      id: a.id,
      action: operation ? (finance&&phone ? "erase" : a.erasedAt ? "keep":"minimize") : "keep",
      reason: operation
        ? finance&&phone
          ? "운영·금융 보관기간 경과 후보"
          : "신청 정보 최소화 후보; 금융 증빙·지급 연락처는 각 목적의 만료일을 별도 확인"
        : "운영 보관기간 또는 근거 확인 필요",
    });
    if(a.rewardPhone)items.push({purpose:"rewardPhone",kind:"reward-phone",id:a.id,action:phone?"erase":"keep",reason:"상품·상금 지급·정산 확인일 기준. 지급·신청 기록은 보존하고 전화번호만 삭제"});
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
      action: s.thread.status==="resolved"&&due("inquiry",s.thread.resolvedAt??"") ? "erase" : "keep",
      reason: "문의 처리 완료일 기준. 미처리·재개 문의와 분쟁 보류는 보존",
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
    items:held?items.map(item=>({...item,action:item.action==="external-review"?item.action:"keep",reason:`보관 보류 우선 · ${item.reason}`})):items,
  };
}
