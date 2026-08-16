import { describe, expect, it } from 'vitest';
import {
  clampNicknameInput,
  countGraphemes,
  isHangulJamoGrapheme,
  isNicknameLengthValid,
  nicknameCompositionAllowed,
  shouldBlockNicknameBeforeInput,
} from './nickname-input';

describe('clampNicknameInput — Hangul IME 6th syllable', () => {
  it('keeps 중성 jamo of the 6th syllable while composing', () => {
    const prev = '서울고수안ㅎ';
    const incoming = '서울고수안ㅎㅏ';
    expect(countGraphemes(prev)).toBe(6);
    expect(isHangulJamoGrapheme('ㅎ')).toBe(true);
    expect(isHangulJamoGrapheme('ㅏ')).toBe(true);
    expect(
      clampNicknameInput(incoming, { isComposing: true, previous: prev, allowFinishSyllable: true }),
    ).toBe(incoming);
  });

  it('keeps 종성 jamo of the 6th syllable after 초성+중성 already fill 6 slots', () => {
    const prev = '서울고수안하';
    const incoming = '서울고수안하ㄴ';
    expect(countGraphemes(prev)).toBe(6);
    expect(
      clampNicknameInput(incoming, {
        isComposing: true,
        previous: prev,
        allowFinishSyllable: true,
      }),
    ).toBe(incoming);
  });

  it('keeps the finished 6th syllable after composition ends', () => {
    expect(
      clampNicknameInput('서울고수안한', { isComposing: false, previous: '서울고수안하ㄴ' }),
    ).toBe('서울고수안한');
    expect(countGraphemes('서울고수안한')).toBe(6);
  });

  it('allows trailing jamo on the 6th slot even without isComposing (Android IME)', () => {
    expect(clampNicknameInput('서울고수안ㅎㅏ', { isComposing: false, previous: '서울고수안ㅎ' })).toBe(
      '서울고수안ㅎㅏ',
    );
  });

  it('blocks a 7th character after 6 complete syllables', () => {
    expect(
      clampNicknameInput('서울고수안한ㄱ', {
        isComposing: true,
        previous: '서울고수안한',
        allowFinishSyllable: true,
      }),
    ).toBe('서울고수안한');
    expect(
      clampNicknameInput('서울고수안한ㄱ', { isComposing: false, previous: '서울고수안한' }),
    ).toBe('서울고수안한');
    expect(
      clampNicknameInput('서울고수안한ㄱ', {
        isComposing: true,
        previous: '서울고수안한',
        allowFinishSyllable: false,
      }),
    ).toBe('서울고수안한');
  });

  it('does not slice Latin/number input until after 6 graphemes', () => {
    expect(clampNicknameInput('abc123', { isComposing: false })).toBe('abc123');
    expect(clampNicknameInput('abc1234', { isComposing: false })).toBe('abc123');
  });

  it('counts emoji as graphemes and blocks the 7th', () => {
    const six = '😀😁😂🤣😃😄';
    expect(countGraphemes(six)).toBe(6);
    expect(clampNicknameInput(six + '😅', { isComposing: false, previous: six })).toBe(six);
  });
});

describe('nickname length validation', () => {
  it('requires 2~6 completed graphemes', () => {
    expect(isNicknameLengthValid('가')).toBe(false);
    expect(isNicknameLengthValid('가나')).toBe(true);
    expect(isNicknameLengthValid('서울고수안한')).toBe(true);
    expect(isNicknameLengthValid('서울고수안한글')).toBe(false);
  });
});

describe('shouldBlockNicknameBeforeInput / composition start', () => {
  it('allows a new composition when under 6 or the 6th is still jamo', () => {
    expect(nicknameCompositionAllowed('서울고수안')).toBe(true);
    expect(nicknameCompositionAllowed('서울고수안ㅎ')).toBe(true);
    expect(shouldBlockNicknameBeforeInput('서울고수안ㅎ')).toBe(false);
  });

  it('blocks further input once 6 syllables are complete', () => {
    expect(nicknameCompositionAllowed('서울고수안한')).toBe(false);
    expect(shouldBlockNicknameBeforeInput('서울고수안한')).toBe(true);
  });

  it('does not beforeinput-block while finishing the 6th syllable', () => {
    expect(shouldBlockNicknameBeforeInput('서울고수안하', 6, true)).toBe(false);
  });
});
