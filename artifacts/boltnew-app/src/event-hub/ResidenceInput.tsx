import type { HubApplication } from '../lib/event-hub-client';
import { useState } from 'react';
import { LOCATION_GROUPS } from '../lib/profile-choice-options';
import { HubButton, HubField, inputClass } from './HubUi';
type Residence = HubApplication['basic']['residence'];
const districts=['강서구','금정구','기장군','남구','동구','동래구','부산진구','북구','사상구','사하구','서구','수영구','연제구','영도구','중구','해운대구'];
const neighborhoods=['가야동','감전동','감천동','개금동','거제동','광안동','괘법동','구서동','금곡동','기장읍','남천동','남포동','다대동','당감동','대연동','덕천동','동대신동','동삼동','망미동','명륜동','명장동','명지동','모라동','문현동','민락동','반송동','반여동','범일동','범천동','보수동','부곡동','부민동','부암동','부전동','사직동','서대신동','서동','수영동','수정동','신평동','안락동','양정동','엄궁동','연산동','영선동','온천동','용당동','용호동','우동','장림동','장전동','전포동','정관읍','좌동','주례동','중동','초량동','초읍동','충무동','하단동','학장동','화명동'];
export function ResidenceInput({value,residence,onChange}:{value:string;residence?:Residence;onChange:(value:string,residence?:Residence)=>void}) {
  const [custom,setCustom]=useState(false);
  const busan=residence?.city==='부산';
  const city=busan?'부산':value;
  const options=Object.entries(LOCATION_GROUPS).flatMap(([region,cities])=>cities.map(name=>region==='광역시'||region==='기타'?name:`${region} ${name}`));
  const areaOptions=residence?.kind==='neighborhood'?neighborhoods:districts;
  const selectArea=(area:string)=>onChange(area?`부산 ${area}`:'',{city:'부산',kind:residence?.kind==='neighborhood'?'neighborhood':'district',value:area});
  return <div className="space-y-2">
    <HubField label="도시"><select className={inputClass} required value={custom&&!busan?'__custom':city} onChange={e=>{const next=e.target.value;setCustom(next==='__custom');if(next==='__custom'){onChange('',undefined);return;}onChange(next==='부산'?'':next,next==='부산'?{city:'부산',kind:'district',value:''}:undefined);}}><option value="">도시 선택</option>
      {city&&!options.includes(city)&&<option value={city}>{city} · 저장된 지역</option>}
      {Object.entries(LOCATION_GROUPS).map(([region,cities])=><optgroup key={region} label={region}>{cities.map(name=>{const val=region==='광역시'||region==='기타'?name:`${region} ${name}`;return <option key={val} value={val}>{name}</option>;})}</optgroup>)}
      <option value="__custom">다른 도시 직접 입력</option>
    </select></HubField>
    {busan&&<>
      <div className="hub-compact-actions" role="group" aria-label="부산 지역 입력 방식">{(['district','neighborhood'] as const).map(kind=><HubButton key={kind} className="hub-choice-button" aria-pressed={residence.kind===kind} onClick={()=>{setCustom(false);onChange('',{city:'부산',kind,value:''});}}>{kind==='district'?'구로 입력':'동으로 입력'}</HubButton>)}</div>
      <HubField label={residence.kind==='neighborhood'?'부산 동':'부산 구'}><select className={inputClass} required value={custom?'__custom':residence.value} onChange={e=>{setCustom(e.target.value==='__custom');selectArea(e.target.value==='__custom'?'':e.target.value);}}><option value="">{residence.kind==='neighborhood'?'동 선택':'구 선택'}</option>{residence.value&&!areaOptions.includes(residence.value)&&<option value={residence.value}>{residence.value} · 저장된 지역</option>}{areaOptions.map(area=><option key={area} value={area}>{area}</option>)}<option value="__custom">목록에 없는 지역</option></select></HubField>
    </>}
    {custom&&<HubField label={busan?'동·지역 이름':'도시 이름'}><input className={inputClass} required maxLength={30} value={busan?residence.value:value} onChange={e=>busan?selectArea(e.target.value):onChange(e.target.value,undefined)}/></HubField>}
  </div>;
}
