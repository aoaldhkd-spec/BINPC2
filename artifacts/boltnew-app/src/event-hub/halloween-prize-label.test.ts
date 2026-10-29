import { expect, it } from 'vitest';
import { halloweenPrizeLabel, HALLOWEEN_STOCK } from '../../../../lib/api-zod/src/event-policy-halloween';
it('displays historical glow-band records without changing their IDs, inventory or delivery history', () => {
  const stock = { id: 'old-band-stock', label: 'LED 밴드', remaining: 1 };
  const card = { id: 'old-card', prize: stock.id, prizeLabel: stock.label, given: true };
  const before = JSON.stringify({ stock, card, inventory: HALLOWEEN_STOCK });
  expect(halloweenPrizeLabel(stock.label)).toBe('야광밴드');
  expect(halloweenPrizeLabel(card.prizeLabel)).toBe('야광밴드');
  expect(halloweenPrizeLabel('할로윈 키링')).toBe('할로윈 키링');
  expect(Object.values(HALLOWEEN_STOCK['2026-10-30']).reduce((a,b)=>a+b,0)).toBe(23);
  expect(Object.values(HALLOWEEN_STOCK['2026-10-31']).reduce((a,b)=>a+b,0)).toBe(49);
  expect(JSON.stringify({ stock, card, inventory: HALLOWEEN_STOCK })).toBe(before);
});
