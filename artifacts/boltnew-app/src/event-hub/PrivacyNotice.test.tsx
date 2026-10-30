// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PublicPrivacyNotice } from "./PrivacyNotice";
import { PrivacyManagement } from "./PrivacyManagement";
import { BasicForm } from "./EventHubPage";
import { EventLaboratoryStore } from "./event-laboratory-store";
import { DEFAULT_PRIVACY_POLICY } from "../../../../lib/api-zod/src/event-hub-privacy";
import type { HubController, HubCommand } from "../lib/event-hub-client";
vi.mock("../lib/supabase", () => ({ supabase: { from:vi.fn(),channel:()=>({on(){return this;},subscribe(){return this;}}),removeChannel:vi.fn() }, onSseReconnect:()=>()=>{},isSseHealthy:()=>true }));
vi.mock("../lib/webPush",()=>({currentPushStatus:()=>({code:"unsupported"}),requestPushPermissionFromClick:vi.fn()}));
afterEach(()=>{cleanup();localStorage.clear();vi.restoreAllMocks();vi.unstubAllGlobals();});
function fixture(){
 const state=new EventLaboratoryStore().state(true);state.applications=[];
 const mutate=vi.fn(async(_command:HubCommand)=>({saved:true}));
 const hub:HubController={state,status:"",error:"",mutate,load:vi.fn(),setError:vi.fn()};
 return {hub,state,mutate};
}
it("shows the six approved purpose-specific periods and keeps unspecified storage policies unknown",()=>{
 render(<PublicPrivacyNotice/>);
 expect(screen.getByText("기존 행사 주기의 익일 17시 초기화")).toBeTruthy();
 expect(screen.getByText("행사 종료 후 30일")).toBeTruthy();
 expect(screen.getByText(/최종 입금·정산·지급 확인 후 180일/)).toBeTruthy();
 expect(screen.getByText(/처리 완료 후 90일/)).toBeTruthy();
 expect(screen.getByText(/최종 이용 후 1년 또는 재사용 동의 철회/)).toBeTruthy();
 expect(screen.getByText("지급·정산 확인 후 원칙 30일 이내 삭제")).toBeTruthy();
 expect(screen.getByText(/백업·감사·복구 기록의 보관 기준은 별도 확인/)).toBeTruthy();
 expect(screen.queryByText(/기본 180일/)).toBeNull();
});
it("preserves the published controller, contact and source notice without inventing backup or audit durations",()=>{
 render(<PublicPrivacyNotice notice={{policyVersion:"synthetic-v1",controllerName:"시험 운영자",contact:"합성 문의처",notice:"기존 고지 원문 보존",fingerprint:"synthetic",periods:[{purpose:"backup",days:null},{purpose:"audit",days:null},{purpose:"recovery",days:null}]}}/>);
 fireEvent.click(screen.getByText("운영자·문의처와 저장된 고지"));
 expect(screen.getByText("시험 운영자 · 문의 합성 문의처")).toBeTruthy();
 expect(screen.getByText("기존 고지 원문 보존")).toBeTruthy();
 for(const label of ["백업·복제본","운영 감사","세션·복구"])expect(screen.getByText(`${label}: 미확정`)).toBeTruthy();
});
it("keeps explicit required consent and does not add a phone to the actual first application step",()=>{
 const {hub,state,mutate}=fixture();render(<BasicForm eventId={state.events[0].id} hub={hub}/>);
 fireEvent.click(screen.getByText("개인정보 수집 안내 · 보유기간"));
 expect(screen.getByText("행사 종료 후 30일")).toBeTruthy();
 expect(screen.queryByLabelText(/전화번호|수령 연락처/)).toBeNull();
 expect((screen.getByLabelText("[필수] 위 개인정보 수집·이용 안내를 확인하고 동의합니다") as HTMLInputElement).checked).toBe(false);
 expect((screen.getByRole("button",{name:"다음"}) as HTMLButtonElement).disabled).toBe(true);
 expect(mutate).not.toHaveBeenCalled();
});
it("loads only approved periods as an editable draft and never approves publication, disposal or unconfirmed policies",async()=>{
 const {hub,state,mutate}=fixture();
 const policy=structuredClone(DEFAULT_PRIVACY_POLICY);policy.revision=7;policy.status="approved";policy.notice="기존 고지";policy.controllerName="기존 책임자";policy.rules.backup={days:null,basis:"미확정"};policy.rules.audit={days:null,basis:"미확정"};policy.rules.recovery={days:null,basis:"미확정"};policy.backupProcedure="기존 검토 절차";
 state.privacyPolicy=policy;render(<PrivacyManagement hub={hub}/>);
 fireEvent.click(screen.getByRole("button",{name:"승인 기준 불러오기"}));expect(mutate).not.toHaveBeenCalled();
 expect(screen.getByText(/정책 검토 중/)).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"정책 초안 저장"}));
 await waitFor(()=>expect(mutate).toHaveBeenCalledOnce());
 const command=mutate.mock.calls[0][0];expect(command.action).toBe("admin.privacy.policy");expect(command.revision).toBe(7);
 expect(command.data).toMatchObject({status:"draft",controllerName:"기존 책임자",backupProcedure:"기존 검토 절차",rules:{application:{days:30},finance:{days:180},member:{days:365},inquiry:{days:90},audit:{days:null,basis:"미확정"},recovery:{days:null,basis:"미확정"},backup:{days:null,basis:"미확정"}},rewardPhoneRule:{days:30}});
 expect(state.privacyPolicy).toBe(policy);expect(policy.status).toBe("approved");expect(policy.notice).toBe("기존 고지");
 expect(screen.queryByRole("button",{name:/파기 실행|즉시 삭제|모집 열기/})).toBeNull();
});
it("cannot approve an older stored policy while different periods or notice text are still being edited",()=>{
 const {hub,state,mutate}=fixture();state.privacyPolicy=structuredClone(DEFAULT_PRIVACY_POLICY);
 const confirm=vi.fn(()=>true);vi.stubGlobal("confirm",confirm);
 render(<PrivacyManagement hub={hub}/>);
 const approve=screen.getByRole("button",{name:"저장된 정책 확정 기록 (모집은 별도 승인)"}) as HTMLButtonElement;
 expect(approve.disabled).toBe(false);
 fireEvent.change(screen.getByLabelText("개인정보 고지 원문 초안"),{target:{value:"아직 저장하지 않은 새 고지"}});
 expect(approve.disabled).toBe(true);fireEvent.click(approve);expect(confirm).not.toHaveBeenCalled();expect(mutate).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"서버 최신 초안 불러오기"}));expect(approve.disabled).toBe(false);
 fireEvent.click(screen.getByRole("button",{name:"승인 기준 불러오기"}));expect(approve.disabled).toBe(true);
 expect(screen.getByText("편집한 정책을 먼저 저장해야 확정할 수 있습니다.")).toBeTruthy();fireEvent.click(approve);expect(mutate).not.toHaveBeenCalled();
});
