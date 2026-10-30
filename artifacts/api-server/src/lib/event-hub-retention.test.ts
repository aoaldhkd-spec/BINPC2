import {expect,it} from 'vitest';
import {APPROVED_PRIVACY_RETENTION_RULES,APPROVED_REWARD_PHONE_RULE,DEFAULT_PRIVACY_POLICY,draftPrivacyPlan,type PrivacyPolicy,type PrivacySnapshot} from '@workspace/api-zod';
const at='2026-11-01T00:00:00.000Z',day=86400000;
const policy=():PrivacyPolicy=>({...DEFAULT_PRIVACY_POLICY,status:'approved',revision:1,backupProcedure:'합성 검사 절차',rewardPhoneRule:{...APPROVED_REWARD_PHONE_RULE},rules:{...Object.fromEntries(Object.entries(DEFAULT_PRIVACY_POLICY.rules).map(([key])=>[key,{days:1,basis:'합성 검사 기준'}])) as PrivacyPolicy['rules'],...APPROVED_PRIVACY_RETENTION_RULES}});
const snapshot=():PrivacySnapshot=>({owner:'test-owner',caseRevision:0,applications:[{id:'app',revision:1,eventEnd:at,financeAt:at,paid:true,publicProfile:false}],receiptIds:[],errorIds:[]});
const run=(s:PrivacySnapshot,days:number,p=policy())=>draftPrivacyPlan(s,p,new Date(Date.parse(at)+days*day));
it('does not invent backup/audit/recovery policy when applying the four approved purpose periods',()=>{
 const p={...DEFAULT_PRIVACY_POLICY,rules:{...DEFAULT_PRIVACY_POLICY.rules,...APPROVED_PRIVACY_RETENTION_RULES},rewardPhoneRule:APPROVED_REWARD_PHONE_RULE};
 const plan=run(snapshot(),200,p);expect(p.rules.backup.days).toBeNull();expect(p.rules.audit.days).toBeNull();expect(p.rules.recovery.days).toBeNull();expect(plan.blocked.join(' ')).toContain('backup:');expect(plan.blocked.join(' ')).toContain('audit:');expect(plan.blocked.join(' ')).toContain('recovery:');
});
it('shows a confirmed policy as confirmed without enabling an executor',()=>{expect(run(snapshot(),1).blocked).not.toContain('운영 보관·파기 정책이 검토 초안입니다. 운영 파기는 승인 전 실행하지 않습니다.');});
it('anchors applications and saved drafts to event end, not the time an old draft was last edited',()=>{
 const s=snapshot();s.basicDrafts=[{id:'event',revision:1,eventEnd:at,updatedAt:'2020-01-01T00:00:00Z'}];
 expect(run(s,29).items.find(i=>i.kind==='basic-draft')?.action).toBe('keep');expect(run(s,30).items.find(i=>i.kind==='basic-draft')?.action).toBe('erase');expect(run(s,30).items.find(i=>i.kind==='application')?.action).toBe('minimize');
});
it('revisits minimized financial records at 180 days instead of silently losing them from the plan',()=>{
 const s=snapshot();s.applications[0].erasedAt=new Date(Date.parse(at)+30*day).toISOString();
 expect(run(s,179).items.find(i=>i.kind==='application')?.action).toBe('keep');expect(run(s,180).items.find(i=>i.kind==='application')?.action).toBe('erase');
});
it('keeps unresolved/reopened inquiries and counts 90 days from completion',()=>{
 const s=snapshot();s.thread={id:'thread',status:'open',lastAt:'2020-01-01T00:00:00Z'};expect(run(s,200).items.find(i=>i.kind==='thread')?.action).toBe('keep');
 s.thread={...s.thread,status:'resolved',resolvedAt:at};expect(run(s,89).items.find(i=>i.kind==='thread')?.action).toBe('keep');expect(run(s,90).items.find(i=>i.kind==='thread')?.action).toBe('erase');
 s.thread={...s.thread,status:'open',resolvedAt:undefined};expect(run(s,200).items.find(i=>i.kind==='thread')?.action).toBe('keep');
});
it('erases only due reward phone purpose while preserving longer financial evidence',()=>{
 const s=snapshot();s.applications[0].rewardPhone={confirmedAt:at};
 expect(run(s,29).items.find(i=>i.kind==='reward-phone')?.action).toBe('keep');const p=run(s,30);expect(p.items.find(i=>i.kind==='reward-phone')?.action).toBe('erase');expect(p.items.find(i=>i.kind==='application')?.action).toBe('minimize');
 s.applications[0].rewardPhone={};const unknown=run(s,500);expect(unknown.items.find(i=>i.kind==='reward-phone')?.action).toBe('keep');expect(unknown.blocked.join(' ')).toContain('rewardPhone:');
});
it('keeps all personal and financial purposes under an active or malformed legal hold',()=>{
 for(const until of [undefined,'bad-date','2030-01-01T00:00:00Z']){const s=snapshot();s.hold={reason:'실제 분쟁 합성검사',until};s.receiptIds=['receipt'];s.member={id:'member',lastAt:at};s.thread={id:'thread',status:'resolved',resolvedAt:at,lastAt:at};s.applications[0].rewardPhone={confirmedAt:at};const p=run(s,500);expect(p.items.filter(i=>i.action!=='external-review').every(i=>i.action==='keep')).toBe(true);}
});
it('uses the reusable profile last use boundary without touching onsite reset scope',()=>{
 const s=snapshot();s.member={id:'member',lastAt:at};s.applications[0].publicProfile=true;expect(run(s,364).items.find(i=>i.kind==='member')?.action).toBe('keep');expect(run(s,365).items.find(i=>i.kind==='member')?.action).toBe('erase');expect(run(s,365).items.find(i=>i.kind==='onsite')?.action).toBe('external-review');
});
