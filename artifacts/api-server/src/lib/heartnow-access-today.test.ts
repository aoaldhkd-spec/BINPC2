import {afterEach,expect,it,vi} from 'vitest';
import {configureHeartNowSession,todayHeartNowSession,heartNowPublicAccess,isHeartNowPublicRequest} from './heartnow-access';
const settings={event_cycle_archive_id:'today',event_cycle_started_at:'2026-10-31T22:00:00+09:00',event_cycle_reset_complete:false,session_active:true};
afterEach(()=>{configureHeartNowSession(()=>({}));vi.unstubAllEnvs();vi.useRealTimers();});
it('follows the existing October 31 cycle without opening recruitment or management',()=>{
 vi.stubEnv('HEARTNOW_PUBLIC_ACCESS','');vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-31T23:00:00+09:00'));configureHeartNowSession(()=>settings);
 expect(heartNowPublicAccess()).toBe(true);expect(isHeartNowPublicRequest('POST','/api/db/halloween-cards')).toBe(true);expect(isHeartNowPublicRequest('POST','/api/event-hub/mutate')).toBe(false);expect(isHeartNowPublicRequest('GET','/api/event-hub/admin')).toBe(false);
 configureHeartNowSession(()=>({...settings,session_active:false}));expect(heartNowPublicAccess()).toBe(true);
});
it('does not reactivate before start, after the 17:00 reset, on an older cycle or a different day',()=>{
 for(const date of ['2026-10-31T21:59:59+09:00','2026-11-01T17:00:00+09:00'])expect(todayHeartNowSession(settings,new Date(date))).toBe(false);
 expect(todayHeartNowSession({...settings,event_cycle_reset_complete:true},new Date('2026-10-31T23:00:00+09:00'))).toBe(false);
 expect(todayHeartNowSession({...settings,event_cycle_started_at:'2026-10-30T22:30:00+09:00'},new Date('2026-10-31T23:00:00+09:00'))).toBe(false);
 expect(todayHeartNowSession({...settings,event_cycle_started_at:'2026-11-01T02:00:00+09:00'},new Date('2026-11-01T03:00:00+09:00'))).toBe(false);
});
it('shows the ordinary waiting screen after reset without opening the application API',()=>{
 vi.stubEnv('HEARTNOW_PUBLIC_ACCESS','');vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-31T20:00:00+09:00'));configureHeartNowSession(()=>({event_cycle_reset_complete:true,session_active:false}));expect(heartNowPublicAccess()).toBe(true);expect(isHeartNowPublicRequest('POST','/api/event-hub/mutate')).toBe(false);
 vi.setSystemTime(new Date('2026-11-01T17:00:00+09:00'));expect(heartNowPublicAccess()).toBe(false);
});
