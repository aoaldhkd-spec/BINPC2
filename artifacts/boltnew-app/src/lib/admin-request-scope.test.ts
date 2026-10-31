// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { adminRequestScope, testerRequestScope } from './admin-request-scope';
afterEach(()=>{vi.restoreAllMocks();localStorage.clear();window.history.replaceState({},'', '/');});
it('only the administrator route, including its configured base, carries admin authority',()=>{
  for(const path of ['/','/events','/administrator','/test','/events/admin']) expect(adminRequestScope(path)).toBe(false);
  expect(adminRequestScope('/admin')).toBe(true);expect(adminRequestScope('/admin/events')).toBe(true);
  expect(adminRequestScope('/binpc2/admin','/binpc2/')).toBe(true);
  expect(adminRequestScope('/binpc2/events','/binpc2/')).toBe(false);
});
it('stored admin login is retained but not attached to participant database requests',async()=>{
  localStorage.setItem('admin_token_v1','synthetic-admin-token');
  const requests: Record<string,unknown>[]=[];
  vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{if(init?.body)requests.push(JSON.parse(String(init.body)));return new Response(JSON.stringify({data:[],error:null}));});
  const {supabase}=await import('./localdb');
  window.history.replaceState({},'', '/events');await supabase.from('profiles').select('*');
  expect(requests.at(-1)).not.toHaveProperty('adminToken');
  window.history.replaceState({},'', '/admin');await supabase.from('profiles').select('*');
  expect(requests.at(-1)?.adminToken).toBe('synthetic-admin-token');
  window.history.replaceState({},'', '/');await supabase.from('profiles').select('*');
  expect(requests.at(-1)).not.toHaveProperty('adminToken');
  expect(localStorage.getItem('admin_token_v1')).toBe('synthetic-admin-token');
});

it('keeps tester credentials restricted to the explicit tester route',()=>{
  for(const path of ['/','/index.html','/events','/events/waiting','/admin','/tester','/testimony']) expect(testerRequestScope(path)).toBe(false);
  expect(testerRequestScope('/test')).toBe(true);
  expect(testerRequestScope('/test/tools')).toBe(true);
  expect(testerRequestScope('/binpc2/test','/binpc2/')).toBe(true);
  expect(testerRequestScope('/binpc2/','/binpc2/')).toBe(false);
});

it('registers an ordinary profile without stale tester authority and preserves both stored credentials and profile draft',async()=>{
  localStorage.setItem('test_token_v1','synthetic-retired-tester-token');
  localStorage.setItem('admin_token_v1','synthetic-admin-token');
  localStorage.setItem('registration-draft-proof','keep-the-draft');
  const sent:Record<string,unknown>[]=[];
  vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{
    const body=JSON.parse(String(init?.body));sent.push(body);
    if(body.testToken) return new Response(JSON.stringify({data:null,error:{code:'LEGACY_TEST_WRITE_DISABLED'}}),{status:423});
    return new Response(JSON.stringify({data:{id:'synthetic-ordinary-profile'},error:null}));
  });
  const {supabase}=await import('./localdb');
  window.history.replaceState({},'', '/');
  const saved=await supabase.from('profiles').insert({id:'synthetic-ordinary-profile',nickname:'격리검증'}).select().single();
  expect(saved.error).toBeNull();expect(saved.data?.id).toBe('synthetic-ordinary-profile');
  expect(sent.at(-1)).not.toHaveProperty('testToken');expect(sent.at(-1)).not.toHaveProperty('adminToken');
  window.history.replaceState({},'', '/test');await supabase.from('profiles').select('*');
  expect(sent.at(-1)?.testToken).toBe('synthetic-retired-tester-token');
  expect(localStorage.getItem('test_token_v1')).toBe('synthetic-retired-tester-token');
  expect(localStorage.getItem('registration-draft-proof')).toBe('keep-the-draft');
});
