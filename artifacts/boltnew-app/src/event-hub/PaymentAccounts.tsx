import { useState } from 'react';
import type { PrivateApplication } from '../lib/event-hub-client';
import { useEventHub } from '../lib/event-hub-client';
import { HubButton } from './HubUi';
export function PaymentAccounts({app,hub,blocked}:{app:PrivateApplication;hub:ReturnType<typeof useEventHub>;blocked:boolean}) {
  const [copied,setCopied]=useState('');
  if (app.approvalRevokedAt) return <p>승인 상태를 운영자에게 확인해 주세요. 다시 송금하지 마세요.</p>;
  if (app.waivedAt) return <p>무료 참가 승인 완료입니다. 입금하지 마세요.</p>;
  if (app.payment==='approved') return <p>입금 확인 완료입니다. 다시 송금하지 마세요.</p>;
  if (['reported','held','mismatch'].includes(app.payment)) return <p>입금 신고가 접수되었습니다. 운영자 확인을 기다려 주세요. 다시 송금하지 마세요.</p>;
  if (app.quote?.fee===0) return <p>무료 참가 대상입니다. 운영자의 무료 승인을 기다려 주세요. 입금하지 마세요.</p>;
  if (blocked) return <p>테스트 중에는 실제 송금하지 마세요. 관리자 시험은 가상 입금만 사용합니다.</p>;
  if (app.bossTestOnly) return <p className="font-bold">실제 송금 없이 ‘입금 신고’만 해주세요.</p>;
  const accounts=app.billing?.accounts??[];
  return <div className="space-y-2">
    <p>간보기 방지와 참여 인원 확정을 위해 전원 선입금을 받고 있습니다.</p>
    <p>입금 후 입금했다고 알려주시면, 운영자가 확인한 뒤 승인해 드립니다.</p>
    <p className="font-bold">안내받거나 선택한 계좌 하나로 한 번만 입금하세요.</p>
    {accounts.map(a=><div key={a.id} className="rounded-xl border p-3"><p>{a.bank} {a.number}</p><p>{a.holder?`예금주: ${a.holder}`:'예금주: 운영자에게 확인'}</p>
      {!app.confirmedAt && <HubButton disabled={hub.status==='saving'||app.paymentAccount?.id===a.id} onClick={()=>hub.mutate({action:'application.account',target:app.id,revision:app.revision,data:{accountId:a.id}})}>{app.paymentAccount?.id===a.id?'선택한 계좌':'이 계좌 선택'}</HubButton>}
      <HubButton onClick={async()=>{try{await navigator.clipboard.writeText(a.number);setCopied('계좌번호를 복사했습니다.');}catch{setCopied('복사하지 못했습니다. 표시된 번호를 확인해 주세요.');}}}>계좌번호 복사</HubButton>
    </div>)}
    {!accounts.length && <p className="break-words">{app.billing?.account?`계좌·예금주: ${app.billing.account}`:'입금 계좌는 운영자에게 확인해 주세요.'}</p>}
    {copied&&<p role="status">{copied}</p>}
  </div>;
}
