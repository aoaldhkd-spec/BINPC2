import { useState } from "react";
import { HALLOWEEN_RECOGNITION_LABELS, type HalloweenRecognitionKind } from "../../../../lib/api-zod/src/event-policy-halloween";
import type { HubController, PrivateApplication } from "../lib/event-hub-client";
import { HubButton, HubField, inputClass, formatHubTime } from "./HubUi";

export function HalloweenRecognitionNotice({ app }: { app: PrivateApplication }) {
  if (!app.halloweenRecognition) return null;
  return <p className="text-sm">
    분장 혜택 확인 ({formatHubTime(app.halloweenRecognition.at)}): {app.halloweenRecognition.participantNotice}
  </p>;
}

export function HalloweenRecognitionAdmin({ app, hub }: { app: PrivateApplication; hub: HubController }) {
  const [kind, setKind] = useState<HalloweenRecognitionKind>(app.halloweenRecognition?.kind ?? "none");
  const [reason, setReason] = useState("");
  const event = hub.state?.events.find(e => e.id === app.eventId);
  if (!event?.campaign?.kind.startsWith("halloween-")) return null;
  return <details>
    <summary>코스튬·페인팅·스티커 인정</summary>
    <div className="space-y-2 mt-3">
      <p className="text-sm">운영자 인정 시 코스튬 15,000원, 페인팅·스티커 18,000원과 유효한 선착순·신청 시각 회비 중 가장 낮은 금액 한 가지만 적용합니다. 1등 무료는 0원으로 유지합니다.</p>
      <p className="text-sm">이미 신청을 확정했거나 입금을 신고·승인한 금액은 유지하고 차액을 별도 검토합니다.</p>
      <HalloweenRecognitionNotice app={app} />
      <HubField label="운영자 분장 인정">
        <select className={inputClass} value={kind} onChange={e => setKind(e.target.value as HalloweenRecognitionKind)}>
          {Object.entries(HALLOWEEN_RECOGNITION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </HubField>
      <HubField label="분장 인정·변경 사유">
        <textarea className={inputClass} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
      </HubField>
      <HubButton disabled={!reason.trim() || hub.status === "saving" || hub.status === "checking"}
        onClick={() => hub.mutate({action:"admin.application.costume",target:app.id,revision:app.revision,data:{kind,reason}})}>
        인정 결과·회비 안내 저장
      </HubButton>
    </div>
  </details>;
}
