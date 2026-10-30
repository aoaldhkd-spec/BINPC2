import {beforeEach,expect,it} from 'vitest';
import {randomBytes,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {HUB_CONSENT_VERSION,HubEventInput,type HubApplication,type HubEvent} from '@workspace/api-zod';
import {EventHubService,type HubOwner} from './event-hub-service.js';
import {HubTx,type HubStore} from './event-hub-store.js';
let rows:Map<string,any>,counts:{ownerApps:number;eventSelect:number;allEvents:number},moduleEnabled:boolean,owner:HubOwner,event:HubEvent,clock:Date;
const key=randomBytes(32),copy=<T>(v:T):T=>v===undefined?v:structuredClone(v);
const db={async query(sql:string,values:any[]=[]){
 if(sql.startsWith('INSERT INTO event_hub_records')){rows.set(`${values[0]}:${values[1]}`,JSON.parse(values[2]));return{rows:[]};}
 if(sql.includes('jsonb_to_recordset'))return{rows:JSON.parse(values[0]).map((r:any)=>({...r,data:copy(rows.get(`${r.kind}:${r.id}`))??null}))};
 if(sql.includes("table_name='app_settings'"))return{rows:[{data:{module_flags:{event_hub:moduleEnabled}}}]};
 if(sql.includes("kind='application' AND data->>'owner'")){counts.ownerApps++;return{rows:[...rows].filter(([k,v])=>k.startsWith('application:')&&v.owner===values[0]).map(([k,data])=>({id:k.slice('application:'.length),data:copy(data)}))};}
 if(sql.startsWith('SELECT id,data FROM event_hub_records WHERE kind=$1 ORDER BY id')){if(values[0]==='event')counts.allEvents++;return{rows:[...rows].filter(([k])=>k.startsWith(`${values[0]}:`)).map(([k,data])=>({id:k.slice(values[0].length+1),data:copy(data)}))};}
 if(sql.startsWith('SELECT data FROM event_hub_records WHERE kind=$1 AND id=$2')){if(values[0]==='event')counts.eventSelect++;const data=rows.get(`${values[0]}:${values[1]}`);return{rows:data?[{data:copy(data)}]:[]};}
 throw new Error(`Unexpected synthetic query: ${sql}`);
}} as unknown as PoolClient;
const tx=()=>new HubTx(db,key);
const store={async transaction<T>(fn:(tx:HubTx)=>Promise<T>):Promise<T>{const saved=copy(rows);try{return await fn(tx());}catch(error){rows=saved;throw error;}}} as HubStore;
const service=()=>new EventHubService(store,'synthetic-session-secret',()=>clock);
const save=(revision=0)=>service().mutate(owner.id,false,{requestId:randomUUID(),action:'application.basic-draft',revision,data:{eventId:event.id,basic:{nickname:'합성본인',collection:true,version:HUB_CONSENT_VERSION},nextStep:1}});
beforeEach(async()=>{
 rows=new Map();counts={ownerApps:0,eventSelect:0,allEvents:0};moduleEnabled=true;clock=new Date('2026-10-30T11:00:00.000Z');
 owner={id:randomUUID(),recoveryHash:'synthetic-opaque',createdAt:clock.toISOString()};event={...HubEventInput.parse({title:'쿼리 격리 검사',date:'2026-10-30',area:'합성',address:'비공개',fee:23000,account:'가상',deadline:'행사 전',notice:'공지'}),id:randomUUID(),revision:1,recruitment:true,nextRank:0,history:[]};
 await tx().put('owner',owner.id,owner);await tx().put('event',event.id,event);await tx().put('laboratory-mode','global',{enabled:false,publicAdmissionOpen:true,admissionOpenedAt:clock.toISOString(),banner:'',generation:1,revision:1,dirty:false,resetGeneration:1,resetAt:clock.toISOString(),changedAt:clock.toISOString()});
});
it('reads owner applications once and uses authenticated prefetched event for unscheduled draft',async()=>{
 await save();expect(counts).toEqual({ownerApps:1,eventSelect:0,allEvents:0});const saved=await tx().get<HubOwner>('owner',owner.id);expect(saved?.basicDrafts?.[event.id].revision).toBe(1);
});
it('keeps manual opening boundary despite skipping unrelated scheduler sweep',async()=>{
 event.opensAt=new Date(clock.getTime()+1).toISOString();await tx().put('event',event.id,event);await expect(save()).rejects.toMatchObject({code:'CLOSED'});expect(counts.allEvents).toBe(0);clock=new Date(event.opensAt);await save();expect((await tx().get<HubOwner>('owner',owner.id))?.basicDrafts?.[event.id].revision).toBe(1);
});
it('scheduled target scans all events and cannot bypass same-date automatic-room conflict',async()=>{
 event.recruitment=false;event.scheduleEnabled=true;event.opensAt=clock.toISOString();await tx().put('event',event.id,event);const otherId=randomUUID();await tx().put('event',otherId,{...event,id:otherId,scheduleEnabled:false,recruitment:true,autoDate:event.date});
 await expect(save()).rejects.toMatchObject({code:'CLOSED'});expect(counts.allEvents).toBe(1);expect((await tx().get<HubOwner>('owner',owner.id))?.basicDrafts).toBeUndefined();
});
it('scheduled exact opening invalidates prefetched event after the scheduler writes it',async()=>{
 event.recruitment=false;event.scheduleEnabled=true;event.opensAt=clock.toISOString();await tx().put('event',event.id,event);await save();expect(counts.allEvents).toBe(1);expect(counts.eventSelect).toBe(1);expect((await tx().get<HubEvent>('event',event.id))?.recruitment).toBe(true);
});
it('routing-owner tampering cannot acquire pending-companion module exemption',async()=>{
 const id=randomUUID(),foreign={id,eventId:event.id,owner:randomUUID(),revision:1,stage:4,rank:1,basic:{nickname:'타인합성',birthYear:1995,location:'서울'},profile:{lastStep:1},payment:'approved',attendance:'confirmed',checkin:false,cards:[],prizesGiven:[],history:[],updatedAt:clock.toISOString(),companionSubmission:{submittedAt:clock.toISOString(),permissionToProvideAt:clock.toISOString(),linkedAt:clock.toISOString(),personalConsentPending:true}} satisfies HubApplication;
 await tx().put('application',id,foreign);rows.get(`application:${id}`).owner=owner.id;moduleEnabled=false;await expect(save()).rejects.toMatchObject({code:'MODULE_DISABLED'});expect((await tx().get<HubApplication>('application',id))?.owner).toBe(foreign.owner);expect((await tx().get<HubOwner>('owner',owner.id))?.basicDrafts).toBeUndefined();
});
it('prefetch still authenticates ciphertext and rejects a corrupted event before saving',async()=>{
 const encrypted=rows.get(`event:${event.id}`);encrypted.crypto_box.tag=Buffer.alloc(16).toString('base64');await expect(save()).rejects.toThrow();expect((await tx().get<HubOwner>('owner',owner.id))?.basicDrafts).toBeUndefined();expect([...rows.keys()].some(k=>k.startsWith('request:'))).toBe(false);
});
