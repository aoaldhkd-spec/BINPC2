// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { adminRequestScope } from './admin-request-scope';
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
