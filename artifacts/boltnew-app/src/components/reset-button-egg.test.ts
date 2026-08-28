import { describe, expect, it } from 'vitest';
import { buildEggReveal } from './ResetButton';
import { koreanAgeFromBirthYear } from '../lib/korean-age';

const kst2026 = new Date('2026-06-01T12:00:00+09:00');

describe('buildEggReveal', () => {
  it('uses fixed receipt title, actual host age, and invoice-style penalty', () => {
    const birthYear = 1997;
    const age = koreanAgeFromBirthYear(birthYear, kst2026);
    expect(age).toBe(30);

    const reveal = buildEggReveal(birthYear);
    expect(reveal.headline).toBe('술번개 공식 영수증');
    expect(reveal.ageGag).toBe('30세');
    expect(reveal.penaltyLine).toBe('높게 말한 값 · +100,000원');
  });

  it('shows exactly one age on the receipt', () => {
    const reveal = buildEggReveal(1997);
    const receiptText = [reveal.headline, reveal.ageGag, reveal.penaltyLine].filter(Boolean).join('\n');
    expect(receiptText.match(/\d+세/g)).toEqual(['30세']);
  });

  it('does not embed a fake wrong age in the penalty line', () => {
    const reveal = buildEggReveal(1997);
    expect(reveal.penaltyLine).not.toMatch(/\d+세/);
  });

  it('omits penalty line when birth year is missing', () => {
    const reveal = buildEggReveal(null);
    expect(reveal.headline).toBe('술번개 공식 영수증');
    expect(reveal.ageGag).toBe('실제 나이는 프로필에 있어요');
    expect(reveal.penaltyLine).toBeNull();
  });
});
