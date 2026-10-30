import {useEffect,useRef,useState} from 'react';
import type {CompanionDraftGroup,HubCommand} from '../lib/event-hub-client';

type Mutate=(command:HubCommand)=>Promise<null|Record<string,unknown>>;
/** Saved selections belong to the authenticated server owner, never an event-only browser key. */
export function useCompanionSelection(eventId:string,group:CompanionDraftGroup|undefined,mutate:Mutate) {
  const [local,setLocal]=useState<{draftIds:string[];reviewedRevision:number;failed:boolean}>();
  const [saving,setSaving]=useState(false);
  const inFlight=useRef(false);
  const revision=group?.revision??0;
  const pending=(group?.items??[]).filter(item=>!item.removedAt&&!item.claimedAt&&!item.applicationId);
  const source=local?.draftIds??group?.selection?.draftIds??pending.map(item=>item.id);
  const selected=pending.filter(item=>source.includes(item.id));
  const needsReview=!!local?.failed || (local ? revision>local.reviewedRevision : !!group?.selection&&group.selection.reviewedRevision!==revision);
  const awaitingState=!!local&&!local.failed&&local.reviewedRevision>revision;
  useEffect(()=>{
    if(!saving&&local&&!local.failed&&group?.selection&&revision>=local.reviewedRevision){
      // Use the latest durable server selection after save, reload, or another device's edit.
      setLocal(undefined);
    }
  },[group?.selection,revision,local,saving]);
  const save=async(draftIds=selected.map(item=>item.id))=>{
    if(inFlight.current)return;
    inFlight.current=true;setSaving(true);
    setLocal({draftIds,reviewedRevision:revision,failed:false});
    try{
      const result=await mutate({action:'companion.selection.save',revision,data:{eventId,draftIds}});
      setLocal({draftIds,reviewedRevision:result?Number(result.revision??revision+1):revision,failed:!result});
    }catch{
      setLocal({draftIds,reviewedRevision:revision,failed:true});
    }finally{inFlight.current=false;setSaving(false);}
  };
  return {pending,selected,saving,needsReview,awaitingState,failed:!!local?.failed,save,
    toggle:(id:string,checked:boolean)=>save(checked?[...new Set([...selected.map(item=>item.id),id])]:selected.filter(item=>item.id!==id).map(item=>item.id))};
}
