// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
vi.mock('../admin/LoginScreen',()=>({LoginScreen:()=> <div>owner login</div>}));
import { BossAccessBoundary } from './BossAccessBoundary';
beforeEach(()=>{window.history.replaceState({},'', '/events');});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();});
const response=(locked:boolean,authorized:boolean)=>new Response(JSON.stringify({locked,authorized,sseTicket:'synthetic-ticket'}));
function Draft(){const [text,setText]=useState('');return <input aria-label="작성 중 프로필" value={text} onChange={e=>setText(e.target.value)}/>;}
it('does not mount private content for ordinary users, old local tokens or failed access lookup',async()=>{
 localStorage.setItem('admin_token_v1','old-admin-token');
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response(true,false)));
 render(<BossAccessBoundary><Draft/></BossAccessBoundary>);
 await screen.findByText('현재 테스트 중입니다');
 expect(screen.queryByLabelText('작성 중 프로필')).toBeNull();
});
it('temporarily hides private content while preserving its draft across failed and recovered access lookups',async()=>{
 const fetch=vi.fn().mockImplementation(()=>Promise.resolve(response(true,true)));vi.stubGlobal('fetch',fetch);
 render(<BossAccessBoundary><Draft/></BossAccessBoundary>);
 const input=await screen.findByLabelText('작성 중 프로필');fireEvent.change(input,{target:{value:'보존할 입력'}});
 fetch.mockRejectedValue(Error('offline'));
 await act(async()=>{window.dispatchEvent(new Event('pageshow'));});
 await screen.findByText('접근 권한을 확인하지 못했습니다.');
 expect((input as HTMLInputElement).value).toBe('보존할 입력');
 expect(input.closest('[hidden]')).not.toBeNull();
 fetch.mockImplementation(()=>Promise.resolve(response(true,true)));
 await act(async()=>{window.dispatchEvent(new Event('online'));});
 await waitFor(()=>expect(input.closest('[hidden]')).toBeNull());
 expect((input as HTMLInputElement).value).toBe('보존할 입력');
});

it('allows the legacy home only and immediately blocks navigation into event screens',async()=>{
 window.history.replaceState({},'', '/');
 vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>Promise.resolve(new Response(JSON.stringify({locked:true,authorized:false,heartnowPublic:true})))));
 render(<BossAccessBoundary><Draft/></BossAccessBoundary>);
 await screen.findByLabelText('작성 중 프로필');
 await act(async()=>{window.history.pushState({},'', '/events');window.dispatchEvent(new Event('app-route-changed'));});
 await screen.findByText('현재 테스트 중입니다');
 expect(screen.queryByLabelText('작성 중 프로필')).toBeNull();
 await act(async()=>{window.history.replaceState({},'', '/');window.dispatchEvent(new PopStateEvent('popstate'));});
 await screen.findByLabelText('작성 중 프로필');
});

it.each(['/', '/index.html'])('opens ordinary HeartNow at %s without any owner access request',path=>{
 window.history.replaceState({},'',path);
 const fetch=vi.fn(()=>new Promise(()=>{}));vi.stubGlobal('fetch',fetch);
 render(<BossAccessBoundary><Draft/></BossAccessBoundary>);
 expect(screen.getByLabelText('작성 중 프로필')).toBeTruthy();
 expect(screen.queryByText('접근 권한 확인 중…')).toBeNull();
 expect(fetch).not.toHaveBeenCalled();
});

it('keeps the ordinary profile mounted without owner polling on app return, reconnection or timer ticks',async()=>{
 vi.useFakeTimers();window.history.replaceState({},'', '/');
 const fetch=vi.fn().mockRejectedValue(Error('owner service unavailable'));vi.stubGlobal('fetch',fetch);
 render(<BossAccessBoundary><Draft/></BossAccessBoundary>);
 const input=screen.getByLabelText('작성 중 프로필');fireEvent.change(input,{target:{value:'복귀해도 같은 프로필'}});
 await act(async()=>{
  window.dispatchEvent(new Event('pageshow'));window.dispatchEvent(new Event('online'));
  window.dispatchEvent(new Event('boss-access-changed'));document.dispatchEvent(new Event('visibilitychange'));
  vi.advanceTimersByTime(600000);
 });
 expect(screen.getByLabelText('작성 중 프로필')).toBe(input);
 expect((input as HTMLInputElement).value).toBe('복귀해도 같은 프로필');
 expect(input.closest('[hidden]')).toBeNull();expect(fetch).not.toHaveBeenCalled();
 expect(screen.queryByText('접근 권한 확인 중…')).toBeNull();
 expect(screen.queryByText('접근 권한을 확인하지 못했습니다.')).toBeNull();
});

it.each(['/events/waiting','/admin','/test'])('still protects direct private route %s',async path=>{
 window.history.replaceState({},'',path);
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response(true,false)));
 render(<BossAccessBoundary><Draft/></BossAccessBoundary>);
 await screen.findByText('현재 테스트 중입니다');expect(screen.queryByLabelText('작성 중 프로필')).toBeNull();
});
