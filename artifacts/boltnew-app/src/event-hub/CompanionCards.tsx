import {useState,type ReactNode} from 'react';
import {HUB_CONSENT_VERSION,type HubBasicDraft} from '../../../../lib/api-zod/src/event-hub';
import {HubButton,HubCard,HubField,inputClass} from './HubUi';
import {ResidenceInput} from './ResidenceInput';
import {BirthYearSelect} from './BirthYearSelect';
import {useCompanionSelection} from './useCompanionSelection';
import type {CompanionDraftGroup,PrivateApplication} from '../lib/event-hub-client';
type Basic=Pick<HubBasicDraft['basic'],'nickname'|'birthYear'|'location'|'residence'>;
type Group=CompanionDraftGroup;
type Mutate=(command:{action:string;target?:string;revision?:number;data:Record<string,unknown>})=>Promise<null|Record<string,unknown>>;
export function CompanionCards({eventId,group={revision:0,items:[]},mutate,busy,blocked,onOwn,privacyPolicyFingerprint,ownApplication}:{
 eventId:string;group?:Group;mutate:Mutate;busy:boolean;blocked:boolean;onOwn:()=>void;privacyPolicyFingerprint?:string;ownApplication?:PrivateApplication;
}){
 const [editor,setEditor]=useState<{id:string;basic:Basic;revision:number;permission:boolean}|null>(null);
 const [message,setMessage]=useState('');
 const selection=useCompanionSelection(eventId,group,mutate);
 const {pending,selected}=selection;
 const saving=busy||selection.saving;
 const open=(item?:Group['items'][number])=>setEditor({id:item?.id??crypto.randomUUID(),basic:structuredClone(item?.basic??{}),revision:group.revision,permission:false});
 return <HubCard>
  <h3 className="font-black">동반신청</h3>
  <HubButton onClick={onOwn}>{ownApplication?'내 신청 보기':'본인 정보 입력'}</HubButton>
  {group.items.filter(x=>!x.removedAt).map((item,i)=><article className="rounded-xl border p-3 my-2" key={item.id}>
   <h4>친구 {i+1}{item.basic.nickname?` · ${item.basic.nickname}`:''}</h4>
   <p>{item.basic.birthYear?`${item.basic.birthYear}년생`: '년생 작성 전'} · {item.basic.location||'지역 작성 전'}</p>
   <p className="text-sm">{item.claimedAt?'본인 계정에 연결됨':item.applicationId?'신청 접수됨':item.identityLinkedAt?'본인 확인 완료 · 신청 미확정':'친구 정보 저장됨 · 신청 미확정'}</p>
   {ownApplication&&!item.claimedAt&&!item.applicationId&&<label className="flex items-center gap-2 py-2"><input type="checkbox" disabled={saving||blocked} checked={selected.some(person=>person.id===item.id)} onChange={e=>void selection.toggle(item.id,e.target.checked)}/>{item.basic.nickname||'친구'} 함께 신청</label>}
   {!item.claimedAt&&!item.applicationId&&item.identityLinkedAt&&<HubButton disabled={busy||blocked} onClick={()=>mutate({action:'companion.draft.unlink',target:item.id,revision:group.revision,data:{eventId}})}>본인 확인 해제</HubButton>}
   {!item.claimedAt&&!item.applicationId&&!item.identityLinkedAt&&<div className="hub-compact-actions">
    <HubButton aria-label="친구 정보 수정" disabled={busy||blocked} onClick={()=>open(item)}>정보 수정</HubButton>
    <HubButton disabled={busy||blocked} onClick={async()=>{if(await mutate({action:'companion.draft.remove',target:item.id,revision:group.revision,data:{eventId,privacyPolicyFingerprint}})){setMessage('친구 작성 목록에서 제외했습니다. 보관 기록은 유지됩니다.');}}} aria-label="작성 목록에서 제외">목록 제외</HubButton>
   </div>}
  </article>)}
  {ownApplication&&selection.saving&&<p role="status">신청 인원 저장 중…</p>}
  {ownApplication&&pending.length>0&&selection.needsReview&&<><p role="alert">{selection.failed?'신청 인원을 저장하지 못했습니다.':'지인 목록이 변경되었습니다. 신청 인원을 확인해 주세요.'}</p><HubButton disabled={saving||blocked} onClick={()=>selection.save()}>신청 인원 확인·저장</HubButton></>}
  {ownApplication&&pending.length>0&&<HubButton pending={saving} disabled={blocked||selected.length===0||selection.needsReview||selection.awaitingState} onClick={async()=>{const result=await mutate({action:'companion.submit',revision:group.revision,data:{eventId,draftIds:selected.map(x=>x.id),privacyPolicyFingerprint}});if(result){setMessage('친구 신청을 접수했습니다. 금액을 확인해 주세요.');onOwn();}}}>친구 {selected.length}명 신청 접수</HubButton>}
  <HubButton disabled={busy||blocked} onClick={()=>open()}>+ 지인 추가</HubButton>
  {editor&&<form noValidate className="border rounded-xl p-3 space-y-2" onSubmit={async e=>{e.preventDefault();const result=await mutate({action:'companion.draft.save',revision:editor.revision,data:{eventId,id:editor.id,basic:editor.basic,permissionToProvide:editor.permission,privacyPolicyFingerprint}});if(result){setEditor(null);setMessage('친구 정보를 저장했습니다. 신청은 아직 확정되지 않았습니다.');}}}>
   <HubField label="친구 닉네임"><input className={inputClass} maxLength={12} value={editor.basic.nickname??''} onChange={e=>setEditor({...editor,basic:{...editor.basic,nickname:e.target.value}})}/></HubField>
   <BirthYearSelect label="친구 출생연도" value={String(editor.basic.birthYear??'')} onChange={value=>setEditor({...editor,basic:{...editor.basic,birthYear:value?Number(value):undefined}})}/>
   <ResidenceInput value={editor.basic.location??''} residence={editor.basic.residence} onChange={(location,residence)=>setEditor({...editor,basic:{...editor.basic,location,residence}})}/>
   <label className="block"><input type="checkbox" checked={editor.permission} onChange={e=>setEditor({...editor,permission:e.target.checked})}/> 친구에게 이번 행사 신청에 필요한 정보를 전달해도 된다는 확인을 받았습니다</label>
   <p className="text-xs">친구의 프로필·재사용 동의는 포함되지 않습니다.</p>
   {editor.revision!==group.revision&&<p role="alert">친구 목록이 다른 화면에서 변경되었습니다. 최신 목록을 확인한 뒤 다시 열어 주세요. 입력 내용은 남겨 두었습니다.</p>}
   <div className="hub-compact-actions"><HubButton type="submit" pending={busy} disabled={blocked||!editor.permission||editor.revision!==group.revision}>친구 정보 저장</HubButton>
   <HubButton disabled={busy} onClick={()=>setEditor(null)}>닫기</HubButton></div>
  </form>}
  {message&&<p role="status">{message}</p>}
 </HubCard>;
}
/** Legacy recovery form is preserved but no longer mounted in the participant UI. */
export function CompanionClaimForm({eventId,mutate,busy,blocked,privacyPolicyFingerprint,privacyNotice,onClaimed}:{eventId:string;mutate:Mutate;busy:boolean;blocked:boolean;privacyPolicyFingerprint?:string;privacyNotice:ReactNode;onClaimed:()=>void}){
 const [token,setToken]=useState(''),[collection,setCollection]=useState(false);
 return <form onSubmit={async e=>{e.preventDefault();if(await mutate({action:'companion.claim',data:{eventId,invitationToken:token.trim(),collection,version:HUB_CONSENT_VERSION,privacyPolicyFingerprint}})){setToken('');onClaimed();}}}>
  <h3>친구가 작성한 내 신청 이어받기</h3><p>현재 로그인한 본인에게 연결합니다. 기존 내 신청이 있으면 자동으로 합치지 않습니다.</p>
  <HubField label="친구가 전달한 연결코드"><input className={inputClass} autoComplete="off" value={token} onChange={e=>setToken(e.target.value)} maxLength={43}/></HubField>
  {privacyNotice}
  <label><input type="checkbox" checked={collection} onChange={e=>setCollection(e.target.checked)}/> 이번 행사 개인정보 안내를 확인했고 내 정보 수집에 동의합니다</label>
  <HubButton type="submit" disabled={busy||blocked||!collection||!/^[A-Za-z0-9_-]{43}$/.test(token.trim())}>본인 확인 후 정보 검토하기</HubButton>
 </form>;
}
