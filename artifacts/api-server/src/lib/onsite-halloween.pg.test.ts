import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {campaignPresets,HubEventInput,type HubEvent,type HubApplication} from '@workspace/api-zod';
import {HubStore} from './event-hub-store';
import {OnsiteHalloweenService} from './onsite-halloween';
import {campaignAction,type CampaignStock} from './event-campaign-service';
import {isolatedFixtureDatabase} from './event-hub-isolation';
const url=process.env.HUB_TEST_DATABASE_URL;
describe.skipIf(!url)('onsite Halloween without application — actual PostgreSQL',()=>{
 const schema='onsite_cards_'+randomUUID().replaceAll('-','');const control=new pg.Pool({connectionString:url,max:1});
 const pool=new pg.Pool({connectionString:url,max:8,options:'-c search_path='+schema}),store=new HubStore(pool);let now:Date,service:OnsiteHalloweenService,eventId:string,userId:string;
 beforeAll(async()=>{isolatedFixtureDatabase(url!,['binpc2_hub_test_resume']);await control.query('CREATE SCHEMA '+schema);await pool.query(readFileSync(new URL('../../migrations/20261027_event_hub.sql',import.meta.url),'utf8'));await pool.query("CREATE TABLE IF NOT EXISTS app_kv_rows(table_name text NOT NULL,row_id text NOT NULL,data jsonb NOT NULL,updated_at timestamptz DEFAULT now(),PRIMARY KEY(table_name,row_id))");});
 afterAll(async()=>{await pool.end();await control.query('DROP SCHEMA '+schema+' CASCADE');await control.end();});
 beforeEach(async()=>{
  await pool.query('TRUNCATE event_hub_records,app_kv_rows');userId=randomUUID();now=new Date('2026-10-31T13:59:59.999Z');service=new OnsiteHalloweenService(store,()=>now,()=>0);
  const prepared=await store.transaction(tx=>campaignAction(tx,{action:'campaign.prepare',target:'halloween-2026-10-31',data:{}},true,now.toISOString()));eventId=prepared.id!;
  await pool.query("INSERT INTO app_kv_rows(table_name,row_id,data) VALUES('app_settings','1',$1),('profiles',$2,$3)",[JSON.stringify({session_active:true,event_cycle_started_at:'2026-10-31T13:00:00Z',event_cycle_reset_complete:false,event_cycle_archive_id:'cycle-saturday',module_flags:{event_hub:true}}),userId,JSON.stringify({id:userId,nickname:'격리참가자',pin_code:'4321'})]);
 });
 const remaining=()=>store.transaction(async tx=>(await tx.stocksForEvent<CampaignStock>(eventId)).reduce((n,s)=>n+s.remaining,0));
 it('keeps three cards locked at boundaries, then draws once per slot under concurrent replay and restart',async()=>{
  let notifications=0;service=new OnsiteHalloweenService(store,()=>now,()=>0,()=>{notifications++;});
  expect(await remaining()).toBe(49);expect((await service.state(userId)).cards).toHaveLength(0);
  await expect(service.draw(userId,eventId,0)).rejects.toMatchObject({code:'CARD_LOCKED'});
  for(const [slot,at]of ['2026-10-31T14:00:00Z','2026-10-31T15:00:00Z','2026-10-31T15:30:00Z'].entries()){
   now=new Date(at);if(slot>0){now=new Date(Date.parse(at)-1);await expect(service.draw(userId,eventId,slot)).rejects.toMatchObject({code:'CARD_LOCKED'});now=new Date(at);}
   const before=await remaining();const results=await Promise.all(Array.from({length:15},()=>service.draw(userId,eventId,slot)));
   expect(new Set(results.map(r=>r.cards[slot].id)).size).toBe(1);expect(before-await remaining()).toBe(1);
   expect(notifications).toBe(slot+1);service=new OnsiteHalloweenService(new HubStore(pool),()=>now,()=>0,()=>{notifications++;});expect((await service.state(userId)).cards).toHaveLength(slot+1);
  }
  const saved=(await service.state(userId)).cards;now=new Date('2026-10-31T16:00:00Z');expect((await service.draw(userId,eventId,2)).cards).toEqual(saved);
  const rows=await pool.query("SELECT count(*)::int AS n FROM event_hub_records WHERE kind='application'");expect(rows.rows[0].n).toBe(0);
 });
 it('keeps modules/01:00/reset/other profiles and tour pools protected',async()=>{
  now=new Date('2026-10-31T15:30:00Z');await service.draw(userId,eventId,0);const state=await service.state(userId),stock=await remaining();
  await expect(service.draw('another-profile',eventId,0)).rejects.toMatchObject({code:'CARDS_UNAVAILABLE'});
  await store.transaction(async tx=>{const e=(await tx.get<HubEvent>('event',eventId))!;e.cardsEnabled=false;await tx.put('event',eventId,e);});
  expect((await service.state(userId)).cards).toEqual(state.cards);await expect(service.draw(userId,eventId,1)).rejects.toMatchObject({code:'CARDS_UNAVAILABLE'});
  await store.transaction(async tx=>{const e=(await tx.get<HubEvent>('event',eventId))!;e.cardsEnabled=true;await tx.put('event',eventId,e);});
  now=new Date('2026-10-31T16:00:00Z');await expect(service.draw(userId,eventId,1)).rejects.toMatchObject({code:'CARDS_UNAVAILABLE'});
  now=new Date('2026-11-01T08:00:00Z');await pool.query("UPDATE app_kv_rows SET data=data||'{\"event_cycle_reset_complete\":true}'::jsonb WHERE table_name='app_settings'");await expect(service.draw(userId,eventId,1)).rejects.toMatchObject({code:'CARDS_UNAVAILABLE'});
  expect((await service.state(userId,eventId)).cards).toEqual(state.cards);expect(await remaining()).toBe(stock);
  const preset=campaignPresets().find(p=>p.event.campaign.kind==='tour')!;const tour={...HubEventInput.parse(preset.event),id:'tour-independent',revision:1,recruitment:false,nextRank:0,history:[]} as HubEvent;await store.transaction(tx=>tx.put('event',tour.id,tour));await expect(service.draw(userId,tour.id,0)).rejects.toMatchObject({code:'CARDS_UNAVAILABLE'});
 });
 it('reuses linked application cards without a second entitlement and preserves individual approval',async()=>{
  now=new Date('2026-10-31T15:30:00Z');const owner=randomUUID(),application:HubApplication={id:randomUUID(),owner,eventId,revision:1,stage:4,rank:20,basic:{nickname:'격리참가자',birthYear:1995,location:'부산'},payment:'approved',attendance:'confirmed',checkin:true,profile:{lastStep:4},profileId:userId,cycleId:'cycle-saturday',cards:[],prizesGiven:[],history:[],updatedAt:now.toISOString()};
  await store.transaction(tx=>tx.put('application',application.id,application));await pool.query("UPDATE app_kv_rows SET data=data||$2::jsonb WHERE table_name='profiles' AND row_id=$1",[userId,JSON.stringify({event_hub_application:application.id,event_hub_owner:owner})]);
  await service.draw(userId,eventId,0);expect((await store.transaction(tx=>tx.get<HubApplication>('application',application.id)))?.cards).toHaveLength(1);
  expect((await pool.query("SELECT id FROM event_hub_records WHERE kind='settings' AND id LIKE 'onsite-halloween:%'")).rows).toHaveLength(0);
  await store.transaction(async tx=>{const a=(await tx.get<HubApplication>('application',application.id))!;a.approvalRevokedAt=now.toISOString();await tx.put('application',a.id,a);});await expect(service.draw(userId,eventId,1)).rejects.toMatchObject({code:'CARDS_UNAVAILABLE'});expect((await service.state(userId)).cards).toHaveLength(1);
 });
 it('preserves a tour-linked profile and refuses a second Halloween entitlement',async()=>{
  const owner=randomUUID(),preset=campaignPresets().find(p=>p.event.campaign.kind==='tour')!;
  const tour={...HubEventInput.parse(preset.event),id:'tour-owned',revision:1,recruitment:false,nextRank:0,history:[]} as HubEvent;
  const app:HubApplication={id:'tour-app',owner,eventId:tour.id,profileId:userId,cards:[],prizesGiven:[],revision:1,stage:4,rank:20,basic:{nickname:'격리참가자',birthYear:1995,location:'부산'},payment:'approved',attendance:'confirmed',checkin:true,profile:{lastStep:4},history:[],updatedAt:now.toISOString()};
  await store.transaction(async tx=>{await tx.put('event',tour.id,tour);await tx.put('application',app.id,app);});
  await pool.query("UPDATE app_kv_rows SET data=data||$2::jsonb WHERE table_name='profiles' AND row_id=$1",[userId,JSON.stringify({event_hub_application:app.id,event_hub_owner:owner})]);
  expect((await service.state(userId)).event).toBeNull();
  await expect(service.draw(userId,eventId,0)).rejects.toMatchObject({code:'EVENT_SCOPE'});
  expect(await remaining()).toBe(49);expect((await store.transaction(tx=>tx.get<HubApplication>('application',app.id)))?.cards).toHaveLength(0);
 });
 it('allows the operator to hand over one Haribo before the first card unlock without creating an application',async()=>{
  const stock=await remaining();expect((await service.results()).find(r=>r.profileId===userId)?.cards).toHaveLength(0);expect((await pool.query("SELECT id FROM event_hub_records WHERE kind='settings' AND id LIKE 'onsite-halloween:%'")).rows).toHaveLength(0);await Promise.all([service.give(eventId,userId),service.give(eventId,userId)]);
  const given=await service.state(userId);expect(given.cards).toHaveLength(0);expect(given.candyGivenAt).toBe(now.toISOString());expect(await remaining()).toBe(stock);
  now=new Date('2026-10-31T14:00:00Z');const after=await service.draw(userId,eventId,0);expect(after.candyGivenAt).toBe(given.candyGivenAt);expect(after.cards).toHaveLength(1);
 });
 it('records prize/Haribo fulfillment once and never decrements stock at handover',async()=>{
  now=new Date('2026-10-31T15:30:00Z');const state=await service.draw(userId,eventId,0),stock=await remaining();
  await Promise.all(Array.from({length:10},()=>service.give(eventId,userId,state.cards[0].id)));await Promise.all([service.give(eventId,userId),service.give(eventId,userId)]);
  const given=await service.state(userId);expect(given.prizesGiven).toEqual([state.cards[0].id]);expect(given.candyGivenAt).toBe(now.toISOString());expect(await remaining()).toBe(stock);
  expect((await service.results())[0].history).toHaveLength(2);
 });
 it('carries unused Friday stock once under concurrent requests, preserving IDs and Saturday card limits',async()=>{
  const friday=await store.transaction(tx=>campaignAction(tx,{action:'campaign.prepare',target:'halloween-2026-10-30',data:{}},true,now.toISOString()));
  const source=friday.id!;const before=await store.transaction(tx=>tx.stocksForEvent<CampaignStock>(source));
  await Promise.all(Array.from({length:15},()=>store.transaction(tx=>campaignAction(tx,{action:'campaign.stock.carry',target:eventId,data:{sourceEventId:source}},true,now.toISOString()))));
  expect(await remaining()).toBe(72);const donors=await store.transaction(tx=>tx.stocksForEvent<CampaignStock>(source));expect(donors.map(s=>s.id)).toEqual(before.map(s=>s.id));expect(donors.every(s=>s.remaining===0&&s.history.length===2)).toBe(true);
  const totals=await store.transaction(async tx=>Object.fromEntries((await tx.stocksForEvent<CampaignStock>(eventId)).map(s=>[s.label,s.remaining])));expect(totals).toEqual({'LED 반지':40,'할로윈 키링':24,'LED 목걸이':6,'LED 밴드':2});
  now=new Date('2026-10-31T15:30:00Z');await Promise.all(Array.from({length:10},()=>service.draw(userId,eventId,0)));await service.draw(userId,eventId,1);await service.draw(userId,eventId,2);expect((await service.state(userId)).cards).toHaveLength(3);await expect(service.draw(userId,eventId,3)).rejects.toBeTruthy();expect(await remaining()).toBe(69);
 });
 it('moves only remaining Friday inventory and rejects unprivileged or mixed test/operating transfers',async()=>{
  const friday=await store.transaction(tx=>campaignAction(tx,{action:'campaign.prepare',target:'halloween-2026-10-30',data:{}},true,now.toISOString()));const source=friday.id!;
  await store.transaction(async tx=>{const stock=(await tx.stocksForEvent<CampaignStock>(source)).find(s=>s.label==='LED 반지')!;stock.remaining--;stock.history.push({at:now.toISOString(),actor:'system',action:'draw.reserve',reason:'existing-result-preserved'});await tx.put('stock',stock.id,stock);});
  const command={action:'campaign.stock.carry',target:eventId,data:{sourceEventId:source}};
  await expect(store.transaction(tx=>campaignAction(tx,command,false,now.toISOString()))).rejects.toMatchObject({code:'ADMIN'});expect(await remaining()).toBe(49);
  await store.transaction(tx=>campaignAction(tx,command,true,now.toISOString()));expect(await remaining()).toBe(71);
  const donor=await store.transaction(async tx=>(await tx.stocksForEvent<CampaignStock>(source)).find(s=>s.label==='LED 반지'));expect(donor!.history.some(h=>h.reason==='existing-result-preserved')).toBe(true);
  const boss=await store.transaction(tx=>campaignAction(tx,{action:'campaign.prepare',target:'halloween-2026-10-30',data:{}},true,now.toISOString(),true));await expect(store.transaction(tx=>campaignAction(tx,{...command,data:{sourceEventId:boss.id}},true,now.toISOString()))).rejects.toMatchObject({code:'STOCK_SCOPE'});expect(await remaining()).toBe(71);
 });

 it('uses the existing Saturday cycle without event registration and initializes the 72-item ledger exactly once',async()=>{
  await pool.query("DELETE FROM event_hub_records WHERE kind IN ('event','stock')");
  const preview=await service.state(userId);expect(preview.event?.id).toBe('onsite-live-halloween-2026-10-31');expect(preview.cards).toHaveLength(0);expect((await pool.query("SELECT id FROM event_hub_records WHERE kind='stock'")).rowCount).toBe(0);
  now=new Date('2026-10-31T14:00:00Z');await Promise.all(Array.from({length:15},()=>service.draw(userId,preview.event!.id,0)));
  const stocks=await store.transaction(tx=>tx.stocksForEvent<CampaignStock>(preview.event!.id));expect(stocks.reduce((n,s)=>n+s.remaining,0)).toBe(71);expect(stocks.filter(s=>s.special).reduce((n,s)=>n+s.remaining,0)).toBe(8);
  service=new OnsiteHalloweenService(new HubStore(pool),()=>now,()=>0);const restored=await service.state(userId);expect(restored.cards).toHaveLength(1);expect(restored.cards[0].id).toBe((await service.draw(userId,preview.event!.id,0)).cards[0].id);
  await expect(store.transaction(tx=>campaignAction(tx,{action:'campaign.prepare',target:'halloween-2026-10-31',data:{}},true,now.toISOString()))).rejects.toMatchObject({code:'ONSITE_TODAY_ONLY'});
  await expect(service.draw(userId,'another-halloween',0)).rejects.toMatchObject({code:'EVENT_SCOPE'});
  now=new Date('2026-10-31T15:30:00Z');await service.draw(userId,preview.event!.id,1);await service.draw(userId,preview.event!.id,2);expect((await service.state(userId)).cards).toHaveLength(3);expect((await pool.query("SELECT id FROM event_hub_records WHERE kind IN ('event','application')")).rowCount).toBe(0);
  now=new Date('2026-10-31T16:00:00Z');expect((await service.state(userId)).cards).toHaveLength(3);await expect(service.draw(userId,preview.event!.id,3)).rejects.toBeTruthy();
 });
 it('refuses duplicate physical stock initialization when a previous normal ledger is present',async()=>{
  await pool.query("DELETE FROM event_hub_records WHERE kind='event'");now=new Date('2026-10-31T14:00:00Z');
  const preview=await service.state(userId);await expect(service.draw(userId,preview.event!.id,0)).rejects.toMatchObject({code:'STOCK_CONFLICT'});expect(await remaining()).toBe(49);expect((await service.state(userId)).cards).toHaveLength(0);
 });

});
