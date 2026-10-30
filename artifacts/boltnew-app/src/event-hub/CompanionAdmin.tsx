import { useState } from "react";
import { paymentSatisfied } from "../../../../lib/api-zod/src/event-campaign";
import type { HubController, HubState, PrivateApplication } from "../lib/event-hub-client";
import { applicationListStatus } from "./EventPresentation";
import { HubButton, HubCard, HubCheck, HubField, formatHubTime, inputClass } from "./HubUi";

type LinkRequest = NonNullable<HubState["companionLinkRequests"]>[number];
type Group = { id: string; eventId: string; sponsorOwner: string; members: PrivateApplication[] };

/** Event-scoped display groups only. Each person's existing approval remains separate. */
export function companionAdminGroups(applications: PrivateApplication[]): Group[] {
  const groups = new Map<string, Group>();
  for (const app of applications) {
    if (!app.sponsorOwner || app.erasedAt) continue;
    const id = `${app.eventId}:${app.sponsorOwner}`;
    if (!groups.has(id)) groups.set(id, { id, eventId: app.eventId, sponsorOwner: app.sponsorOwner, members: [] });
  }
  for (const group of groups.values()) {
    group.members = applications.filter(app => !app.erasedAt && app.eventId === group.eventId &&
      (app.sponsorOwner === group.sponsorOwner || (!app.sponsorOwner && app.owner === group.sponsorOwner)))
      .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER));
  }
  return [...groups.values()];
}

export function CompanionAdminGroups({ applications, events, onSelect }: {
  applications: PrivateApplication[];
  events: HubState["events"];
  onSelect: (id: string) => void;
}) {
  const groups = companionAdminGroups(applications);
  if (!groups.length) return null;
  return <HubCard>
    <h3 className="font-black">동반신청 · {groups.length}팀</h3>
    {groups.map(group => {
      const sponsor = group.members.find(app => app.owner === group.sponsorOwner && !app.sponsorOwner);
      const active = group.members;
      const quoted = active.filter(app => app.quote);
      const total = quoted.reduce((sum, app) => sum + (app.quote?.fee ?? 0), 0);
      const batches = [...new Set(group.members.map(app => app.combinedPaymentReport?.batchId).filter((id): id is string => !!id))];
      const event = events.find(e => e.id === group.eventId);
      return <details className="rounded-xl border p-3" key={group.id}>
        <summary className="cursor-pointer font-bold min-h-11 py-2">
          {sponsor?.basic.nickname ?? "대표 신청"} · {group.members.length}명 · 회비 합계 {total.toLocaleString()}원
          {quoted.length < active.length && ` · ${active.length - quoted.length}명 미확정`}
        </summary>
        <p className="text-xs">{event?.date} · {event?.title ?? group.eventId} · 승인 {active.filter(paymentSatisfied).length}/{active.length}명</p>
        <div className="grid gap-2 mt-2">
          {group.members.map(app => <div key={app.id} className="rounded-xl border p-3 space-y-2">
            <p className="font-bold">{app.basic.nickname} · 접수 {app.rank ?? "미정"}번 · {app.quote ? `${app.quote.fee.toLocaleString()}원` : "회비 미확정"}</p>
            <p className="text-sm">{applicationListStatus(app)}{app.companionSubmission && ` · ${app.companionSubmission.linkedAt ? "본인 연결 완료" : "본인 연결 대기"} · ${app.companionSubmission.personalConsentPending ? "본인 동의 대기" : "본인 동의 완료"}`}</p>
            <HubButton onClick={() => onSelect(app.id)}>{app.basic.nickname} 처리</HubButton>
          </div>)}
        </div>
        {batches.map(batchId => {
          const members = group.members.filter(app => app.combinedPaymentReport?.batchId === batchId);
          return <p className="text-xs mt-2" key={batchId}>합산 신고 대상 · {members.map(app => app.basic.nickname).join(" · ")} · 현재 회비 {members.reduce((sum, app) => sum + (app.quote?.fee ?? 0), 0).toLocaleString()}원 · 승인 개별 처리</p>;
        })}
      </details>;
    })}
  </HubCard>;
}

function LinkRequestEditor({ request, applications, event, hub }: {
  request: LinkRequest;
  applications: PrivateApplication[];
  event?: HubState["events"][number];
  hub: HubController;
}) {
  const [selection, setSelection] = useState<{ applicationId: string; applicationRevision: number; requestRevision: number; identityChecked: boolean } | null>(null);
  const selected = applications.find(app => app.id === selection?.applicationId);
  const candidates = applications.filter(app => app.eventId === request.eventId && !app.erasedAt &&
    app.companionSubmission && !app.companionSubmission.linkedAt && app.sponsorOwner !== request.owner && !app.profileId);
  const stale = !!selection && (!selected || selected.revision !== selection.applicationRevision || request.revision !== selection.requestRevision || !candidates.some(app => app.id === selected.id));
  const busy = hub.status === "saving" || hub.status === "checking";
  return <div className="rounded-xl border p-3 space-y-2">
    <p className="font-bold">요청 {request.id.slice(0, 8)}</p>
    <p className="text-xs">{event?.date} · {event?.title ?? request.eventId} · {formatHubTime(request.at)}</p>
    <HubField label={`연결할 친구 · ${request.id.slice(0, 8)}`}>
      <select className={inputClass} value={selection?.applicationId ?? ""} disabled={busy} onChange={e => {
        const app = candidates.find(candidate => candidate.id === e.target.value);
        setSelection(app ? { applicationId: app.id, applicationRevision: app.revision, requestRevision: request.revision, identityChecked: false } : null);
      }}>
        <option value="">친구 선택</option>
        {candidates.map(app => <option key={app.id} value={app.id}>{app.basic.nickname} · {app.basic.birthYear}년생 · {app.basic.location} · 접수 {app.rank ?? "미정"}번</option>)}
      </select>
    </HubField>
    {!candidates.length && <p className="text-sm">연결할 동반신청이 없습니다.</p>}
    {stale && <p role="alert">신청 정보가 바뀌었습니다. 다시 선택해 주세요.</p>}
    <fieldset disabled={busy || !selection || stale}>
      <HubCheck label="요청자 본인과 선택한 친구가 같은 사람임을 확인했습니다." checked={selection?.identityChecked ?? false} onChange={identityChecked => setSelection(current => current && ({ ...current, identityChecked }))} />
    </fieldset>
    <div className="flex flex-wrap gap-2">
      <HubButton disabled={busy || !selection?.identityChecked || stale} onClick={async () => {
        if (!selection || stale) return;
        if (await hub.mutate({ action: "admin.companion.link", target: request.id, revision: selection.requestRevision,
          data: { eventId: request.eventId, applicationId: selection.applicationId, applicationRevision: selection.applicationRevision, identityChecked: true } })) setSelection(null);
      }}>본인 연결</HubButton>
      {selection && <HubButton disabled={busy} onClick={() => setSelection(null)}>다시 선택</HubButton>}
    </div>
  </div>;
}

export function CompanionLinkRequests({ applications, hub }: { applications: PrivateApplication[]; hub: HubController }) {
  const eventIds = new Set(applications.map(app => app.eventId));
  const pending = (hub.state?.companionLinkRequests ?? []).filter(request => request.status === "pending" && eventIds.has(request.eventId));
  if (!pending.length) return null;
  return <HubCard>
    <h3 className="font-black">친구 본인 연결 · {pending.length}건</h3>
    {pending.map(request => <LinkRequestEditor key={request.id} request={request} applications={applications} event={hub.state?.events.find(e => e.id === request.eventId)} hub={hub} />)}
  </HubCard>;
}
