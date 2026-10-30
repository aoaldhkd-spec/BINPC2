import {beforeEach,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {HUB_CONSENT_VERSION,HubEventInput,applicationAdmissionIssue,type HubApplication,type HubEvent} from '@workspace/api-zod';
import {companionApplicationViews,companionSubmissionCommand} from './companion-submission.js';
import {saveBasicApplication} from './event-hub-application-basic.js';
import {companionCommand} from './companion-records.js';
import {normalizeHubNickname,type HubTx} from './event-hub-store.js';
import type {HubOwner} from './event-hub-service.js';
let rows:Map<string,unknown>,event:HubEvent,sponsor:HubOwner,draftIds:string[];
const now=new Date('2026-10-30T10:00:00Z'),clone=<T>(v:T):T=>v===undefined?v:structuredClone(v);
const all=(kind:string)=>[...rows].filter(([k])=>k.startsWith(`${kind}:`)).map(([,v])=>clone(v)) as any[];
const tx={
 async prefetch(){},
 async get(kind:string,id:string){return clone(rows.get(`${kind}:${id}`));},
 async put(kind:string,id:string,value:unknown){rows.set(`${kind}:${id}`,clone(value));},
 async applicationsForOwner(owner:string){return all('application').filter(a=>a.owner===owner);},
 async membersForOwner(owner:string){return all('member').filter(a=>a.owner===owner);},
 async basicInputs(owner:string,nickname:string){const apps=all('application'),members=all('member');return {applications:apps.filter(a=>a.owner===owner),members:members.filter(a=>a.owner===owner),nicknameApplications:()=>apps.filter(a=>normalizeHubNickname(a.basic.nickname)===nickname),nicknameMembers:()=>members.filter(a=>a.nicknameKey===nickname),profiles:[]};},
} as unknown as HubTx;
const basic={nickname:'본인시험',birthYear:1995,location:'서울',depositor:'합성자료',collection:true as const,version:HUB_CONSENT_VERSION as typeof HUB_CONSENT_VERSION};
const run=async(action:string,data:Record<string,unknown>,revision?:number,target='',owner=sponsor.id,admin=false)=>{
 const snapshot=clone(rows);try{return await companionSubmissionCommand(tx,{owner,admin,event:clone(rows.get(`event:${event.id}`) as HubEvent),now,command:{action,target,revision,data:{eventId:event.id,...data}}});}catch(e){rows=snapshot;throw e;}
};
const apps=()=>all('application') as HubApplication[],group=()=> (rows.get(`owner:${sponsor.id}`) as HubOwner).companionDrafts![event.id];
const submit=()=>run('companion.submit',{basic,draftIds},group().revision);
async function confirm(){const self=apps().find(a=>a.owner===sponsor.id)!;self.consent={collection:true,sharing:true,notice:true,version:HUB_CONSENT_VERSION,reuse:false,marketing:false,push:false,profileNow:false,acceptedAt:now.toISOString(),noticeVersion:1};self.stage=3;await tx.put('application',self.id,self);await run('companion.confirm',{groupRevision:group().revision,applicationIds:apps().filter(a=>a.owner!==sponsor.id).map(a=>a.id),revisions:Object.fromEntries(apps().map(a=>[a.id,a.revision]))},self.revision,self.id);}
beforeEach(()=>{
 rows=new Map();draftIds=[randomUUID(),randomUUID()];
 event={...HubEventInput.parse({title:'합성 행사',date:'2026-10-30',area:'시험',address:'비공개',fee:23000,account:'합성안내',deadline:'행사전',notice:'필수공지',benefitsEnabled:true,benefits:[{from:1,to:3,type:'final',value:14000,label:'3등까지'}]}),id:randomUUID(),revision:1,recruitment:true,nextRank:2,history:[]};
 sponsor={id:randomUUID(),createdAt:now.toISOString(),recoveryHash:'opaque',basicDrafts:{unrelated:{basic:{collection:true,version:HUB_CONSENT_VERSION},nextStep:1,revision:5,updatedAt:now.toISOString()}},companionDrafts:{[event.id]:{revision:2,items:draftIds.map((id,i)=>({id,basic:{nickname:`친구${i+1}번`,birthYear:1994+i,location:'파주'},providedAt:now.toISOString(),permissionToProvideAt:now.toISOString(),changedAt:now.toISOString()}))}}};
 rows.set(`owner:${sponsor.id}`,clone(sponsor));rows.set(`event:${event.id}`,clone(event));
});
it('allocates separate ranks/fees atomically without friend contact or personal consent fabrication',async()=>{
 await submit();const people=apps().sort((a,b)=>a.rank-b.rank);expect(people.map(a=>a.rank)).toEqual([3,4,5]);expect(people.map(a=>a.quote?.fee)).toEqual([14000,23000,23000]);expect(new Set(people.map(a=>a.owner)).size).toBe(3);
 for(const child of people.slice(1)){for(const field of ['phone','depositor','collection','version'])expect(child.basic).not.toHaveProperty(field);expect(child.consent).toBeUndefined();expect(child.profile).toEqual({lastStep:1});expect(applicationAdmissionIssue(child,event)?.code).toBe('COMPANION_CONSENT');}
 expect((rows.get(`owner:${sponsor.id}`) as HubOwner).basicDrafts).toEqual(sponsor.basicDrafts);expect(all('member')).toHaveLength(0);
});
it('rolls back all people and ranks if a later friend is duplicate',async()=>{
 (rows.get(`owner:${sponsor.id}`) as HubOwner).companionDrafts![event.id].items[1].basic.nickname='친구1번';await expect(submit()).rejects.toMatchObject({code:'NICKNAME'});expect(apps()).toHaveLength(0);expect((rows.get(`event:${event.id}`) as HubEvent).nextRank).toBe(2);expect(all('owner')).toHaveLength(1);
});
it('fresh retries reuse each person without changing existing approved self',async()=>{
 await submit();const self=apps().find(a=>a.owner===sponsor.id)!;self.payment='approved';self.confirmedAt=now.toISOString();self.approvedAt=self.confirmedAt;self.profile={lastStep:4,mbti:'INTJ'};await tx.put('application',self.id,self);await submit();expect(apps()).toHaveLength(3);expect(apps().find(a=>a.id===self.id)).toEqual(self);expect((rows.get(`event:${event.id}`) as HubEvent).nextRank).toBe(5);await expect(run('companion.submit',{basic,draftIds},2)).rejects.toMatchObject({code:'REVISION'});
});
it('summary requires own notice for fees and never exposes child profile, phone or venue',async()=>{
 await submit();let views=await companionApplicationViews(tx,rows.get(`owner:${sponsor.id}`) as HubOwner,apps());expect(views).toHaveLength(2);expect(views[0]).not.toHaveProperty('quote');expect(views[0]).not.toHaveProperty('rank');await confirm();views=await companionApplicationViews(tx,rows.get(`owner:${sponsor.id}`) as HubOwner,apps());expect(views[0].quote?.fee).toBe(23000);for(const v of views)for(const key of ['owner','phone','depositor','profile','cards','recoveryHash','venue','consent'])expect(v).not.toHaveProperty(key);
});
it('representative confirmation keeps personal consent absent and grouped report never approves',async()=>{
 await submit();await confirm();const people=apps();expect(people.every(a=>a.confirmedAt)).toBe(true);expect(people.filter(a=>a.sponsorOwner).every(a=>!a.consent)).toBe(true);await run('companion.report',{applicationIds:people.map(a=>a.id),revisions:Object.fromEntries(people.map(a=>[a.id,a.revision])),combinedPayment:true});expect(apps().every(a=>a.payment==='reported'&&!a.approvedAt&&!a.waivedAt)).toBe(true);expect(new Set(apps().map(a=>a.combinedPaymentReport?.batchId)).size).toBe(1);
});
it('rejects unrelated people and stale revisions without partially reporting payment',async()=>{
 await submit();await confirm();const people=apps();await expect(run('companion.report',{applicationIds:[people[0].id,randomUUID()],revisions:{[people[0].id]:people[0].revision},combinedPayment:true})).rejects.toMatchObject({code:'COMPANION_ACCESS'});await expect(run('companion.report',{applicationIds:people.map(a=>a.id),revisions:Object.fromEntries(people.map(a=>[a.id,a.revision-1])),combinedPayment:true})).rejects.toMatchObject({code:'REVISION'});expect(apps().every(a=>a.payment==='none')).toBe(true);
});
it('submitted drafts cannot edit or produce legacy invitation tokens',async()=>{
 await submit();await expect(companionCommand(tx,{owner:sponsor.id,eventId:event.id,now:now.toISOString(),maxDrafts:20,invitationTtlMs:1,command:{action:'companion.invite',target:draftIds[0],revision:group().revision,data:{eventId:event.id}}})).rejects.toMatchObject({code:'COMPANION_LOCKED'});expect(apps()).toHaveLength(3);
});
it('only persisted authenticated request and explicit admin identity check bind a friend',async()=>{
 await submit();await confirm();const friend:HubOwner={id:randomUUID(),createdAt:now.toISOString(),recoveryHash:'friend-opaque'};await tx.put('owner',friend.id,friend);const result=await run('companion.link.request',{owner:sponsor.id,userId:sponsor.id},undefined,'',friend.id);const request=await tx.get<any>('settings',`companion-link:${result.linkRequestId}`);expect(request.owner).toBe(friend.id);const child=apps().find(a=>a.sponsorOwner)!;const payload={applicationId:child.id,applicationRevision:child.revision,identityChecked:true};await expect(run('admin.companion.link',payload,1,request.id,sponsor.id,false)).rejects.toMatchObject({code:'ADMIN'});await expect(run('admin.companion.link',{...payload,identityChecked:false},1,request.id,sponsor.id,true)).rejects.toThrow();await run('admin.companion.link',payload,1,request.id,sponsor.id,true);const linked=apps().find(a=>a.id===child.id)!;expect(linked.owner).toBe(friend.id);expect(linked.companionSubmission?.personalConsentPending).toBe(true);expect(linked.rank).toBe(child.rank);expect(linked.quote).toEqual(child.quote);expect(linked.confirmedAt).toBe(child.confirmedAt);await expect(run('admin.companion.link',payload,1,request.id,sponsor.id,true)).rejects.toMatchObject({code:'COMPANION_LINK'});
});
it('does not merge friend existing member identity on administrator linkage',async()=>{
 await submit();const friend:HubOwner={id:randomUUID(),createdAt:now.toISOString(),recoveryHash:'friend-opaque'};await tx.put('owner',friend.id,friend);const result=await run('companion.link.request',{},undefined,'',friend.id);const child=apps().find(a=>a.sponsorOwner)!;rows.set('member:existing',{owner:friend.id,basic:{nickname:'다른본인',birthYear:1995}});await expect(run('admin.companion.link',{applicationId:child.id,applicationRevision:child.revision,identityChecked:true},1,String(result.linkRequestId),sponsor.id,true)).rejects.toMatchObject({code:'COMPANION_IDENTITY'});expect(apps().find(a=>a.id===child.id)?.owner).toBe(child.owner);
});
it('linked personal basic completion keeps existing approval/rank and cannot change submitted age',async()=>{
 await submit();const child=apps().find(a=>a.sponsorOwner)!;const childOwner=await tx.get<HubOwner>('owner',child.owner);child.companionSubmission!.linkedAt=now.toISOString();child.payment='approved';child.confirmedAt=now.toISOString();child.approvedAt=now.toISOString();await tx.put('application',child.id,child);const completed={...child.basic,depositor:'친구입금자',collection:true as const,version:HUB_CONSENT_VERSION as typeof HUB_CONSENT_VERSION};await expect(saveBasicApplication(tx,{owner:childOwner!,event,basic:{...completed,birthYear:1990},now,actor:child.owner,edit:true,revision:child.revision})).rejects.toMatchObject({code:'COMPANION_IDENTITY'});const updated=await saveBasicApplication(tx,{owner:childOwner!,event,basic:completed,now,actor:child.owner,edit:true,revision:child.revision});expect(updated.id).toBe(child.id);expect(updated.payment).toBe('approved');expect(updated.rank).toBe(child.rank);expect(updated.quote).toEqual(child.quote);expect(updated.confirmedAt).toBe(child.confirmedAt);expect(updated.consent).toBeUndefined();
});

it('combined report compares immutable bank destination even when account IDs match',async()=>{
 await submit();await confirm();const people=apps(),accountId=randomUUID();
 for(const [i,a] of people.entries()){a.paymentAccount={id:accountId,bank:'합성은행',number:i===0?'000-001':'000-002'};await tx.put('application',a.id,a);}
 await expect(run('companion.report',{applicationIds:people.map(a=>a.id),revisions:Object.fromEntries(people.map(a=>[a.id,a.revision])),combinedPayment:true})).rejects.toMatchObject({code:'ACCOUNT'});
 expect(apps().every(a=>a.payment==='none')).toBe(true);
});
it('supports a representative plus the full twenty-friend draft limit in one report',async()=>{
 const own=rows.get(`owner:${sponsor.id}`) as HubOwner,template=own.companionDrafts![event.id].items[0];
 own.companionDrafts![event.id].items=Array.from({length:20},(_,i)=>({...clone(template),id:randomUUID(),basic:{nickname:`친구${i+1}번`,birthYear:1995,location:'파주'}}));draftIds=own.companionDrafts![event.id].items.map(d=>d.id);
 await submit();await confirm();const people=apps();expect(people).toHaveLength(21);
 await run('companion.report',{applicationIds:people.map(a=>a.id),revisions:Object.fromEntries(people.map(a=>[a.id,a.revision])),combinedPayment:true});
 expect(apps().every(a=>a.payment==='reported')).toBe(true);
});

it('omitting general phone preserves stored application and reused-member phone during an ordinary edit',async()=>{
 await submit();const self=apps().find(a=>a.owner===sponsor.id)!;self.basic.phone='01000000000';await tx.put('application',self.id,self);
 const member={id:randomUUID(),owner:sponsor.id,nicknameKey:normalizeHubNickname(self.basic.nickname),basic:{...self.basic,phone:'01011111111'},profile:{lastStep:1},history:[],nicknameChanges:0};await tx.put('member',member.id,member);
 const updated=await saveBasicApplication(tx,{owner:sponsor,event,basic:{...basic,nickname:'수정본인'},now,actor:sponsor.id,edit:true,revision:self.revision});
 expect(updated.basic.phone).toBe('01000000000');expect(updated.rank).toBe(self.rank);expect(updated.id).toBe(self.id);
 expect((await tx.get<any>('member',member.id)).basic.phone).toBe('01011111111');
});
