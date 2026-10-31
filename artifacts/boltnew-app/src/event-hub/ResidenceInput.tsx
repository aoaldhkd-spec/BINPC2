import type { HubApplication } from '../lib/event-hub-client';
import { useState } from 'react';
import { LOCATION_GROUPS } from '../lib/profile-choice-options';
import { HubButton, HubField, inputClass } from './HubUi';
type Residence = HubApplication['basic']['residence'];
const districts=['강서구','금정구','기장군','남구','동구','동래구','부산진구','북구','사상구','사하구','서구','수영구','연제구','영도구','중구','해운대구'];
const neighborhoods=['가야동','감전동','감천동','개금동','거제동','광안동','괘법동','구서동','금곡동','기장읍','남천동','남포동','다대동','당감동','대연동','덕천동','동대신동','동삼동','망미동','명륜동','명장동','명지동','모라동','문현동','민락동','반송동','반여동','범일동','범천동','보수동','부곡동','부민동','부암동','부전동','사직동','서대신동','서동','수영동','수정동','신평동','안락동','양정동','엄궁동','연산동','영선동','온천동','용당동','용호동','우동','장림동','장전동','전포동','정관읍','좌동','주례동','중동','초량동','초읍동','충무동','하단동','학장동','화명동'];
const cityValue=(region:string,city:string)=>region==='광역시'||region==='기타'?city:`${region} ${city}`;
export function ResidenceInput({value,residence,onChange}:{value:string;residence?:Residence;onChange:(value:string,residence?:Residence)=>void}) {
  const [region,setRegion]=useState(()=>Object.entries(LOCATION_GROUPS).find(([name,cities])=>cities.some(city=>cityValue(name,city)===(residence?.city==='부산'?'부산':value)))?.[0]??'광역시');
  const [custom,setCustom]=useState<'city'|'area'|null>(null);
  const [search,setSearch]=useState('');
  const [cityExpanded,setCityExpanded]=useState(false);
  const busan=residence?.city==='부산';
  const city=busan?'부산':value;
  const options=Object.entries(LOCATION_GROUPS).flatMap(([name,cities])=>cities.map(city=>cityValue(name,city)));
  const areaOptions=residence?.kind==='neighborhood'?neighborhoods:districts;
  const selectArea=(area:string)=>onChange(area?`부산 ${area}`:'',{city:'부산',kind:residence?.kind==='neighborhood'?'neighborhood':'district',value:area});
  return <div className="hub-profile-choice space-y-3">
    <fieldset className="space-y-2" aria-label="도시 선택"><legend className="font-bold text-sm">도시</legend>
      {busan&&!cityExpanded&&custom!=='city'?<HubButton className="hub-choice-button" aria-pressed="true" aria-expanded="false" onClick={()=>setCityExpanded(true)}>부산</HubButton>:<>
      <div className="hub-choice-tabs" role="group" aria-label="지역 구분">{Object.keys(LOCATION_GROUPS).map(name=><HubButton key={name} className="hub-choice-button" aria-pressed={region===name} onClick={()=>setRegion(name)}>{name}</HubButton>)}</div>
      <div className="hub-choice-grid" role="group" aria-label="도시">{LOCATION_GROUPS[region].map(name=>{const val=cityValue(region,name);return <HubButton key={val} className="hub-choice-button" aria-pressed={city===val} onClick={()=>{setCustom(null);setSearch('');setCityExpanded(false);if(val==='부산'&&busan)return;onChange(val==='부산'?'':val,val==='부산'?{city:'부산',kind:'district',value:''}:undefined);}}>{name}</HubButton>;})}</div>
      {city&&!options.includes(city)&&custom!=='city'&&<HubButton className="hub-choice-button" aria-pressed="true" onClick={()=>setCustom('city')}>{city}</HubButton>}
      <HubButton className="hub-choice-button" aria-pressed={custom==='city'} onClick={()=>setCustom(custom==='city'?null:'city')}>도시 직접 입력</HubButton>
      {custom==='city'&&<HubField label="도시 이름"><input className={inputClass} required maxLength={30} value={busan?'':value} onChange={e=>onChange(e.target.value,undefined)}/></HubField>}
      </>}
    </fieldset>
    {busan&&<fieldset className="space-y-2"><legend className="sr-only">부산 지역</legend>
      <div className="hub-choice-tabs" role="group" aria-label="부산 지역 입력 방식">{(['district','neighborhood'] as const).map(kind=><HubButton key={kind} className="hub-choice-button" aria-pressed={residence.kind===kind} onClick={()=>{setCustom(null);setSearch('');if(kind!==residence.kind)onChange('',{city:'부산',kind,value:''});}}>{kind==='district'?'구로 입력':'동으로 입력'}</HubButton>)}</div>
      {residence.kind==='neighborhood'&&<HubField label="동 검색"><input type="search" className={inputClass} value={search} onChange={e=>setSearch(e.target.value)}/></HubField>}
      <div className="hub-choice-grid hub-area-grid" role="group" aria-label={residence.kind==='neighborhood'?'부산 동':'부산 구'}>{areaOptions.filter(area=>area.includes(search.trim())).map(area=><HubButton key={area} className="hub-choice-button" aria-pressed={residence.value===area} onClick={()=>{setCustom(null);selectArea(area);}}>{area}</HubButton>)}</div>
      {residence.value&&!areaOptions.includes(residence.value)&&<HubButton className="hub-choice-button" aria-pressed="true" onClick={()=>setCustom('area')}>{residence.value}</HubButton>}
      <HubButton className="hub-choice-button" aria-pressed={custom==='area'} onClick={()=>setCustom(custom==='area'?null:'area')}>지역 직접 입력</HubButton>
      {custom==='area'&&<HubField label="동·지역 이름"><input className={inputClass} required maxLength={30} value={residence.value} onChange={e=>selectArea(e.target.value)}/></HubField>}
    </fieldset>}
  </div>;
}
