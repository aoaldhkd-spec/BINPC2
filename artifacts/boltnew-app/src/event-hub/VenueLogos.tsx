import { useState } from 'react';
import type { HubController,HubEvent } from '../lib/event-hub-client';
import { HubCard,HubField,HubButton,inputClass } from './HubUi';
export const VENUE_LOGOS = [
 ['red_hole','레드홀 · RED HOLE'],['fake','페이크 · FAKE'],['jack','자크 · JACK'],
 ['m_karaoke','M가라오케 · M KARAOKE (기존 제작 시안)'],['speed','스피드 · SPEED'],
 ['check_in','체크인 · CHECK-IN'],['on_top','온탑 · ON TOP'],
] as const;
export function VenueLogo({id}:{id?:string}){
 const item=VENUE_LOGOS.find(v=>v[0]===id);
 if (!item) return null;
 return <figure><img src={`/tour-logos-v3/${item[0]}.png`} alt={item[1]} width={160} height={140} loading="lazy" className="max-w-full h-36 object-contain bg-white rounded-xl"/><figcaption className="text-xs">{item[1]}</figcaption></figure>;
}
export function VenueLogoSettings({event:e,hub}:{event:HubEvent;hub:HubController}){
 const [id,setId]=useState(e.venueLogoId??'');
 return <HubCard><h3 className="font-black">행사 장소 로고 (승인 후 공개)</h3>
 <p>실제 장소·차수는 운영자가 지정합니다. 후보만으로 자동 배정하지 않습니다. 자크는 최신 지퍼 로고, M가라오케는 공식 원본이 아닌 기존 제작 시안입니다.</p>
 <HubField label="장소 로고"><select className={inputClass} value={id} onChange={x=>setId(x.target.value)}><option value="">문자 안내만 / 미지정</option>{VENUE_LOGOS.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></HubField>
 <VenueLogo id={id}/>
 <HubButton disabled={hub.status==='saving'} onClick={()=>hub.mutate({action:'event.save',target:e.id,revision:e.revision,data:{...e,venueLogoId:id||undefined}})}>장소 로고 연결 저장</HubButton>
 <details><summary>수령한 7개 매장 로고 확인</summary><div className="grid grid-cols-2 gap-3">{VENUE_LOGOS.map(([key])=><VenueLogo key={key} id={key}/>)}</div></details>
 <GoraeThanks/>
 </HubCard>;
}
export function GoraeThanks(){return <figure className="text-xs mt-4"><img src="/tour-logos-v3/gorae.png" alt="고래 Gorae 감사용 로고" width={100} height={100} loading="lazy" className="object-contain h-24 bg-white rounded-xl"/><figcaption>대관에 도움을 주신 고래 사장님께 감사드립니다.</figcaption></figure>;}
