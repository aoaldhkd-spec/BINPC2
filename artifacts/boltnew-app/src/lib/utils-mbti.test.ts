import { describe, expect, it } from 'vitest';
import { getMbtiStyle } from './utils';

describe('getMbtiStyle temperament groups', () => {
  it('uses the 4th letter for SJ vs SP (not T/F)', () => {
    const sj = getMbtiStyle('ISTJ');
    const sp = getMbtiStyle('ISTP');
    expect(sj.color).toBe('#b45309');
    expect(sp.color).toBe('#0e7490');
    expect(sj.color).not.toBe(sp.color);
    expect(getMbtiStyle('ESFJ').color).toBe(sj.color);
    expect(getMbtiStyle('ESFP').color).toBe(sp.color);
  });

  it('keeps NT vs NF on the T/F letter', () => {
    expect(getMbtiStyle('INTJ').color).toBe('#7c3aed');
    expect(getMbtiStyle('INFJ').color).toBe('#be185d');
  });
});
