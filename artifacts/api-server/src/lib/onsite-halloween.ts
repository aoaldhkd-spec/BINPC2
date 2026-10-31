import {randomInt} from 'node:crypto';
import {drawModuleEnabled,eventEnded,eventExpiryAt,paymentSatisfied,campaignPresets,HubEventInput,type HubApplication,type HubEvent,type HubSettings,DEFAULT_HUB_SETTINGS} from '@workspace/api-zod';
import type {OnsiteHalloweenState,HalloweenCardEvent} from '../../../../lib/api-zod/src/onsite-halloween';
import {HubStore,fail,type HubTx} from './event-hub-store.js';
import {cardSlotAvailable} from '../../../../lib/api-zod/src/event-card-clock';
import {drawHalloween} from './event-policy-halloween-server.js';
import {parseModuleFlags} from './db-module-flags.js';
import {assertOnsiteSocialWrite} from './event-onsite-access.js';
import {todayHeartNowSession} from './heartnow-access.js';
import type {CampaignStock} from './event-campaign-service.js';

const todayId='onsite-live-halloween-2026-10-31',todayConfig='onsite-live-halloween-config-2026-10-31';
const todayInventory={'LED 반지':40,'할로윈 키링':24,'LED 목걸이':6,'LED 밴드':2};
function todayEvent():HubEvent{
 const preset=campaignPresets().find(p=>p.key==='halloween-2026-10-31')!;
 return {...HubEventInput.parse(preset.event),id:todayId,revision:1,recruitment:false,nextRank:0,history:[]};
}

type RecordData={revision?:number;eventId:string;profileId:string;cycleId:string;owner:string;rank:number;benefitExcluded:true;cards:HubApplication['cards'];prizesGiven:string[];candyGivenAt?:string;prizeGivenAt?:Record<string,string>;history?:{at:string;actor:string;action:string;reason?:string}[];createdAt:string};
const prefix='onsite-halloween:';
function publicEvent(e:HubEvent):HalloweenCardEvent{const {id,title,date,start,end,type,campaign,cardsEnabled,theme,themeEnabled}=e;return {id,title,date,start,end,type,campaign,cardsEnabled,theme,themeEnabled};}
function view(event:HubEvent|undefined,own:{cards:HubApplication['cards'];prizesGiven:string[];revision?:number;candyGivenAt?:string}|undefined,now:Date,reason:string|null):OnsiteHalloweenState{return {event:event?publicEvent(event):null,cards:own?.cards??[],revision:own?.revision??0,serverNow:now.toISOString(),blockedReason:reason,prizesGiven:own?.prizesGiven??[],...(own?.candyGivenAt?{candyGivenAt:own.candyGivenAt}:{})};}
/** No application, payment approval, admission rank or new inventory is fabricated. */
export class OnsiteHalloweenService{
 constructor(private store:HubStore,private now=()=>new Date(),private pick=(max:number)=>randomInt(max),private notify=()=>{}){}
 private async context(tx:HubTx,userId:string,eventId?:string){
  const rows=(await tx.db.query("SELECT table_name,data FROM app_kv_rows WHERE (table_name='profiles' AND row_id=$1) OR table_name='app_settings' ORDER BY updated_at DESC",[userId])).rows;
  const profile=rows.find(r=>r.table_name==='profiles')?.data;
  const settings=rows.find(r=>r.table_name==='app_settings')?.data;
  const now=this.now();
  const events=(await tx.all<HubEvent>('event')).filter(e=>e.type==='halloween'&&!e.bossTestOnly&&e.campaign?.kind!=='tour');
  const app=profile?.event_hub_application?await tx.get<HubApplication>('application',String(profile.event_hub_application)):undefined;
  const candidates=events.filter(e=>eventId?e.id===eventId:app?e.id===app.eventId:now.getTime()>=Date.parse(e.date+'T17:00:00+09:00')&&now.getTime()<eventExpiryAt(e));
  if(candidates.length>1)fail('EVENT_AMBIGUOUS','행사를 운영자에게 확인해 주세요.',409);
  let event=candidates[0];
  const today=(!app&&!profile?.event_hub_application&&todayHeartNowSession(settings??{},now));
  const savedToday=today?await tx.get<{cycleId:string}>('settings',todayConfig):undefined;
  const ownToday=today?await tx.get<RecordData>('settings',prefix+todayId+':'+userId):undefined;
  if(today&&(savedToday||ownToday||!events.some(e=>e.date==='2026-10-31'))){
    if(eventId&&eventId!==todayId)fail('EVENT_SCOPE','현재 회식의 뽑기 기록을 사용해 주세요.',403);
    event=todayEvent();
  }
  const localConfig=event?.id===todayId?savedToday:undefined;
  const record=event?(event.id===todayId?ownToday:await tx.get<RecordData>('settings',prefix+event.id+':'+userId)):undefined;
  if(record&&(record.profileId!==userId||record.eventId!==event!.id))fail('AUTH','본인 결과만 확인할 수 있습니다.',403);
  if(app&&(app.profileId!==userId||app.owner!==profile.event_hub_owner))fail('AUTH','본인 행사 연결을 확인해 주세요.',403);
  if(app&&event&&app.eventId!==event.id)fail('EVENT_SCOPE','해당 현장 프로필의 행사만 이용할 수 있습니다.',403);
  const linked=app&&event?.id===app.eventId?app:undefined;
  if(linked&&record)fail('CARD_IDENTITY_CONFLICT','기존 카드 기록을 운영자에게 확인해 주세요. 다시 뽑지 마세요.',409);
  let flags=settings?.module_flags;try{if(typeof flags==='string')flags=JSON.parse(flags);}catch{flags={};}
  const policy=await tx.get<HubSettings>('settings','global')??DEFAULT_HUB_SETTINGS;
  const start=Date.parse(String(settings?.event_cycle_started_at??''));
  const sameCycle=profile&&settings?.session_active===true&&settings.event_cycle_reset_complete!==true&&Number.isFinite(start)&&start<=now.getTime()&&event&&start>=Date.parse(event.date+'T17:00:00+09:00')&&start<eventExpiryAt(event)&&(!record||record.cycleId===settings.event_cycle_archive_id)&&(!linked||linked.cycleId===settings.event_cycle_archive_id)&&(!localConfig||localConfig.cycleId===settings.event_cycle_archive_id);
  const reason=!event?'운영자가 할로윈 행사를 준비 중입니다.':!profile||!String(profile.nickname??'').trim()||!String(profile.pin_code??'').trim()||profile.boss_test_event?'현장 프로필로 입장해 주세요.':!sameCycle?'현재 현장 행사에서만 뽑을 수 있습니다.':policy.paused||!parseModuleFlags(flags).event_hub||!drawModuleEnabled(event,policy)?'할로윈 뽑기가 꺼져 있습니다.':eventEnded(event,now)?'신규 뽑기가 종료되었습니다.':linked&&!paymentSatisfied(linked)?'참가 권한을 운영자에게 확인해 주세요.':null;
  return {profile,settings,event,record,linked,reason,now};
 }
 async state(userId:string,eventId?:string):Promise<OnsiteHalloweenState>{return this.store.transaction(async tx=>{const c=await this.context(tx,userId,eventId);return view(c.event,c.linked??c.record,c.now,c.reason);});}
 async draw(userId:string,eventId:string,slot:number){
  let changed=false;
  const saved=await this.store.transaction(async tx=>{
   const c=await this.context(tx,userId,eventId);const old=c.linked??c.record;
   // A repeated slot returns its durable result without another decrement.
   if(old?.cards[slot])return view(c.event,old,c.now,c.reason);
   if(c.reason||!c.event)fail('CARDS_UNAVAILABLE',c.reason??'행사를 확인해 주세요.',403);
   await assertOnsiteSocialWrite(tx,userId);
   const a=old??{revision:0,eventId,profileId:userId,owner:userId,cycleId:String(c.settings?.event_cycle_archive_id??''),rank:0,benefitExcluded:true as const,cards:[],prizesGiven:[],createdAt:c.now.toISOString()};
   if(slot!==a.cards.length||slot>=3)fail('CARD_SLOT','이미 사용했거나 아직 차례가 아닌 카드입니다.',409);
   if(!cardSlotAvailable(c.event,slot,c.now))fail('CARD_LOCKED','아직 카드 해제 시각이 아닙니다.',403);
   if(c.event.id===todayId){
    const configured=await tx.get('settings',todayConfig);
    if(!configured){
     const otherStocks=(await tx.all<CampaignStock>('stock')).filter(s=>s.eventId===todayId||/^campaign-halloween-2026-10-3[01]$/.test(s.eventId));
     if(otherStocks.length)fail('STOCK_CONFLICT','기존 경품 원장을 확인해 주세요. 중복 생성하지 않았습니다.',409);
     for(const [label,remaining] of Object.entries(todayInventory)){
      const id=todayId+':'+label;await tx.put('stock',id,{id,eventId:todayId,label,remaining,special:['LED 목걸이','LED 밴드'].includes(label),history:[{at:c.now.toISOString(),actor:'system',action:'onsite.today.unused-stock.72'}]});
     }
     await tx.put('settings',todayConfig,{eventId:todayId,cycleId:c.settings.event_cycle_archive_id,at:c.now.toISOString(),initial:todayInventory});
    }
   }
   await drawHalloween(tx,c.event,a,c.now.toISOString(),this.pick);
   if(c.linked){c.linked.revision++;c.linked.updatedAt=c.now.toISOString();c.linked.history.push({at:c.now.toISOString(),actor:userId,action:'onsite.halloween.draw'});await tx.put('application',c.linked.id,c.linked);}
   else {a.revision=(c.record?.revision??0)+1;await tx.put('settings',prefix+eventId+':'+userId,a);}
   changed=true;return view(c.event,a,c.now,c.reason);
  });
  if(changed){try{this.notify();}catch{/* A notification cannot undo a committed draw. */}}return saved;
 }
 async results(){return this.store.transaction(async tx=>{
  const rows=(await tx.db.query("SELECT id FROM event_hub_records WHERE kind='settings' AND id LIKE 'onsite-halloween:%' ORDER BY id")).rows;
  const results:Array<RecordData & {nickname:string}>=[];for(const row of rows){const value=await tx.get<RecordData>('settings',row.id);if(value){const p=(await tx.db.query("SELECT data->>'nickname' AS nickname FROM app_kv_rows WHERE table_name='profiles' AND row_id=$1",[value.profileId])).rows[0];results.push({...value,nickname:p?.nickname??'종료된 현장 참가자'});}}
  // Show current onsite participants even before they open their first card.
  // This is a read-only projection; handover creates the durable receipt.
  const settings=(await tx.db.query("SELECT data FROM app_kv_rows WHERE table_name='app_settings' ORDER BY updated_at DESC LIMIT 1")).rows[0]?.data;
  const started=Date.parse(String(settings?.event_cycle_started_at??''));
  if(settings?.event_cycle_archive_id&&!settings.event_cycle_reset_complete&&Number.isFinite(started)){
    const events=(await tx.all<HubEvent>('event')).filter(e=>e.type==='halloween'&&!e.bossTestOnly&&started>=Date.parse(e.date+'T17:00:00+09:00')&&started<eventExpiryAt(e));
    if(todayHeartNowSession(settings,this.now())&&!events.some(e=>e.date==='2026-10-31'))events.push(todayEvent());
    const profiles=(await tx.db.query("SELECT data FROM app_kv_rows WHERE table_name='profiles'")).rows;
    for(const event of events)for(const {data:p} of profiles)if(p.id&&p.nickname&&p.pin_code&&!p.boss_test_event&&!p.event_hub_application&&!results.some(r=>r.eventId===event.id&&r.profileId===p.id))results.push({eventId:event.id,profileId:String(p.id),owner:String(p.id),cycleId:String(settings.event_cycle_archive_id),rank:0,benefitExcluded:true,cards:[],prizesGiven:[],createdAt:String(p.created_at??this.now().toISOString()),nickname:String(p.nickname)});
  }
  return results;
 });}
 async give(eventId:string,profileId:string,cardId?:string){let changed=false;const saved=await this.store.transaction(async tx=>{
  const key=prefix+eventId+':'+profileId;let record=await tx.get<RecordData>('settings',key);
  if(!record&&!cardId){
    const c=await this.context(tx,profileId,eventId);const start=Date.parse(String(c.settings?.event_cycle_started_at??''));
    if(c.linked||!c.event||!c.profile||!c.profile.nickname||!c.profile.pin_code||c.profile.boss_test_event||c.settings?.event_cycle_reset_complete||!c.settings?.event_cycle_archive_id||!Number.isFinite(start)||start<Date.parse(c.event.date+'T17:00:00+09:00')||start>=eventExpiryAt(c.event))fail('RESULT','확인된 현장 참가자만 지급 처리할 수 있습니다.',403);
    record={eventId,profileId,owner:profileId,cycleId:String(c.settings.event_cycle_archive_id),rank:0,benefitExcluded:true,cards:[],prizesGiven:[],createdAt:this.now().toISOString()};
  }
  if(!record)fail('RESULT','해당 결과가 없습니다.',404);
  if(cardId){const card=record.cards.find(c=>c.id===cardId);if(!card||card.prize==='다음 기회에')fail('RESULT','당첨 상품만 지급 처리할 수 있습니다.');if(!record.prizesGiven.includes(cardId)){changed=true;record.prizesGiven.push(cardId);(record.prizeGivenAt??={})[cardId]=this.now().toISOString();(record.history??=[]).push({at:this.now().toISOString(),actor:'admin',action:'prize.given',reason:cardId});}}
  else if(!record.candyGivenAt){changed=true;record.candyGivenAt=this.now().toISOString();(record.history??=[]).push({at:record.candyGivenAt,actor:'admin',action:'candy.given'});}
  if(changed){record.revision=(record.revision??0)+1;await tx.put('settings',key,record);}return {saved:true};
 });if(changed){try{this.notify();}catch{/* Durable handover remains saved. */}}return saved;}
}
