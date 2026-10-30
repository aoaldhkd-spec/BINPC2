import { useState } from 'react';
import type { CompanionApplication, HubController, PrivateApplication } from '../lib/event-hub-client';
import { HubButton, HubCard } from './HubUi';

export function companionPaymentLabel(a: Pick<CompanionApplication, 'payment'|'waivedAt'|'approvalRevokedAt'|'confirmedAt'|'quote'>) {
  if (a.approvalRevokedAt) return '승인 취소 · 관리자 문의';
  if (a.waivedAt) return '무료 승인 완료';
  if (a.payment === 'approved') return '입금 승인 완료';
  if (!a.confirmedAt) return '금액 확인 전';
  if (a.quote?.fee === 0) return '무료 승인 대기';
  return { none: '입금 전', reported: '입금 신고 · 승인 대기', held: '입금 확인 보류', mismatch: '입금 내역 확인 필요' }[a.payment];
}
type Payable = Pick<CompanionApplication, 'id'|'revision'|'nickname'|'payment'|'waivedAt'|'approvalRevokedAt'|'confirmedAt'|'quote'|'paymentAccountId'|'paymentAccount'>;
export function canReportCompanionPayment(a: Payable) {
  return !!a.confirmedAt && !!a.quote && a.quote.fee > 0 && !a.waivedAt && !a.approvalRevokedAt && a.payment === 'none';
}
export function CompanionFeeRows({ rows }: { rows: CompanionApplication[] }) {
  return <div className="grid gap-2 sm:grid-cols-2">{rows.map(a => <article key={a.id} className="rounded-xl border p-3">
    <h3 className="font-bold">{a.nickname} · 친구</h3>
    <p className="text-sm">{a.birthYear}년생 · {a.location}</p>
    {a.quote && <p className="font-bold">{a.rank}등 · {a.quote.fee.toLocaleString()}원</p>}
    <p className="text-sm">{companionPaymentLabel(a)}</p>
    <p className="text-xs">{a.personalConsentPending ? '친구 본인 동의·프로필 확인 필요' : a.linked ? '친구 본인 계정에서 이어하기' : '친구 본인 확인 대기'}</p>
  </article>)}</div>;
}
/** Only representative-safe summaries are accepted. No friend profile/entry controls. */
export function CompanionOrders({ app, hub, blocked }: { app: PrivateApplication; hub: HubController; blocked: boolean }) {
  const [excluded, setExcluded] = useState<string[]>([]);
  const [accountId, setAccountId] = useState('');
  const rows = (hub.state?.companionApplications ?? []).filter(a => a.eventId === app.eventId);
  const accounts=hub.state?.companionAccounts?.[app.eventId]??app.billing?.accounts??[];
  if (!rows.length || !app.consent?.notice) return null;
  const pending = rows.filter(a => !a.confirmedAt);
  const own: Payable = { ...app, nickname: app.basic.nickname, paymentAccountId:app.paymentAccount?.id };
  const people: Payable[] = [own, ...rows];
  const payable = people.filter(canReportCompanionPayment);
  const selected = payable.filter(a => !excluded.includes(a.id));
  const total = selected.reduce((sum,a) => sum + (a.quote?.fee ?? 0), 0);
  const selectedAccountIds=[...new Set(selected.map(a=>a.paymentAccount?JSON.stringify([a.paymentAccount.id,a.paymentAccount.bank,a.paymentAccount.number,a.paymentAccount.holder??'']):a.paymentAccountId??'legacy'))];
  const sameAccount=selectedAccountIds.length<=1;
  const selectedAccount=selected[0]?.paymentAccount;
  const busy = hub.status === 'saving' || hub.status === 'checking';
  const group = hub.state?.companionDrafts?.[app.eventId];
  return <HubCard>
    <h2 className="font-black">함께 신청한 친구</h2>
    <CompanionFeeRows rows={rows}/>
    {pending.length > 0 && <>
      <p className="font-bold">친구 {pending.length}명 · {pending.reduce((sum,a) => sum + (a.quote?.fee ?? 0), 0).toLocaleString()}원</p>
      {accounts.length>0 && <fieldset><legend className="text-sm font-bold">친구 입금 계좌 선택</legend><div className="hub-compact-actions">{accounts.map(a => <HubButton key={a.id} aria-pressed={(accountId || app.paymentAccount?.id) === a.id} onClick={() => setAccountId(a.id)}>{a.bank} · 끝 {a.number.replace(/\D/g,'').slice(-4)}</HubButton>)}</div></fieldset>}
      <HubButton pending={busy} pendingLabel={hub.status==='checking'?'저장 확인 중…':'저장 중…'} disabled={blocked || !group || pending.some(a => !a.quote)} onClick={() => hub.mutate({action:'companion.confirm',target:app.id,revision:app.revision,data:{eventId:app.eventId,groupRevision:group?.revision,applicationIds:pending.map(a=>a.id),revisions:Object.fromEntries(pending.map(a=>[a.id,a.revision])),accountId:accountId || app.paymentAccount?.id,privacyPolicyFingerprint:hub.state?.privacyNotice?.fingerprint}})}>친구 금액 확인·신청 확정</HubButton>
    </>}
    {payable.length > 0 && <fieldset className="space-y-2">
      <legend className="font-bold">함께 입금한 사람</legend>
      {payable.map(a => <label key={a.id} className="flex items-center gap-2 py-2"><input type="checkbox" checked={!excluded.includes(a.id)} onChange={e => setExcluded(v => e.target.checked ? v.filter(id=>id!==a.id) : [...v,a.id])}/>{a.nickname}{a.id===app.id?' · 본인':''} · {a.quote!.fee.toLocaleString()}원</label>)}
      <p className="font-bold">선택 {selected.length}명 · 합계 {total.toLocaleString()}원</p>
      {!sameAccount&&<p role="alert">같은 계좌로 입금한 사람끼리 선택해 주세요.</p>}
      {sameAccount&&selectedAccount&&!app.bossTestOnly&&<p>{selectedAccount.bank} {selectedAccount.number}{selectedAccount.holder?` · ${selectedAccount.holder}`:''}</p>}
      <p className="text-sm">입금은 함께, 승인은 한 명씩 진행됩니다.</p>
      {app.bossTestOnly && <p className="text-sm">실제 송금 없이 신고만 해주세요.</p>}
      <HubButton pending={busy} pendingLabel={hub.status==='checking'?'저장 확인 중…':'저장 중…'} disabled={blocked || !sameAccount || selected.length === 0} onClick={() => hub.mutate({action:'companion.report',data:{eventId:app.eventId,applicationIds:selected.map(a=>a.id),revisions:Object.fromEntries(selected.map(a=>[a.id,a.revision])),combinedPayment:true}})}>선택한 {selected.length}명 입금 신고</HubButton>
    </fieldset>}
  </HubCard>;
}

export function MyCompanionRequest({eventId,hub,blocked}:{eventId:string;hub:HubController;blocked:boolean}) {
  const request=hub.state?.companionLinkRequests?.find(r=>r.eventId===eventId);
  if (request) return <p role="status" className="text-sm">{request.status==='pending'?'관리자 확인 대기':'내 신청 확인 완료'} · 요청 {request.id.slice(0,8)}</p>;
  return <HubButton disabled={blocked||hub.status==='saving'||hub.status==='checking'} onClick={()=>hub.mutate({action:'companion.link.request',data:{eventId}})}>친구가 대신 신청했어요</HubButton>;
}
