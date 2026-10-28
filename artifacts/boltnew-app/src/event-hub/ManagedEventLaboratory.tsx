import { useState } from "react";
import { campaignPresets } from "../../../../lib/api-zod/src/event-campaign";
import { HubEventInput } from "../../../../lib/api-zod/src/event-hub";
import type { HubEvent } from "../lib/event-hub-client";
import { EventLaboratory } from "./EventLaboratory";
import { HubCard, HubField, inputClass } from "./HubUi";
import type { TestModeController } from "./test-mode-client";

export function ManagedEventLaboratory({ event, controller }: { event?: HubEvent; controller: TestModeController }) {
  const [scenario, setScenario] = useState("");
  const { data, busy, error, epoch, write } = controller;
  const scenarios = campaignPresets().filter(p => p.event.campaign.kind !== "tour" || [5, 6].includes(new Date(p.event.date + "T12:00:00+09:00").getUTCDay()));
  const preset = scenarios.find(p => p.key === scenario);
  const selected: HubEvent | undefined = preset ? {
    ...HubEventInput.parse(preset.event), id: preset.key, revision: 1,
    recruitment: true, nextRank: 0, history: [],
  } : event;
  const workspaceId = (selected?.id ?? "default").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
  if (!data) return <HubCard>관리자 테스트 상태를 확인한 뒤 시험실을 사용할 수 있습니다.</HubCard>;
  if (!data.mode.enabled) return <HubCard>시험실을 사용하려면 테스트 모드를 ON으로 전환하세요.</HubCard>;
  return <>
    <HubField label="반복 테스트 시나리오">
      <select className={inputClass} value={scenario} disabled={busy} onChange={e => setScenario(e.target.value)}>
        <option value="">{event ? "선택 행사의 규칙으로 테스트" : "일반 선착순 테스트"}</option>
        {scenarios.map(p => <option key={p.key} value={p.key}>{p.event.date} · {p.event.title} · {new Date(p.event.date + "T12:00:00+09:00").getUTCDay() === 5 ? "금요일" : "토요일"}</option>)}
      </select>
    </HubField>
    <EventLaboratory key={`${workspaceId}:${data.mode.generation}:${epoch}`} event={selected} persistence={{
      snapshot: data.workspaces[workspaceId],
      disabled: busy || !!error,
      save: snapshot => write({ operation: "save", workspaceId, snapshot }, data.mode.generation),
    }} />
  </>;
}
