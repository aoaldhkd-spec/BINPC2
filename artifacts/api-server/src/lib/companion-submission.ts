import {randomBytes,randomUUID} from 'node:crypto';
import {HubBasic,z,type HubApplication,type HubEvent} from '@workspace/api-zod';
import {CompanionCompleteBasic,type CompanionGroup} from './companion-records.js';
import {saveBasicApplication,withoutGeneralPhoneInput} from './event-hub-application-basic.js';
import {digest,fail,normalizeHubNickname,type HubTx} from './event-hub-store.js';
import type {HubOwner} from './event-hub-service.js';
import {companionDraftFingerprint,releaseCompanionDraftLink,saveCompanionLinkRequest,type CompanionLinkRequest} from './companion-links.js';

export type {CompanionLinkRequest} from './companion-links.js';
type Command={action:string;target:string;revision?:number;data:Record<string,unknown>};
type Context={owner:string;admin:boolean;event:HubEvent;now:Date;command:Command;privacyPolicyConsent?:HubApplication['privacyPolicyConsent']};
const ids=z.array(z.string().uuid()).min(1).max(20).refine(v=>new Set(v).size===v.length);
const reportIds=z.array(z.string().uuid()).min(1).max(21).refine(v=>new Set(v).size===v.length);
const rev=(actual:number,expected:unknown)=>{if(actual!==expected)fail('REVISION','신청 정보가 바뀌었습니다. 최신 내용을 확인해 주세요.',409);};
const activeOwner=async(tx:HubTx,id:string)=>{const o=await tx.get<HubOwner>('owner',id);if(!o||o.id!==id||o.erasedAt)fail('AUTH','본인 신청 세션을 확인해 주세요.',401);if(o.restricted?.active)fail('RESTRICTED','관리자 확인이 필요한 신청입니다.',403);return o;};
const ownApplication=async(tx:HubTx,owner:string,eventId:string)=> (await tx.applicationsForOwner<HubApplication>(owner)).find(a=>a.owner===owner&&a.eventId===eventId&&!a.erasedAt);
function groupFor(owner:HubOwner,eventId:string):CompanionGroup{return owner.companionDrafts?.[eventId]??{revision:0,items:[]};}
function update(a:HubApplication,at:string,actor:string,action:string){a.updatedAt=at;a.revision++;a.history.push({at,actor,action});}
async function existingFriend(tx:HubTx,owner:string,sponsor:string,eventId:string,basic:HubApplication['basic']){
 const friend=await activeOwner(tx,owner);
 if(friend.id===sponsor||await ownApplication(tx,friend.id,eventId)||friend.basicDrafts?.[eventId]||friend.companionOrigins?.[eventId])fail('COMPANION_CONFLICT','친구의 기존 신청이 있습니다. 자동으로 합치지 않습니다.',409);
 const member=(await tx.membersForOwner<{owner:string;nicknameKey?:string;basic:HubApplication['basic']}>(friend.id)).find(v=>v.owner===friend.id);
 if(member&&(normalizeHubNickname(member.basic.nickname)!==normalizeHubNickname(basic.nickname)||member.nicknameKey!==normalizeHubNickname(basic.nickname)||member.basic.birthYear!==basic.birthYear))fail('COMPANION_IDENTITY','기존 본인 정보와 일치하지 않습니다. 관리자에게 정정을 요청해 주세요.',409);
 return friend;
}
async function childApplications(tx:HubTx,owner:HubOwner,eventId:string,selected:string[]){
 const group=groupFor(owner,eventId),apps:HubApplication[]=[];
 for(const id of selected){const draft=group.items.find(v=>v.applicationId===id&&!v.removedAt);const a=await tx.get<HubApplication>('application',id);
  if(!draft||!a||a.erasedAt||a.eventId!==eventId||a.sponsorOwner!==owner.id||a.companionDraftId!==draft.id||!a.companionSubmission)fail('COMPANION_ACCESS','이 동반신청에 접근할 수 없습니다.',404);
  apps.push(a);
 }return apps;
}
/** Explicit representative projection. Never return child credentials, profile, personal phone, venue or social state. Event bank snapshots require sponsor notice. */
export async function companionApplicationViews(tx:HubTx,owner:HubOwner|undefined,ownApps:HubApplication[]){
 const rows=[];
 const records=Object.values(owner?.companionDrafts??{}).flatMap(g=>g.items.filter(d=>d.applicationId&&!d.removedAt).map(d=>({kind:'application',id:d.applicationId!})));
 if(records.length)await tx.prefetch(records);
 for(const [eventId,group] of Object.entries(owner?.companionDrafts??{})){
  const own=ownApps.find(a=>a.eventId===eventId&&a.owner===owner!.id&&!a.erasedAt),showFee=Boolean(own?.consent?.notice);
  for(const d of group.items){if(!d.applicationId||d.removedAt)continue;const a=await tx.get<HubApplication>('application',d.applicationId);
   if(!a||a.erasedAt||a.sponsorOwner!==owner!.id||a.eventId!==eventId||a.companionDraftId!==d.id)continue;
   rows.push({id:a.id,eventId,draftId:d.id,nickname:d.basic.nickname??'',birthYear:d.basic.birthYear,location:d.basic.location??'',revision:a.revision,
    ...(showFee?{rank:a.rank,quote:a.quote}:{}),payment:a.payment,paymentAccountId:showFee?a.paymentAccount?.id:undefined,paymentAccount:showFee?a.paymentAccount:undefined,attendance:a.attendance,confirmedAt:a.confirmedAt,waivedAt:a.waivedAt,approvalRevokedAt:a.approvalRevokedAt,linked:Boolean(a.companionSubmission?.linkedAt),personalConsentPending:a.companionSubmission?.personalConsentPending??true});
  }
 }return rows;
}
export async function companionSubmissionCommand(tx:HubTx,ctx:Context):Promise<Record<string,unknown>>{
 const {command:m,event:e,now}=ctx,at=now.toISOString();
 if(['admin.companion.link-draft','admin.companion.unlink-draft','companion.link.cancel'].includes(m.action)){
  if(m.action.startsWith('admin.')&&!ctx.admin)fail('ADMIN','관리자만 처리할 수 있습니다.',403);
  const request=await tx.get<CompanionLinkRequest>('settings',`companion-link:${m.target}`);
  if(!request||request.id!==m.target||request.eventId!==e.id||request.status!=='pending'||request.cancelledAt)fail('COMPANION_LINK','대기 중인 본인 연결 요청을 확인해 주세요.',409);
  if(m.action==='companion.link.cancel'&&request.owner!==ctx.owner)fail('COMPANION_ACCESS','본인의 연결 요청만 취소할 수 있습니다.',403);
  rev(request.revision,m.revision);
  if(m.action==='admin.companion.link-draft'){
   const data=z.object({sponsorOwner:z.string().uuid(),draftId:z.string().uuid(),groupRevision:z.number().int().nonnegative(),identityChecked:z.literal(true)}).parse(m.data);
   if(request.draftBinding)fail('COMPANION_LINK','기존 연결을 해제한 뒤 다시 선택해 주세요.',409);
   const sponsor=await activeOwner(tx,data.sponsorOwner),group=groupFor(sponsor,e.id);rev(group.revision,data.groupRevision);
   const draft=group.items.find(d=>d.id===data.draftId&&!d.removedAt&&!d.applicationId&&!d.claimedAt&&!d.linkRequestId);
   if(!draft)fail('COMPANION_LOCKED','아직 접수하지 않은 친구를 선택해 주세요.',409);
   const basic=CompanionCompleteBasic.parse(draft.basic);await existingFriend(tx,request.owner,sponsor.id,e.id,basic);
   request.draftBinding={sponsorOwner:sponsor.id,draftId:draft.id,basicFingerprint:companionDraftFingerprint(draft),at};request.revision++;
   draft.linkRequestId=request.id;draft.identityLinkedAt=at;draft.inviteHash=undefined;draft.changedAt=at;group.revision++;
   sponsor.companionDrafts={...sponsor.companionDrafts,[e.id]:group};await tx.put('owner',sponsor.id,sponsor);await saveCompanionLinkRequest(tx,request);
   return {saved:true,prepared:true,revision:request.revision};
  }
  const sponsor=request.draftBinding?await tx.get<HubOwner>('owner',request.draftBinding.sponsorOwner):undefined;
  const group=sponsor?groupFor(sponsor,e.id):undefined;
  const draft=group?.items.find(d=>d.id===request.draftBinding?.draftId&&d.linkRequestId===request.id);
  if(draft&&sponsor&&group){
   await releaseCompanionDraftLink(tx,sponsor,draft,e.id,at);group.revision++;
   sponsor.companionDrafts={...sponsor.companionDrafts,[e.id]:group};await tx.put('owner',sponsor.id,sponsor);
  }else{request.cancelledAt=at;request.revision++;await saveCompanionLinkRequest(tx,request);}
  return {saved:true,cancelled:true};
 }
 if(m.action==='admin.companion.link'){
  if(!ctx.admin)fail('ADMIN','관리자만 처리할 수 있습니다.',403);
  const request=await tx.get<CompanionLinkRequest>('settings',`companion-link:${m.target}`);
  if(!request||request.eventId!==e.id||request.status!=='pending'||request.cancelledAt||request.draftBinding)fail('COMPANION_LINK','대기 중인 본인 연결 요청을 확인해 주세요.',409);
  rev(request.revision,m.revision);
  const data=z.object({applicationId:z.string().uuid(),applicationRevision:z.number().int(),identityChecked:z.literal(true)}).parse(m.data);
  const a=await tx.get<HubApplication>('application',data.applicationId);
  if(!a||a.erasedAt||a.eventId!==e.id||!a.companionSubmission||a.companionSubmission.linkedAt||!a.sponsorOwner||a.profileId)fail('COMPANION_LINK','연결할 동반신청을 확인해 주세요.',409);
  rev(a.revision,data.applicationRevision);const friend=await activeOwner(tx,request.owner);
  if(friend.id===a.sponsorOwner||await ownApplication(tx,friend.id,e.id)||friend.basicDrafts?.[e.id]||friend.companionOrigins?.[e.id])fail('COMPANION_CONFLICT','친구의 기존 신청이 있습니다. 자동으로 합치지 않습니다.',409);
  const member=(await tx.membersForOwner<{owner:string;basic:HubApplication['basic']}>(friend.id)).find(v=>v.owner===friend.id);
  if(member&&(member.basic.nickname!==a.basic.nickname||member.basic.birthYear!==a.basic.birthYear))fail('COMPANION_IDENTITY','기존 본인 정보와 일치하지 않습니다. 관리자에게 정정을 요청해 주세요.',409);
  const previousOwner=await activeOwner(tx,a.owner);
  if(previousOwner.companionPendingApplicationId!==a.id)fail('COMPANION_LINK','독립된 동반신청만 연결할 수 있습니다.',409);
  a.owner=friend.id;a.companionSubmission.linkedAt=at;update(a,at,'admin','admin.companion.link');
  friend.companionOrigins={...friend.companionOrigins,[e.id]:{sponsorOwner:a.sponsorOwner,companionDraftId:a.companionDraftId!,claimedAt:at}};
  request.status='linked';request.applicationId=a.id;request.revision++;
  friend.companionLinkRequests={...friend.companionLinkRequests,[e.id]:request};
  const sponsor=await tx.get<HubOwner>('owner',a.sponsorOwner);
  if(sponsor&&!sponsor.erasedAt){const group=groupFor(sponsor,e.id),draft=group.items.find(v=>v.applicationId===a.id&&!v.removedAt);if(draft){draft.claimedAt=at;draft.changedAt=at;group.revision++;await tx.put('owner',sponsor.id,sponsor);}}
  await tx.put('owner',friend.id,friend);await tx.put('application',a.id,a);await tx.put('settings',`companion-link:${request.id}`,request);
  return {saved:true,id:a.id};
 }
 const me=await activeOwner(tx,ctx.owner),group=groupFor(me,e.id);
 if(m.action==='companion.link.request'){
  if(await ownApplication(tx,me.id,e.id))fail('COMPANION_CONFLICT','이미 연결된 내 신청을 이어가 주세요.',409);
  const old=me.companionLinkRequests?.[e.id];if(old?.status==='pending'&&!old.cancelledAt)return {saved:true,linkRequestId:old.id};
  if(Object.keys(me.companionLinkRequests??{}).length>=30)fail('LIMIT','연결 요청 한도를 초과했습니다. 관리자에게 문의해 주세요.');
  const request:CompanionLinkRequest={id:randomUUID(),owner:me.id,eventId:e.id,at,revision:1,status:'pending'};
  me.companionLinkRequests={...me.companionLinkRequests,[e.id]:request};await tx.put('owner',me.id,me);await tx.put('settings',`companion-link:${request.id}`,request);
  return {saved:true,linkRequestId:request.id};
 }
 if(m.action==='companion.submit'){
  if(e.campaign&&m.data.round!==undefined&&m.data.round!==1)fail('ROUND','1차 행사만 신청할 수 있습니다.');
  rev(group.revision,m.revision);const selected=ids.parse(m.data.draftIds);
  if(group.selection&&(group.selection.reviewedRevision!==group.revision||selected.length!==group.selection.draftIds.length||selected.some(id=>!group.selection!.draftIds.includes(id))))fail('COMPANION_SELECTION','함께 신청할 친구를 다시 확인해 주세요.',409);
  const drafts=selected.map(id=>{const d=group.items.find(v=>v.id===id&&!v.removedAt);if(!d||d.claimedAt&&!d.applicationId)fail('COMPANION_LOCKED','친구 본인이 이어서 신청 중입니다.',409);CompanionCompleteBasic.parse(d.basic);return d;});
  const existing=await ownApplication(tx,me.id,e.id);
  const basic=existing?.basic??HubBasic.parse(withoutGeneralPhoneInput(m.data.basic));
  const self=await saveBasicApplication(tx,{owner:me,event:e,basic,now,actor:me.id,privacyPolicyConsent:ctx.privacyPolicyConsent});
  const applicationIds:string[]=[];let changed=false;
  for(const draft of drafts){
   if(draft.applicationId){const saved=(await childApplications(tx,me,e.id,[draft.applicationId]))[0];applicationIds.push(saved.id);continue;}
   const prepared=draft.linkRequestId?await tx.get<CompanionLinkRequest>('settings',`companion-link:${draft.linkRequestId}`):undefined;
   if(draft.linkRequestId&&(!prepared||prepared.status!=='pending'||prepared.cancelledAt||prepared.eventId!==e.id||prepared.draftBinding?.sponsorOwner!==me.id||prepared.draftBinding.draftId!==draft.id||prepared.draftBinding.basicFingerprint!==companionDraftFingerprint(draft)))fail('COMPANION_LINK','친구의 본인 연결을 다시 확인해 주세요.',409);
   const basic=CompanionCompleteBasic.parse(draft.basic);
   const child:HubOwner=prepared?await existingFriend(tx,prepared.owner,me.id,e.id,basic):{id:randomUUID(),createdAt:at,recoveryHash:digest(randomBytes(32).toString('hex'))};
   const a=await saveBasicApplication(tx,{owner:child,event:e,basic,now,actor:me.id,sponsorOwner:me.id,companionDraftId:draft.id,companionSubmission:{submittedAt:at,permissionToProvideAt:draft.permissionToProvideAt,personalConsentPending:true,...(prepared?{linkedAt:at}:{})}});
   if(prepared){
    child.companionOrigins={...child.companionOrigins,[e.id]:{sponsorOwner:me.id,companionDraftId:draft.id,claimedAt:at}};
    prepared.status='linked';prepared.applicationId=a.id;prepared.revision++;
    child.companionLinkRequests={...child.companionLinkRequests,[e.id]:prepared};await tx.put('settings',`companion-link:${prepared.id}`,prepared);draft.claimedAt=at;
   }else child.companionPendingApplicationId=a.id;
   await tx.put('owner',child.id,child);
   draft.applicationId=a.id;draft.submittedAt=at;draft.changedAt=at;draft.inviteHash=undefined;applicationIds.push(a.id);changed=true;
  }
  if(changed){group.revision++;me.companionDrafts={...me.companionDrafts,[e.id]:group};await tx.put('owner',me.id,me);}
  return {saved:true,id:self.id,companionApplicationIds:applicationIds};
 }
 if(m.action==='companion.confirm'){
  const self=await ownApplication(tx,me.id,e.id);if(!self||self.id!==m.target)fail('APPLICATION','내 신청을 확인해 주세요.',404);
  rev(self.revision,m.revision);rev(group.revision,m.data.groupRevision);
  if(!self.consent?.notice||self.consent.noticeVersion!==e.noticeVersion||self.stage<3)fail('CONSENT','공지와 회비를 먼저 확인해 주세요.',409);
  const children=await childApplications(tx,me,e.id,ids.parse(m.data.applicationIds));
  const revisions=z.record(z.string(),z.number().int()).parse(m.data.revisions);
  for(const child of children)rev(child.revision,revisions[child.id]);
  for(const a of [self,...children]){
   if(a.confirmedAt)continue;
   if(!a.quote)fail('STAGE','회비를 확인해 주세요.');
   const account=m.data.accountId?e.accounts?.find(v=>v.id===m.data.accountId):self.paymentAccount;
   if(a.quote.fee>0&&(e.accounts?.length??0)>0&&!account)fail('ACCOUNT','입금할 계좌 하나를 선택해 주세요.');
   if(account&&!e.accounts?.some(v=>v.id===account.id&&v.bank===account.bank&&v.number===account.number&&(v.holder??'')===(account.holder??'')))fail('ACCOUNT_CHANGED','계좌 안내가 변경되었습니다. 다시 확인해 주세요.',409);
   a.paymentAccount=account?{...account}:undefined;a.stage=4;a.confirmedAt=at;update(a,at,me.id,'companion.confirm');await tx.put('application',a.id,a);
  }
  return {saved:true,id:self.id};
 }
 if(m.action==='companion.report'){
  if(m.data.combinedPayment!==true)fail('PAYMENT','합산 입금 신고를 확인해 주세요.');
  const selected=reportIds.parse(m.data.applicationIds),revisions=z.record(z.string(),z.number().int()).parse(m.data.revisions);
  const self=await ownApplication(tx,me.id,e.id);if(!self?.consent?.notice)fail('CONSENT','공지와 회비를 먼저 확인해 주세요.',409);
  const children=await childApplications(tx,me,e.id,selected.filter(id=>id!==self.id));
  const apps=selected.includes(self.id)?[self,...children]:children;
  const batchId=randomUUID();
  for(const a of apps){rev(a.revision,revisions[a.id]);if(!a.confirmedAt)fail('STAGE','신청을 먼저 확정해 주세요.');if(a.approvalRevokedAt)fail('ATTENDANCE','승인이 취소된 신청은 재입금하지 말고 관리자에게 문의해 주세요.',409);if(a.waivedAt||a.quote?.fee===0)fail('FREE','무료 대상은 별도로 승인합니다. 송금하지 마세요.');if(a.lateArrival?.status==='review'||a.lateArrival?.status==='declined')fail('ARRIVAL_REVIEW','도착 예정시간을 관리자와 확인해 주세요.');}
  const accountKeys=new Set(apps.filter(a=>a.payment!=='approved').map(a=>a.paymentAccount?JSON.stringify([a.paymentAccount.id,a.paymentAccount.bank,a.paymentAccount.number,a.paymentAccount.holder??'']):'legacy'));
  if(accountKeys.size>1)fail('ACCOUNT','같은 계좌를 안내받은 신청만 합산 신고할 수 있습니다.',409);
  for(const a of apps){if(a.payment==='approved')continue;a.payment='reported';a.reportedAt??=at;a.combinedPaymentReport={sponsorOwner:me.id,batchId,at};update(a,at,me.id,'companion.report');await tx.put('application',a.id,a);}
  return {saved:true,batchId};
 }
 fail('ACTION','지원하지 않는 동반신청 동작입니다.');
}
