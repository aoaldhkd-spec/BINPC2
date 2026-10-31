import {afterEach,expect,it,vi} from 'vitest';
import {withRequestDeadline} from './request-deadline';
afterEach(()=>vi.useRealTimers());
it('ends a request even when authentication or a transport never settles',async()=>{
 vi.useFakeTimers();let signal!:AbortSignal;
 const pending=withRequestDeadline(s=>{signal=s;return new Promise(()=>{});},1000);
 const failure=expect(pending).rejects.toThrow('저장된 결과는 유지');
 await vi.advanceTimersByTimeAsync(1000);await failure;expect(signal.aborted).toBe(true);
});
it('lets a delayed authentication check cancellation before sending a write',async()=>{
 vi.useFakeTimers();let finish!:()=>void;const write=vi.fn();
 const pending=withRequestDeadline(async signal=>{await new Promise<void>(r=>{finish=r;});if(signal.aborted)return;write();},1000);
 const failure=expect(pending).rejects.toThrow('연결이 지연');
 await vi.advanceTimersByTimeAsync(1000);await failure;finish();await Promise.resolve();expect(write).not.toHaveBeenCalled();
});
it('preserves a committed response and clears the deadline without a later timeout',async()=>{
 vi.useFakeTimers();const result={id:'existing-card'};expect(await withRequestDeadline(async()=>result,1000)).toBe(result);
 expect(vi.getTimerCount()).toBe(0);
});
