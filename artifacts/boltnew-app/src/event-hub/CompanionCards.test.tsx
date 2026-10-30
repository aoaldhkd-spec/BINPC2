// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CompanionCards } from './CompanionCards';
afterEach(cleanup);
it('edits a person-specific draft without submitting a personal application or consent',async()=>{
  const mutate=vi.fn().mockResolvedValue({saved:true}),onOwn=vi.fn();
  const group={revision:2,items:[{id:'friend-one',basic:{nickname:'첫친구',birthYear:1992,location:'서울'}}]};
  const {rerender}=render(<CompanionCards eventId="event-one" group={group} mutate={mutate} busy={false} blocked={false} onOwn={onOwn}/>);
  fireEvent.click(screen.getByRole('button',{name:'친구 정보 수정'}));
  fireEvent.change(screen.getByLabelText('친구 닉네임'),{target:{value:'친구수정'}});
  fireEvent.click(screen.getByLabelText(/친구에게 이번 행사/));
  fireEvent.click(screen.getByRole('button',{name:'친구 정보 저장'}));
  await waitFor(()=>expect(mutate).toHaveBeenCalledTimes(1));
  expect(mutate.mock.calls[0][0]).toMatchObject({action:'companion.draft.save',revision:2,data:{eventId:'event-one',id:'friend-one',basic:{nickname:'친구수정',birthYear:1992,location:'서울'}}});
  expect(onOwn).not.toHaveBeenCalled();
  rerender(<CompanionCards eventId="event-one" group={{revision:3,items:[{...group.items[0],basic:{...group.items[0].basic,nickname:'친구수정'}}]}} mutate={mutate} busy={false} blocked={false} onOwn={onOwn}/>);
  expect(screen.getByRole('heading',{name:/친구 1 · 친구수정/})).toBeTruthy();
});
it('a stale friend list keeps typed input and blocks overwriting newer saved data',()=>{
  const mutate=vi.fn(),props={eventId:'event',mutate,busy:false,blocked:false,onOwn:vi.fn()};
  const {rerender}=render(<CompanionCards {...props} group={{revision:0,items:[]}}/>);
  fireEvent.click(screen.getByRole('button',{name:'친구 추가'}));
  fireEvent.change(screen.getByLabelText('친구 닉네임'),{target:{value:'남은입력'}});
  fireEvent.click(screen.getByLabelText(/친구에게 이번 행사/));
  rerender(<CompanionCards {...props} group={{revision:1,items:[]}}/>);
  expect((screen.getByLabelText('친구 닉네임') as HTMLInputElement).value).toBe('남은입력');
  expect((screen.getByRole('button',{name:'친구 정보 저장'}) as HTMLButtonElement).disabled).toBe(true);
  expect(mutate).not.toHaveBeenCalled();
});

it('preserves existing person drafts and linked records without offering an invitation-code flow',()=>{
  const mutate=vi.fn();
  const group={revision:4,items:[
    {id:'draft-one',basic:{nickname:'동반친구',birthYear:1998,location:'파주'}},
    {id:'linked-one',basic:{nickname:'기존친구',birthYear:1992,location:'서울'},claimedAt:'2026-10-29T12:00:00Z'},
  ]};
  const snapshot=structuredClone(group);
  const {container}=render(<CompanionCards eventId="existing-event" group={group} mutate={mutate} busy={false} blocked={false} onOwn={vi.fn()}/>);
  expect(screen.getByRole('heading',{name:'동반신청'})).toBeTruthy();
  expect(screen.getByText('친구 정보 저장됨 · 신청 미확정')).toBeTruthy();
  expect(screen.getByText('본인 계정에 연결됨')).toBeTruthy();
  expect(screen.getByRole('heading',{name:'친구 1 · 동반친구'})).toBeTruthy();
  expect(screen.getByRole('heading',{name:'친구 2 · 기존친구'})).toBeTruthy();
  expect(screen.queryByRole('button',{name:/초대코드|연결코드/})).toBeNull();
  expect(screen.queryByLabelText(/초대코드|연결코드/)).toBeNull();
  expect(container.querySelector('code')).toBeNull();
  expect(screen.getAllByRole('button',{name:'친구 정보 수정'})).toHaveLength(1);
  expect(group).toEqual(snapshot);
  expect(mutate).not.toHaveBeenCalled();
});
