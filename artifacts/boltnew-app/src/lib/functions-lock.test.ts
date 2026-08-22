import { describe, expect, it } from 'vitest';
import { parseFunctionsLocked } from './functions-lock';

describe('parseFunctionsLocked', () => {
  it('accepts boolean and legacy truthy forms', () => {
    expect(parseFunctionsLocked(true)).toBe(true);
    expect(parseFunctionsLocked(1)).toBe(true);
    expect(parseFunctionsLocked('true')).toBe(true);
    expect(parseFunctionsLocked('1')).toBe(true);
  });

  it('rejects falsey and ambiguous string forms', () => {
    expect(parseFunctionsLocked(false)).toBe(false);
    expect(parseFunctionsLocked(0)).toBe(false);
    expect(parseFunctionsLocked('false')).toBe(false);
    expect(parseFunctionsLocked(null)).toBe(false);
    expect(parseFunctionsLocked(undefined)).toBe(false);
  });
});
