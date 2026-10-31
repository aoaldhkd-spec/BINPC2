// @vitest-environment happy-dom
import { act, cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi, beforeEach } from 'vitest';
import { useState, useEffect } from 'react';
import { SeasonalSkin, SEASONAL_SKIN_CHANGED } from './SeasonalSkin';
vi.mock('../lib/bootstrap-ready', () => ({ readBootstrapReady: () => fetch('/api/db/ready').then(r => r.ok ? r.json() : null).catch(() => null) }));
const mounts=vi.fn();
function ExistingForm() {
  const [value,setValue]=useState('작성 중 프로필');
  useEffect(()=>{mounts();},[]);
  return <input aria-label="기존 입력" value={value} onChange={e=>setValue(e.target.value)}/>;
}
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-30T22:00:00+09:00'));mounts.mockClear();});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();localStorage.clear();});
it('admin skin OFF restores presentation without remounting or clearing profile input/dark preference',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({settings:{module_flags:{seasonal_landing:true}}})}));
  localStorage.setItem('dark_mode','0');localStorage.setItem('matching_user','existing-profile');
  render(<SeasonalSkin><ExistingForm/></SeasonalSkin>);
  await waitFor(()=>expect(document.documentElement.dataset.seasonalSkin).toBe('halloween'));
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'프로필 이어쓰기'}});
  act(()=>window.dispatchEvent(new CustomEvent(SEASONAL_SKIN_CHANGED,{detail:false})));
  expect(document.documentElement.dataset.seasonalSkin).toBeUndefined();
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('프로필 이어쓰기');
  expect(localStorage.getItem('dark_mode')).toBe('0');expect(localStorage.getItem('matching_user')).toBe('existing-profile');expect(mounts).toHaveBeenCalledTimes(1);
  act(()=>window.dispatchEvent(new CustomEvent(SEASONAL_SKIN_CHANGED,{detail:true})));
  expect(document.documentElement.dataset.seasonalSkin).toBe('halloween');expect(mounts).toHaveBeenCalledTimes(1);
  vi.setSystemTime(new Date('2026-11-01T17:00:00+09:00'));
  await act(async()=>window.dispatchEvent(new Event('focus')));
  expect(document.documentElement.dataset.seasonalSkin).toBeUndefined();
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('프로필 이어쓰기');expect(mounts).toHaveBeenCalledTimes(1);
});
it('late settings and temporary failures cannot turn the skin back on after an administrator turns it off',async()=>{
  let resolve!:(v:unknown)=>void;
  const fetcher=vi.fn().mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockRejectedValue(new Error('offline'));
  vi.stubGlobal('fetch',fetcher);
  render(<SeasonalSkin><ExistingForm/></SeasonalSkin>);
  act(()=>window.dispatchEvent(new CustomEvent(SEASONAL_SKIN_CHANGED,{detail:false})));
  await act(async()=>resolve({ok:true,json:async()=>({settings:{module_flags:{seasonal_landing:true}}})}));
  expect(document.documentElement.dataset.seasonalSkin).toBeUndefined();
  await act(async()=>window.dispatchEvent(new Event('focus')));
  expect(document.documentElement.dataset.seasonalSkin).toBeUndefined();expect(mounts).toHaveBeenCalledTimes(1);
});
