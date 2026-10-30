import { randomBytes } from 'node:crypto';
import { z, HubBasic, HUB_CONSENT_VERSION, type HubBasicDraft } from '@workspace/api-zod';
import { digest, fail, type HubTx } from './event-hub-store.js';

const DraftBasic = HubBasic.pick({nickname:true,birthYear:true,location:true,residence:true}).partial().extend({
  nickname:z.string().trim().max(12).optional(), location:z.string().trim().max(40).optional(),
  residence:HubBasic.shape.residence.unwrap().extend({value:z.string().trim().max(30)}).optional(),
});
export const CompanionCompleteBasic = HubBasic.pick({nickname:true,birthYear:true,location:true,residence:true});
const CompleteBasic = CompanionCompleteBasic;
export const CompanionSave = z.object({
  id:z.string().uuid(), basic:DraftBasic, permissionToProvide:z.literal(true),
}).strict();
export const CompanionClaim = z.object({
  invitationToken:z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  collection:z.literal(true), version:z.literal(HUB_CONSENT_VERSION),
  // Use the normal current policy fingerprint at the caller's existing gate.
  privacyPolicyFingerprint:z.string().optional(),
}).strict();
export type CompanionDraft = {
  id:string; basic:z.infer<typeof DraftBasic>; providedAt:string;
  permissionToProvideAt:string; changedAt:string; removedAt?:string;
  inviteHash?:string; claimedAt?:string;
  applicationId?:string; submittedAt?:string;
};
export type CompanionGroup = {revision:number; items:CompanionDraft[]};
type Owner = {
  id:string; erasedAt?:string; restricted?:{active:boolean};
  basicDrafts?:Record<string,HubBasicDraft>;
  companionDrafts?:Record<string,CompanionGroup>;
  companionOrigins?:Record<string,{sponsorOwner:string;companionDraftId:string;claimedAt:string}>;
};
type Invitation = {
  sponsorOwner:string; eventId:string; draftId:string;
  createdAt:string; expiresAt:string; usedAt?:string; usedBy?:string;
};
type Context = {
  owner:string; eventId:string; now:string;
  // Technical abuse cap/TTL, configured explicitly by the caller; not a benefit policy.
  maxDrafts:number; invitationTtlMs:number;
  command:{action:string;target:string;revision?:number;data:Record<string,unknown>};
};
function authorizedOwner(value:Owner|undefined,id:string):Owner {
  if(!value || value.id!==id || value.erasedAt)fail('AUTH','본인 신청 연결을 먼저 확인해 주세요.',401);
  if(value.restricted?.active)fail('RESTRICTED','관리자 확인이 필요한 신청입니다.',403);
  return value;
}
function groupFor(owner:Owner,eventId:string):CompanionGroup {
  return owner.companionDrafts?.[eventId]??{revision:0,items:[]};
}
function expectedRevision(actual:number,expected:number|undefined){
  if(actual!==expected)fail('REVISION','친구 신청 정보가 바뀌었습니다. 최신 내용을 확인해 주세요.',409);
}
export function companionDraftViews(owner:Pick<Owner,"companionDrafts">|undefined){
  return Object.fromEntries(Object.entries(owner?.companionDrafts??{}).map(([eventId,group])=>[eventId,{
    revision:group.revision,items:group.items.filter(x=>!x.removedAt).map(({inviteHash:_privateHash,...draft})=>draft),
  }]));
}

export async function companionCommand(tx:HubTx,ctx:Context,
  newToken:()=>string=()=>randomBytes(32).toString('base64url')):Promise<Record<string,unknown>> {
  const me=authorizedOwner(await tx.get<Owner>('owner',ctx.owner),ctx.owner);
  const {command:m,eventId,now}=ctx;
  const {eventId:_routeEvent,privacyPolicyFingerprint:_checkedByCaller,...payload}=m.data;
  if(m.action==='companion.claim'){
    const input=CompanionClaim.parse(payload);
    const hash=digest(input.invitationToken),key=`companion-invite:${hash}`;
    const invitation=await tx.get<Invitation>('settings',key);
    if(!invitation || invitation.eventId!==eventId || invitation.usedAt || Date.parse(invitation.expiresAt)<=Date.parse(now))
      fail('COMPANION_INVITE','연결코드를 확인하거나 새 코드를 받아 주세요.',409);
    if(invitation.sponsorOwner===me.id)fail('COMPANION_SELF','친구가 자기 계정으로 확인해 주세요.',403);
    const sponsor=authorizedOwner(await tx.get<Owner>('owner',invitation.sponsorOwner),invitation.sponsorOwner);
    const group=groupFor(sponsor,eventId),draft=group.items.find(x=>x.id===invitation.draftId);
    if(!draft || draft.removedAt || draft.claimedAt || draft.inviteHash!==hash)
      fail('COMPANION_INVITE','친구 신청 내용이 바뀌었습니다. 새 연결코드를 받아 주세요.',409);
    // Never merge people by phone, payer or device; preserve an existing personal application/draft.
    const existing=(await tx.applicationsForOwner<{owner:string;eventId:string}>(me.id)).some(a=>a.owner===me.id&&a.eventId===eventId);
    if(existing || me.basicDrafts?.[eventId] || me.companionOrigins?.[eventId])
      fail('COMPANION_CONFLICT','이 행사에 작성 중이거나 저장된 내 신청이 있습니다. 기존 신청을 이어가 주세요.',409);
    const basic=CompleteBasic.parse(draft.basic);
    const member=(await tx.membersForOwner<{owner:string;basic:Record<string,unknown>}>(me.id)).find(x=>x.owner===me.id);
    // An existing member's own values take precedence; the friend reviews them in BasicForm.
    // No member/profile write is performed here. Do not inherit the sponsor's profile or consent.
    me.basicDrafts={...me.basicDrafts,[eventId]:{
      basic:{...basic,...(member?.basic??{}),collection:true,version:HUB_CONSENT_VERSION},
      nextStep:1,revision:1,updatedAt:now,
    } as HubBasicDraft};
    me.companionOrigins={...me.companionOrigins,[eventId]:{sponsorOwner:sponsor.id,companionDraftId:draft.id,claimedAt:now}};
    draft.claimedAt=now;draft.changedAt=now;group.revision++;
    sponsor.companionDrafts={...sponsor.companionDrafts,[eventId]:group};
    invitation.usedAt=now;invitation.usedBy=me.id;
    await tx.put('owner',sponsor.id,sponsor);await tx.put('owner',me.id,me);await tx.put('settings',key,invitation);
    return {saved:true,eventId,next:'basic-review'};
  }
  if (!me.companionDrafts?.[eventId] && Object.keys(me.companionDrafts??{}).length >= 30) fail('LIMIT','작성 중인 행사 수를 초과했습니다. 기존 친구 목록을 확인해 주세요.');
  const group=groupFor(me,eventId);expectedRevision(group.revision,m.revision);
  if(m.action==='companion.draft.save'){
    const input=CompanionSave.parse(payload),old=group.items.find(x=>x.id===input.id);
    if(old?.claimedAt || old?.removedAt || old?.applicationId)fail('COMPANION_LOCKED','접수한 친구 신청은 관리자에게 문의해 주세요.',409);
    if(!old && (group.items.length>=100 || group.items.filter(x=>!x.removedAt).length>=ctx.maxDrafts))fail('LIMIT','한 번에 작성할 친구 수를 초과했습니다. 관리자에게 문의해 주세요.');
    const item:CompanionDraft={id:input.id,basic:input.basic,providedAt:old?.providedAt??now,permissionToProvideAt:old?.permissionToProvideAt??now,changedAt:now};
    // Editing invalidates old invitations, but does not erase their audit record.
    group.items=old?group.items.map(x=>x.id===item.id?item:x):[...group.items,item];
  }else{
    const draft=group.items.find(x=>x.id===m.target);
    if(!draft || draft.removedAt || draft.claimedAt || draft.applicationId)fail('COMPANION_LOCKED','작성 중인 친구 신청을 확인해 주세요.',409);
    if(m.action==='companion.draft.remove'){
      draft.removedAt=now;draft.changedAt=now;draft.inviteHash=undefined;
    }else if(m.action==='companion.invite'){
      CompleteBasic.parse(draft.basic);
      const invitationToken=newToken(),hash=digest(invitationToken);
      if(!/^[A-Za-z0-9_-]{43}$/.test(invitationToken))throw Error('Invalid server invitation generator');
      draft.inviteHash=hash;draft.changedAt=now;
      await tx.put('settings',`companion-invite:${hash}`,{
        sponsorOwner:me.id,eventId,draftId:draft.id,createdAt:now,
        expiresAt:new Date(Date.parse(now)+ctx.invitationTtlMs).toISOString(),
      } satisfies Invitation);
      group.revision++;me.companionDrafts={...me.companionDrafts,[eventId]:group};await tx.put('owner',me.id,me);
      // MUST strip invitationToken from durable request receipts and log payloads.
      return {saved:true,eventId,draftId:draft.id,invitationToken};
    }else fail('ACTION','지원하지 않는 동작입니다.');
  }
  group.revision++;me.companionDrafts={...me.companionDrafts,[eventId]:group};await tx.put('owner',me.id,me);
  return {saved:true,eventId};
}
