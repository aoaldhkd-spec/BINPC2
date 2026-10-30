// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RewardContactAdmin, RewardReceiptContact } from "./RewardContact";
import { EventLaboratoryStore } from "./event-laboratory-store";
import type { HubController, PrivateApplication } from "../lib/event-hub-client";
vi.mock("../lib/supabase", () => ({ supabase: {}, onSseReconnect: () => () => {}, isSseHealthy: () => true }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function fixture() {
 const state=new EventLaboratoryStore().state(true),event=state.events[0];
 event.campaign={kind:"halloween-friday",round:1,secondRoundLink:""};
 const app={...state.applications[0],basic:{...state.applications[0].basic,phone:"01011112222"},cards:[{id:"given-card",prize:"ring",prizeLabel:"반지",at:"2026-10-30T14:00:00Z"}],prizesGiven:[]} as PrivateApplication;
 const hub={state,status:"",error:"",mutate:vi.fn(async()=>({saved:true})),load:vi.fn(),setError:vi.fn()} as HubController;
 return {app,event,hub};
}
it("shows no phone field for ordinary applications, a win without receipt, or a discount coupon",()=>{
 const {app,event,hub}=fixture();
 const v=render(<RewardReceiptContact app={app} event={event} hub={hub}/>);
 expect(screen.queryByLabelText(/연락처/)).toBeNull();
 const requested={...app,rewardPhoneRequest:{source:"card" as const,resultId:"given-card",purpose:"배송 확인",requestedAt:"2026-10-30T14:10:00Z"}};
 v.rerender(<RewardReceiptContact app={requested} event={event} hub={hub}/>);
 expect(screen.queryByLabelText(/연락처/)).toBeNull();
 v.rerender(<RewardReceiptContact app={{...requested,prizesGiven:["given-card"],cards:[{...app.cards[0],couponAmount:1000}]}} event={event} hub={hub}/>);
 expect(screen.queryByLabelText(/연락처/)).toBeNull();
 expect(hub.mutate).not.toHaveBeenCalled();
});
it("asks optional purpose-specific contact only after actual receipt and never copies general phone",async()=>{
 const {app,event,hub}=fixture();
 const requested={...app,prizesGiven:["given-card"],rewardPhoneRequest:{source:"card" as const,resultId:"given-card",purpose:"상품 배송 확인",requestedAt:"2026-10-30T14:10:00Z"}};
 render(<RewardReceiptContact app={requested} event={event} hub={hub}/>);
 const phone=screen.getByLabelText("수령 연락처 (선택)") as HTMLInputElement;
 expect(phone.value).toBe("");
 fireEvent.change(phone,{target:{value:"01099998888"}});
 expect((screen.getByRole("button",{name:"연락처 저장"}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByLabelText("위 수령 목적의 연락처 이용에 동의합니다 (선택)"));
 fireEvent.click(screen.getByRole("button",{name:"연락처 저장"}));
 await waitFor(()=>expect(hub.mutate).toHaveBeenCalledExactlyOnceWith({action:"application.phone",target:app.id,revision:app.revision,data:{phone:"01099998888",purposeAccepted:true}}));
});
it("only offers actually paid item/cash receipts to administrators, never discounts or unclassified legacy rows",()=>{
 const {app,event,hub}=fixture();
 app.manualResults=[{id:"discount",kind:"discount",label:"할인",amount:1000,at:"2026-10-30T00:00:00Z",paidAt:"2026-10-30T01:00:00Z"},{id:"legacy",label:"기존 미분류",amount:1000,at:"2026-10-30T00:00:00Z",paidAt:"2026-10-30T01:00:00Z"},{id:"cash",kind:"cash",label:"지급한 상금",amount:1000,at:"2026-10-30T00:00:00Z",paidAt:"2026-10-30T01:00:00Z"}];
 render(<RewardContactAdmin app={app} event={event} hub={hub}/>);
 fireEvent.click(screen.getByText("수령 연락처 요청",{selector:"summary"}));
 expect(screen.queryByRole("option",{name:"할인"})).toBeNull();
 expect(screen.queryByRole("option",{name:"기존 미분류"})).toBeNull();
 expect(screen.queryByRole("option",{name:"반지"})).toBeNull();
 expect(screen.getByRole("option",{name:"지급한 상금"})).toBeTruthy();
 expect(hub.mutate).not.toHaveBeenCalled();
});
