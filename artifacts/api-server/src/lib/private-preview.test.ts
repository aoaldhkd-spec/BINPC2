import { describe,it,expect,vi,afterEach } from 'vitest';
import express from 'express';
import {createPrivatePreviewGate,validatePrivatePreview,productionHubBlocked} from './private-preview';
const env={APP_MODE:'private-preview',NODE_ENV:'production',DATABASE_URL:'postgresql://preview@127.0.0.1:5432/binpc2_private_v6',
 PREVIEW_ACCESS_USER:'test-only',PREVIEW_ACCESS_PASSWORD:'access-fixture-not-deployment-'.repeat(2),BOOTSTRAP_ADMIN_PASSWORD:'admin-fixture-not-deployment-'.repeat(2),
 BOOTSTRAP_TEST_PASSWORD:'test-fixture-not-deployment-'.repeat(2),SESSION_SECRET:'session-fixture-not-deployment-'.repeat(2),PREVIEW_ALLOW_LOOPBACK_HTTP:'1',PREVIEW_PUBLIC_ORIGIN:'http://127.0.0.1:8084'};
afterEach(()=>vi.unstubAllEnvs());
describe('private real-app preview boundary',()=>{
 it('refuses operational URLs, wrong database names, missing access protection, development mode and live sender keys',()=>{
  for(const patch of [
   {DATABASE_URL:'postgresql://user@db.example.supabase.co:5432/postgres'},
   {DATABASE_URL:'postgresql://user@127.0.0.1:5432/binpc2_hub_handoff_dev'},
   {PREVIEW_ACCESS_PASSWORD:''},{NODE_ENV:'development'},{VAPID_PRIVATE_KEY:'refused'},
  ])expect(()=>validatePrivatePreview({...env,...patch})).toThrow();
  expect(validatePrivatePreview(env)).toBe(true);
 });
 it('keeps the existing operational production signup gate without explicit valid preview isolation',()=>{
  vi.stubEnv('NODE_ENV','production');vi.stubEnv('APP_MODE','');
  expect(productionHubBlocked()).toBe(true);
  vi.stubEnv('APP_MODE','private-preview');vi.stubEnv('DATABASE_URL','postgresql://user@db.example.supabase.co/postgres');
  expect(()=>productionHubBlocked()).toThrow();
 });
 it('gates participant, administrator and API with no auth bypass; disables external send and exposes only health',async()=>{
  const app=express();app.use(createPrivatePreviewGate(env));app.use((_q,r)=>r.json({ok:true}));
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const address=server.address();if(!address||typeof address==='string')throw Error('test server unavailable');
  const base='http://127.0.0.1:'+address.port;
  try{
   for(const path of ['/','/events','/admin','/api/event-hub/admin']){
    expect((await fetch(base+path)).status).toBe(401);
   }
   expect((await fetch(base+'/api/healthz')).status).toBe(200);
   const headers={authorization:'Basic '+Buffer.from(env.PREVIEW_ACCESS_USER+':'+env.PREVIEW_ACCESS_PASSWORD).toString('base64')};
   const protectedResponse=await fetch(base+'/events',{headers});
   expect(protectedResponse.status).toBe(200);expect(protectedResponse.headers.get('x-robots-tag')).toContain('noindex');
   expect((await fetch(base+'/api/db/push/subscribe',{headers})).status).toBe(403);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
 });
});
