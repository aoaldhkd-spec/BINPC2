import './onsite-halloween-cards.css';
import {useEffect,useRef,useState} from 'react';
import type {OnsiteHalloweenState} from '../../../../lib/api-zod/src/onsite-halloween';
import {supabase} from '../lib/supabase';
import {onsiteHalloweenRequest} from '../lib/localdb';
import {EventCardFaces} from '../event-hub/EventCardFaces';
export function OnsiteHalloweenCards({userId}:{userId:string}){
 const [state,setState]=useState<OnsiteHalloweenState|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[clock,setClock]=useState(new Date());
 const identity=useRef(userId);identity.current=userId;
 const accept=(next:OnsiteHalloweenState)=>setState(old=>old&&old.event?.id===next.event?.id&&((next.revision??0)<(old.revision??0)||((next.revision??0)===(old.revision??0)&&Date.parse(next.serverNow)<Date.parse(old.serverNow)))?old:next);
 const scope=useRef(0);const busyRef=useRef(false);
 useEffect(()=>{const token=++scope.current;busyRef.current=false;setBusy(false);setState(null);setError('');const load=()=>{void onsiteHalloweenRequest<OnsiteHalloweenState>({action:'state'}).then(s=>{if(scope.current===token && identity.current===userId){accept(s);setError('');}}).catch(e=>{if(scope.current===token && identity.current===userId)setError(e.message);});};let timer:ReturnType<typeof setTimeout>|undefined;const refresh=()=>{if(!timer)timer=setTimeout(()=>{timer=undefined;load();},150);};const channel=supabase.channel('onsite-halloween-'+userId).on('postgres_changes',{event:'UPDATE',schema:'public',table:'event_hub_updates'},refresh).subscribe();load();window.addEventListener('online',load);return()=>{scope.current++;if(timer)clearTimeout(timer);supabase.removeChannel(channel);window.removeEventListener('online',load);};},[userId]);
 useEffect(()=>{if(!state)return;const at=Date.parse(state.serverNow),start=performance.now();const tick=()=>setClock(new Date(at+performance.now()-start));tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);},[state]);
 const draw=async(slot:number)=>{if(!state?.event||busyRef.current)return;const token=scope.current;busyRef.current=true;setBusy(true);setError('');try{const saved=await onsiteHalloweenRequest<OnsiteHalloweenState>({action:'draw',eventId:state.event.id,slot});if(scope.current===token && identity.current===userId)accept(saved);}catch(e){if(scope.current===token && identity.current===userId)setError((e as Error).message);}finally{if(scope.current===token && identity.current===userId){busyRef.current=false;setBusy(false);}}};
 return <section aria-label="할로윈 경품 뽑기" className="onsite-halloween-deck rounded-2xl border border-orange-400/50 bg-slate-900 p-4 text-white space-y-3">
 <h2 className="font-black text-lg text-orange-200">🎃 할로윈 카드 · {state?.cards.length??0}/3</h2>
 {state?.event?<EventCardFaces event={state.event} cards={state.cards} clock={clock} disabled={busy||!!state.blockedReason} onDraw={slot=>void draw(slot)}/>:<p role="status">{state?.blockedReason??'카드 확인 중…'}</p>}
 {state?.event&&state.blockedReason&&<p role="status" className="text-sm">{state.blockedReason}</p>}
 {state?.prizesGiven.length ? <p className="text-sm">상품 지급 확인 {state.prizesGiven.length}개</p> : null}{state?.candyGivenAt&&<p className="text-sm">하리보 지급 확인</p>}
 {busy&&<p role="status">결과 저장 중…</p>}{error&&<p role="alert">{error}<button className="ml-2 underline" onClick={()=>{const token=scope.current;void onsiteHalloweenRequest<OnsiteHalloweenState>({action:'state',eventId:state?.event?.id}).then(s=>{if(scope.current===token&&identity.current===userId){accept(s);setError('');}}).catch(e=>{if(scope.current===token&&identity.current===userId)setError(e.message);});}}>다시 확인</button></p>}
 </section>;
}
