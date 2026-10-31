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
 const reload=useRef<()=>void>(()=>{});
 useEffect(()=>{
  const token=++scope.current;busyRef.current=false;setBusy(false);setState(null);setError('');
  let stopped=false,inFlight=false,queued=false;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const schedule=()=>{
   if(stopped||timer)return;
   timer=setTimeout(()=>{timer=undefined;void load();},1000+Math.floor(Math.random()*750));
  };
  const load=async()=>{
   if(stopped)return;
   if(inFlight){queued=true;return;}
   inFlight=true;
   try{
    const next=await onsiteHalloweenRequest<OnsiteHalloweenState>({action:'state'});
    if(scope.current===token&&identity.current===userId){accept(next);setError('');}
   }catch(e){if(scope.current===token&&identity.current===userId)setError((e as Error).message);}
   finally{inFlight=false;if(queued&&!stopped){queued=false;schedule();}}
  };
  const refresh=()=>{if(inFlight)queued=true;else schedule();};
  const resume=()=>{if(document.visibilityState!=='hidden')void load();};
  reload.current=()=>{void load();};
  const channel=supabase.channel('onsite-halloween-'+userId).on('postgres_changes',{event:'UPDATE',schema:'public',table:'event_hub_updates'},refresh).subscribe();
  void load();window.addEventListener('online',resume);window.addEventListener('pageshow',resume);document.addEventListener('visibilitychange',resume);
  return()=>{stopped=true;scope.current++;if(timer)clearTimeout(timer);supabase.removeChannel(channel);window.removeEventListener('online',resume);window.removeEventListener('pageshow',resume);document.removeEventListener('visibilitychange',resume);reload.current=()=>{};};
 },[userId]);
 useEffect(()=>{if(!state)return;const at=Date.parse(state.serverNow),start=performance.now();const tick=()=>setClock(new Date(at+performance.now()-start));tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);},[state]);
 const draw=async(slot:number)=>{if(!state?.event||busyRef.current)return;const token=scope.current;busyRef.current=true;setBusy(true);setError('');try{const saved=await onsiteHalloweenRequest<OnsiteHalloweenState>({action:'draw',eventId:state.event.id,slot});if(scope.current===token && identity.current===userId)accept(saved);}catch(e){if(scope.current===token && identity.current===userId)setError((e as Error).message);}finally{if(scope.current===token && identity.current===userId){busyRef.current=false;setBusy(false);}}};
 return <section aria-label="할로윈 경품 뽑기" className="onsite-halloween-deck rounded-2xl border border-orange-400/50 bg-slate-900 p-4 text-white space-y-3">
 <h2 className="font-black text-lg text-orange-200">🎃 할로윈 카드 · {state?.cards.length??0}/3</h2>
 {state?.event?<EventCardFaces event={state.event} cards={state.cards} clock={clock} disabled={busy||!!state.blockedReason} onDraw={slot=>void draw(slot)}/>:<p role="status">{state?.blockedReason??(error?'카드를 불러오지 못했습니다.':'카드 확인 중…')}</p>}
 {state?.event&&state.blockedReason&&<p role="status" className="text-sm">{state.blockedReason}</p>}
 {state?.prizesGiven.length ? <p className="text-sm">상품 지급 확인 {state.prizesGiven.length}개</p> : null}{state?.candyGivenAt&&<p className="text-sm">하리보 지급 확인</p>}
 {busy&&<p role="status">결과 저장 중…</p>}{error&&<p role="alert">{error}<button className="ml-2 underline" onClick={()=>reload.current()}>다시 확인</button></p>}
 </section>;
}
