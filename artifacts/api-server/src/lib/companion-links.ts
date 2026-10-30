import {HubBasic} from '@workspace/api-zod';
import {digest,fail,type HubTx} from './event-hub-store.js';
import type {CompanionDraft} from './companion-records.js';
import type {HubOwner} from './event-hub-service.js';

export type CompanionLinkRequest={
 id:string;owner:string;eventId:string;at:string;revision:number;status:'pending'|'linked';applicationId?:string;
 draftBinding?:{sponsorOwner:string;draftId:string;basicFingerprint:string;at:string};
 cancelledAt?:string;
};
const identity=HubBasic.pick({nickname:true,birthYear:true,location:true,residence:true});
export const companionDraftFingerprint=(draft:CompanionDraft)=>digest(JSON.stringify(identity.parse(draft.basic)));
export const participantLinkRequest=(request:CompanionLinkRequest)=>{
 const {draftBinding:_binding,...visible}=request;
 return {...visible,prepared:Boolean(request.draftBinding&&!request.cancelledAt&&request.status==='pending')};
};
export async function saveCompanionLinkRequest(tx:HubTx,request:CompanionLinkRequest){
 const friend=await tx.get<HubOwner>('owner',request.owner);
 if(friend&&!friend.erasedAt&&friend.id===request.owner&&friend.companionLinkRequests?.[request.eventId]?.id===request.id){
  friend.companionLinkRequests[request.eventId]=request;await tx.put('owner',friend.id,friend);
 }
 await tx.put('settings',`companion-link:${request.id}`,request);
}
/** A representative can release only their own unsubmitted draft association.
 * Missing/erased friend requests never prevent removing that local association.
 */
export async function releaseCompanionDraftLink(tx:HubTx,sponsor:Pick<HubOwner,'id'>,draft:CompanionDraft,eventId:string,at:string){
 if(draft.applicationId||draft.claimedAt)fail('COMPANION_LOCKED','접수된 친구 신청은 관리자에게 문의해 주세요.',409);
 const request=draft.linkRequestId?await tx.get<CompanionLinkRequest>('settings',`companion-link:${draft.linkRequestId}`):undefined;
 if(request&&request.status==='pending'&&!request.cancelledAt&&request.eventId===eventId&&request.draftBinding?.sponsorOwner===sponsor.id&&request.draftBinding.draftId===draft.id){
  request.cancelledAt=at;request.revision++;await saveCompanionLinkRequest(tx,request);
 }
 delete draft.linkRequestId;delete draft.identityLinkedAt;draft.changedAt=at;
}
