import { APPROVED_PRIVACY_RETENTION_SUMMARY } from "../../../../lib/api-zod/src/event-hub-privacy";
import type { HubState } from "../lib/event-hub-client";

export function ApprovedRetentionSummary() {
  return <dl className="space-y-2 text-sm">
    {APPROVED_PRIVACY_RETENTION_SUMMARY.map(item => <div key={item.id}>
      <dt className="font-bold">{item.label}</dt><dd>{item.period}</dd>
    </div>)}
  </dl>;
}

export function PublicPrivacyNotice({ notice }: { notice?: HubState["privacyNotice"] }) {
  const remaining = notice?.periods.filter(period => ["audit", "recovery", "backup"].includes(period.purpose)) ?? [];
  return <div className="py-3 space-y-3">
    <p>신청·참가 관리와 입금 확인을 위해 닉네임·출생연도·지역·입금자명을 수집합니다. 일반 신청·승인·입장에는 전화번호를 받지 않습니다.</p>
    <ApprovedRetentionSummary />
    {notice ? <details>
      <summary>운영자·문의처와 저장된 고지</summary>
      <div className="space-y-2 pt-2">
        <p>{notice.controllerName} · 문의 {notice.contact}</p>
        <p className="whitespace-pre-wrap">{notice.notice}</p>
        {remaining.length > 0 && <ul>{remaining.map(period => <li key={period.purpose}>
          {({ audit: "운영 감사", recovery: "세션·복구", backup: "백업·복제본" } as Record<string, string>)[period.purpose]}: {period.days === null ? "미확정" : `${period.days}일`}
        </li>)}</ul>}
        <p className="text-xs">정책 버전 {notice.policyVersion}</p>
      </div>
    </details> : <p className="text-xs">운영자·문의처 등 최종 고지는 공개 전에 확정합니다. 백업·감사·복구 기록의 보관 기준은 별도 확인이 필요합니다.</p>}
    <p>필수 수집에 동의하지 않으면 신청할 수 없습니다. 현장 공개 프로필은 입장 승인 후에만 생성합니다.</p>
  </div>;
}
