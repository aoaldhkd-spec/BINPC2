import { useState, useEffect, useRef } from 'react';
import type { HubController,HubEvent } from '../lib/event-hub-client';
import { HubCard,HubField,HubButton,HubCheck,inputClass } from './HubUi';
import { Preview } from './MediaManager';
export const VENUE_LOGOS = [
 ['red_hole','레드홀 · RED HOLE'],['fake','페이크 · FAKE'],['jack','자크 · JACK'],
 ['m_karaoke','M가라오케 · M KARAOKE (기존 제작 시안)'],['speed','스피드 · SPEED'],
 ['check_in','체크인 · CHECK-IN'],['on_top','온탑 · ON TOP'],
 ['black','블랙 · BLACK'],
] as const;
export function VenueLogo({id}:{id?:string}){
 const item=VENUE_LOGOS.find(v=>v[0]===id);
 if (!item) return null;
 return <figure><img src={`/tour-logos-v3/${item[0]}.${item[0] === 'black' ? 'webp' : 'png'}`} alt={item[1]} width={160} height={140} loading="lazy" className="max-w-full h-36 object-contain bg-white rounded-xl"/><figcaption className="text-xs">{item[1]}</figcaption></figure>;
}
/** Only the explicitly public selection is used for list/detail/admin artwork. */
export function PromotionLogo({event,admin=false}:{event:HubEvent;admin?:boolean}){
 const choice=event.promotionLogo;
 if(!choice)return null;
 if(choice.builtinId)return <VenueLogo id={choice.builtinId}/>;
 const version=admin?event.logoVersions?.find(v=>v.id===choice.versionId&&v.role==='venue'):undefined;
 const logo=version??(choice.url?choice:undefined);
 if(!logo?.url)return null;
 return <figure><Preview url={logo.url} alt={logo.label??'행사 홍보 로고'} interactive={false} secured={admin}/><figcaption>{logo.label}{logo.provenance==='design'?' · 기존 제작 시안 (공식 원본 아님)':''}</figcaption></figure>;
}
function SavedLogoPreview({url,label}:{url:string;label:string}){
 const [preview,setPreview]=useState('');const [failed,setFailed]=useState(false);
 useEffect(()=>{let active=true,objectUrl='';const abort=new AbortController();setPreview('');setFailed(false);
  void (async()=>{try{const token=localStorage.getItem('admin_token_v1')??'';const r=await fetch(url,{credentials:'include',headers:{'x-admin-token':token},signal:abort.signal});if(!r.ok)throw Error('LOGO_READ');objectUrl=URL.createObjectURL(await r.blob());if(active)setPreview(objectUrl);}catch{if(active)setFailed(true);}})();
  return()=>{active=false;abort.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[url]);
 return preview?<img src={preview} alt={label} className="h-36 max-w-full object-contain rounded-xl bg-white"/>:<p>{failed?'원본을 불러오지 못했습니다. 다시 열어 확인하세요.':'원본 확인 중…'}</p>;
}
export function VenueLogoSettings({event:e,hub}:{event:HubEvent;hub:HubController}){
 const [id,setId]=useState(e.venueLogoId??'');const [versionId,setVersionId]=useState(e.venueLogoVersionId??'');
 const previousSelection=useRef({id:e.venueLogoId??'',version:e.venueLogoVersionId??''});
 useEffect(()=>{const previous=previousSelection.current;const next={id:e.venueLogoId??'',version:e.venueLogoVersionId??''};setId(current=>current===previous.id?next.id:current);setVersionId(current=>current===previous.version?next.version:current);previousSelection.current=next;},[e.venueLogoId,e.venueLogoVersionId]);
 const [file,setFile]=useState<File|null>(null);const [preview,setPreview]=useState('');const [label,setLabel]=useState('');
 const [role,setRole]=useState<'venue'|'thanks'>('venue');const [provenance,setProvenance]=useState<'original'|'design'>('original');const [sourceNote,setSourceNote]=useState('');const [reading,setReading]=useState(false);
 const [publicConfirmed,setPublicConfirmed]=useState(false);
 useEffect(()=>setPublicConfirmed(false),[id,versionId]);
 useEffect(()=>{if(!file){setPreview('');return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
 const versions=e.logoVersions??[];const selected=versions.find(v=>v.id===versionId);
 const busy=hub.status==='saving'||reading;
 async function upload(){if(!file||!label.trim())return;setReading(true);try{
   if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024)throw Error('PNG·JPEG·WebP 2MB 이하만 가능합니다.');
   const image=await createImageBitmap(file);const valid=image.width>0&&image.height>0&&image.width<=8192&&image.height<=8192&&image.width*image.height<=24000000;image.close();if(!valid)throw Error('원본 크기를 확인하세요. 가로·세로8192px 및2400만 화소 이하만 가능합니다.');
   const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
   await hub.mutate({action:'event.logo.upload',target:e.id,revision:e.revision,data:{mime:file.type,base64:btoa(binary),label,role,provenance,sourceNote}});
  }catch(err){hub.setError(err instanceof Error?err.message:'원본을 읽지 못했습니다.');}finally{setReading(false);}}
 return <HubCard><h3 className="font-black">행사 로고 선택·업로드</h3>
 <p>자크는 최신 지퍼 로고, M가라오케는 기존 제작 시안, 고래는 감사 전용입니다. 로고와 실제 장소·차수는 자동 배정하지 않습니다.</p>
 <div className="hub-promotion-preview"><strong>목록·상세에 표시하는 공개 홍보 로고</strong>{e.promotionLogo?<PromotionLogo event={e} admin/>:<p className="text-sm">전국투어는 해당 지역의 제공 로고를 기본으로 표시합니다.</p>}</div>
 <HubField label="장소 로고"><select className={inputClass} value={versionId?'custom':id} onChange={x=>{setVersionId('');setId(x.target.value);}}><option value="">문자 안내만 / 미지정</option>{VENUE_LOGOS.map(([key,name])=><option key={key} value={key}>{name}</option>)}{versionId&&<option value="custom">저장한 원본 선택됨</option>}</select></HubField>
 <VenueLogo id={versionId?undefined:id}/>
 <HubField label="저장한 장소용 로고 버전"><select className={inputClass} value={versionId} onChange={x=>{setVersionId(x.target.value);if(x.target.value)setId('');}}><option value="">제공 로고 / 문자 안내</option>{versions.filter(v=>v.role==='venue').map((v,i)=><option key={v.id} value={v.id}>{i+1}. {v.label} · {v.provenance==='design'?'제작 시안':'제공 원본'} · {v.at}</option>)}</select></HubField>
 {selected&&<SavedLogoPreview url={selected.url} label={selected.label}/>}
 <HubButton disabled={busy} onClick={()=>hub.mutate({action:'event.logo.select',target:e.id,revision:e.revision,data:{versionId:versionId||null,builtinId:id||undefined}})}>선택한 로고를 행사에 연결</HubButton>
 <p className="text-xs">위 버튼은 승인자용 장소 로고를 바꿉니다. 목록·상세에 공개하려면 아래에서 별도로 저장하세요.</p>
 <HubCheck label="선택한 로고에 연락처·상세 주소·개인정보가 없으며 공개 홍보에 사용해도 됩니다" checked={publicConfirmed} onChange={setPublicConfirmed}/>
 <HubButton disabled={busy||!publicConfirmed||(!id&&!versionId)} onClick={()=>hub.mutate({action:'event.logo.select',target:e.id,revision:e.revision,data:{versionId:versionId||null,builtinId:id||undefined,area:'promotion',publicConfirmed:true}})}>목록·상세의 공개 홍보 로고로 저장</HubButton>
 {e.promotionLogo&&<HubButton disabled={busy} onClick={()=>hub.mutate({action:'event.logo.select',target:e.id,revision:e.revision,data:{versionId:null,area:'promotion'}})}>공개 홍보 로고를 지역 기본값으로 복원</HubButton>}
 <details><summary>새 원본 업로드 · 미리보기 후 저장</summary><div className="space-y-3 mt-3">
  <p className="text-xs">PNG·JPEG·WebP 2MB 이하. 원본 비율과 바이트를 보존합니다. 저장과 행사 연결은 각각 확인합니다. 연락처·계좌·얼굴이 없는 로고만 올리세요.</p>
  <HubField label="새 로고 원본 파일"><input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={x=>setFile(x.target.files?.[0]??null)}/></HubField>
  {preview&&<img src={preview} alt="저장 전 새 로고 미리보기" className="h-40 max-w-full object-contain bg-white rounded-xl"/>}
  <HubField label="로고 이름"><input className={inputClass} value={label} maxLength={80} onChange={x=>setLabel(x.target.value)}/></HubField>
  <HubField label="로고 용도"><select className={inputClass} value={role} onChange={x=>setRole(x.target.value as 'venue'|'thanks')}><option value="venue">행사 장소용</option><option value="thanks">감사용 (장소 연결 불가)</option></select></HubField>
  <HubField label="로고 원본 구분"><select className={inputClass} value={provenance} onChange={x=>setProvenance(x.target.value as 'original'|'design')}><option value="original">제공 원본</option><option value="design">제작 시안 (공식 원본 아님)</option></select></HubField>
  <HubField label="원본 출처 메모"><input className={inputClass} value={sourceNote} maxLength={300} onChange={x=>setSourceNote(x.target.value)}/></HubField>
  <HubButton disabled={busy||!file||!label.trim()} onClick={upload}>미리본 원본 저장 (아직 미연결)</HubButton>
 </div></details>
 <details><summary>원본·변경 이력과 이전 버전 복원 ({versions.length})</summary><div className="space-y-3 mt-3">{versions.map(v=><article key={v.id} className="rounded-xl border p-3 space-y-1"><p>{v.label} · {v.role==='thanks'?'감사 전용':v.provenance==='design'?'제작 시안':'제공 원본'} {e.venueLogoVersionId===v.id?'· 현재 연결':''}</p><p className="text-xs">{v.at} · {v.width}×{v.height}px · {v.size.toLocaleString()}B</p><p className="text-xs break-all">SHA-256 {v.sha256}</p>{v.sourceNote&&<p className="text-xs">출처: {v.sourceNote}</p>}<HubButton disabled={busy||(v.role==='venue'?e.venueLogoVersionId:e.thanksLogoVersionId)===v.id} onClick={()=>hub.mutate({action:'event.logo.select',target:e.id,revision:e.revision,data:{versionId:v.id,restore:true,area:v.role}})}>{v.role==='thanks'?'감사 영역을 이 버전으로 복원':'이 버전으로 복원'}</HubButton></article>)}{!versions.length&&<p>아직 저장한 새 원본이 없습니다. 제공된9종은 그대로 보존됩니다.</p>}{e.history.filter(h=>h.action.startsWith('event.logo.')).slice().reverse().map((h,i)=><p key={i} className="text-xs">{h.at} · {h.action} · {h.reason}</p>)}</div></details>
 <details><summary>수령한 8개 매장 로고 확인</summary><div className="grid grid-cols-2 gap-3">{VENUE_LOGOS.map(([key])=><VenueLogo key={key} id={key}/>)}</div></details>
 <GoraeThanks/>
 </HubCard>;
}
export function GoraeThanks({logo}:{logo?:{url:string;label:string;width:number;height:number}}={}){return <figure className="text-xs mt-4"><img src={logo?.url??"/tour-logos-v3/gorae.png"} alt={logo?.label??"고래 Gorae 감사용 로고"} width={100} height={100} loading="lazy" className="object-contain h-24 bg-white rounded-xl"/><figcaption>대관에 도움을 주신 고래 사장님께 감사드립니다.</figcaption></figure>;}
