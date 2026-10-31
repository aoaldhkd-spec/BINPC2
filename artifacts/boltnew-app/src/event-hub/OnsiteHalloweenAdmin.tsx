import {useEffect,useState} from 'react';
import {onsiteHalloweenRequest} from '../lib/localdb';
import type {HubApplication} from '../../../../lib/api-zod/src/event-hub';
type Result={eventId:string;profileId:string;nickname:string;cards:HubApplication['cards'];prizesGiven:string[];candyGivenAt?:string};
export function OnsiteHalloweenAdmin({eventId}:{eventId:string}){
 const [rows,setRows]=useState<Result[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=async()=>{setError('');try{setRows(await onsiteHalloweenRequest<Result[]>({action:'admin-results'},true));}catch(e){setError((e as Error).message);}};
 useEffect(()=>{let active=true;void onsiteHalloweenRequest<Result[]>({action:'admin-results'},true).then(r=>{if(active)setRows(r);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[eventId]);
 const give=async(profileId:string,cardId?:string)=>{if(busy)return;setBusy(true);try{await onsiteHalloweenRequest({action:'give',eventId,profileId,cardId},true);await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <section className="mt-4 space-y-2"><h4 className="font-black">현장 참가자 카드·지급</h4><button onClick={()=>void load()} className="underline">새로고침</button>{error&&<p role="alert">{error}</p>}
 {rows.filter(r=>r.eventId===eventId).map(r=><div key={r.profileId} className="rounded-xl border p-3"><p className="font-bold">{r.nickname} · {r.cards.length}/3</p>{r.cards.map((c,i)=><div key={c.id} className="flex justify-between gap-2"><span>카드 {i+1} · {c.prizeLabel}</span>{c.prize!=='다음 기회에'&&<button disabled={busy||r.prizesGiven.includes(c.id)} onClick={()=>void give(r.profileId,c.id)}>{r.prizesGiven.includes(c.id)?'지급 완료':'상품 지급 확인'}</button>}</div>)}<button disabled={busy||!!r.candyGivenAt} onClick={()=>void give(r.profileId)}>{r.candyGivenAt?'하리보 지급 완료':'하리보 지급 확인'}</button></div>)}
 </section>;
}
