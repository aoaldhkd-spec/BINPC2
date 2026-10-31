// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
vi.mock('../admin/LoginScreen',()=>({LoginScreen:()=> <div>owner login</div>}));
import { BossAccessBoundary } from './BossAccessBoundary';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
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
