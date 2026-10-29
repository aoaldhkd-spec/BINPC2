import { expect, it } from 'vitest';
import { cardSlotAvailable, halloweenCardTimes } from '../../../../lib/api-zod/src/event-card-clock';
import { eventExpiryAt } from '../../../../lib/api-zod/src/event-hub-modules';
import { campaignPresets } from '../../../../lib/api-zod/src/event-campaign';
import { HubEventInput, type HubEvent } from '../../../../lib/api-zod/src/event-hub';
it.each(['2026-10-30','2026-10-31'])('opens each Halloween slot at KST boundaries, closes drawing at01:00 but keeps17:00 expiry: %s', date => {
  const e = { ...HubEventInput.parse(campaignPresets().find(p=>p.key===`halloween-${date}`)!.event),id:'clock',revision:1,history:[],recruitment:true,nextRank:0 } as HubEvent;
  for (const [i,at] of halloweenCardTimes(e).entries()) {
    expect(cardSlotAvailable(e,i,new Date(at-1))).toBe(false);
    expect(cardSlotAvailable(e,i,new Date(at))).toBe(true);
    expect(cardSlotAvailable(e,i,new Date(at+1))).toBe(true);
  }
  const midnight=Date.parse(date+'T00:00:00+09:00');
  expect(cardSlotAvailable(e,0,new Date(midnight+24.2*3600000))).toBe(true);
  expect(cardSlotAvailable(e,1,new Date(midnight+24.2*3600000))).toBe(true);
  expect(cardSlotAvailable(e,2,new Date(midnight+24.2*3600000))).toBe(false);
  expect(cardSlotAvailable(e,2,new Date(midnight+25*3600000-1))).toBe(true);
  expect(cardSlotAvailable(e,2,new Date(midnight+25*3600000))).toBe(false);
  expect(eventExpiryAt(e)).toBe(midnight+41*3600000);
});
