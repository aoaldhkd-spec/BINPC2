// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {WaitingOverlay} from './WaitingOverlay';
const access=vi.hoisted(()=>({authorized:true}));
vi.mock('./BossAccessBoundary',()=>({useBossTestAccess:()=>access.authorized}));
vi.mock('../lib/public-test-mode',()=>({TEST_MODE_BANNER:'시험 중 안내',usePublicTestMode:()=>true}));
vi.mock('../lib/landing-season',()=>({useLandingHalloween:()=>true}));
afterEach(()=>{cleanup();access.authorized=true;});
it('does not flash public-lock banners for an authenticated boss while test-mode lookup is pending; ordinary users stay blocked',()=>{
  const view=render(<WaitingOverlay sessionActive={false} onEnter={vi.fn()}/>);
  expect(screen.queryByText('시험 중 안내')).toBeNull();
  expect(screen.queryByRole('link',{name:'행사 공지 · 관리자 문의'})).toBeNull();
  expect((screen.getByRole('button',{name:'입장하기'}) as HTMLButtonElement).disabled).toBe(false);
  access.authorized=false;
  view.rerender(<WaitingOverlay sessionActive={false} onEnter={vi.fn()}/>);
  expect(screen.getByText('시험 중 안내')).toBeTruthy();
  expect((screen.getByRole('button',{name:'입장하기'}) as HTMLButtonElement).disabled).toBe(true);
});
