import { useEffect, useState } from "react";
import { canRequestRewardContact } from "../../../../lib/api-zod/src/event-reward-contact";
import type { HubController, HubEvent, PrivateApplication } from "../lib/event-hub-client";
import { HubButton, HubCheck, HubField, inputClass } from "./HubUi";

export function RewardReceiptContact({ app, event, hub }: { app: PrivateApplication; event: HubEvent; hub: HubController }) {
  const [phone, setPhone] = useState(app.rewardPhone ?? "");
  const [accepted, setAccepted] = useState(false);
  useEffect(() => setAccepted(false), [app.rewardPhoneRequest?.requestedAt]);
  const request = app.rewardPhoneRequest;
  if (!request || !canRequestRewardContact(app, request.source, request.resultId, event.campaign?.kind)) return null;
  const busy = hub.status === "saving" || hub.status === "checking";
  return <div className="rounded-xl border p-3 space-y-2">
    <h4 className="font-bold">상품·상금 수령 연락처</h4>
    <p className="text-sm">{request.purpose}</p>
    <HubField label="수령 연락처 (선택)"><input type="tel" inputMode="tel" autoComplete="tel" className={inputClass} value={phone} onChange={e => setPhone(e.target.value)} /></HubField>
    <HubCheck checked={accepted} onChange={setAccepted} label="위 수령 목적의 연락처 이용에 동의합니다 (선택)" />
    <HubButton disabled={busy || !accepted || !phone.trim()} onClick={() => hub.mutate({ action: "application.phone", target: app.id, revision: app.revision, data: { phone, purposeAccepted: true } })}>{busy ? "저장 중…" : "연락처 저장"}</HubButton>
    {request.fulfilledAt && <p role="status" className="text-sm">연락처 저장 완료</p>}
  </div>;
}

export function RewardContactAdmin({ app, event, hub }: { app: PrivateApplication; event?: HubEvent; hub: HubController }) {
  const [selection, setSelection] = useState("");
  const [purpose, setPurpose] = useState("");
  const busy = hub.status === "saving" || hub.status === "checking";
  const options = [
    ...app.cards.filter(card => canRequestRewardContact(app, "card", card.id, event?.campaign?.kind)).map(card => ({ value: `card:${card.id}`, source: "card" as const, id: card.id, label: card.prizeLabel ?? "지급한 상품" })),
    ...(app.manualResults ?? []).filter(result => canRequestRewardContact(app, "result", result.id, event?.campaign?.kind)).map(result => ({ value: `result:${result.id}`, source: "result" as const, id: result.id, label: result.label })),
  ];
  const selected = options.find(option => option.value === selection);
  const request = app.rewardPhoneRequest;
  if (!options.length && !request) return null;
  return <details className="rounded-xl border p-3">
    <summary className="cursor-pointer font-bold py-2">수령 연락처 {request ? request.fulfilledAt ? "· 저장됨" : "· 요청 중" : "요청"}</summary>
    <div className="space-y-2 pt-2">
      {request && <>
        <p className="text-sm">이용 목적: {request.purpose}</p>
        {request.fulfilledAt && app.rewardPhone && canRequestRewardContact(app, request.source, request.resultId, event?.campaign?.kind) && <p className="text-sm">수령 연락처: {app.rewardPhone}</p>}
        <HubButton disabled={busy} onClick={() => hub.mutate({ action: "admin.application.phone-request", target: app.id, revision: app.revision, data: { cancel: true } })}>요청 종료</HubButton>
      </>}
      {!!options.length && <>
        <HubField label="지급한 상품·상금"><select className={inputClass} value={selection} onChange={e => setSelection(e.target.value)}><option value="">지급 기록 선택</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></HubField>
        <HubField label="연락처 이용 목적"><input className={inputClass} value={purpose} maxLength={200} onChange={e => setPurpose(e.target.value)} placeholder="예: 상품 배송 확인" /></HubField>
        <HubButton disabled={busy || !selected || purpose.trim().length < 2} onClick={async () => {
          if (!selected) return;
          if (await hub.mutate({ action: "admin.application.phone-request", target: app.id, revision: app.revision, data: { source: selected.source, resultId: selected.id, purpose } })) { setSelection(""); setPurpose(""); }
        }}>{busy ? "저장 중…" : "연락처 요청"}</HubButton>
      </>}
    </div>
  </details>;
}
