import {afterEach,expect,it,vi} from 'vitest';
import {heartNowPublicAccess,isHeartNowPublicRequest} from './heartnow-access';
afterEach(()=>vi.unstubAllEnvs());
it('requires the explicit independent opt-in, never recruitment or test mode',()=>{
 for(const value of ['', '0','true']){vi.stubEnv('HEARTNOW_PUBLIC_ACCESS',value);expect(heartNowPublicAccess()).toBe(false);expect(isHeartNowPublicRequest('POST','/api/db/op')).toBe(false);}
 vi.stubEnv('HEARTNOW_PUBLIC_ACCESS','1');expect(heartNowPublicAccess()).toBe(true);
});
it('permits legacy transports while keeping event, admin, push-send and unknown routes locked',()=>{
 vi.stubEnv('HEARTNOW_PUBLIC_ACCESS','1');
 for(const [verb,route]of [['GET','/api/db/ready'],['GET','/api/db/events'],['POST','/api/db/op'],['POST','/api/db/auth/login'],['POST','/api/db/rpc/verify_panel_password'],['POST','/api/db/push/subscribe']])expect(isHeartNowPublicRequest(verb,route)).toBe(true);
 for(const [verb,route]of [['GET','/api/event-hub/state'],['POST','/api/event-hub/mutate'],['GET','/api/event-hub/laboratory'],['POST','/api/db/rpc/admin_toggle_session'],['POST','/api/db/rpc/test_update_settings'],['GET','/api/db/health'],['POST','/api/db/admin/clear-db-errors'],['POST','/api/db/push/notify'],['POST','/api/db/push/self-test'],['GET','/api/db/op'],['DELETE','/api/db/op'],['POST','/api/db/rpc/a/../admin']])expect(isHeartNowPublicRequest(verb,route)).toBe(false);
});
