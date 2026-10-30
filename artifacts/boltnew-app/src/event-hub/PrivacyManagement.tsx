import { useState } from "react";
import {
  DEFAULT_PRIVACY_POLICY,
  APPROVED_PRIVACY_RETENTION_NOTICE,
  APPROVED_PRIVACY_RETENTION_RULES,
  APPROVED_REWARD_PHONE_RULE,
  PRIVACY_PURPOSES,
  type PrivacyPolicy,
  type PrivacyPlan,
  type PrivacyPurpose,
} from "../../../../lib/api-zod/src/event-hub-privacy";
import type { HubController, HubState } from "../lib/event-hub-client";
import { ApprovedRetentionSummary } from "./PrivacyNotice";
import {
  HubButton,
  HubCard,
  HubCheck,
  HubField,
  formatHubTime,
  inputClass,
} from "./HubUi";
const labels: Record<PrivacyPurpose, string> = {
  application: "신청·행사 운영",
  finance: "입금·정산·분쟁",
  member: "재사용 회원",
  inquiry: "관리자 문의",
  audit: "운영·오류 감사",
  recovery: "세션·복구·저장 영수증",
  backup: "백업·복제본",
  rewardPhone: "상품·상금 수령 전화번호",
};
function editablePolicySignature(policy: PrivacyPolicy) {
  return JSON.stringify({
    fields: [policy.policyVersion, policy.controllerName, policy.contact, policy.notice, policy.backupProcedure, policy.photoNotice],
    rules: PRIVACY_PURPOSES.map(purpose => [purpose, policy.rules[purpose].days, policy.rules[purpose].basis]),
    photo: policy.photoRule ? [policy.photoRule.days, policy.photoRule.basis] : null,
    rewardPhone: policy.rewardPhoneRule ? [policy.rewardPhoneRule.days, policy.rewardPhoneRule.basis] : null,
  });
}
export function PrivacyManagement({ hub }: { hub: HubController }) {
  const [policy, setPolicy] = useState<PrivacyPolicy>(
      hub.state?.privacyPolicy ?? DEFAULT_PRIVACY_POLICY,
    ),
    [plan, setPlan] = useState<PrivacyPlan | null>(null);
  const unsaved = editablePolicySignature(policy) !== editablePolicySignature(hub.state?.privacyPolicy ?? DEFAULT_PRIVACY_POLICY);
  return (
    <div className="space-y-4">
      <HubCard>
        <h3 className="font-black">목적별 보관·파기 정책</h3>
        <p className="text-sm">{policy.status === "approved" ? "저장된 정책 확정됨" : "정책 검토 중"} · 모집 공개와 실제 삭제는 별도 승인입니다.</p>
        <details className="rounded-xl border p-3" open>
          <summary className="font-bold cursor-pointer">승인된 보관 기준 6가지</summary>
          <div className="space-y-3 pt-3"><ApprovedRetentionSummary />
            <HubButton disabled={hub.status === "saving" || hub.status === "checking"} onClick={() => setPolicy({
              ...policy, status: "draft", approvedAt: undefined, publicationFingerprint: undefined,
              notice: APPROVED_PRIVACY_RETENTION_NOTICE,
              rules: { ...policy.rules, ...APPROVED_PRIVACY_RETENTION_RULES },
              rewardPhoneRule: { ...APPROVED_REWARD_PHONE_RULE },
            })}>승인 기준 불러오기</HubButton>
            <p className="text-xs">편집값만 바꿉니다. 저장·모집·삭제는 실행하지 않습니다. 백업·감사·복구 기준은 기존 값 또는 미확정으로 유지합니다.</p>
          </div>
        </details>
        {(['policyVersion','controllerName','contact'] as const).map((field,i)=><HubField key={field} label={['정책 버전','운영 책임 주체','개인정보 문의처'][i]}><input className={inputClass} value={policy[field]??''} maxLength={field==='policyVersion'?100:field==='contact'?300:200} onChange={e=>setPolicy({...policy,[field]:e.target.value})}/></HubField>)}
        {policy.publicationFingerprint&&<p className="text-xs break-all">확정 정책 지문: {policy.publicationFingerprint}</p>}

        <HubField label="개인정보 고지 원문 초안">
          <textarea
            className={inputClass}
            rows={5}
            value={policy.notice}
            onChange={(e) => setPolicy({ ...policy, notice: e.target.value })}
          />
        </HubField>
        <details><summary className="cursor-pointer font-bold py-2">목적별 저장값 편집</summary><div className="space-y-3">
        {PRIVACY_PURPOSES.map((p) => (
          <fieldset key={p} className="border rounded-xl p-3 space-y-2">
            <legend className="text-sm font-bold">{labels[p]}</legend>
            <HubField
              label={`${labels[p]} 보유기간 초안 (일, 미확정이면 비움)`}
            >
              <input
                className={inputClass}
                type="number"
                min={1}
                max={3650}
                value={policy.rules[p].days ?? ""}
                onChange={(e) =>
                  setPolicy({
                    ...policy,
                    rules: {
                      ...policy.rules,
                      [p]: {
                        ...policy.rules[p],
                        days: e.target.value ? Number(e.target.value) : null,
                      },
                    },
                  })
                }
              />
            </HubField>
            <HubField label={`${labels[p]} 목적·근거·예외`}>
              <textarea
                className={inputClass}
                value={policy.rules[p].basis}
                onChange={(e) =>
                  setPolicy({
                    ...policy,
                    rules: {
                      ...policy.rules,
                      [p]: { ...policy.rules[p], basis: e.target.value },
                    },
                  })
                }
              />
            </HubField>
          </fieldset>
        ))}
        <fieldset className="border rounded-xl p-3 space-y-2">
          <legend className="text-sm font-bold">실제 상품·상금 수령 전화번호</legend>
          <p className="text-sm">지급·정산 확인 후 원칙적으로 30일 안에 삭제. 일반 신청·승인·입장에는 수집하지 않습니다.</p>
          <HubField label="수령 전화번호 보관기간 (일)"><input className={inputClass} type="number" min={1} max={3650} value={policy.rewardPhoneRule?.days ?? ""} onChange={e => setPolicy({ ...policy, rewardPhoneRule: { days: e.target.value ? Number(e.target.value) : null, basis: policy.rewardPhoneRule?.basis ?? "" } })} /></HubField>
          <HubField label="수령 전화번호 목적·기준일·예외"><textarea className={inputClass} value={policy.rewardPhoneRule?.basis ?? ""} onChange={e => setPolicy({ ...policy, rewardPhoneRule: { days: policy.rewardPhoneRule?.days ?? null, basis: e.target.value } })} /></HubField>
        </fieldset>
        </div></details>
        <HubField label="백업·스냅샷·복제본 파기 절차 초안">
          <textarea
            className={inputClass}
            rows={3}
            value={policy.backupProcedure}
            onChange={(e) =>
              setPolicy({ ...policy, backupProcedure: e.target.value })
            }
          />
        </HubField>
        <details><summary>사진 수집을 별도 승인할 때만 작성</summary><HubField label="사진 보관기간 초안 (일)"><input className={inputClass} type="number" min={1} max={3650} value={policy.photoRule?.days??''} onChange={e=>setPolicy({...policy,photoRule:{days:e.target.value?Number(e.target.value):null,basis:policy.photoRule?.basis??''}})}/></HubField><HubField label="사진 수집·보관 근거와 예외"><textarea className={inputClass} value={policy.photoRule?.basis??''} onChange={e=>setPolicy({...policy,photoRule:{days:policy.photoRule?.days??null,basis:e.target.value}})}/></HubField><HubField label="사진 별도 동의 고지 원문"><textarea className={inputClass} value={policy.photoNotice??''} onChange={e=>setPolicy({...policy,photoNotice:e.target.value})}/></HubField></details>
        <div className="flex flex-wrap gap-2">
          <HubButton
            disabled={hub.status === "saving"}
            onClick={async () => {
              if (
                await hub.mutate({
                  action: "admin.privacy.policy",
                  revision: policy.revision,
                  data: { ...policy, status: "draft" },
                })
              )
                setPolicy({ ...policy, status:"draft",approvedAt:undefined,publicationFingerprint:undefined,revision: policy.revision + 1 });
            }}
          >
            정책 초안 저장
          </HubButton>
          <HubButton disabled={unsaved||hub.status==="saving"||hub.status==="checking"||policy.status==="approved"} onClick={async()=>{if(unsaved)return;if(!window.confirm('저장된 최신 정책 원문·모든 목적별 기간·백업 절차를 확정했습니까? 정책 확정만 기록하며 모집·사진·파기를 켜지 않습니다.'))return;const r=await hub.mutate({action:'admin.privacy.policy.approve',revision:policy.revision,data:{confirmed:true}});if(r)setPolicy({...policy,status:'approved',revision:policy.revision+1,publicationFingerprint:String(r.policyFingerprint)});}}>저장된 정책 확정 기록 (모집은 별도 승인)</HubButton>
          <HubButton
            onClick={() =>
              setPolicy(hub.state?.privacyPolicy ?? DEFAULT_PRIVACY_POLICY)
            }
          >
            서버 최신 초안 불러오기
          </HubButton>
        </div>
        {unsaved && <p className="text-sm" role="status">편집한 정책을 먼저 저장해야 확정할 수 있습니다.</p>}
      </HubCard>
      {(hub.state?.owners ?? [])
        .filter((o) => o.privacyCase)
        .map((o) => (
          <PrivacyCaseCard
            key={o.id}
            owner={o}
            state={hub.state!}
            hub={hub}
            showPlan={setPlan}
          />
        ))}
      {plan && (
        <HubCard>
          <h3 className="font-black">파기 계획 미리보기 · 실행 없음</h3>
          <p className="text-xs">
            정책 버전 {plan.policyRevision} · 생성{" "}
            {formatHubTime(plan.createdAt)}
          </p>
          <ul className="text-sm text-amber-800">
            {plan.blocked.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th>목적</th>
                  <th>검토 동작</th>
                  <th>사유</th>
                </tr>
              </thead>
              <tbody>
                {plan.items.map((i, n) => (
                  <tr className="border-t" key={n}>
                    <td className="p-2">{labels[i.purpose]}</td>
                    <td className="p-2">
                      {
                        {
                          keep: "보관 검토",
                          minimize: "정보 최소화 후보",
                          erase: "파기 후보",
                          "external-review": "별도 검토",
                        }[i.action]
                      }
                    </td>
                    <td className="p-2">{i.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs">
            계획 확인번호 {plan.fingerprint.slice(0, 16)} · 원본 변경 시 다시
            생성해야 합니다.
          </p>
        </HubCard>
      )}
    </div>
  );
}
function PrivacyCaseCard({
  owner: o,
  state,
  hub,
  showPlan,
}: {
  owner: NonNullable<HubState["owners"]>[number];
  state: HubState;
  hub: HubController;
  showPlan: (p: PrivacyPlan) => void;
}) {
  const [reason, setReason] = useState(""),
    [publicMessage, setPublicMessage] = useState(
      o.privacyCase?.publicMessage ?? "",
    ),
    [identified, setIdentified] = useState(false);
  const act = (status: "hold" | "reviewed") =>
    hub.mutate({
      action: "admin.privacy.review",
      target: o.id,
      revision: o.privacyCase?.revision,
      data: { status, reason, publicMessage, identityConfirmed: identified },
    });
  return (
    <HubCard>
      <h3 className="font-black">
        개인정보 요청 ·{" "}
        {state.applications.find((a) => a.owner === o.id)?.basic.nickname ??
          "신청 전 문의자"}
      </h3>
      <p>
        상태: {o.privacyCase?.status} · 요청{" "}
        {formatHubTime(o.privacyCase?.createdAt)}
      </p>
      <HubCheck
        label="별도 절차로 요청자 본인 확인을 완료했습니다 (전화번호 일치만으로 확인 금지)"
        checked={identified}
        onChange={setIdentified}
      />
      <HubField label="관리자 검토·보관 보류 사유 (비공개)">
        <textarea
          className={inputClass}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </HubField>
      <HubField label="신청자에게 보여줄 처리 안내">
        <textarea
          className={inputClass}
          value={publicMessage}
          onChange={(e) => setPublicMessage(e.target.value)}
        />
      </HubField>
      <div className="flex flex-wrap gap-2">
        <HubButton disabled={!reason.trim()} onClick={() => act("hold")}>
          사유와 함께 검토 보류
        </HubButton>
        <HubButton
          disabled={!reason.trim() || !identified}
          onClick={() => act("reviewed")}
        >
          본인 확인·검토 완료 기록
        </HubButton>
        <HubButton
          onClick={async () => {
            const result = await hub.mutate({
              action: "admin.privacy.plan",
              target: o.id,
            });
            if (result?.plan) showPlan(result.plan as PrivacyPlan);
          }}
        >
          파기 후보·보류 사유 확인
        </HubButton>
        <HubButton
          disabled={!reason.trim()}
          onClick={() =>
            hub.mutate({
              action: "admin.privacy.hold",
              target: o.id,
              data: { enabled: !o.privacyHold, reason },
            })
          }
        >
          {o.privacyHold ? "보관 보류 해제" : "분쟁·보관 보류 설정"}
        </HubButton>
      </div>
      <ol className="text-xs space-y-1">
        {o.privacyCase?.history.map((h, i) => (
          <li key={i}>
            {formatHubTime(h.at)} · {h.action} · {h.reason ?? ""}
          </li>
        ))}
      </ol>
      <p className="text-xs">
        검토 완료는 삭제 실행 완료와 다릅니다. 운영 파기 실행 경로는 비활성
        상태입니다.
      </p>
    </HubCard>
  );
}
export function OwnerRecoveryControls({
  owner,
  hub,
}: {
  owner: NonNullable<HubState["owners"]>[number];
  hub: HubController;
}) {
  const [reason, setReason] = useState(""),
    [verified, setVerified] = useState(false),
    [code, setCode] = useState("");
  return (
    <details>
      <summary>회원 로그인 잠금 해제·확인된 신청 복구</summary>
      <div className="space-y-2 py-3">
        <p className="text-xs">
          잠금 만료: {formatHubTime(owner.loginLockedUntil)} · 복구코드를
          재발급하면 이전 코드는 사용할 수 없습니다.
        </p>
        <HubCheck
          label="별도 본인 확인 완료 (닉네임·전화번호만으로 복구 금지)"
          checked={verified}
          onChange={setVerified}
        />
        <HubField label="본인 확인·복구 처리 사유">
          <textarea
            className={inputClass}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </HubField>
        <div className="flex flex-wrap gap-2">
          <HubButton
            disabled={!verified || !reason.trim() || hub.status === "saving"}
            onClick={() =>
              hub.mutate({
                action: "admin.owner.unlock",
                target: owner.id,
                data: { identityConfirmed: verified, reason },
              })
            }
          >
            본인 확인 후 로그인 잠금 해제
          </HubButton>
          <HubButton
            disabled={!verified || !reason.trim() || hub.status === "saving"}
            onClick={async () => {
              const r = await hub.mutate({
                action: "admin.owner.recover",
                target: owner.id,
                data: { identityConfirmed: verified, reason },
              });
              if (r)
                setCode(
                  typeof r.recoveryCode === "string"
                    ? r.recoveryCode
                    : "응답이 유실되어 코드를 표시할 수 없습니다. 다시 발급해 주세요.",
                );
            }}
          >
            확인된 신청 복구코드 재발급
          </HubButton>
        </div>
        {code && (
          <div>
            <p className="text-sm">
              이 화면에서만 표시합니다. 본인 확인한 신청자에게 안전한 별도
              경로로 전달하세요. 문의·로그에 붙여넣지 마세요.
            </p>
            <output className="block break-all rounded-xl border p-3 select-all">
              {code}
            </output>
            <HubButton onClick={() => setCode("")}>표시 닫기</HubButton>
          </div>
        )}
      </div>
    </details>
  );
}
