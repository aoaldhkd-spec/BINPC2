import { useState } from "react";
import {
  campaignPresets,
  campaignQuote,
  tourSessionHours,
  paymentSatisfied,
} from "../../../../lib/api-zod/src/event-campaign";
import type {
  HubController,
  HubEvent,
  PrivateApplication,
} from "../lib/event-hub-client";
import { HubCard, HubButton, HubField, HubCheck, inputClass } from "./HubUi";
export function CampaignSetup({ hub }: { hub: HubController }) {
  const [key, setKey] = useState("halloween-2026-10-30");
  return (
    <HubCard>
      <h3 className="font-black">할로윈·전국투어 행사 준비</h3>
      <p className="text-sm">
        기존 방과 기록은 유지합니다. 선택한 1차 방 한 개를 접수 전 상태로
        만듭니다. 계좌·입금기한·주소·전국투어 선입금은 운영자가 확인 후
        입력하세요. 대구는 미확정이며 생성하지 않습니다.
      </p>
      <HubField label="생성할 행사 정책">
        <select
          className={inputClass}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        >
          {campaignPresets().map((p) => (
            <option key={p.key} value={p.key}>
              {p.event.date} {p.event.title}
            </option>
          ))}
        </select>
      </HubField>
      <HubButton
        disabled={hub.status === "saving"}
        onClick={() => hub.mutate({ action: "campaign.prepare", target: key })}
      >
        선택 행사·정해진 재고 준비
      </HubButton>
      <p className="text-xs">
        할로윈 금23·토49개, 총72개. 투어 금·토는 할인권10개·30,000원. 자동
        정산·현금 지급 없음. 매장 후보는 차수 배정이 아닙니다.
      </p>
    </HubCard>
  );
}
export function CampaignOperations({
  event,
  hub,
}: {
  event: HubEvent;
  hub: HubController;
}) {
  const [reason, setReason] = useState(""),
    [checked, setChecked] = useState(false),
    [bank, setBank] = useState(false);
  const apps =
    hub.state?.applications.filter((a) => a.eventId === event.id) ?? [];
  const confirmed = apps.filter((a) => a.attendance === "confirmed").length;
  const run = (action: string, data: Record<string, unknown> = {}) =>
    hub.mutate({
      action,
      target: event.id,
      revision: event.revision,
      data: {
        ...data,
        reason,
        confirmed: checked,
        bankAndContactReviewed: bank,
      },
    });
  return (
    <HubCard>
      <h3 className="font-black">행사 준비상태·선착순 승계</h3>
      <p>
        {event.campaign ? "BINPC2 1차 전용" : "일반 술번개"} · 확정 {confirmed}
        명 / 최소5명 ·{" "}
        {confirmed >= 5
          ? "개최 최소 인원 충족"
          : "개최 인원 미달 · 관리자 확인"}
      </p>
      {event.campaign && event.campaign.kind !== "tour" && (
        <details>
          <summary>확정 회비표 (운영자 확인용)</summary>
          {[1, 2, 3, 4, 5, 6, 10, 11, 15, 16].map((rank) => (
            <p key={rank}>
              {rank}등:{" "}
              {campaignQuote(
                event,
                rank,
                new Date(`${event.date}T20:59:59+09:00`),
              ).fee.toLocaleString()}
              원
            </p>
          ))}
        </details>
      )}
      {event.campaign?.kind === "tour" && (
        <p>
          1차 {tourSessionHours(event.date)?.first} · 2차{" "}
          {tourSessionHours(event.date)?.second} · 3차{" "}
          {tourSessionHours(event.date)?.third} (매장 차수 미배정)
        </p>
      )}
      <p>{event.campaign?.kind==='tour'?'2차는 운영자 오픈채팅, 3차는 현장 안내입니다.':'할로윈은 1차만 진행하며 다음 날 01:00에 종료합니다. 2차는 없습니다.'} 자동 정산·송금·환불은 하지 않습니다.</p>
      <p className="text-sm whitespace-pre-wrap">{event.replyNotice}</p>
      <HubField label="선착순 처리 사유">
        <textarea
          className={inputClass}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </HubField>
      <HubCheck
        label="관리자가 입금·연락 조건과 처리 대상을 확인했습니다"
        checked={checked}
        onChange={setChecked}
      />
      <HubCheck
        label="은행·연락 내역을 대조했습니다 (입금 신고/승인자 제외 시 필수)"
        checked={bank}
        onChange={setBank}
      />
      <fieldset
        disabled={!reason.trim() || !checked || hub.status === "saving"}
        className="space-y-3 min-w-0"
      >
        {apps.map((a) => (
          <div key={a.id} className="border-t py-2 space-y-2">
            <strong>
              {a.basic.nickname} · 원래 접수{a.rank}번 · 유효 혜택
              {a.benefitExcluded ? "제외" : (a.benefitRank ?? a.rank)}번
            </strong>
            <p>
              {a.payment} · {a.benefitContact ?? "연락상태 미표시"}
            </p>
            {a.differenceReview && (
              <p className="text-amber-800">
                차액 확인 필요: 기존{" "}
                {a.differenceReview.previous.toLocaleString()}원 → 제안{" "}
                {a.differenceReview.proposed.toLocaleString()}원. 자동 정산·금액
                변경 없음.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {[
                "대상 확인",
                "입금·연락 확인",
                "무응답",
                "입금 지연",
                a.benefitExcluded ? "restore" : "exclude",
              ].map((kind) => (
                <HubButton
                  key={kind}
                  onClick={() =>
                    run("campaign.priority", { applicationId: a.id, kind })
                  }
                >
                  {kind === "exclude"
                    ? "혜택 제외"
                    : kind === "restore"
                      ? "제외 취소·정정"
                      : kind}
                </HubButton>
              ))}
            </div>
          </div>
        ))}
        <HubButton onClick={() => run("campaign.succeed")}>
          확인 후 다음 신청자에게 혜택 승계
        </HubButton>
      </fieldset>
      <details>
        <summary>승계 내역 보기</summary>
        {event.history
          .filter((h) => h.action.startsWith("campaign."))
          .map((h, i) => (
            <p key={i}>
              {h.at} {h.action} {h.reason}
            </p>
          ))}
      </details>
    </HubCard>
  );
}
export function CampaignApproval({
  app,
  hub,
}: {
  app: PrivateApplication;
  hub: HubController;
}) {
  const [reason, setReason] = useState("");
  const event = hub.state?.events.find((e) => e.id === app.eventId);
  if (!event?.campaign) return null;
  const mutate = (action: string, data: Record<string, unknown> = {}) =>
    hub.mutate({ action, target: app.id, revision: app.revision, data });
  return (
    <div className="space-y-2">
      {event.campaign.kind !== "tour" && app.quote?.fee === 0 && (
        <HubButton
          disabled={
            !!app.waivedAt || paymentSatisfied(app) || hub.status === "saving"
          }
          onClick={() => {
            if (
              window.confirm(
                "은행 입금 승인이 아닌 무료 참가 승인입니다. 유효1등·금액0원을 확인했습니까?",
              )
            )
              void mutate("admin.application.free");
          }}
        >
          무료 참가 승인
        </HubButton>
      )}
      {app.waivedAt && <p>무료 참가 승인 완료 · 은행 입금으로 기록하지 않음</p>}
      {app.eligibility && (
        <>
          <p>사전 참가 검토: {app.eligibility.status}</p>
          <HubField label="사전 검토 사유 (관리자 기록)">
            <input
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </HubField>
          <div className="flex gap-2">
            <HubButton
              disabled={!reason.trim()}
              onClick={() =>
                mutate("admin.application.eligibility", {
                  status: "approved",
                  reason,
                  message: "참가 사전 검토가 승인되었습니다.",
                })
              }
            >
              사전 검토 승인
            </HubButton>
            <HubButton
              disabled={!reason.trim()}
              onClick={() =>
                mutate("admin.application.eligibility", {
                  status: "declined",
                  reason,
                  message: "관리자에게 참가 조건을 문의해 주세요.",
                })
              }
            >
              참가 불가 안내
            </HubButton>
          </div>
        </>
      )}
    </div>
  );
}
