import {beforeEach,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {HubEventInput,type HubApplication,type HubEvent} from '@workspace/api-zod';
import {EventHubService,type HubOwner} from './event-hub-service.js';
import {HubStore,HubTx} from './event-hub-store.js';

let rows:Map<string,any>,queries:string[],owner:HubOwner,event:HubEvent;
const clock=new Date('2026-10-30T11:00:00Z'),copy=<T>(v:T):T=>v===undefined?v:structuredClone(v);
const listed=(kind:string)=>[...rows].filter(([k])=>k.startsWith(`${kind}:`)).map(([k,data])=>({id:k.slice(kind.length+1),data:copy(data)}));
const db={release(){},async query(sql:string,v:any[]=[]){
 if(sql.startsWith('BEGIN')){
  expect(sql.trim().split(';').filter(s=>s.trim()).map(s=>s.trim())).toEqual([
   'BEGIN', "SET LOCAL lock_timeout='10000ms'",
   "SELECT pg_advisory_xact_lock(hashtext('binpc2:event-anonymous-archive-reset:v1'))",
   "SELECT pg_advisory_xact_lock(hashtext('binpc2:event-hub:v6'))",
   "SELECT kind,id,data FROM event_hub_records WHERE data ? 'crypto_box' ORDER BY kind,id LIMIT 1",
  ]);
  queries.push('begin-locks-key-validation');
  const first=[...rows].filter(([,data])=>data.crypto_box).sort(([a],[b])=>a.localeCompare(b))[0];
  const colon=first?.[0].indexOf(':');
  const sentinel=first?[{kind:first[0].slice(0,colon),id:first[0].slice(colon!+1),data:copy(first[1])}]:[];
  return ['BEGIN','SET','SELECT','SELECT','SELECT'].map((command,i)=>({command,rows:i===4?sentinel:[],rowCount:i===4?sentinel.length:null}));
 }
 if(sql==='COMMIT'||sql==='ROLLBACK'){queries.push(sql);return{rows:[]};}
 if(sql.startsWith('INSERT INTO event_hub_records')){queries.push('put');rows.set(`${v[0]}:${v[1]}`,JSON.parse(v[2]));return{rows:[]};}
 if(sql.includes("data ? 'crypto_box'")){queries.push('key-validation');const first=[...rows].find(([,data])=>data.crypto_box);if(!first)return{rows:[]};const colon=first[0].indexOf(':');return{rows:[{kind:first[0].slice(0,colon),id:first[0].slice(colon+1),data:copy(first[1])}]};}
 if(sql.startsWith("SELECT 'hub' AS source")){
  queries.push('state-batch');const [who,admin,settingIds]=v;
  const selected=[...rows].map(([key,data])=>{const colon=key.indexOf(':');return{source:'hub',kind:key.slice(0,colon),id:key.slice(colon+1),data:copy(data)};})
   .filter(r=>(r.kind==='laboratory-mode'&&r.id==='global')||(r.kind==='settings'&&settingIds.includes(r.id))||r.kind==='event'
    ||(['owner','thread'].includes(r.kind)&&(admin||(who!==null&&r.id===who)))
    ||(r.kind==='application'&&(admin||(who!==null&&r.data.owner===who)))
    ||(r.kind==='member'&&(admin||(who!==null&&(r.data.owner===who||!Object.hasOwn(r.data,'owner')))))
    ||(admin&&['stock','error'].includes(r.kind)))
   .sort((a,b)=>a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id));
  return{rows:[...selected,{source:'app-settings',kind:'app-settings',id:'1',data:{module_flags:{event_hub:true}}}]};
 }
 if(sql.startsWith('SELECT data FROM event_hub_records')){queries.push('get');const data=rows.get(`${v[0]}:${v[1]}`);return{rows:data?[{data:copy(data)}]:[]};}
 if(sql.startsWith('SELECT id,data FROM event_hub_records WHERE kind=$1 ORDER BY id')){queries.push('all:'+v[0]);return{rows:listed(v[0])};}
 throw Error('Unhandled synthetic state query');
}} as unknown as PoolClient;
const store=new HubStore({connect:async()=>db} as unknown as Pool,'synthetic-state-secret');
const tx=()=>new HubTx(db,store.key);
const service=()=>new EventHubService(store,'synthetic-state-secret',()=>clock);
const mode=(enabled=true)=>({enabled,publicAdmissionOpen:!enabled,admissionOpenedAt:enabled?null:clock.toISOString(),banner:'',generation:1,revision:1,dirty:false,resetGeneration:1,resetAt:clock.toISOString(),changedAt:clock.toISOString()});
beforeEach(async()=>{
 rows=new Map();queries=[];owner={id:randomUUID(),recoveryHash:'synthetic-recovery',createdAt:clock.toISOString()};
 event={...HubEventInput.parse({title:'격리 조회 검사',date:'2026-10-30',area:'합성',address:'승인 장소',fee:23000,account:'가상',deadline:'행사 전',notice:'공지'}),id:randomUUID(),revision:1,recruitment:true,nextRank:0,history:[]};
 await tx().put('owner',owner.id,owner);await tx().put('event',event.id,event);await tx().put('laboratory-mode','global',mode());queries=[];
});

it('reads participant state in three SQL round trips with the exact lock and key-validation batch before commit',async()=>{
 const state=await service().state(owner.id);expect(queries).toEqual(['begin-locks-key-validation','state-batch','COMMIT']);
 expect(state.testMode).toMatchObject({enabled:true,publicAdmissionOpen:false});expect(state.applications).toEqual([]);expect(state.settings).toBeUndefined();
});
it('keeps anonymous state private and does not perform ownerless application/member reads',async()=>{
 const state=await service().state();expect(queries).toEqual(['begin-locks-key-validation','state-batch','COMMIT']);
 expect(state.owners).toBeUndefined();expect(state.members).toBeUndefined();expect(state.member).toBeNull();expect(state.applications).toEqual([]);
});
it('retains full administrator collections while stripping authentication material',async()=>{
 await tx().put('owner','other-owner',{id:'other-owner',recoveryHash:'hidden',createdAt:clock.toISOString()});
 await tx().put('thread','other-owner',{id:'other-owner',messages:[]});await tx().put('stock','stock-one',{id:'stock-one',eventId:event.id,label:'합성',remaining:1});
 await tx().put('error','error-one',{id:'error-one',code:'SYNTHETIC'});queries=[];
 const state=await service().state(owner.id,true);expect(queries).toEqual(['begin-locks-key-validation','state-batch','COMMIT']);
 expect(state.owners).toHaveLength(2);expect(state.owners?.every(o=>!('recoveryHash'in o))).toBe(true);expect(state.threads).toHaveLength(1);expect(state.stocks).toHaveLength(1);expect(state.errors).toHaveLength(1);
});
it('does not expose a foreign application when unencrypted owner routing is forged',async()=>{
 const id=randomUUID(),a={id,eventId:event.id,owner:'foreign-owner',revision:1,stage:4,rank:1,basic:{nickname:'타인',birthYear:1995,location:'서울'},profile:{lastStep:1},payment:'approved',attendance:'confirmed',checkin:false,cards:[],prizesGiven:[],history:[],updatedAt:clock.toISOString()} satisfies HubApplication;
 await tx().put('application',id,a);rows.get(`application:${id}`).owner=owner.id;queries=[];
 const state=await service().state(owner.id);expect(state.applications).toEqual([]);expect(queries).toEqual(['begin-locks-key-validation','state-batch','COMMIT']);
});
it('does not make a partial owner collection into a global tx.all cache',async()=>{
 await tx().put('application','foreign',{id:'foreign',owner:'foreign-owner'});const transaction=tx();const inputs=await transaction.stateInputs(owner.id,false);
 expect(inputs.all('application')).toEqual([]);expect(await transaction.all('application')).toEqual([{id:'foreign',owner:'foreign-owner'}]);expect(queries.at(-1)).toBe('all:application');
});
it('invalidates even missing prefetched settings after a write within the transaction',async()=>{
 const transaction=tx();await transaction.stateInputs(owner.id,false);expect(await transaction.get('settings','global')).toBeUndefined();
 await transaction.put('settings','global',{revision:7});expect(await transaction.get('settings','global')).toEqual({revision:7});expect(queries.at(-1)).toBe('get');
});
it('rejects corrupted selected ciphertext and retains rollback rather than returning partial state',async()=>{
 rows.get(`event:${event.id}`).crypto_box.tag=Buffer.alloc(16).toString('base64');await expect(service().state(owner.id)).rejects.toThrow();expect(queries.at(-1)).toBe('ROLLBACK');
});
it('uses the complete event collection for exact scheduled opening and same-date conflict checks',async()=>{
 event.recruitment=false;event.scheduleEnabled=true;event.opensAt=clock.toISOString();await tx().put('event',event.id,event);await tx().put('laboratory-mode','global',mode(false));
 const conflict={...event,id:randomUUID(),autoDate:event.date,scheduleEnabled:false,recruitment:true};await tx().put('event',conflict.id,conflict);
 expect((await service().state(owner.id,true)).events.find(e=>e.id===event.id)?.recruitment).toBe(false);
 conflict.recruitment=false;await tx().put('event',conflict.id,conflict);
 const opened=(await service().state(owner.id,true)).events.find(e=>e.id===event.id)!;expect(opened.recruitment).toBe(true);expect(opened.revision).toBe(2);expect((await tx().get<HubEvent>('event',event.id))?.recruitment).toBe(true);
});
