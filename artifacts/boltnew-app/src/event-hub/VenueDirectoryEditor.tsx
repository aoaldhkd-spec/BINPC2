import { useEffect, useState } from 'react';
import type { VenueAddress } from '../../../../lib/api-zod/src/event-venue-directory';
import { useEventHub, type HubEvent } from '../lib/event-hub-client';
import { HubButton, HubCard, HubField, inputClass } from './HubUi';
const venues = {red_hole:'레드홀',fake:'페이크',jack:'자크 (JACK)',m_karaoke:'M가라오케',speed:'스피드',check_in:'체크인',on_top:'온탑',black:'BLACK'};
export function VenueDirectoryEditor({hub,event}:{hub:ReturnType<typeof useEventHub>;event?:HubEvent}) {
  const directory=hub.state?.venueDirectory??{revision:0,items:[],history:[]};
  const fresh=():VenueAddress=>({id:crypto.randomUUID(),venueId:null,label:'',roadOriginal:'',parcelOriginal:'',floor:'',source:'사용자 직접 제공',receivedAt:new Date().toISOString()});
  const [value,setValue]=useState(fresh),[confirmed,setConfirmed]=useState(false);
  const [baseRevision,setBaseRevision]=useState(directory.revision);
  const dirty=JSON.stringify(directory.items.find(v=>v.id===value.id))!==JSON.stringify(value);
  useEffect(()=>{if(!dirty)setBaseRevision(directory.revision);},[dirty,directory.revision]);
  return <HubCard><details><summary className="font-bold">매장 주소 등록·1차 장소 연결</summary>
    <p>주소 등록과 날짜별 1차 배정은 별개입니다. 매장 연결이 불명확한 주소는 미확인으로 보관하세요. 상세 주소는 승인된 해당 행사 참가자만 봅니다.</p>
    <HubField label="저장된 매장 주소"><select className={inputClass} value={directory.items.some(v=>v.id===value.id)?value.id:''} onChange={e=>{setValue(directory.items.find(v=>v.id===e.target.value)??fresh());setConfirmed(false);setBaseRevision(directory.revision);}}><option value="">새 주소</option>{directory.items.map(v=><option value={v.id} key={v.id}>{v.label}{v.venueId?'':' · 매장 연결 미확인'}</option>)}</select></HubField>
    <HubField label="주소의 매장"><select className={inputClass} value={value.venueId??''} onChange={e=>setValue({...value,venueId:e.target.value as VenueAddress['venueId']||null})}><option value="">매장 연결 미확인</option>{Object.entries(venues).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></HubField>
    {([['label','자료 이름'],['roadOriginal','도로명 원문'],['parcelOriginal','지번 원문'],['floor','층'],['source','제공 출처']] as const).map(([key,label])=><HubField label={label} key={key}><input className={inputClass} value={value[key]} onChange={e=>setValue({...value,[key]:e.target.value})}/></HubField>)}
    <HubButton disabled={hub.status==='saving'} onClick={async()=>{const result=await hub.mutate({action:'venue.address.save',revision:baseRevision,data:value});if(result){setConfirmed(false);setBaseRevision(baseRevision+1);}}}>매장 주소 저장</HubButton>
    {event&&<>{dirty&&<p>변경한 주소를 먼저 저장한 뒤 1차 배정을 확인해 주세요.</p>}<p>연결할 행사: {event.date} · {event.title}</p><label className="block"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> 이 매장의 해당 날짜 1차 배정을 확인했습니다</label><HubButton disabled={dirty||!confirmed||!value.venueId||!directory.items.some(v=>v.id===value.id)||hub.status==='saving'} onClick={()=>hub.mutate({action:'event.address.select',target:event.id,revision:event.revision,data:{addressId:value.id,confirmedFirstRound:true}})}>이 행사 1차 장소로 연결</HubButton></>}
    {event?.venueAddressId&&<HubButton disabled={hub.status==='saving'} onClick={()=>hub.mutate({action:'event.address.select',target:event.id,revision:event.revision,data:{addressId:null}})}>이 행사 주소 연결 해제 (원문·이력 보존)</HubButton>}
    <p className="text-xs">이전 원문과 변경 이력은 보존됩니다. 외부 지도 검증을 대신하지 않습니다.</p>
  </details></HubCard>;
}
