// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BasicForm } from './EventHubPage';
import { CompanionCards } from './CompanionCards';
import { BirthYearSelect } from './BirthYearSelect';
import { EventLaboratoryStore } from './event-laboratory-store';
import type { HubController } from '../lib/event-hub-client';
import { HUB_CONSENT_VERSION } from '../../../../lib/api-zod/src/event-hub';
vi.mock('../lib/supabase',()=>({supabase:{},onSseReconnect:()=>()=>{},isSseHealthy:()=>true}));
afterEach(cleanup);
function fixture(step:number){
  const state=new EventLaboratoryStore().state(),event=state.events[0];
  state.testMode={enabled:false,publicAdmissionOpen:true,banner:'시험'};state.applications=[];
  state.basicDrafts={[event.id]:{revision:2,nextStep:step,updatedAt:new Date().toISOString(),basic:{nickname:'선택시험',collection:true,version:HUB_CONSENT_VERSION}}};
  const mutate=vi.fn().mockResolvedValue({saved:true});
  const hub:HubController={state,mutate,load:vi.fn(),setError:vi.fn(),error:'',status:''};return {hub,event,mutate};
}
it('does not choose or save a birth year merely by opening a decade, and waits for a durable save',async()=>{
  const {hub,event,mutate}=fixture(2);let finish!:(v:unknown)=>void;mutate.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  render(<BasicForm eventId={event.id} hub={hub}/>);
  const next=screen.getByRole('button',{name:'다음'}) as HTMLButtonElement;expect(next.disabled).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'00년대'}));expect(next.disabled).toBe(true);expect(mutate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'90년대'}));fireEvent.click(screen.getByRole('button',{name:'1998년생'}));fireEvent.click(next);
  expect(mutate.mock.calls[0][0]).toMatchObject({action:'application.basic-draft',revision:2,data:{nextStep:3,basic:{birthYear:1998,nickname:'선택시험'}}});
  expect(screen.getByRole('group',{name:'태어난 년도'})).toBeTruthy();expect((screen.getByRole('button',{name:'저장 중…'}) as HTMLButtonElement).disabled).toBe(true);
  finish({saved:true});await waitFor(()=>expect(screen.getByRole('group',{name:'도시'})).toBeTruthy());
});
it('requires one explicit Busan area before advancing and preserves the selected area on a second city tap',async()=>{
  const {hub,event,mutate}=fixture(3);hub.state!.basicDrafts![event.id].basic.birthYear=1998;
  render(<BasicForm eventId={event.id} hub={hub}/>);
  fireEvent.click(screen.getByRole('button',{name:'부산'}));expect((screen.getByRole('button',{name:'다음'}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'동으로 입력'}));fireEvent.click(screen.getByRole('button',{name:'전포동'}));
  fireEvent.click(screen.getByRole('button',{name:'부산'}));expect(screen.getByRole('button',{name:'전포동'}).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button',{name:'다음'}));await waitFor(()=>expect(mutate).toHaveBeenCalledOnce());
  expect(mutate.mock.calls[0][0]).toMatchObject({action:'application.basic-draft',data:{basic:{location:'부산 전포동',residence:{city:'부산',kind:'neighborhood',value:'전포동'}}}});
  expect(screen.queryByRole('group',{name:'부산 구'})).toBeNull();
});
it('saves each friend from the same year and city buttons without submitting or replacing the representative profile',async()=>{
  const mutate=vi.fn().mockResolvedValue({saved:true});
  render(<CompanionCards eventId="synthetic-event" mutate={mutate} busy={false} blocked={false} onOwn={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'+ 지인 추가'}));fireEvent.change(screen.getByLabelText('친구 닉네임'),{target:{value:'지인선택'}});
  fireEvent.click(screen.getByRole('button',{name:'1998년생'}));fireEvent.click(screen.getByRole('button',{name:'경기'}));fireEvent.click(screen.getByRole('button',{name:'파주'}));
  expect(mutate).not.toHaveBeenCalled();fireEvent.click(screen.getByLabelText(/친구에게 이번 행사/));fireEvent.click(screen.getByRole('button',{name:'친구 정보 저장'}));
  await waitFor(()=>expect(mutate).toHaveBeenCalledOnce());expect(mutate.mock.calls[0][0]).toMatchObject({action:'companion.draft.save',data:{eventId:'synthetic-event',basic:{nickname:'지인선택',birthYear:1998,location:'경기 파주'}}});
  expect(mutate.mock.calls[0][0].data.basic).not.toHaveProperty('phone');
});
it('keeps a saved birth year outside the common buttons and does not silently replace it',()=>{
  const change=vi.fn();render(<BirthYearSelect value="1985" onChange={change}/>);
  expect(screen.getByRole('button',{name:'1985년생'}).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button',{name:'00년대'}));expect(change).not.toHaveBeenCalled();
});
