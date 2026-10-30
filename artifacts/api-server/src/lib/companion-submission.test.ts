import {beforeEach,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {HUB_CONSENT_VERSION,HubEventInput,applicationAdmissionIssue,type HubApplication,type HubEvent} from '@workspace/api-zod';
import {companionApplicationViews,companionSubmissionCommand} from './companion-submission.js';
import {saveBasicApplication} from './event-hub-application-basic.js';
import {companionCommand,companionDraftViews} from './companion-records.js';
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
async function existingMemberLink(){
 const friend:HubOwner={id:randomUUID(),createdAt:now.toISOString(),recoveryHash:'friend-only-recovery'};
 const draft=group().items[0],member={id:randomUUID(),owner:friend.id,nicknameKey:normalizeHubNickname(draft.basic.nickname!),basic:{...draft.basic,phone:'01011111111'},profile:{lastStep:6,mbti:'ENFP'},passwordHash:'friend-only-hash',salt:'friend-only-salt',nicknameChanges:0,history:[]};
 rows.set(`owner:${friend.id}`,clone(friend));rows.set(`member:${member.id}`,clone(member));
 const requested=await run('companion.link.request',{},undefined,'',friend.id);
 const request=await tx.get<any>('settings',`companion-link:${requested.linkRequestId}`);
 const prepare=()=>run('admin.companion.link-draft',{sponsorOwner:sponsor.id,draftId:draft.id,groupRevision:group().revision,identityChecked:true},request.revision,request.id,ownerAdmin(),true);
 return{friend,member,draft,request,prepare};
}
const ownerAdmin=()=>sponsor.id;
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
it('ignores a newly injected general phone before group basic validation or shared persistence',async()=>{
 await run('companion.submit',{basic:{...basic,phone:{unexpected:'input'}},draftIds},group().revision);expect(apps().every(a=>a.basic.phone===undefined)).toBe(true);
 const self=apps().find(a=>a.owner===sponsor.id)!;self.basic.phone='01011111111';await tx.put('application',self.id,self);
 const updated=await saveBasicApplication(tx,{owner:sponsor,event,basic:{...basic,phone:'01099999999'},now,actor:sponsor.id,edit:true,revision:self.revision});expect(updated.basic.phone).toBe('01011111111');
});
it('prepares an existing authenticated member without reserving a rank, then submits each person atomically',async()=>{
 const link=await existingMemberLink();await expect(submit()).rejects.toMatchObject({code:'NICKNAME'});expect(apps()).toHaveLength(0);
 await link.prepare();expect(apps()).toHaveLength(0);expect((rows.get(`event:${event.id}`) as HubEvent).nextRank).toBe(2);
 const view=JSON.stringify(companionDraftViews(rows.get(`owner:${sponsor.id}`) as HubOwner));expect(view).not.toContain(link.friend.id);expect(view).not.toContain(link.request.id);expect(view).toContain('identityLinkedAt');
 await submit();const people=apps().sort((a,b)=>a.rank-b.rank),child=people[1];expect(people.map(a=>a.rank)).toEqual([3,4,5]);expect(child.owner).toBe(link.friend.id);expect(child.companionSubmission).toMatchObject({linkedAt:now.toISOString(),personalConsentPending:true});
 expect(child.consent).toBeUndefined();expect(child.basic.phone).toBeUndefined();expect(child.profile).toEqual({lastStep:1});expect(rows.get(`member:${link.member.id}`)).toEqual(link.member);
 expect((await tx.get<any>('settings',`companion-link:${link.request.id}`))).toMatchObject({status:'linked',applicationId:child.id});
 await confirm();await run('companion.report',{applicationIds:people.map(a=>a.id),revisions:Object.fromEntries(apps().map(a=>[a.id,a.revision])),combinedPayment:true});expect(apps().every(a=>a.payment==='reported')).toBe(true);
});
it('requires admin identity attestation and current request/group revisions for draft binding',async()=>{
 const link=await existingMemberLink(),data={sponsorOwner:sponsor.id,draftId:link.draft.id,groupRevision:group().revision,identityChecked:true};
 await expect(run('admin.companion.link-draft',data,link.request.revision,link.request.id,sponsor.id,false)).rejects.toMatchObject({code:'ADMIN'});
 await expect(run('admin.companion.link-draft',{...data,groupRevision:0},link.request.revision,link.request.id,sponsor.id,true)).rejects.toMatchObject({code:'REVISION'});
 await expect(run('admin.companion.link-draft',{...data,identityChecked:false},link.request.revision,link.request.id,sponsor.id,true)).rejects.toThrow();
 (rows.get(`member:${link.member.id}`) as any).basic.birthYear=1990;await expect(link.prepare()).rejects.toMatchObject({code:'COMPANION_IDENTITY'});expect(group().items[0].linkRequestId).toBeUndefined();
});
it('reuses a verified member profile only on that friend own basic completion and never overwrites a current draft',async()=>{
 const link=await existingMemberLink();await link.prepare();await submit();let child=apps().find(a=>a.owner===link.friend.id)!;const completed={...child.basic,depositor:'친구본인',collection:true as const,version:HUB_CONSENT_VERSION as typeof HUB_CONSENT_VERSION};
 child=await saveBasicApplication(tx,{owner:link.friend,event,basic:completed,now,actor:sponsor.id,edit:true,revision:child.revision});expect(child.profile).toEqual({lastStep:1});
 child=await saveBasicApplication(tx,{owner:link.friend,event,basic:completed,now,actor:link.friend.id,edit:true,revision:child.revision});expect(child.profile).toEqual(link.member.profile);expect(rows.get(`member:${link.member.id}`)).toEqual({...link.member,lastActivityAt:now.toISOString()});
 child.profile={lastStep:1,mbti:'ISTJ'};await tx.put('application',child.id,child);
 child=await saveBasicApplication(tx,{owner:link.friend,event,basic:completed,now,actor:link.friend.id,edit:true,revision:child.revision});expect(child.profile).toEqual({lastStep:1,mbti:'ISTJ'});expect(rows.get(`member:${link.member.id}`)).toEqual({...link.member,lastActivityAt:now.toISOString()});
 const view=JSON.stringify(await companionApplicationViews(tx,rows.get(`owner:${sponsor.id}`) as HubOwner,apps().filter(a=>a.owner===sponsor.id)));expect(view).not.toContain('ENFP');expect(view).not.toContain('ISTJ');
});
it('rejects a changed verified draft and rolls back own and other friend allocations',async()=>{
 const link=await existingMemberLink();await link.prepare();group().items[0].basic.location='다른지역';
 await expect(submit()).rejects.toMatchObject({code:'COMPANION_LINK'});expect(apps()).toHaveLength(0);expect((rows.get(`event:${event.id}`) as HubEvent).nextRank).toBe(2);
});
it('does not let a representative rename an inconsistent legacy member through the shared basic engine',async()=>{
 const link=await existingMemberLink();await link.prepare();(rows.get(`member:${link.member.id}`) as any).nicknameKey='old-inconsistent-key';const before=clone(rows.get(`member:${link.member.id}`));
 await expect(submit()).rejects.toMatchObject({code:'COMPANION_IDENTITY'});expect(rows.get(`member:${link.member.id}`)).toEqual(before);expect(apps()).toHaveLength(0);
});
it('does not merge a friend application created after draft binding or overwrite its approval',async()=>{
 const link=await existingMemberLink();await link.prepare();const saved={id:randomUUID(),owner:link.friend.id,eventId:event.id,payment:'approved',rank:9,basic:{nickname:link.draft.basic.nickname},profileId:'preserved-profile',cards:[{id:'preserved-card'}]};rows.set(`application:${saved.id}`,clone(saved));
 await expect(submit()).rejects.toMatchObject({code:'COMPANION_CONFLICT'});expect(apps()).toEqual([saved]);expect((rows.get(`event:${event.id}`) as HubEvent).nextRank).toBe(2);
});
it('allows only the friend or an administrator to cancel a pending request and preserves its record',async()=>{
 const link=await existingMemberLink();await link.prepare();const revision=(await tx.get<any>('settings',`companion-link:${link.request.id}`)).revision;
 await expect(run('companion.link.cancel',{},revision,link.request.id,sponsor.id)).rejects.toMatchObject({code:'COMPANION_ACCESS'});
 await run('companion.link.cancel',{},revision,link.request.id,link.friend.id);expect(group().items[0].linkRequestId).toBeUndefined();expect(group().items[0].identityLinkedAt).toBeUndefined();
 expect(await tx.get<any>('settings',`companion-link:${link.request.id}`)).toMatchObject({cancelledAt:now.toISOString(),revision:revision+1,status:'pending'});
 const next=await run('companion.link.request',{},undefined,'',link.friend.id);expect(next.linkRequestId).not.toBe(link.request.id);expect(rows.has(`settings:companion-link:${link.request.id}`)).toBe(true);expect(rows.get(`member:${link.member.id}`)).toEqual(link.member);
});
it('locks verified draft edits until its own representative releases the association, even if the request is gone',async()=>{
 const link=await existingMemberLink();await link.prepare();const ctx={owner:sponsor.id,eventId:event.id,now:now.toISOString(),maxDrafts:20,invitationTtlMs:1};
 await expect(companionCommand(tx,{...ctx,command:{action:'companion.draft.save',target:'',revision:group().revision,data:{eventId:event.id,id:link.draft.id,basic:{nickname:'변경친구'},permissionToProvide:true}}})).rejects.toMatchObject({code:'COMPANION_LOCKED'});
 rows.delete(`settings:companion-link:${link.request.id}`);
 await companionCommand(tx,{...ctx,command:{action:'companion.draft.unlink',target:link.draft.id,revision:group().revision,data:{eventId:event.id}}});expect(group().items[0].linkRequestId).toBeUndefined();expect(rows.get(`member:${link.member.id}`)).toEqual(link.member);
});
it('cannot prepare the same request twice or cancel a completed application binding',async()=>{
 const link=await existingMemberLink();await link.prepare();const request=await tx.get<any>('settings',`companion-link:${link.request.id}`);
 await expect(run('admin.companion.link-draft',{sponsorOwner:sponsor.id,draftId:draftIds[1],groupRevision:group().revision,identityChecked:true},request.revision,request.id,sponsor.id,true)).rejects.toMatchObject({code:'COMPANION_LINK'});
 await submit();const linked=await tx.get<any>('settings',`companion-link:${request.id}`);await expect(run('companion.link.cancel',{},linked.revision,linked.id,link.friend.id)).rejects.toMatchObject({code:'COMPANION_LINK'});expect(apps().filter(a=>a.owner===link.friend.id)).toHaveLength(1);
});
it('persists explicit friend selection and rejects a stale or different selected set without reserving a rank',async()=>{
 const ctx={owner:sponsor.id,eventId:event.id,now:now.toISOString(),maxDrafts:20,invitationTtlMs:1};
 const selected=await companionCommand(tx,{...ctx,command:{action:'companion.selection.save',target:'',revision:group().revision,data:{eventId:event.id,draftIds:[draftIds[0]]}}});expect(selected.revision).toBe(group().revision);expect(group().selection).toEqual({draftIds:[draftIds[0]],reviewedRevision:group().revision});
 await expect(submit()).rejects.toMatchObject({code:'COMPANION_SELECTION'});expect(apps()).toHaveLength(0);
 await run('companion.submit',{basic,draftIds:[draftIds[0]]},group().revision);expect(apps()).toHaveLength(2);expect(group().items[1].applicationId).toBeUndefined();
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
