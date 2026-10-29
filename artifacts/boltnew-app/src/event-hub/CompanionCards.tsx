import {useState,type ReactNode} from 'react';
import {HUB_CONSENT_VERSION,type HubBasicDraft} from '../../../../lib/api-zod/src/event-hub';
import {HubButton,HubCard,HubField,inputClass} from './HubUi';
import {ResidenceInput} from './ResidenceInput';
type Basic=Pick<HubBasicDraft['basic'],'nickname'|'birthYear'|'location'|'residence'>;
type Group={revision:number;items:{id:string;basic:Basic;claimedAt?:string;removedAt?:string}[]};
type Mutate=(command:{action:string;target?:string;revision?:number;data:Record<string,unknown>})=>Promise<null|Record<string,unknown>>;
export function CompanionCards({eventId,group={revision:0,items:[]},mutate,busy,blocked,onOwn,privacyPolicyFingerprint}:{
 eventId:string;group?:Group;mutate:Mutate;busy:boolean;blocked:boolean;onOwn:()=>void;privacyPolicyFingerprint?:string;
}){
 const [editor,setEditor]=useState<{id:string;basic:Basic;revision:number;permission:boolean}|null>(null);
 const [invitation,setInvitation]=useState<{id:string;token:string}|null>(null);
 const [message,setMessage]=useState('');
 const open=(item?:Group['items'][number])=>setEditor({id:item?.id??crypto.randomUUID(),basic:structuredClone(item?.basic??{}),revision:group.revision,permission:false});
 return <HubCard>
  <h3 className="font-black">본인과 친구 신청</h3>
  <p>본인 정보와 친구 정보는 따로 저장됩니다. 친구는 자기 계정에서 안내와 동의를 확인한 뒤 신청을 이어갑니다.</p>
  <HubButton onClick={onOwn}>본인 신청 계속하기</HubButton>
  {group.items.filter(x=>!x.removedAt).map((item,i)=><article className="rounded-xl border p-3 my-2" key={item.id}>
   <h4>친구 {i+1}{item.basic.nickname?` · ${item.basic.nickname}`:''}</h4>
   <p>{item.basic.birthYear?`${item.basic.birthYear}년생`: '년생 작성 전'} · {item.basic.location||'지역 작성 전'}</p>
   <p>{item.claimedAt?'친구가 본인 확인을 마쳤습니다. 이후에는 친구가 직접 이어갑니다.':'작성 중 · 아직 신청 순번이나 입금이 확정되지 않았습니다.'}</p>
   {!item.claimedAt&&<div className="flex flex-wrap gap-2">
    <HubButton disabled={busy||blocked} onClick={()=>open(item)}>친구 정보 수정</HubButton>
    <HubButton disabled={busy||blocked} onClick={async()=>{const result=await mutate({action:'companion.invite',target:item.id,revision:group.revision,data:{eventId,privacyPolicyFingerprint}});if(typeof result?.invitationToken==='string'){setInvitation({id:item.id,token:result.invitationToken});setMessage('친구는 본인 로그인 후 연결코드를 입력해 주세요.');}else if(result)setMessage('전달할 코드를 확인하지 못했습니다. 새 연결코드를 만들어 주세요.');}}>친구 연결코드 만들기</HubButton>
    <HubButton disabled={busy||blocked} onClick={async()=>{if(await mutate({action:'companion.draft.remove',target:item.id,revision:group.revision,data:{eventId,privacyPolicyFingerprint}})){if(invitation?.id===item.id)setInvitation(null);setMessage('친구 작성 목록에서 제외했습니다. 보관 기록은 유지됩니다.');}}}>작성 목록에서 제외</HubButton>
   </div>}
  </article>)}
  <HubButton disabled={busy||blocked} onClick={()=>open()}>친구 추가</HubButton>
  {editor&&<form noValidate className="border rounded-xl p-3 space-y-2" onSubmit={async e=>{e.preventDefault();const result=await mutate({action:'companion.draft.save',revision:editor.revision,data:{eventId,id:editor.id,basic:editor.basic,permissionToProvide:editor.permission,privacyPolicyFingerprint}});if(result){setEditor(null);setInvitation(null);setMessage('친구 정보를 저장했습니다. 친구 본인 확인 전에는 신청 순번·입금이 확정되지 않습니다.');}}}>
   <h4>이 친구의 정보만 수정합니다</h4>
   <HubField label="친구 닉네임"><input className={inputClass} maxLength={12} value={editor.basic.nickname??''} onChange={e=>setEditor({...editor,basic:{...editor.basic,nickname:e.target.value}})}/></HubField>
   <HubField label="친구 출생연도 (네 자리)"><input className={inputClass} inputMode="numeric" maxLength={4} value={editor.basic.birthYear??''} onChange={e=>setEditor({...editor,basic:{...editor.basic,birthYear:e.target.value?Number(e.target.value):undefined}})}/></HubField>
   <ResidenceInput value={editor.basic.location??''} residence={editor.basic.residence} onChange={(location,residence)=>setEditor({...editor,basic:{...editor.basic,location,residence}})}/>
   <label className="block"><input type="checkbox" checked={editor.permission} onChange={e=>setEditor({...editor,permission:e.target.checked})}/> 친구에게 이번 행사 신청에 필요한 정보를 전달해도 된다는 확인을 받았습니다</label>
   <p className="text-xs">친구 본인의 개인정보·프로필 동의와 재사용 동의는 친구가 따로 확인합니다.</p>
   {editor.revision!==group.revision&&<p role="alert">친구 목록이 다른 화면에서 변경되었습니다. 최신 목록을 확인한 뒤 다시 열어 주세요. 입력 내용은 남겨 두었습니다.</p>}
   <HubButton type="submit" disabled={busy||blocked||!editor.permission||editor.revision!==group.revision}>친구 정보 저장</HubButton>
   <HubButton disabled={busy} onClick={()=>setEditor(null)}>닫기</HubButton>
  </form>}
  {invitation&&<div className="break-all"><p>이 코드는 해당 친구에게만 전달하세요. 로그인 비밀번호가 아니며 새 코드를 만들면 이전 코드는 사용할 수 없습니다.</p><code>{invitation.token}</code><HubButton onClick={async()=>{try{await navigator.clipboard.writeText(invitation.token);setMessage('연결코드를 복사했습니다.');}catch{setMessage('복사하지 못했습니다. 코드를 직접 선택해 복사해 주세요.');}}}>연결코드 복사</HubButton></div>}
  {message&&<p role="status">{message}</p>}
 </HubCard>;
}
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
