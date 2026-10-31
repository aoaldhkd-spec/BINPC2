import type {HubApplication} from '../../../../lib/api-zod/src/event-hub';
import type {HalloweenCardEvent} from '../../../../lib/api-zod/src/onsite-halloween';
import {campaignCardLimit,halloweenPrizeLabel} from '../../../../lib/api-zod/src/event-campaign';
import {halloweenCardTimes} from '../../../../lib/api-zod/src/event-card-clock';
import {eventEnded,effectiveEventTheme} from '../../../../lib/api-zod/src/event-hub-modules';
/** Shared card backs/results for the existing application and legacy onsite flow. */
export function EventCardFaces({event,cards,clock,disabled,onDraw}:{event:HalloweenCardEvent;cards:HubApplication['cards'];clock:Date;disabled:boolean;onDraw:(slot:number)=>void}){
 const slots=halloweenCardTimes(event),ended=eventEnded(event,clock);
 return <div className={`grid ${campaignCardLimit(event)===2?'grid-cols-2':'grid-cols-3'} gap-2`} data-campaign-theme={effectiveEventTheme(event,clock)}>
 {Array.from({length:campaignCardLimit(event)},(_,i)=><button type="button" key={i}
 disabled={disabled||ended||!event.cardsEnabled||!!cards[i]||i!==cards.length||(slots.length>0&&clock.getTime()<slots[i])}
 onClick={()=>onDraw(i)} aria-label={`카드 ${i+1} ${cards[i]?'결과':ended?'종료':slots.length&&clock.getTime()<slots[i]?'잠김':'열기'}`}
 className={`event-card-face aspect-[2/3] rounded-xl grid place-items-center p-2 text-center text-sm transition-transform duration-500 ${cards[i]?'hub-card-revealed bg-teal-50 border border-teal-300':'bg-slate-800 text-white'}`}>
 {cards[i]?cards[i].prize==='다음 기회에'?event.campaign?.kind==='tour'?'꽝':'다음 기회에':`🎁 ${halloweenPrizeLabel(cards[i].prizeLabel??'당첨 상품 · 관리자에게 확인해 주세요')}`:
 <span><strong className="block text-2xl">🎃</strong><span className="block">카드 {i+1}</span>{slots.length>0&&<><span className="block">{['23:00','00:00','00:30'][i]} 해제</span><span className="block">{ended?'뽑기 종료':clock.getTime()<slots[i]?`🔒 ${Math.ceil((slots[i]-clock.getTime())/60000)}분 후`:'열림'}</span></>}</span>}
 </button>)}
 </div>;
}
