// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {BasicForm} from './EventHubPage';
import {CompanionCards} from './CompanionCards';
import {MyCompanionRequest} from './CompanionOrders';
import {EventLaboratoryStore} from './event-laboratory-store';
import {HUB_CONSENT_VERSION,type CompanionDraftGroup,type HubCommand,type HubController} from '../lib/event-hub-client';
import {TEST_MODE_BANNER} from '../lib/public-test-mode';
vi.mock('../lib/supabase',()=>({supabase:{from:vi.fn(),channel:()=>({on(){return this;},subscribe(){return this;}}),removeChannel:vi.fn()},onSseReconnect:()=>()=>{},isSseHealthy:()=>true}));
vi.mock('../lib/webPush',()=>({currentPushStatus:()=>({code:'unsupported'}),requestPushPermissionFromClick:vi.fn()}));
afterEach(cleanup);
function fixture(){
  const store=new EventLaboratoryStore();store.jump('신청 확정');
  const state=store.state(),event=state.events[0],app=state.applications[0];
  state.testMode={enabled:false,publicAdmissionOpen:true,banner:TEST_MODE_BANNER};state.applications=[];
  state.basicDrafts={[event.id]:{revision:3,updatedAt:'2026-10-30T12:00:00Z',nextStep:5,basic:{nickname:'본인시험',birthYear:1992,location:'서울',depositor:'가상본인',collection:true,version:HUB_CONSENT_VERSION}}};
  const group:CompanionDraftGroup={revision:4,items:[{id:'first',basic:{nickname:'첫지인',birthYear:1998,location:'파주'}},{id:'second',basic:{nickname:'둘째지인',birthYear:2002,location:'안산'}}]};
  state.companionDrafts={[event.id]:group};
  const save=async(command:HubCommand):Promise<Record<string,unknown>|null>=>{
    if(command.action==='companion.selection.save'){group.revision++;group.selection={draftIds:command.data?.draftIds as string[],reviewedRevision:group.revision};return {saved:true,revision:group.revision};}
    return {saved:true,id:'synthetic-application'};
  };
  const mutate=vi.fn(save),hub:HubController={state,mutate,load:vi.fn(),setError:vi.fn(),error:'',status:''};
  return {state,event,app,group,hub,mutate,save};
}
it('recovers the server-saved person selection after reopening, without exposing or resubmitting an old phone',async()=>{
  const {event,group,hub,mutate}=fixture();const view=render(<BasicForm eventId={event.id} hub={hub}/>);
  fireEvent.click(screen.getByLabelText(/둘째지인 · 2002년생/));
  await waitFor(()=>expect(group.selection?.draftIds).toEqual(['first']));
  await waitFor(()=>expect((screen.getByRole('button',{name:'2명 함께 신청'}) as HTMLButtonElement).disabled).toBe(false));
  view.unmount();render(<BasicForm eventId={event.id} hub={{...hub,state:structuredClone(hub.state)}}/>);
  expect((screen.getByLabelText(/둘째지인 · 2002년생/) as HTMLInputElement).checked).toBe(false);
  expect(screen.queryByLabelText(/전화번호/)).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'2명 함께 신청'}));
  await waitFor(()=>expect(mutate).toHaveBeenCalledTimes(2));
  expect(mutate.mock.calls[1][0]).toMatchObject({action:'companion.submit',revision:5,data:{draftIds:['first']}});
  expect(mutate.mock.calls[1][0].data?.basic).not.toHaveProperty('phone');
});
it('keeps a failed exclusion visible and blocks final submission until the exact selection is saved',async()=>{
  const {event,hub,mutate,save}=fixture();mutate.mockResolvedValueOnce(null);
  render(<BasicForm eventId={event.id} hub={hub}/>);
  fireEvent.click(screen.getByLabelText(/둘째지인 · 2002년생/));
  await screen.findByText('신청 인원을 저장하지 못했습니다.');
  expect((screen.getByLabelText(/둘째지인 · 2002년생/) as HTMLInputElement).checked).toBe(false);
  expect((screen.getByRole('button',{name:'2명 함께 신청'}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'2명 함께 신청'}));expect(mutate).toHaveBeenCalledOnce();
  mutate.mockImplementation(save);fireEvent.click(screen.getByRole('button',{name:'신청 인원 확인·저장'}));
  await waitFor(()=>expect((screen.getByRole('button',{name:'2명 함께 신청'}) as HTMLButtonElement).disabled).toBe(false));
  expect(mutate.mock.calls[1][0]).toMatchObject({action:'companion.selection.save',data:{draftIds:['first']}});
});
it('new or removed person cards require review and never silently select a newly added friend',async()=>{
  const {event,group,hub,mutate}=fixture();group.selection={draftIds:['first'],reviewedRevision:4};
  const view=render(<BasicForm eventId={event.id} hub={hub}/>);
  group.revision=5;group.items[0].removedAt='2026-10-30T12:00:00Z';group.items.push({id:'new-person',basic:{nickname:'새지인',birthYear:1999,location:'서울'}});
  view.rerender(<BasicForm eventId={event.id} hub={hub}/>);
  expect((screen.getByLabelText(/새지인 · 1999년생/) as HTMLInputElement).checked).toBe(false);
  expect((screen.getByRole('button',{name:'다음'}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'신청 인원 확인·저장'}));
  await waitFor(()=>expect((screen.getByRole('button',{name:'다음'}) as HTMLButtonElement).disabled).toBe(false));
  expect(mutate.mock.calls[0][0]).toMatchObject({revision:5,data:{draftIds:[]}});
});
it('freezes the displayed group during a delayed save and leaves approval intact when adding friends later',async()=>{
  const {app,event,group,hub,mutate,save}=fixture();app.payment='approved';const before=structuredClone(app);
  let finish!:()=>void;mutate.mockImplementationOnce(command=>new Promise(resolve=>{finish=()=>{void save(command).then(resolve);};}));
  render(<CompanionCards eventId={event.id} group={group} ownApplication={app} mutate={hub.mutate} busy={false} blocked={false} onOwn={vi.fn()}/>);
  fireEvent.click(screen.getByLabelText('둘째지인 함께 신청'));
  expect((screen.getByLabelText('첫지인 함께 신청') as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole('button',{name:'저장 중…'}) as HTMLButtonElement).disabled).toBe(true);
  finish();await waitFor(()=>expect((screen.getByRole('button',{name:'친구 1명 신청 접수'}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button',{name:'친구 1명 신청 접수'}));
  await waitFor(()=>expect(mutate).toHaveBeenCalledTimes(2));
  expect(mutate.mock.calls[1][0]).toMatchObject({action:'companion.submit',revision:5,data:{draftIds:['first']}});
  expect(mutate.mock.calls[1][0].data).not.toHaveProperty('basic');expect(app).toEqual(before);
});
it('prelinked cards cannot edit identity before an explicit unlink and never show the friend account',()=>{
  const {app,event,group,hub,mutate}=fixture();group.items=[{...group.items[0],identityLinkedAt:'2026-10-30T12:00:00Z'}];const before=structuredClone(group);
  render(<CompanionCards eventId={event.id} group={group} ownApplication={app} mutate={hub.mutate} busy={false} blocked={false} onOwn={vi.fn()}/>);
  expect(screen.getByText('본인 확인 완료 · 신청 미확정')).toBeTruthy();
  expect(screen.queryByRole('button',{name:'친구 정보 수정'})).toBeNull();expect(screen.queryByRole('button',{name:'작성 목록에서 제외'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'본인 확인 해제'}));
  expect(mutate).toHaveBeenCalledExactlyOnceWith({action:'companion.draft.unlink',target:'first',revision:4,data:{eventId:event.id}});expect(group).toEqual(before);
});
it('friend can cancel an unsubmitted authenticated preparation and retry, but cannot cancel submitted linkage',()=>{
  const {event,state,hub,mutate}=fixture();state.companionLinkRequests=[{id:'own-request',owner:'own-identity',eventId:event.id,at:'2026-10-30T12:00:00Z',revision:3,status:'pending',prepared:true}];
  const view=render(<MyCompanionRequest eventId={event.id} hub={hub} blocked={false}/>);
  expect(screen.getByRole('status').textContent).toContain('대표자 신청 대기');
  fireEvent.click(screen.getByRole('button',{name:'동반신청 확인 취소'}));
  expect(mutate).toHaveBeenCalledExactlyOnceWith({action:'companion.link.cancel',target:'own-request',revision:3,data:{eventId:event.id}});
  state.companionLinkRequests[0].cancelledAt='2026-10-30T12:01:00Z';view.rerender(<MyCompanionRequest eventId={event.id} hub={hub} blocked={false}/>);
  expect(screen.getByRole('button',{name:'친구가 대신 신청했어요'})).toBeTruthy();
  delete state.companionLinkRequests[0].cancelledAt;state.companionLinkRequests[0].status='linked';view.rerender(<MyCompanionRequest eventId={event.id} hub={hub} blocked={false}/>);
  expect(screen.queryByRole('button',{name:'동반신청 확인 취소'})).toBeNull();expect(screen.queryByRole('textbox')).toBeNull();
});
