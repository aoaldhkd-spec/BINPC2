// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,fireEvent} from '@testing-library/react';
import {WaitingOverlay} from './WaitingOverlay';
const access=vi.hoisted(()=>({authorized:true,public:false}));
vi.mock('./BossAccessBoundary',()=>({useBossTestAccess:()=>access.authorized,useHeartNowPublicAccess:()=>access.public}));
vi.mock('../lib/public-test-mode',()=>({TEST_MODE_BANNER:'시험 중 안내',usePublicTestMode:()=>true}));
vi.mock('../lib/landing-season',()=>({useLandingHalloween:()=>true}));
afterEach(()=>{cleanup();access.authorized=true;access.public=false;vi.useRealTimers();});
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

it('lets the owner use ordinary HeartNow admission when public legacy access is enabled, without redirecting into applications',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-31T13:15:00Z'));access.public=true;
 const enter=vi.fn();const view=render(<WaitingOverlay sessionActive={false} eventCycleStartedAt="2026-10-31T13:00:00Z" eventCycleResetComplete={false} onEnter={enter}/>);
 expect((screen.getByRole('button',{name:'입장하기'}) as HTMLButtonElement).disabled).toBe(true);
 view.rerender(<WaitingOverlay sessionActive eventCycleStartedAt="2026-10-31T13:00:00Z" eventCycleResetComplete={false} onEnter={enter}/>);
 fireEvent.click(screen.getByRole('button',{name:'입장하기'}));expect(screen.getByText('개인정보 안내')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'안내 확인 · 프로필 설정'}));expect(enter).toHaveBeenCalledOnce();
});
