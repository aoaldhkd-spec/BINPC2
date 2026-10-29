// @vitest-environment happy-dom
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EventLaboratoryStore } from './event-laboratory-store';
import { PaymentAccounts } from './PaymentAccounts';
import { ResidenceInput } from './ResidenceInput';
import { VenueDirectoryEditor } from './VenueDirectoryEditor';
import type { HubController } from '../lib/event-hub-client';
vi.mock('../lib/supabase',()=>({supabase:{},onSseReconnect:()=>()=>{},isSseHealthy:()=>true}));
afterEach(cleanup);
function fixture(){
  const store=new EventLaboratoryStore();store.jump('회비 확인');
  const state=store.state();
  const hub:HubController={state,status:'',error:'',load:vi.fn(),setError:vi.fn(),mutate:vi.fn()};
  const app=state.applications[0];
  app.quote!.fee=30000;delete app.waivedAt;
  app.billing!.accounts=[{id:'synthetic-a',bank:'시험은행',number:'0000-0000-0001'}];
  return {hub,state,app};
}
it.each(['approved','reported','held','mismatch'] as const)('does not solicit another payment after %s',payment=>{
  const {hub,app}=fixture();app.payment=payment;
  render(<PaymentAccounts app={app} hub={hub} blocked={false}/>);
  expect(screen.getByText(/다시 송금하지 마세요/)).toBeTruthy();
  expect(screen.queryByRole('button',{name:'계좌번호 복사'})).toBeNull();
  expect(screen.queryByText(/0000-0000-0001/)).toBeNull();
});
it('uses the saved account choice and hides banking actions in test mode',()=>{
  const {hub,app}=fixture();
  const view=render(<PaymentAccounts app={app} hub={hub} blocked={false}/>);
  fireEvent.click(screen.getByRole('button',{name:'이 계좌 선택'}));
  expect(hub.mutate).toHaveBeenCalledWith({action:'application.account',target:app.id,revision:app.revision,data:{accountId:'synthetic-a'}});
  view.rerender(<PaymentAccounts app={app} hub={hub} blocked/>);
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByText(/0000-0000-0001/)).toBeNull();
});
it('accepts one Busan district or neighborhood, and another city without merging fields',()=>{
  function Harness(){const [v,setV]=useState('');const [r,setR]=useState<Parameters<typeof ResidenceInput>[0]['residence']>();return <><ResidenceInput value={v} residence={r} onChange={(value,residence)=>{setV(value);setR(residence);}}/><output aria-label="저장 지역">{v}</output></>;}
  render(<Harness/>);
  fireEvent.click(screen.getByRole('button',{name:'부산'}));
  fireEvent.click(screen.getByRole('button',{name:'동으로 입력'}));
  fireEvent.change(screen.getByLabelText('사는 지역'),{target:{value:'전포동'}});
  expect(screen.getByLabelText('저장 지역').textContent).toBe('부산 전포동');
  expect(screen.getAllByRole('textbox')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button',{name:'다른 도시'}));
  fireEvent.change(screen.getByLabelText('사는 지역'),{target:{value:'파주'}});
  expect(screen.getByLabelText('저장 지역').textContent).toBe('파주');
});
it('blocks an unsaved address link and sends the original revision after a concurrent edit',()=>{
  const {hub,state}=fixture();
  const original={id:crypto.randomUUID(),venueId:'jack' as const,label:'합성 매장',roadOriginal:'시험로 1',parcelOriginal:'시험동 12(13)',floor:'B1',source:'합성',receivedAt:new Date().toISOString()};
  state.venueDirectory={revision:4,items:[original],history:[]};
  const view=render(<VenueDirectoryEditor hub={hub} event={state.events[0]}/>);
  fireEvent.change(screen.getByLabelText('저장된 매장 주소'),{target:{value:original.id}});
  fireEvent.change(screen.getByLabelText('도로명 원문'),{target:{value:'시험로 2'}});
  fireEvent.click(screen.getByRole('checkbox'));
  expect((screen.getByRole('button',{name:'이 행사 1차 장소로 연결'}) as HTMLButtonElement).disabled).toBe(true);
  state.venueDirectory={revision:5,items:[{...original,roadOriginal:'다른 탭 변경'}],history:[]};
  view.rerender(<VenueDirectoryEditor hub={hub} event={state.events[0]}/>);
  fireEvent.click(screen.getByRole('button',{name:'매장 주소 저장'}));
  expect(hub.mutate).toHaveBeenCalledWith(expect.objectContaining({action:'venue.address.save',revision:4}));
});
