import {z,type HubApplication} from '@workspace/api-zod';
import {fail,type HubTx} from './event-hub-store.js';
import type {HubOwner} from './event-hub-service.js';

const Entry=z.object({kind:z.enum(['application','basic-draft','member','thread','request','reward-phone']),id:z.string().min(1),action:z.enum(['erase','minimize']),at:z.string().datetime()});
type ErasureEntry=z.infer<typeof Entry>;
type Ledger={owner:string;revision:number;entries:ErasureEntry[]};
const Checkpoint=z.object({version:z.literal(1),ledgers:z.array(z.object({owner:z.string().uuid(),revision:z.number().int().positive(),entries:z.array(Entry)}))});
export type PrivacyRestoreCheckpoint=z.infer<typeof Checkpoint>;

/** Encrypted identifiers only, kept apart from erased personal fields. No timer or HTTP erasure route. */
export async function recordPrivacyErasure(tx:HubTx,owner:string,entries:Omit<ErasureEntry,'at'>[],at:string){
 if(!entries.length)return;
 const key=`privacy-erasure:${owner}`,old=await tx.get<Ledger>('settings',key);
 if(old&&old.owner!==owner)fail('PRIVACY_RESTORE_CHECK','삭제 기록의 대상이 일치하지 않습니다.',409);
 const next=new Map((old?.entries??[]).map(entry=>[`${entry.kind}:${entry.id}`,entry]));
 for(const entry of entries)next.set(`${entry.kind}:${entry.id}`,Entry.parse({...entry,at}));
 await tx.put('settings',key,{owner,revision:(old?.revision??0)+1,entries:[...next.values()]} satisfies Ledger);
}

/** This protected checkpoint must be retained outside the restored backup/environment too. */
export async function capturePrivacyRestoreCheckpoint(tx:HubTx):Promise<PrivacyRestoreCheckpoint>{
 const rows=await tx.db.query("SELECT id FROM event_hub_records WHERE kind='settings' AND id LIKE 'privacy-erasure:%' ORDER BY id");
 const ledgers:Ledger[]=[];
 for(const row of rows.rows){const ledger=await tx.get<Ledger>('settings',row.id);if(!ledger||row.id!==`privacy-erasure:${ledger.owner}`)fail('PRIVACY_RESTORE_CHECK','삭제 기록을 확인할 수 없습니다.',409);ledgers.push(ledger);}
 return Checkpoint.parse({version:1,ledgers});
}

/** Read-only restoration gate. An old backup cannot certify itself using its own old ledger. */
export async function assertPrivacyRestoreCheckpoint(tx:HubTx,input:unknown){
 const checkpoint=Checkpoint.parse(input);
 for(const expected of checkpoint.ledgers){
  const actual=await tx.get<Ledger>('settings',`privacy-erasure:${expected.owner}`);
  if(!actual||actual.owner!==expected.owner||actual.revision<expected.revision)fail('PRIVACY_RESTORE_STALE','최신 삭제 기록이 없는 백업입니다. 공개 전에 삭제 상태를 안전하게 재반영해야 합니다.',409);
  for(const entry of expected.entries){
   if(!actual.entries.some(value=>value.kind===entry.kind&&value.id===entry.id&&Date.parse(value.at)>=Date.parse(entry.at)))fail('PRIVACY_RESTORE_STALE','최신 삭제 기록이 누락되었습니다.',409);
   if(entry.kind==='basic-draft'){
    const own=await tx.get<HubOwner>('owner',expected.owner);
    const exists=entry.id.startsWith('companion:')?own?.companionDrafts?.[entry.id.slice(10)]?.items.some(d=>Object.keys(d.basic).length>0):entry.id.startsWith('companion-link:')?own?.companionLinkRequests?.[entry.id.slice(15)]?.status==='pending':!!own?.basicDrafts?.[entry.id];
    if(exists)fail('PRIVACY_RESTORE_RESURRECTION','삭제된 작성 정보가 백업에서 다시 나타났습니다.',409);
   }else if(entry.kind==='reward-phone'){
    const app=await tx.get<HubApplication>('application',entry.id);
    if(app?.rewardPhone&&(!app.rewardPhoneRetainFrom||Date.parse(app.rewardPhoneRetainFrom)<=Date.parse(entry.at)))fail('PRIVACY_RESTORE_RESURRECTION','삭제된 지급 연락처가 백업에서 다시 나타났습니다.',409);
   }else{
    const value=await tx.get<Record<string,unknown>>(entry.kind,entry.id);
    const basic=value?.basic as HubApplication['basic']|undefined,profile=value?.profile as HubApplication['profile']|undefined;
    const minimized=entry.kind==='application'&&entry.action==='minimize'&&typeof value?.erasedAt==='string'&&Date.parse(value.erasedAt)>=Date.parse(entry.at)&&basic?.nickname==='삭제된 신청자'&&basic.birthYear===1900&&!basic.location&&!basic.residence&&!basic.phone&&!basic.depositor&&profile?.lastStep===1&&Object.keys(profile).every(key=>key==='lastStep');
    const sanitized=!value||minimized||(entry.kind==='request'&&entry.action==='minimize'&&(value.result as {erased?:boolean}|undefined)?.erased===true);
    if(!sanitized)fail('PRIVACY_RESTORE_RESURRECTION','삭제·최소화된 자료가 백업에서 다시 나타났습니다.',409);
   }
  }
 }
 return {verified:true,ledgerCount:checkpoint.ledgers.length};
}
