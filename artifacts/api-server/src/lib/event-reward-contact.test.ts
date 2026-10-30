import {expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {HubBasic,HubEventInput,HUB_CONSENT_VERSION,PROFILE_CONSENT_VERSION,canRequestRewardContact,applicationAdmissionIssue,type HubApplication,type HubEvent} from '@workspace/api-zod';
import {applyApplicationOperation} from './event-operations.js';
const now=new Date('2026-10-31T14:00:00Z');
const event:HubEvent={...HubEventInput.parse({title:'격리 행사',date:'2026-10-31',area:'가상',address:'비공개',fee:25000,account:'합성',deadline:'행사 전',notice:'공지',type:'halloween',campaign:{kind:'halloween-saturday',round:1}}),id:randomUUID(),revision:1,nextRank:0,recruitment:true,history:[]};
const application=():HubApplication=>({id:randomUUID(),eventId:event.id,owner:randomUUID(),revision:1,stage:4,rank:1,basic:HubBasic.parse({nickname:'합성참가',birthYear:1995,location:'부산',depositor:'합성입금',collection:true,version:HUB_CONSENT_VERSION}),confirmedAt:now.toISOString(),payment:'approved',attendance:'confirmed',checkin:false,profile:{lastStep:6,mbti:'INTJ',interests:['음악','여행'],personalityScore:50,pushDecision:'skip',privacyConsent:{collection:true,sharing:true,version:PROFILE_CONSENT_VERSION}},consent:{collection:true,sharing:true,notice:true,version:HUB_CONSENT_VERSION,acceptedAt:now.toISOString(),noticeVersion:1,reuse:false,marketing:false,push:false,profileNow:false},cards:[],prizesGiven:[],history:[],updatedAt:now.toISOString()});
const act=(a:HubApplication,action:string,data:Record<string,unknown>,admin=false,e=event)=>applyApplicationOperation(a,e,action,data,now,admin);
const physical=(a:HubApplication)=>{const card={id:randomUUID(),prize:randomUUID(),prizeLabel:'반지',at:now.toISOString()};a.cards.push(card);a.prizesGiven.push(card.id);return card.id;};
it('ordinary full application and admission require no phone, while malformed legacy input remains invalid',()=>{
 const a=application();expect(a.basic.phone).toBeUndefined();expect(applicationAdmissionIssue(a,event)).toBeNull();expect(()=>HubBasic.parse({...a.basic,phone:'invalid'})).toThrow();expect(HubBasic.parse({...a.basic,phone:'01000000000'}).phone).toBe('01000000000');
});
it('rejects general collection, undelivered wins, discounts and unclassified legacy results',()=>{
 const a=application();expect(()=>act(a,'application.phone',{phone:'01000000000',purposeAccepted:true})).toThrow(/수령/);
 const card=physical(a);a.prizesGiven=[];expect(canRequestRewardContact(a,'card',card)).toBe(false);
 a.manualResults=[{id:randomUUID(),label:'할인',amount:1000,kind:'discount',at:now.toISOString(),paidAt:now.toISOString()},{id:randomUUID(),label:'과거 결과',amount:1000,at:now.toISOString(),paidAt:now.toISOString()}];
 for(const r of a.manualResults)expect(canRequestRewardContact(a,'result',r.id)).toBe(false);
 expect(a.rewardPhone).toBeUndefined();expect(applicationAdmissionIssue(a,event)).toBeNull();
});
it('tour coupons and miss cards never authorize phone collection even after fulfillment',()=>{
 const a=application(),id=physical(a);expect(canRequestRewardContact(a,'card',id,'tour')).toBe(false);expect(canRequestRewardContact(a,'card',id)).toBe(false);expect(canRequestRewardContact(a,'card',id,'halloween-saturday')).toBe(true);a.cards[0].couponAmount=0;expect(canRequestRewardContact(a,'card',id,'halloween-saturday')).toBe(false);delete a.cards[0].couponAmount;a.cards[0].prize='다음 기회에';expect(canRequestRewardContact(a,'card',id,'halloween-saturday')).toBe(false);
});
it('requires admin request with stated purpose after actual receipt but no new verification step',()=>{
 const a=application(),id=physical(a),before=structuredClone({basic:a.basic,profile:a.profile,payment:a.payment});
 expect(()=>act(a,'admin.application.phone-request',{source:'card',resultId:id,purpose:'수령 확인 연락'})).toThrow(/관리자/);
 expect(()=>act(a,'admin.application.phone-request',{source:'card',resultId:id,purpose:''},true)).toThrow();
 act(a,'admin.application.phone-request',{source:'card',resultId:id,purpose:'수령 확인 연락'},true);
 expect(()=>act(a,'application.phone',{phone:'01000000000'})).toThrow(/목적/);
 expect(()=>act(a,'application.phone',{phone:'01000000000',purposeAccepted:true},true)).toThrow(/본인/);
 act(a,'application.phone',{phone:'01000000000',purposeAccepted:true});
 expect(a.rewardPhone).toBe('01000000000');expect(a.rewardPhoneRequest?.fulfilledAt).toBe(now.toISOString());expect({basic:a.basic,profile:a.profile,payment:a.payment}).toEqual(before);
});
it('only a paid explicit item/cash result authorizes contact, not a result receipt notification',()=>{
 const a=application(),id=randomUUID();act(a,'admin.application.result',{id,label:'현장 상금',amount:1000,kind:'cash',reason:'합성 지급 기록'},true);
 act(a,'admin.application.result.confirm',{id,field:'receivedAt'},true);expect(canRequestRewardContact(a,'result',id)).toBe(false);
 expect(()=>act(a,'admin.application.phone-request',{source:'result',resultId:id,purpose:'상금 수령 확인'},true)).toThrow(/실제/);
 act(a,'admin.application.result.confirm',{id,field:'paidAt',doubleChecked:true},true);expect(canRequestRewardContact(a,'result',id)).toBe(true);
 act(a,'admin.application.phone-request',{source:'result',resultId:id,purpose:'상금 수령 확인'},true);expect(a.rewardPhoneRequest?.resultId).toBe(id);
 a.manualResults![0].amount=0;expect(canRequestRewardContact(a,'result',id)).toBe(false);a.manualResults![0].kind='item';expect(canRequestRewardContact(a,'result',id)).toBe(true);
});
it('cancels only optional contact request without deleting historical number or received item',()=>{
 const a=application(),id=physical(a);a.basic.phone='01011111111';a.rewardPhone='01000000000';act(a,'admin.application.phone-request',{source:'card',resultId:id,purpose:'상품 수령 연락'},true);act(a,'admin.application.phone-request',{cancel:true},true);
 expect(a.rewardPhoneRequest).toBeUndefined();expect(a.rewardPhone).toBe('01000000000');expect(a.basic.phone).toBe('01011111111');expect(a.prizesGiven).toEqual([id]);expect(a.cards[0].id).toBe(id);expect(applicationAdmissionIssue(a,event)).toBeNull();expect(()=>act(a,'application.phone',{phone:'01022222222',purposeAccepted:true})).toThrow(/수령/);
});
