import { useState } from 'react';
import { DECADE_GROUPS } from '../lib/profile-choice-options';
import { maxAdultBirthYear } from '../lib/korean-age';
import { HubButton, HubField, inputClass } from './HubUi';

/** Reuses the profile picker choices; the server still enforces each event's age policy. */
export function BirthYearSelect({value,onChange,label='태어난 년도',readOnly=false,hideLabel=false}:{value:string;onChange:(value:string)=>void;label?:string;readOnly?:boolean;hideLabel?:boolean}) {
  const groups=Object.entries(DECADE_GROUPS);
  const grouped=new Set(groups.flatMap(([,years])=>years));
  const [tab,setTab]=useState(()=>groups.find(([,years])=>years.includes(Number(value)))?.[0]??groups[0]?.[0]);
  const previous=Array.from({length:maxAdultBirthYear()-1900+1},(_,i)=>maxAdultBirthYear()-i).filter(year=>!grouped.has(year));
  return <fieldset className="hub-profile-choice space-y-2" disabled={readOnly}>
    <legend className={hideLabel?'sr-only':'font-bold text-sm'}>{label}</legend>
    <div className="hub-choice-tabs" role="group" aria-label="년생 구분">
      {groups.map(([name])=><HubButton key={name} className="hub-choice-button" aria-pressed={tab===name} onClick={()=>setTab(name)}>{name}</HubButton>)}
    </div>
    <div className="hub-choice-grid hub-year-grid">
      {(DECADE_GROUPS[tab]??[]).map(year=><HubButton key={year} className="hub-choice-button" aria-label={`${year}년생`} aria-pressed={value===String(year)} onClick={()=>onChange(String(year))}>{String(year).slice(2)}년생</HubButton>)}
    </div>
    {value&&!grouped.has(Number(value))&&<HubButton className="hub-choice-button" aria-pressed="true" onClick={()=>onChange(value)}>{value}년생</HubButton>}
    <details className="hub-choice-other"><summary>다른 년생</summary>
      <HubField label="다른 출생연도"><select className={inputClass} value={grouped.has(Number(value))?'':value} onChange={e=>{if(e.target.value)onChange(e.target.value);}}>
        <option value="">년생 선택</option>
        {value&&!grouped.has(Number(value))&&!previous.includes(Number(value))&&<option value={value}>{value}년생 · 저장된 값</option>}
        {previous.map(year=><option key={year} value={year}>{year}년생</option>)}
      </select></HubField>
    </details>
  </fieldset>;
}
