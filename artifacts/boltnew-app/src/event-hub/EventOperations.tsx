import { useState, useEffect } from 'react';
import { eventEndAt } from '../../../../lib/api-zod/src/event-hub-modules';
import type { HubEvent,HubController,PrivateApplication } from '../lib/event-hub-client';
import { HubButton,HubCard,HubField,HubCheck,inputClass,formatHubTime } from './HubUi';
const iso = (v:string) => v ? new Date(v+':00+09:00').toISOString() : undefined;
const local = (v?:string) => v ? new Date(Date.parse(v)+9*3600000).toISOString().slice(0,16) : '';
export function RecruitmentSchedule({event:e,hub}:{event:HubEvent;hub:HubController}) {
 const [start,setStart]=useState(local(e.opensAt)),[end,setEnd]=useState(local(e.closesAt)),[benefitStart,setBenefitStart]=useState(local(e.benefitsOpensAt)),[benefitEnd,setBenefitEnd]=useState(local(e.benefitsClosesAt)),[lateAfter,setLateAfter]=useState(local(e.lateReviewAfter));
 return <HubCard><h3 className="font-black">모집 일정 · 예약 자동접수</h3>
  <p className="text-sm">예정값입니다. 운영 정책·배포 미승인 상태에서는 production 활성화가 차단됩니다. 최소5명은 개최 준비조건입니다.</p>
  <HubField label="신청 시작 (한국시간)"><input type="datetime-local" className={inputClass} value={start} onChange={x=>setStart(x.target.value)}/></HubField>
  <HubField label="신청 종료 (선택, 한국시간)"><input type="datetime-local" className={inputClass} value={end} onChange={x=>setEnd(x.target.value)}/></HubField>
  <HubField label="선착순 혜택 시작 (선택)"><input type="datetime-local" className={inputClass} value={benefitStart} onChange={x=>setBenefitStart(x.target.value)}/></HubField>
  <HubField label="선착순 혜택 종료 (선택)"><input type="datetime-local" className={inputClass} value={benefitEnd} onChange={x=>setBenefitEnd(x.target.value)}/></HubField>
  <HubField label="늦참 관리자 검토 기준 (선택)"><input type="datetime-local" className={inputClass} value={lateAfter} onChange={x=>setLateAfter(x.target.value)}/></HubField>
  <p>미리보기: {formatHubTime(iso(start))} ~ {end?formatHubTime(iso(end)):'행사 신규 입장 마감'} · {e.scheduleEnabled&&!e.schedulePaused?'예약 활성':'일시중지/미활성'}</p>
  <div className="flex flex-wrap gap-2">
   <HubButton disabled={hub.status==='saving'} onClick={()=>hub.mutate({action:'event.recruitment',target:e.id,revision:e.revision,data:{enabled:true,immediate:true}})}>즉시 수동 접수 ON</HubButton>
   <HubButton disabled={hub.status==='saving'||!start} onClick={()=>hub.mutate({action:'event.save',target:e.id,revision:e.revision,data:{...e,opensAt:iso(start),closesAt:iso(end),benefitsOpensAt:iso(benefitStart),benefitsClosesAt:iso(benefitEnd),lateReviewAfter:iso(lateAfter)}})}>예약 시각 저장</HubButton>
   <HubButton disabled={hub.status==='saving'} onClick={()=>hub.mutate({action:'event.schedule',target:e.id,revision:e.revision,data:{enabled:true,paused:false}})}>예약시각에 신청 자동 시작 ON</HubButton>
   <HubButton disabled={hub.status==='saving'} onClick={()=>hub.mutate({action:'event.schedule',target:e.id,revision:e.revision,data:{enabled:true,paused:true}})}>예약 일시중지</HubButton>
   <HubButton disabled={hub.status==='saving'} onClick={()=>hub.mutate({action:'event.recruitment',target:e.id,revision:e.revision,data:{enabled:false}})}>즉시 접수 중지</HubButton>
  </div>
  <details><summary>예약 처리 이력</summary>{e.history.filter(h=>h.action.startsWith('schedule.')).map((h,i)=><p key={i}>{formatHubTime(h.at)} · {h.action}</p>)}</details>
 </HubCard>;
}
export function ParticipantOperations({app:a,event:e,hub}:{app:PrivateApplication;event:HubEvent;hub:HubController}){
 const [open,setOpen]=useState(false),[at,setAt]=useState(local(a.lateArrival?.at)||e.date+'T23:30'),[reason,setReason]=useState(a.lateArrival?.reason??''),[phone,setPhone]=useState(a.rewardPhone??a.basic.phone);
 const save=(action:string,data:Record<string,unknown>)=>hub.mutate({action,target:a.id,revision:a.revision,data});
 return <HubCard><h3 className="font-black">도착 예정 · 혜택 기록</h3>
  <HubButton onClick={()=>setOpen(!open)}>늦게 도착해요 / 도착 예정시간</HubButton>
  {open&&<div className="space-y-2">
   <p>{e.type==='halloween'?'1차만 진행하며 다음 날 01:00 종료·2차 없음. 늦게 와도 안내된 회비는 같습니다.':'BINPC2는 1차 신청입니다. 다른 차수는 운영자 안내를 확인하세요.'}</p>
   <HubField label="도착 예정 (한국시간)"><input type="datetime-local" className={inputClass} value={at} onChange={x=>setAt(x.target.value)}/></HubField>
   <HubField label="늦참 사유 (선택)"><input className={inputClass} value={reason} onChange={x=>setReason(x.target.value)}/></HubField>
   <p>종료 {e.end} · 남은 이용 {at?Math.max(0,Math.round((eventEndAt(e)-Date.parse(iso(at)!))/60000)):0}분. 종료 이후는 관리자 확인이 필요합니다.</p>
   <HubButton disabled={hub.status==='saving'||!at} onClick={()=>save('application.late',{at:iso(at),reason})}>내용 확인 · 도착시간 저장</HubButton>
   <p>문의는 화면의 관리자 1:1 문의를 이용하세요.</p>
  </div>}
  {a.lateArrival&&<p>예정 {formatHubTime(a.lateArrival.at)} · {({noted:"도착 예정 접수",review:"관리자 확인 대기",approved:"늦참 승인",declined:"도착 불가 · 문의 필요"})[a.lateArrival.status]} {a.lateArrival.reviewReason}</p>}
  <HubField label="상품·상금·할인 기록용 전화번호"><input className={inputClass} type="tel" value={phone} onChange={x=>setPhone(x.target.value)}/></HubField>
  <p className="text-xs">입력·저장만 합니다. SMS·전화 인증이나 추가 비밀번호는 없습니다. 지급 전 운영자가 직접 대조합니다.</p>
  <HubButton disabled={hub.status==='saving'} onClick={()=>save('application.phone',{phone})}>기록용 전화번호 저장</HubButton>
 </HubCard>;
}
export function BenefitResults({hub}:{hub:HubController}){
 const [search,setSearch]=useState(''),[detail,setDetail]=useState(''),[label,setLabel]=useState(''),[amount,setAmount]=useState('0'),[reason,setReason]=useState(''),[checked,setChecked]=useState(false);
 return <HubCard><h3 className="font-black">경품·상금·할인 결과</h3>
 <HubField label="번호·닉네임·행사 검색"><input className={inputClass} value={search} onChange={e=>setSearch(e.target.value)}/></HubField>
 {hub.state?.applications.filter(a=>[a.basic.nickname,a.rewardPhone??a.basic.phone,hub.state?.events.find(e=>e.id===a.eventId)?.title].some(v=>v?.includes(search))).map(a=><section key={a.id} className="border-t py-3 space-y-2">
  <p>{a.basic.nickname} · {(a.rewardPhone??a.basic.phone).replace(/[^0-9]/g,'').replace(/^(\d{3})\d+(\d{4})$/,'$1****$2')} · {a.waivedAt?'무료 승인':a.quote?.benefit}</p>
  <p>{hub.state?.events.find(e=>e.id===a.eventId)?.date} · {a.cards.length}개 결과 · 지급확인 {a.prizesGiven.length}</p>
  <HubButton onClick={()=>setDetail(detail===a.id?'':a.id)}>권한 있는 관리자 상세 열람</HubButton>
  {detail===a.id&&<div className="space-y-2">
   <p>전화번호 {a.rewardPhone??a.basic.phone}</p>
   <p>도착 {formatHubTime(a.lateArrival?.at)} · {a.lateArrival?({noted:"도착 예정 접수",review:"관리자 확인 대기",approved:"늦참 승인",declined:"도착 불가 · 문의 필요"})[a.lateArrival.status]:""} · {a.lateArrival?.reason}</p>
   {a.lateArrival&&<><HubField label="늦참 검토 사유"><input className={inputClass} value={reason} onChange={x=>setReason(x.target.value)}/></HubField>{['approved','declined'].map(status=><HubButton key={status} disabled={!reason||hub.status==='saving'} onClick={()=>hub.mutate({action:'admin.application.late',target:a.id,revision:a.revision,data:{status,reason}})}>{status==='approved'?'늦참 승인':'도착 불가·문의 안내'}</HubButton>)}</>}
   {(a.resultDetails??a.cards).map(c=><p key={c.id}>{c.prizeLabel??c.prize} · {c.couponAmount??0}원 · {a.prizesGiven.includes(c.id)?'지급 확인':'지급 전'}</p>)}
   {a.manualResults?.map(r=><div key={r.id}><p>{r.label} {r.amount}원 · 수신 {r.receivedAt?'확인':'대기'} / 실제 지급 {r.paidAt?'확인':'대기'}</p>{(['receivedAt','paidAt'] as const).map(field=><HubButton key={field} disabled={!!r[field]||hub.status==='saving'||(field==='paidAt'&&!checked)} onClick={()=>hub.mutate({action:'admin.application.result.confirm',target:a.id,revision:a.revision,data:{id:r.id,field,doubleChecked:checked}})}>{field==='receivedAt'?'결과 수신 확인':'실제 지급 확인'}</HubButton>)}</div>)}
   <HubField label="수동 결과 이름"><input className={inputClass} value={label} onChange={x=>setLabel(x.target.value)}/></HubField>
   <HubField label="수동 결과 금액 (기록만)"><input className={inputClass} type="number" value={amount} onChange={x=>setAmount(x.target.value)}/></HubField>
   <HubField label="수동 결과 근거"><input className={inputClass} value={reason} onChange={x=>setReason(x.target.value)}/></HubField>
   <HubCheck label="지급 전 신청·번호·결과를 직접 더블체크했습니다" checked={checked} onChange={setChecked}/>
   <HubButton disabled={!label||!reason||hub.status==='saving'} onClick={()=>hub.mutate({action:'admin.application.result',target:a.id,revision:a.revision,data:{id:crypto.randomUUID(),label,amount:Number(amount),reason}})}>수동 상금·상품 결과 기록 (송금 없음)</HubButton>
  </div>}
 </section>)}
 </HubCard>;
}


export function ScheduledOpening({event:e,hub}:{event:HubEvent;hub:HubController}){
 const [seconds,setSeconds]=useState<number|null>(null);
 useEffect(()=>{
  const baseline=Date.parse(hub.state?.serverNow??new Date().toISOString()),started=performance.now();
  const update=()=>setSeconds(e.opensAt?Math.max(0,Math.ceil((Date.parse(e.opensAt)-baseline-(performance.now()-started))/1000)):null);
  update();const timer=setInterval(update,1000);return()=>clearInterval(timer);
 },[e.opensAt,hub.state?.serverNow]);
 const scheduled=!!(e.opensAt&&e.scheduleEnabled&&!e.schedulePaused);
 return <HubCard><h2 className="font-black">신청창 준비 중 · 오픈 후 접수</h2>{e.opensAt&&<p>신청 시작 예정 {formatHubTime(e.opensAt)}</p>}{scheduled&&<p>{seconds===null?"접수 시각 확인 중":seconds>0?`남은 시간 ${seconds}초 · 서버 기준`:"예약 시각이 지났습니다. 현재 접수 상태를 다시 확인해 주세요."}</p>}<p>정식 접수 전에는 신청 순번을 확보할 수 없습니다. 개인정보 입력과 입금은 접수 시작 후 진행하세요.</p><HubButton onClick={()=>hub.load()}>연결 상태·접수 시작 다시 확인</HubButton></HubCard>;
}
