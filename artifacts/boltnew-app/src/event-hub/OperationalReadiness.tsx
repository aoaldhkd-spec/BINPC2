import { VerificationResults } from './VerificationResults';
import { useState } from 'react';
import type { HubController,HubEvent } from '../lib/event-hub-client';
import { HubButton,HubCard,formatHubTime } from './HubUi';
export function OperationalReadiness({hub,event,onLaboratory}:{hub:HubController;event?:HubEvent;onLaboratory:()=>void}){
 const [checkedAt,setCheckedAt]=useState('');
 const state=hub.state;
 return <><VerificationResults/><HubCard><h3 className="font-black">실제 앱 운영 점검</h3>
  <p>검사 버튼을 누른 사실만으로 PASS를 만들지 않습니다. 아래는 현재 서버 설정과 미검증 범위입니다.</p>
  <ul className="list-disc pl-5 space-y-2">
   <li>대상 행사: {event?.title??'행사를 선택하세요'}</li>
   <li>전체 이벤트 엔진: {state?.enabled?'ON':'OFF · 기록 조회/후속 처리 유지'}</li>
   <li>운영 신규 접수: {state?.publicationBlocked?'차단 · 정책 확정/운영 반영 승인을 모두 확인해야 합니다.':'격리 개발 환경 또는 명시 승인된 운영 환경'}</li>
   <li>개인정보 정책: {state?.privacyPolicy?.status??'UNKNOWN'} · 미확정 운영 신규 접수 차단 유지</li>
   <li>회비·입금 안내 준비: {event?.account&&event.deadline&&event.area?'입력됨 · 실제 대조는 운영자 확인 필요':'미설정 항목 있음'}</li>
   <li>예약: {event?.scheduleEnabled&&!event.schedulePaused?'활성':'미활성/일시중지'} · 시작 {formatHubTime(event?.opensAt)}</li>
   <li>현장 개최 최소5명: 개최 점검용이며 첫 신청을 막지 않습니다.</li>
   <li>갤럭시·아이폰 실제 잠금/복귀·OS·알림: UNKNOWN</li>
   <li>운영 백업·복구·보관/삭제 정책·배포 승인: 미확정/미실행</li>
   <li>자동 정산·실제 송금·환불·외부 발송: 실행하지 않음</li>
  </ul>
  <HubButton disabled={hub.status==='saving'} onClick={async()=>{try{await hub.load();setCheckedAt(new Date().toISOString());}catch{setCheckedAt('');}}}>최신 서버 준비상태 다시 확인</HubButton>
  <p>마지막 서버 조회: {checkedAt?formatHubTime(checkedAt):'미실행/실패'}</p>
  <HubButton onClick={onLaboratory}>독립 시험실에서 가상3등·저장/복구·예약·늦참·17시·지급 점검</HubButton>
  <p className="text-xs">가상 시간·승인·재고와 부하는 시험실/격리 자동검사에만 적용합니다. 시험실 결과는 실제 DB 검사나 실기기 성적을 대신하지 않습니다.</p>
 </HubCard></>;
}
