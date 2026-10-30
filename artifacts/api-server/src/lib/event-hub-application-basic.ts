import {randomUUID} from 'node:crypto';
import {campaignEligibility,containsBannedNicknameWord,quoteFor,type HubApplication,type HubEvent,type HubSettings} from '@workspace/api-zod';
import {fail,normalizeHubNickname as nickKey,type HubTx} from './event-hub-store.js';
import {isAdultBirthYear} from './korean-age.js';
import type {HubMember,HubOwner} from './event-hub-service.js';

type Context={owner:HubOwner;event:HubEvent;basic:HubApplication['basic'];now:Date;actor:string;edit?:boolean;revision?:number;privacyPolicyConsent?:HubApplication['privacyPolicyConsent'];companionSubmission?:HubApplication['companionSubmission'];sponsorOwner?:string;companionDraftId?:string};
/** General registration no longer collects a new phone, including direct API payloads. */
export function withoutGeneralPhoneInput(value:unknown):unknown{
 if(!value||typeof value!=='object'||Array.isArray(value))return value;
 const {phone:_discarded,...rest}=value as Record<string,unknown>;
 return rest;
}
/** Shared single-person registration. The caller owns the one enclosing transaction. */
export async function saveBasicApplication(tx:HubTx,ctx:Context):Promise<HubApplication>{
 const {owner:own,event:e,now,actor}=ctx,at=now.toISOString();
 const {phone:_discarded,...basic}=ctx.basic;
 if(!own || own.erasedAt)fail('AUTH','개인 신청 세션을 복구해 주세요.',401);
 if(own.restricted?.active)fail('RESTRICTED','관리자 확인이 필요한 신청입니다.',403);
 if(!isAdultBirthYear(basic.birthYear,now))fail('ADULT','성인 참가 조건을 확인해 주세요.');
 if(containsBannedNicknameWord(basic.nickname)||/[<>\u0000-\u001f\u200b-\u200f]/.test(basic.nickname)||[...new Intl.Segmenter('ko',{granularity:'grapheme'}).segment(basic.nickname)].length>6||/관리자|범일NPC|admin|운영자/i.test(basic.nickname))fail('NICKNAME','사용할 수 없는 닉네임입니다.');
 const inputs=await tx.basicInputs<HubApplication,HubMember>(own.id,nickKey(basic.nickname));
 const old=inputs.applications.find(a=>a.owner===own.id&&a.eventId===e.id);
 const member=inputs.members.find(v=>v.owner===own.id);
 if(old&&!ctx.edit)return old;
 if(member&&member.nicknameKey!==nickKey(basic.nickname)&&(member.nicknameChanges??0)>=1)fail('NICKNAME_CHANGE','닉네임 변경권을 이미 사용했습니다. 관리자에게 문의해 주세요.',409);
 if(inputs.nicknameApplications().some(a=>a.owner!==own.id&&nickKey(a.basic.nickname)===nickKey(basic.nickname))||inputs.nicknameMembers().some(a=>a.owner!==own.id&&a.nicknameKey===nickKey(basic.nickname)))fail('NICKNAME','이미 사용 중인 닉네임입니다.',409);
 if(inputs.profiles.some(p=>nickKey(String(p.nickname??''))===nickKey(basic.nickname)&&p.event_hub_owner!==own.id))fail('NICKNAME','이미 현장에서 사용 중인 닉네임입니다.',409);
 if(old?.companionSubmission?.personalConsentPending&&(nickKey(old.basic.nickname)!==nickKey(basic.nickname)||old.basic.birthYear!==basic.birthYear))fail('COMPANION_IDENTITY','접수한 이름·년생 정정은 관리자에게 문의해 주세요.',409);
 if(member&&actor===own.id&&!ctx.companionSubmission){member.lastActivityAt=at;await tx.put('member',member.id,member);}
 if(member&&member.nicknameKey!==nickKey(basic.nickname)){
  member.nicknameChanges=(member.nicknameChanges??0)+1;member.nicknameKey=nickKey(basic.nickname);member.basic={...basic,...(member.basic.phone!==undefined?{phone:member.basic.phone}:{})};member.history.push({at,actor,action:'member.nickname.change'});await tx.put('member',member.id,member);
 }
 if(old){
  if(ctx.revision!==old.revision)fail('REVISION','서버에 최신 변경이 있습니다. 상태를 확인해 주세요.',409);
  if(old.confirmedAt&&!old.companionSubmission?.personalConsentPending)fail('STAGE','신청 확정 후 기본정보 변경은 관리자 문의를 이용해 주세요.');
  if(old.companionSubmission?.personalConsentPending&&!old.companionSubmission.linkedAt)fail('COMPANION_LINK','관리자에게 본인 신청 연결을 요청해 주세요.',403);
  if(old.companionSubmission?.personalConsentPending&&ctx.privacyPolicyConsent)old.privacyPolicyConsent=ctx.privacyPolicyConsent;
  // Only the authenticated friend may reuse their own saved profile. A representative
  // submission stays empty, and any profile already being written remains untouched.
  if(old.companionSubmission?.personalConsentPending&&old.companionSubmission.linkedAt&&actor===old.owner&&member&&old.profile.lastStep===1&&Object.keys(old.profile).every(key=>key==='lastStep'))old.profile=structuredClone(member.profile);
  old.basic={...basic,...(old.basic.phone!==undefined?{phone:old.basic.phone}:{})};old.revision++;old.updatedAt=at;old.history.push({at,actor,action:'application.basic.edit'});
  await tx.put('application',old.id,old);
  return old;
 }
 e.nextRank++;
 const a:HubApplication={
  bossTestOnly:e.bossTestOnly,...(own.companionOrigins?.[e.id]??{}),
  ...(ctx.companionSubmission?{companionSubmission:ctx.companionSubmission,sponsorOwner:ctx.sponsorOwner,companionDraftId:ctx.companionDraftId}:{}),
  id:randomUUID(),eventId:e.id,owner:own.id,revision:1,stage:2,rank:e.nextRank,basic,
  ...(ctx.privacyPolicyConsent?{privacyPolicyConsent:ctx.privacyPolicyConsent}:{}),
  payment:'none',attendance:'pending',checkin:false,profile:ctx.companionSubmission?{lastStep:1}:member?{...member.profile}:{lastStep:1},
  quote:quoteFor(e,e.nextRank,now),...(e.campaign?{benefitRank:e.nextRank,eligibility:{status:campaignEligibility(e,basic.birthYear)}}:{}),
  cards:[],prizesGiven:[],history:[{at,actor,action:ctx.companionSubmission?'companion.submit':'application.basic'}],
  retainUntil:new Date(Date.parse(`${e.date}T${e.end}:00+09:00`)+(e.end<=e.start?86400000:0)+((await tx.get<HubSettings>('settings','global'))?.retentionDays??180)*86400000).toISOString(),updatedAt:at,
 };
 await tx.put('event',e.id,e);await tx.put('application',a.id,a);return a;
}
