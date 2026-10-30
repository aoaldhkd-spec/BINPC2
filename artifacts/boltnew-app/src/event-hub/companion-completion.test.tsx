// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BasicForm, ApplicationSteps } from './EventHubPage';
import { CompanionOrders, MyCompanionRequest } from './CompanionOrders';
import { CompanionCards } from './CompanionCards';
import { EventLaboratoryStore } from './event-laboratory-store';
import { HUB_CONSENT_VERSION, type CompanionApplication, type HubController, type HubCommand } from '../lib/event-hub-client';
import { TEST_MODE_BANNER } from '../lib/public-test-mode';

vi.mock('../lib/supabase',()=>({supabase:{from:vi.fn(),channel:()=>({on(){return this;},subscribe(){return this;}}),removeChannel:vi.fn()},onSseReconnect:()=>()=>{},isSseHealthy:()=>true}));
vi.mock('../lib/webPush',()=>({currentPushStatus:()=>({code:'unsupported'}),requestPushPermissionFromClick:vi.fn()}));
afterEach(()=>{cleanup();vi.restoreAllMocks();});
function setup(stage:'회비 확인'|'신청 확정'='신청 확정') {
  const store=new EventLaboratoryStore();store.jump(stage);const state=store.state();
  state.testMode={enabled:false,publicAdmissionOpen:true,banner:TEST_MODE_BANNER};
  const app=state.applications[0],event=state.events[0];
  const mutate=vi.fn(async(_command:HubCommand)=>({saved:true,id:app.id}));
  const hub:HubController={state,mutate,load:vi.fn(),setError:vi.fn(),error:'',status:''};
  const friend:CompanionApplication={id:'friend-application',draftId:'friend-draft',eventId:event.id,nickname:'동반친구',birthYear:1998,location:'파주',revision:8,rank:4,quote:{...app.quote!,fee:16000},payment:'none',attendance:'pending',confirmedAt:'2026-10-30T12:00:00Z',linked:false,personalConsentPending:true};
  state.companionApplications=[friend];state.companionDrafts={[event.id]:{revision:3,items:[{id:friend.draftId,basic:{nickname:friend.nickname,birthYear:friend.birthYear,location:friend.location},applicationId:friend.id,submittedAt:friend.confirmedAt}]}};
  return {hub,state,app,event,friend,mutate};
}
it('submits the selected person cards atomically at the final basic step, never on draft save',async()=>{
  const {hub,state,event,mutate}=setup();state.applications=[];
  state.basicDrafts={[event.id]:{revision:4,updatedAt:'2026-10-30T12:00:00Z',nextStep:5,basic:{nickname:'대표테스트',birthYear:1992,location:'서울',phone:'01000000000',collection:true,version:HUB_CONSENT_VERSION}}};
  state.companionDrafts![event.id]={revision:6,items:[{id:'first',basic:{nickname:'첫친구',birthYear:1998,location:'파주'}},{id:'second',basic:{nickname:'다음친구',birthYear:2002,location:'안산'}}]};
  render(<BasicForm eventId={event.id} hub={hub}/>);
  expect(mutate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText(/다음친구 · 2002년생/));
  fireEvent.change(screen.getByLabelText('실제 은행 입금 시 보내는 분 이름'),{target:{value:'가상입금자'}});
  fireEvent.click(screen.getByRole('button',{name:'2명 함께 신청'}));
  await waitFor(()=>expect(mutate).toHaveBeenCalledOnce());
  expect(mutate.mock.calls[0][0]).toMatchObject({action:'companion.submit',revision:6,data:{eventId:event.id,draftIds:['first'],basic:{nickname:'대표테스트',depositor:'가상입금자'}}});
});
it('shows separately quoted fees before confirming the whole order and does not invent friend consent',async()=>{
  const {hub,state,app,event,friend,mutate}=setup('회비 확인');delete friend.confirmedAt;
  state.privacyNotice={policyVersion:'synthetic',controllerName:'시험',contact:'시험',notice:'시험 안내',fingerprint:'current-policy-fingerprint',periods:[]};
  render(<ApplicationSteps app={app} event={event} hub={hub}/>);
  expect(screen.getByText('4등 · 16,000원')).toBeTruthy();
  expect(screen.getByText('친구 본인 동의·프로필 확인 필요')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'2명 금액 확인·신청 확정'}));
  expect(mutate.mock.calls[0][0]).toMatchObject({action:'companion.confirm',target:app.id,revision:app.revision,data:{eventId:event.id,groupRevision:3,applicationIds:[friend.id],revisions:{[friend.id]:friend.revision},privacyPolicyFingerprint:'current-policy-fingerprint'}});
  expect(mutate.mock.calls[0][0].data).not.toHaveProperty('consent');
  expect(state.applications).toHaveLength(1);
});
it('free representative can select an account for paid friends without turning their free approval into a payment',()=>{
  const {hub,app,event,friend,mutate}=setup('회비 확인');delete friend.confirmedAt;
  app.quote={...app.quote!,fee:0};app.billing!.quote={...app.billing!.quote,fee:0};
  app.billing!.accounts=[{id:'synthetic-bank',bank:'가상은행',number:'000-000-0000',holder:'시험'}];
  render(<ApplicationSteps app={app} event={event} hub={hub}/>);
  fireEvent.click(screen.getByRole('button',{name:'가상은행 · 끝 0000'}));
  fireEvent.click(screen.getByRole('button',{name:'2명 금액 확인·신청 확정'}));
  expect(mutate.mock.calls[0][0]).toMatchObject({action:'companion.confirm',data:{accountId:'synthetic-bank'}});
  expect(app.quote.fee).toBe(0);
});
it('adding friends after own approval uses current account choices and sends child revision and current policy',()=>{
  const {hub,state,app,friend,mutate}=setup();app.payment='approved';delete friend.confirmedAt;
  app.billing!.accounts=[];
  state.privacyNotice={policyVersion:'synthetic',controllerName:'시험',contact:'시험',notice:'시험 안내',fingerprint:'current-policy-fingerprint',periods:[]};
  state.companionAccounts={[app.eventId]:[{id:'new-synthetic-bank',bank:'새가상은행',number:'000-000-0001'}]};
  render(<CompanionOrders app={app} hub={hub} blocked={false}/>);
  fireEvent.click(screen.getByRole('button',{name:'새가상은행 · 끝 0001'}));
  fireEvent.click(screen.getByRole('button',{name:'친구 금액 확인·신청 확정'}));
  expect(mutate.mock.calls[0][0]).toMatchObject({action:'companion.confirm',data:{accountId:'new-synthetic-bank',revisions:{[friend.id]:friend.revision},privacyPolicyFingerprint:'current-policy-fingerprint'}});
  expect(app.payment).toBe('approved');
});
it('different deposit accounts must be reported separately without changing their assigned amounts',()=>{
  const {hub,app,friend,mutate}=setup();app.paymentAccount={id:'own-bank',bank:'가상은행',number:'000-000-0000'};friend.paymentAccountId='friend-bank';
  render(<CompanionOrders app={app} hub={hub} blocked={false}/>);
  expect((screen.getByRole('button',{name:'선택한 2명 입금 신고'}) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole('alert').textContent).toContain('같은 계좌');
  expect(mutate).not.toHaveBeenCalled();
});
it('combined payment reports only selected unpaid people and never batches approvals or exposes friend profiles',()=>{
  const {hub,state,app,friend,mutate}=setup();app.payment='approved';
  const paid={...friend,id:'paid',draftId:'paid-draft',nickname:'승인친구',payment:'approved' as const};
  const revoked={...friend,id:'revoked',draftId:'revoked-draft',nickname:'취소친구',approvalRevokedAt:'2026-10-30T12:00:00Z'};
  state.companionApplications!.push(paid,revoked);
  const before=structuredClone(state);
  render(<CompanionOrders app={app} hub={hub} blocked={false}/>);
  expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  expect(screen.queryByRole('button',{name:/프로필|입장|승인/})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'선택한 1명 입금 신고'}));
  expect(mutate.mock.calls[0][0]).toEqual({action:'companion.report',data:{eventId:app.eventId,applicationIds:[friend.id],revisions:{[friend.id]:friend.revision},combinedPayment:true}});
  expect(state).toEqual(before);
});
it('keeps friend charges hidden before the representative personally agrees to notices',()=>{
  const {hub,app}=setup();delete app.consent;
  render(<CompanionOrders app={app} hub={hub} blocked={false}/>);
  expect(screen.queryByText(/16,000/)).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
});
it('linked friend fills only the missing depositor and personally consents without requiring a phone or changing approved rank or profile',async()=>{
  const {hub,state,app,event,mutate}=setup();app.payment='approved';app.basic={nickname:'동반친구',birthYear:1998,location:'파주'};
  app.companionSubmission={submittedAt:'2026-10-30T12:00:00Z',permissionToProvideAt:'2026-10-30T12:00:00Z',personalConsentPending:true,linkedAt:'2026-10-30T12:05:00Z'};
  const before=structuredClone(app),onSaved=vi.fn();
  render(<BasicForm eventId={event.id} hub={hub} app={app} onSaved={onSaved}/>);
  expect(screen.getByText('동반친구 · 1998년생 · 파주')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('[필수] 위 개인정보 수집·이용 안내를 확인하고 동의합니다'));
  fireEvent.click(screen.getByRole('button',{name:'다음'}));
  await waitFor(()=>expect(screen.getByLabelText('실제 은행 입금 시 보내는 분 이름')).toBeTruthy());
  expect(mutate.mock.calls[0][0]).toMatchObject({action:'application.basic-draft',revision:0,data:{nextStep:5}});
  expect(screen.queryByLabelText(/연락용 전화번호/)).toBeNull();
  fireEvent.change(screen.getByLabelText('실제 은행 입금 시 보내는 분 이름'),{target:{value:'가상친구'}});
  fireEvent.click(screen.getByRole('button',{name:'다음'}));
  await waitFor(()=>expect(onSaved).toHaveBeenCalledOnce());
  expect(mutate.mock.calls[1][0]).toMatchObject({action:'application.basic',revision:app.revision,data:{edit:true,basic:{nickname:'동반친구',birthYear:1998,depositor:'가상친구',collection:true}}});
  expect(mutate.mock.calls[1][0].data?.basic).not.toHaveProperty('phone');
  expect(app).toEqual(before);expect(state.applications).toHaveLength(1);
});
it('linked friend reopens a saved missing-contact draft at its actual saved step',()=>{
  const {hub,state,app,event}=setup();app.basic={nickname:'동반친구',birthYear:1998,location:'파주'};
  app.companionSubmission={submittedAt:'2026-10-30T12:00:00Z',permissionToProvideAt:'2026-10-30T12:00:00Z',personalConsentPending:true};
  state.basicDrafts={[event.id]:{revision:3,updatedAt:'2026-10-30T12:00:00Z',nextStep:5,basic:{nickname:'동반친구',birthYear:1998,location:'파주',phone:'01000000000',depositor:'남긴입력',collection:true,version:HUB_CONSENT_VERSION}}};
  render(<BasicForm eventId={event.id} hub={hub} app={app}/>);
  expect((screen.getByLabelText('실제 은행 입금 시 보내는 분 이름') as HTMLInputElement).value).toBe('남긴입력');
  expect(screen.queryByLabelText('닉네임')).toBeNull();
});
it('requests authenticated administrator identification without entering a code or phone lookup',()=>{
  const {hub,state,event,mutate}=setup();
  const view=render(<MyCompanionRequest eventId={event.id} hub={hub} blocked={false}/>);
  fireEvent.click(screen.getByRole('button',{name:'친구가 대신 신청했어요'}));
  expect(mutate).toHaveBeenCalledExactlyOnceWith({action:'companion.link.request',data:{eventId:event.id}});
  state.companionLinkRequests=[{id:'request-synthetic',owner:'own-session',eventId:event.id,at:'2026-10-30T12:00:00Z',revision:1,status:'pending'}];
  view.rerender(<MyCompanionRequest eventId={event.id} hub={hub} blocked={false}/>);
  expect(screen.getByRole('status').textContent).toContain('관리자 확인 대기');
  expect(screen.queryByRole('textbox')).toBeNull();
});
it('submitted friend drafts cannot be edited or removed and adding friends reuses the existing own order',()=>{
  const {app,mutate}=setup();
  render(<CompanionCards eventId={app.eventId} ownApplication={app} group={{revision:5,items:[{id:'submitted',basic:{nickname:'접수친구',birthYear:1998,location:'파주'},applicationId:'submitted-app'},{id:'new',basic:{nickname:'새친구',birthYear:1992,location:'서울'}}]}} mutate={mutate} busy={false} blocked={false} onOwn={vi.fn()}/>);
  expect(screen.getAllByRole('button',{name:'친구 정보 수정'})).toHaveLength(1);
  fireEvent.click(screen.getByRole('button',{name:'친구 1명 신청 접수'}));
  expect(mutate.mock.calls[0][0]).toMatchObject({action:'companion.submit',revision:5,data:{eventId:app.eventId,draftIds:['new']}});
  expect(mutate.mock.calls[0][0].data).not.toHaveProperty('basic');
});
