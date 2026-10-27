// Run: node --experimental-strip-types --test verify-event-hub-campaign-policy.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HALLOWEEN_STOCK, HALLOWEEN_DAILY_ALLOCATION, allocatedGiftCount,
  verifyHalloweenAllocation, canUseHalloweenDraw, TOUR_WEEKS,
  tourSignupRoute, tourSessionHours, canUseTourNostalgiaDraw,
  calculateTourSettlement, isApplicationComplete, canProceedWithEvent,
  resolveThemeKey, AGE_POLICY_2026, TOUR_RULES,
  PUBLIC_PARTICIPATION_NOTICE,
} from './event-hub-campaign-policy.ts';

test('gift quantity by SKU totals 72; rings split 15/25; two dates sum to inventory', () => {
  assert.deepEqual(HALLOWEEN_STOCK, { led_ring:40, halloween_keychain:24, led_band:2, led_necklace:6 });
  assert.deepEqual(HALLOWEEN_DAILY_ALLOCATION['2026-10-30'], { led_ring:15, halloween_keychain:5, led_band:1, led_necklace:1 });
  assert.deepEqual(HALLOWEEN_DAILY_ALLOCATION['2026-10-31'], { led_ring:25, halloween_keychain:19, led_band:1, led_necklace:5 });
  assert.equal(allocatedGiftCount('2026-10-30'),22);
  assert.equal(allocatedGiftCount('2026-10-31'),50);
  assert.equal(verifyHalloweenAllocation(),true);
  assert.equal(Object.values(HALLOWEEN_STOCK).reduce((n,c)=>n+c,0),72);
  assert.equal(Object.keys(HALLOWEEN_STOCK).includes('projector'),false);
});

test('halloween: three draw max, only checked in and confirmed and approved', () => {
  const input={eventDate:'2026-10-30',paidOrAdminWaived:true,participantConfirmed:true,checkedIn:true,alreadyUsedDraws:2};
  assert.equal(canUseHalloweenDraw(input),true);
  assert.equal(canUseHalloweenDraw({...input,alreadyUsedDraws:3}),false);
  assert.equal(canUseHalloweenDraw({...input,alreadyUsedDraws:-1}),false);
  assert.equal(canUseHalloweenDraw({...input,checkedIn:false}),false);
  assert.equal(canUseHalloweenDraw({...input,paidOrAdminWaived:false}),false);
  assert.equal(canUseHalloweenDraw({...input,participantConfirmed:false}),false);
  assert.equal(canUseHalloweenDraw({...input,eventDate:'2026-11-06'}),false);
});

test('tour dates: each 4-day city has round 2 open chat, rounds 1 and 3 BINPC2', () => {
  assert.equal(TOUR_WEEKS.length,4);
  for(const w of TOUR_WEEKS){
    let iso=w.start;
    for(let i=0;i<4;i++){
      assert.equal(tourSignupRoute(iso,1),'binpc2',iso);
      assert.equal(tourSignupRoute(iso,2),'open_chat',iso);
      assert.equal(tourSignupRoute(iso,3),'binpc2',iso);
      const date=new Date(iso+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+1);iso=date.toISOString().slice(0,10);
    }
  }
  assert.equal(tourSignupRoute('2026-12-03',1),null); // Daegu unconfirmed
  assert.equal(tourSignupRoute('2026-10-30',1),null);
  assert.equal(tourSignupRoute('2026-11-31',1),null);
});

test('tour session: Thursday and Sunday earlier, Friday and Saturday later', () => {
  assert.deepEqual(tourSessionHours('2026-11-05'),{first:{start:'21:00',end:'23:30'},second:{start:'23:30',end:'01:30'},third:{start:'01:30',end:null}});
  assert.deepEqual(tourSessionHours('2026-11-06'),{first:{start:'22:00',end:'00:30'},second:{start:'00:30',end:'02:30'},third:{start:'02:30',end:null}});
  assert.deepEqual(tourSessionHours('2026-11-07'),tourSessionHours('2026-11-06'));
  assert.deepEqual(tourSessionHours('2026-11-08'),tourSessionHours('2026-11-05'));
});

test('nostalgia: first ten BINPC2 confirmed Fri/Sat, two draws per person', () => {
  const x={eventDate:'2026-11-06',round:1,dateWideConfirmedPriorityRank:10,depositApproved:true,participantConfirmed:true,checkedIn:true,alreadyUsedDraws:1};
  assert.equal(canUseTourNostalgiaDraw(x),true);
  assert.equal(canUseTourNostalgiaDraw({...x,round:3}),true);
  assert.equal(canUseTourNostalgiaDraw({...x,dateWideConfirmedPriorityRank:11}),false);
  assert.equal(canUseTourNostalgiaDraw({...x,dateWideConfirmedPriorityRank:0}),false);
  assert.equal(canUseTourNostalgiaDraw({...x,alreadyUsedDraws:2}),false);
  assert.equal(canUseTourNostalgiaDraw({...x,alreadyUsedDraws:-2}),false);
  assert.equal(canUseTourNostalgiaDraw({...x,round:2}),false);
  assert.equal(canUseTourNostalgiaDraw({...x,eventDate:'2026-11-05'}),false);
  assert.equal(canUseTourNostalgiaDraw({...x,eventDate:'2026-11-08'}),false);
  assert.equal(canUseTourNostalgiaDraw({...x,depositApproved:false}),false);
  assert.equal(canUseTourNostalgiaDraw({...x,participantConfirmed:false}),false);
  assert.equal(canUseTourNostalgiaDraw({...x,checkedIn:false}),false);
});

test('all tour weeks guarantee 8 Fri/Sat dates and max 160 draw tickets total (10x2x8)',()=>{
  const count=TOUR_WEEKS.reduce((total,week)=>{
    let cur=new Date(week.start+'T00:00:00Z'), end=new Date(week.end+'T00:00:00Z');
    while(cur<=end){if([5,6].includes(cur.getUTCDay()))total++;cur.setUTCDate(cur.getUTCDate()+1)}return total;
  },0);
  assert.equal(count,8);
  assert.equal(count*TOUR_RULES.nostalgiaFirstNConfirmedApplicantsPerDate*TOUR_RULES.nostalgiaDrawLimitPerEligiblePersonPerDate,160);
});

test('draft and deposit report do not mark application complete',()=>{
  for(const state of ['draft','form_submitted','deposit_reported','deposit_verified','verified_waitlist','cancelled'])assert.equal(isApplicationComplete(state),false,state);
  assert.equal(isApplicationComplete('confirmed'),true);
  assert.equal(canProceedWithEvent(4),false);
  assert.equal(canProceedWithEvent(5),true);
});

test('tour settlement additional payment, flag excess as operator review instead of erasing',()=>{
  assert.deepEqual(calculateTourSettlement({sharedRoundTotalKrw:200000,confirmedRoundParticipants:10,advanceDepositKrw:10000}),{individualShareKrw:20000,additionalPaymentKrw:10000,operatorReviewExcessKrw:0});
  assert.deepEqual(calculateTourSettlement({sharedRoundTotalKrw:30000,confirmedRoundParticipants:10,advanceDepositKrw:10000}),{individualShareKrw:3000,additionalPaymentKrw:0,operatorReviewExcessKrw:7000});
  assert.equal(calculateTourSettlement({sharedRoundTotalKrw:1000,confirmedRoundParticipants:0,advanceDepositKrw:10000}),null);
});

test('theme switch is preset driven; unknown key safely defaults',()=>{
  assert.equal(resolveThemeKey('halloween'),'halloween');
  assert.equal(resolveThemeKey('halloween','default'),'default');
  assert.equal(resolveThemeKey('tour'),'default');
  assert.equal(resolveThemeKey('tour','halloween'),'halloween');
  assert.equal(resolveThemeKey('tour','untrusted'),'default');
  assert.equal(AGE_POLICY_2026.minBirthYear,1991);
  assert.equal(AGE_POLICY_2026.maxBirthYear,2007);
  assert.match(PUBLIC_PARTICIPATION_NOTICE,/인원질문, 간보기/);
});
