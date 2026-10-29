import type { HubApplication } from '../lib/event-hub-client';
import { HubButton, HubField, inputClass } from './HubUi';
type Residence = HubApplication['basic']['residence'];
export function ResidenceInput({value,residence,onChange}:{value:string;residence?:Residence;onChange:(value:string,residence?:Residence)=>void}) {
  const busan=residence?.city==='부산';
  return <div className="space-y-2">
    <p>사는 도시를 알려 주세요. 부산은 구 또는 동 하나만 입력하면 됩니다.</p>
    <div className="flex gap-2"><HubButton onClick={()=>onChange('',{city:'부산',kind:'district',value:''})}>부산</HubButton><HubButton onClick={()=>onChange('',undefined)}>다른 도시</HubButton></div>
    {busan && <div className="flex gap-2" role="group" aria-label="부산 지역 입력 방식">{(['district','neighborhood'] as const).map(kind=><button type="button" key={kind} className={inputClass} aria-pressed={residence.kind===kind} onClick={()=>onChange('',{city:'부산',kind,value:''})}>{kind==='district'?'구로 입력':'동으로 입력'}</button>)}</div>}
    <HubField label="사는 지역"><input className={inputClass} required maxLength={30} value={busan?residence.value:value} placeholder={busan?(residence.kind==='district'?'예: 부산진구':'예: 전포동'):'예: 서울, 파주, 안산'} onChange={e=>busan?onChange(`부산 ${e.target.value}`,{...residence,value:e.target.value}):onChange(e.target.value,undefined)}/></HubField>
    <p className="text-xs">주거지의 상세 주소·건물·호수는 입력하지 마세요.</p>
  </div>;
}
