import { useEffect, useRef } from 'react';
import { HubButton } from './HubUi';
export type ApplicationParty='solo'|'together';

export function ApplicationChoice({open,onChoose,onClose}:{open:boolean;onChoose:(choice:ApplicationParty)=>void;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement as HTMLElement|null;
    const element=dialog.current;
    if(element&&!element.open){element.showModal();element.querySelector<HTMLButtonElement>('[data-party-first]')?.focus();}
    return ()=>{element?.close();previous?.focus();};
  },[open]);
  if(!open)return null;
  return <dialog ref={dialog} aria-labelledby="application-choice-title" className="hub-application-choice" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===dialog.current)onClose();}}>
    <section onClick={e=>e.stopPropagation()}>
      <div className="flex items-center justify-between gap-3"><h2 id="application-choice-title" className="font-black text-xl">누구와 신청하시나요?</h2><button type="button" aria-label="신청 선택 닫기" className="min-h-11 min-w-11" onClick={onClose}>✕</button></div>
      <div className="hub-compact-actions"><HubButton data-party-first onClick={()=>onChoose('solo')}>혼자 신청</HubButton><HubButton onClick={()=>onChoose('together')}>지인과 함께</HubButton></div>
    </section>
  </dialog>;
}
