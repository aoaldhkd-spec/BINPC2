import { TOUR_WEEKS } from '../../../../lib/api-zod/src/event-policy-tour';
import type { HubEvent } from '../lib/event-hub-client';
import { EventArtwork } from './EventPresentation';

export function tourWeekFor(event: HubEvent) {
  return event.type==='tour' ? TOUR_WEEKS.find(w=>event.date>=w.start && event.date<=new Date(Date.parse(w.start+'T00:00:00Z')+3*86400000).toISOString().slice(0,10)) : undefined;
}

/** Public regions only. No detailed venue coordinates, applications or account data. */
export function TourOverview({events,selected,onSelect}:{events:HubEvent[];selected:string;onSelect:(region:string)=>void}){
  if(!events.some(e=>tourWeekFor(e)))return null;
  return <section className="hub-tour-overview" aria-label="전국투어 지역 안내">
    <header><span className="hub-eyebrow">2026 · NOVEMBER — DECEMBER</span><h2>이번엔, 우리 동네에서.</h2><p>인천에서 대구까지 · 목·금·토·일</p></header>
    <div className="hub-tour-route">
      <img className="hub-korea-map" src="/event-art/korea-tour-map.svg" alt="대한민국 지도: 인천, 종로, 광주, 신림, 대구 전국투어 지역" width={400} height={500}/>
      <div className="hub-tour-stops" aria-label="전국투어 지역 선택">
        {TOUR_WEEKS.map((w,i)=>{
          const event=events.find(e=>tourWeekFor(e)?.region===w.region);
          const end=new Date(Date.parse(w.start+'T00:00:00Z')+3*86400000).toISOString().slice(8,10);
          return <button type="button" key={w.region} disabled={!event} aria-pressed={selected===w.region} onClick={()=>onSelect(selected===w.region?'':w.region)}>
            <span className="hub-tour-stop-number">{String(i+1).padStart(2,'0')}</span>
            <span className="hub-tour-stop-copy"><strong>{w.region}</strong><span>{Number(w.start.slice(5,7))}.{w.start.slice(8)}–{end} · 목~일</span><small>{w.venues.join(' · ')}</small>{!event&&<small>행사 목록 준비 중</small>}</span>
            {event&&<EventArtwork event={event} compact/>}
          </button>;
        })}
        {selected&&<button className="hub-tour-show-all" type="button" onClick={()=>onSelect('')}>전체 행사 다시 보기</button>}
      </div>
    </div>
    <p className="hub-tour-footnote">지역을 선택하면 아래 날짜별 행사를 볼 수 있어요. 웹 신청은 1차만 · 상세 장소와 지도는 참가 승인 후 안내해요.</p>
  </section>;
}
