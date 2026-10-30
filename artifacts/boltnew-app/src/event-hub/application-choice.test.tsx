// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {ApplicationChoice} from './ApplicationChoice';
import {ApplicationSteps,BasicForm,EventHubContent} from './EventHubPage';
import {EventLaboratoryStore} from './event-laboratory-store';
import {HUB_CONSENT_VERSION,type HubCommand,type HubController} from '../lib/event-hub-client';
import {TEST_MODE_BANNER} from '../lib/public-test-mode';
vi.mock('../lib/supabase',()=>({supabase:{from:vi.fn(),channel:()=>({on(){return this;},subscribe(){return this;}}),removeChannel:vi.fn()},onSseReconnect:()=>()=>{},isSseHealthy:()=>true}));
vi.mock('../lib/webPush',()=>({currentPushStatus:()=>({code:'unsupported'}),requestPushPermissionFromClick:vi.fn()}));
afterEach(()=>{cleanup();localStorage.clear();vi.restoreAllMocks();});
function fixture(){
  const store=new EventLaboratoryStore(),state=store.state(),event=state.events[0];state.applications=[];
  state.testMode={enabled:false,publicAdmissionOpen:true,banner:TEST_MODE_BANNER};
  const mutate=vi.fn(async(_command:HubCommand)=>({saved:true}));
  const hub:HubController={state,mutate,load:vi.fn(),setError:vi.fn(),error:'',status:''};
  return {hub,state,event,mutate};
}
it('opens a concise accessible choice before inputs and remembers the selected party after reopening',()=>{
  const {hub,event}=fixture();const props={hub,path:`/events/e/${event.id}`};
  const view=render(<EventHubContent {...props}/>);
  fireEvent.click(screen.getByRole('button',{name:'신청하기'}));
  expect(screen.getByRole('dialog',{name:'누구와 신청하시나요?'})).toBeTruthy();
  expect(screen.queryByLabelText('닉네임')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'지인과 함께'}));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('button',{name:'+ 지인 추가'})).toBeTruthy();
  view.unmount();render(<EventHubContent {...props}/>);
  fireEvent.click(screen.getByRole('button',{name:'신청하기'}));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('button',{name:'+ 지인 추가'})).toBeTruthy();
});
it('preserves the unsaved person card while changing between own and companion steps',()=>{
  const {hub,event}=fixture();render(<EventHubContent path={`/events/e/${event.id}`} hub={hub}/>);
  fireEvent.click(screen.getByRole('button',{name:'신청하기'}));fireEvent.click(screen.getByRole('button',{name:'지인과 함께'}));
  fireEvent.click(screen.getByRole('button',{name:'+ 지인 추가'}));fireEvent.change(screen.getByLabelText('친구 닉네임'),{target:{value:'남긴지인'}});
  fireEvent.click(screen.getByRole('button',{name:'본인 정보 입력'}));fireEvent.click(screen.getByRole('button',{name:'지인 목록'}));
  expect((screen.getByLabelText('친구 닉네임') as HTMLInputElement).value).toBe('남긴지인');
  fireEvent.click(screen.getByRole('button',{name:'신청 인원 변경'}));fireEvent.click(screen.getByRole('button',{name:'혼자 신청'}));
  fireEvent.click(screen.getByRole('button',{name:'신청 인원 변경'}));fireEvent.click(screen.getByRole('button',{name:'지인과 함께'}));
  expect((screen.getByLabelText('친구 닉네임') as HTMLInputElement).value).toBe('남긴지인');
});
it('supports Escape or explicit close without creating an application',()=>{
  const choose=vi.fn(),close=vi.fn();render(<ApplicationChoice open onChoose={choose} onClose={close}/>);
  fireEvent(screen.getByRole('dialog'),new Event('cancel',{cancelable:true}));expect(close).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button',{name:'신청 선택 닫기'}));expect(close).toHaveBeenCalledTimes(2);expect(choose).not.toHaveBeenCalled();
});
it('resumes the retired phone step at depositor and never resubmits a stored phone',async()=>{
  const {hub,state,event,mutate}=fixture();state.basicDrafts={[event.id]:{revision:3,updatedAt:'2026-10-30T12:00:00Z',nextStep:4,basic:{nickname:'보존사용자',birthYear:1998,location:'서울',phone:'01000000000',collection:true,version:HUB_CONSENT_VERSION}}};
  render(<BasicForm eventId={event.id} hub={hub}/>);
  expect(screen.queryByLabelText(/전화번호/)).toBeNull();
  fireEvent.change(screen.getByLabelText('실제 은행 입금 시 보내는 분 이름'),{target:{value:'가상입금'}});fireEvent.click(screen.getByRole('button',{name:'다음'}));
  await waitFor(()=>expect(mutate).toHaveBeenCalledOnce());
  expect(mutate.mock.calls[0][0]).toMatchObject({action:'application.basic',data:{basic:{nickname:'보존사용자',birthYear:1998,location:'서울',depositor:'가상입금'}}});
  expect(mutate.mock.calls[0][0].data?.basic).not.toHaveProperty('phone');
});
it('solo choice does not submit stored friend drafts',async()=>{
  const {hub,state,event,mutate}=fixture();state.basicDrafts={[event.id]:{revision:1,updatedAt:'2026-10-30T12:00:00Z',nextStep:5,basic:{nickname:'본인선택',birthYear:1998,location:'서울',depositor:'가상입금',collection:true,version:HUB_CONSENT_VERSION}}};
  state.companionDrafts={[event.id]:{revision:2,items:[{id:'friend-draft',basic:{nickname:'동반기록',birthYear:1998,location:'서울'}}]}};
  render(<BasicForm eventId={event.id} hub={hub} includeCompanions={false}/>);fireEvent.click(screen.getByRole('button',{name:'다음'}));
  await waitFor(()=>expect(mutate).toHaveBeenCalledOnce());expect(mutate.mock.calls[0][0].action).toBe('application.basic');expect(state.companionDrafts[event.id].items).toHaveLength(1);
});
it('renders an uploaded image-only notice without a false empty-notice warning and still requires personal consent',()=>{
  const store=new EventLaboratoryStore();store.jump('회비 확인');const state=store.state(),app=state.applications[0],event=state.events[0];
  state.testMode={enabled:false,publicAdmissionOpen:true,banner:TEST_MODE_BANNER};app.stage=2;delete app.consent;event.notice='';
  event.media=['/synthetic-notice.png'];event.materials=[{id:'image-only',url:'/synthetic-notice.png',purpose:'notice',alt:'직접 올린 공지',hidden:false,at:'2026-10-30T12:00:00Z'}];
  const mutate=vi.fn();const hub:HubController={state,mutate,load:vi.fn(),setError:vi.fn(),error:'',status:''};
  render(<ApplicationSteps app={app} event={event} hub={hub}/>);
  expect(screen.getByRole('img',{name:'직접 올린 공지'})).toBeTruthy();expect(screen.queryByText('공지 준비 중')).toBeNull();
  expect((screen.getByRole('button',{name:'동의하고 다음'}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByLabelText('필수 안내를 모두 확인하고 동의합니다'));
  expect((screen.getByRole('button',{name:'동의하고 다음'}) as HTMLButtonElement).disabled).toBe(false);expect(mutate).not.toHaveBeenCalled();
});
