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

type LinkSelection = {
  requestRevision: number; identityChecked: boolean;
} & ({ kind: "application"; applicationId: string; applicationRevision: number } |
  { kind: "draft"; sponsorOwner: string; draftId: string; groupRevision: number });

type DraftCandidate = {
  key: string; sponsorOwner: string; draftId: string; groupRevision: number;
  nickname: string; birthYear: number; location: string; sponsorName: string;
};
function draftCandidates(request: LinkRequest, hub: HubController): DraftCandidate[] {
  return (hub.state?.owners ?? []).flatMap(owner => {
    if (owner.id === request.owner || owner.erasedAt || owner.restricted?.active) return [];
    const group = owner.companionDrafts?.[request.eventId];
    if (!group) return [];
    const sponsorName = hub.state?.applications.find(app => app.owner === owner.id && app.eventId === request.eventId && !app.erasedAt)?.basic.nickname ?? owner.basicDrafts?.[request.eventId]?.basic.nickname ?? "대표 작성자";
    return group.items.flatMap(draft => {
      if (draft.removedAt || draft.claimedAt || draft.applicationId || draft.submittedAt || !draft.basic.nickname?.trim() || !draft.basic.location?.trim() || !Number.isInteger(draft.basic.birthYear)) return [];
      const boundElsewhere = (hub.state?.companionLinkRequests ?? []).some(other => other.id !== request.id && other.status === "pending" && !other.cancelledAt && other.eventId === request.eventId && other.draftBinding?.sponsorOwner === owner.id && other.draftBinding.draftId === draft.id);
      if (boundElsewhere) return [];
      return [{ key: `draft:${owner.id}:${draft.id}`, sponsorOwner: owner.id, draftId: draft.id, groupRevision: group.revision,
        nickname: draft.basic.nickname, birthYear: draft.basic.birthYear!, location: draft.basic.location, sponsorName }];
    });
  });
}
function LinkRequestEditor({ request, applications, event, hub }: {
  request: LinkRequest;
  applications: PrivateApplication[];
  event?: HubState["events"][number];
  hub: HubController;
}) {
  const [selection, setSelection] = useState<LinkSelection | null>(null);
  const candidates = applications.filter(app => app.eventId === request.eventId && !app.erasedAt &&
    app.companionSubmission && !app.companionSubmission.linkedAt && app.sponsorOwner !== request.owner && !app.profileId);
  const drafts = draftCandidates(request, hub);
  const selectedApp = selection?.kind === "application" ? candidates.find(app => app.id === selection.applicationId) : undefined;
  const selectedDraft = selection?.kind === "draft" ? drafts.find(draft => draft.sponsorOwner === selection.sponsorOwner && draft.draftId === selection.draftId) : undefined;
  const stale = !!selection && (request.revision !== selection.requestRevision || (selection.kind === "application" ? !selectedApp || selectedApp.revision !== selection.applicationRevision : !selectedDraft || selectedDraft.groupRevision !== selection.groupRevision));
  const busy = hub.status === "saving" || hub.status === "checking";
  const bound = request.draftBinding;
  const boundDraft = bound && hub.state?.owners?.find(owner => owner.id === bound.sponsorOwner)?.companionDrafts?.[request.eventId]?.items.find(draft => draft.id === bound.draftId);
  return <div className="rounded-xl border p-3 space-y-2">
    <p className="font-bold">요청 {request.id.slice(0, 8)}</p>
    <p className="text-xs">{event?.date} · {event?.title ?? request.eventId} · {formatHubTime(request.at)}</p>
    {bound ? <>
      <p className="font-bold">{boundDraft?.basic.nickname ?? "친구"} · 계정 연결됨 · 신청 전</p>
      <p className="text-xs">신청 확정 전 · 순번 미정</p>
      <HubButton disabled={busy} onClick={() => hub.mutate({ action: "admin.companion.unlink-draft", target: request.id, revision: request.revision, data: { eventId: request.eventId } })}>계정 연결 해제</HubButton>
    </> : <>
      <HubField label={`연결할 친구 · ${request.id.slice(0, 8)}`}>
        <select className={inputClass} value={selection?.kind === "application" ? selection.applicationId : selectedDraft?.key ?? ""} disabled={busy} onChange={e => {
          const app = candidates.find(candidate => candidate.id === e.target.value);
          const draft = drafts.find(candidate => candidate.key === e.target.value);
          setSelection(app ? { kind: "application", applicationId: app.id, applicationRevision: app.revision, requestRevision: request.revision, identityChecked: false } : draft ? { kind: "draft", sponsorOwner: draft.sponsorOwner, draftId: draft.draftId, groupRevision: draft.groupRevision, requestRevision: request.revision, identityChecked: false } : null);
        }}>
          <option value="">친구 선택</option>
          {!!candidates.length && <optgroup label="접수한 동반신청">{candidates.map(app => <option key={app.id} value={app.id}>{app.basic.nickname} · {app.basic.birthYear}년생 · {app.basic.location} · 접수 {app.rank ?? "미정"}번</option>)}</optgroup>}
          {!!drafts.length && <optgroup label="신청 전 · 계정 연결">{drafts.map(draft => <option key={draft.key} value={draft.key}>{draft.nickname} · {draft.birthYear}년생 · {draft.location} · {draft.sponsorName}와 신청 전</option>)}</optgroup>}
        </select>
      </HubField>
      {!candidates.length && !drafts.length && <p className="text-sm">연결할 동반신청이 없습니다.</p>}
      {stale && <p role="alert">신청 정보가 바뀌었습니다. 다시 선택해 주세요.</p>}
      <fieldset disabled={busy || !selection || stale}>
        <HubCheck label="요청자 본인과 선택한 친구가 같은 사람임을 확인했습니다." checked={selection?.identityChecked ?? false} onChange={identityChecked => setSelection(current => current && ({ ...current, identityChecked }))} />
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <HubButton disabled={busy || !selection?.identityChecked || stale} onClick={async () => {
          if (!selection || stale) return;
          const command = selection.kind === "application" ? { action: "admin.companion.link", target: request.id, revision: selection.requestRevision,
            data: { eventId: request.eventId, applicationId: selection.applicationId, applicationRevision: selection.applicationRevision, identityChecked: true } } :
            { action: "admin.companion.link-draft", target: request.id, revision: selection.requestRevision,
              data: { eventId: request.eventId, sponsorOwner: selection.sponsorOwner, draftId: selection.draftId, groupRevision: selection.groupRevision, identityChecked: true } };
          if (await hub.mutate(command)) setSelection(null);
        }}>{selection?.kind === "draft" ? "계정만 연결" : "본인 연결"}</HubButton>
        {selection && <HubButton disabled={busy} onClick={() => setSelection(null)}>다시 선택</HubButton>}
      </div>
    </>}
  </div>;
}

export function CompanionLinkRequests({ applications, hub, eventId }: { applications: PrivateApplication[]; hub: HubController; eventId?: string }) {
  const eventIds = new Set((hub.state?.events ?? []).filter(event => !eventId || event.id === eventId).map(event => event.id));
  const pending = (hub.state?.companionLinkRequests ?? []).filter(request => request.status === "pending" && !request.cancelledAt && eventIds.has(request.eventId));
  if (!pending.length) return null;
  return <HubCard>
    <h3 className="font-black">친구 본인 연결 · {pending.length}건</h3>
    {pending.map(request => <LinkRequestEditor key={request.id} request={request} applications={applications} event={hub.state?.events.find(event => event.id === request.eventId)} hub={hub} />)}
  </HubCard>;
}
