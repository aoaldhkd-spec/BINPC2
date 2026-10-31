// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
const request=vi.hoisted(()=>vi.fn());vi.mock('../lib/localdb',()=>({onsiteHalloweenRequest:request}));
import {OnsiteHalloweenCards} from './OnsiteHalloweenCards';
const state={event:{id:'friday',title:'금요일',date:'2026-10-30',start:'22:30',end:'01:00',type:'halloween',campaign:{kind:'halloween-friday',round:1,secondRoundLink:''},cardsEnabled:true},cards:[],serverNow:'2026-10-30T14:00:00Z',blockedReason:null,prizesGiven:[]};
afterEach(()=>{cleanup();request.mockReset();});
it('shows all three backs, opens only the current server slot, and persists the returned result',async()=>{
 request.mockResolvedValueOnce(state).mockResolvedValueOnce({...state,cards:[{id:'card-1',prize:'ring',prizeLabel:'반지',at:state.serverNow}]});
 render(<OnsiteHalloweenCards userId="self"/>);const first=await screen.findByRole('button',{name:'카드 1 열기'});
 expect((screen.getByRole('button',{name:'카드 2 잠김'}) as HTMLButtonElement).disabled).toBe(true);
 expect((screen.getByRole('button',{name:'카드 3 잠김'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(first);await screen.findByText('🎁 반지');expect(request).toHaveBeenLastCalledWith({action:'draw',eventId:'friday',slot:0});
});
it('does not apply a late draw or retry response to another profile',async()=>{
 let late!:(v:unknown)=>void;request.mockResolvedValueOnce(state).mockImplementationOnce(()=>new Promise(resolve=>{late=resolve;})).mockResolvedValueOnce(state);
 const view=render(<OnsiteHalloweenCards userId="first"/>);fireEvent.click(await screen.findByRole('button',{name:'카드 1 열기'}));
 view.rerender(<OnsiteHalloweenCards userId="second"/>);await waitFor(()=>expect(request).toHaveBeenCalledTimes(3));
 await act(async()=>late({...state,cards:[{id:'private-first',prize:'ring',prizeLabel:'이전 사람 상품'}]}));expect(screen.queryByText(/이전 사람 상품/)).toBeNull();
});
