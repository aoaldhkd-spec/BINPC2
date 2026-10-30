import { DECADE_GROUPS } from '../lib/profile-choice-options';
import { maxAdultBirthYear } from '../lib/korean-age';
import { HubField, inputClass } from './HubUi';

/** Reuses the profile picker choices; the server still enforces each event's age policy. */
export function BirthYearSelect({value,onChange,label='태어난 년도',readOnly=false}:{value:string;onChange:(value:string)=>void;label?:string;readOnly?:boolean}) {
  const grouped=new Set(Object.values(DECADE_GROUPS).flat());
  const previous=Array.from({length:maxAdultBirthYear()-1900+1},(_,i)=>maxAdultBirthYear()-i).filter(year=>!grouped.has(year));
  const unknownSaved=value&&!grouped.has(Number(value))&&!previous.includes(Number(value));
  return <HubField label={label}><select className={inputClass} value={value} disabled={readOnly} required onChange={e=>onChange(e.target.value)}>
    <option value="">년생 선택</option>
    {unknownSaved&&<option value={value}>{value}년생 · 저장된 값</option>}
    {Object.entries(DECADE_GROUPS).map(([decade,years])=><optgroup label={decade} key={decade}>{years.map(year=><option key={year} value={year}>{year}년생</option>)}</optgroup>)}
    <optgroup label="다른 년생">{previous.map(year=><option key={year} value={year}>{year}년생</option>)}</optgroup>
  </select></HubField>;
}
