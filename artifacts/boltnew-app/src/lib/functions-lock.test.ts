import { describe, expect, it } from 'vitest';
import { parseFunctionsLocked, planFunctionsLockTransition, SOCIAL_LOCKED_TABS } from './functions-lock';

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


describe('planFunctionsLockTransition', () => {
  it('shows unlock toast on unlock edge', () => {
    const p = planFunctionsLockTransition({
      wasLocked: true,
      nowLocked: false,
      view: 'main',
      mainTab: 'profiles',
      hasFortuneModal: false,
      hasLikeConfirm: false,
      hasContactShare: false,
    });
    expect(p.showUnlockToast).toBe(true);
    expect(p.showKickToast).toBe(false);
  });

  it('kicks chat and social tab on lock edge', () => {
    const p = planFunctionsLockTransition({
      wasLocked: false,
      nowLocked: true,
      view: 'chat',
      mainTab: [...SOCIAL_LOCKED_TABS][0],
      hasFortuneModal: true,
      hasLikeConfirm: true,
      hasContactShare: true,
    });
    expect(p.closeChatOrGroup).toBe(true);
    expect(p.resetMainTabToProfiles).toBe(true);
    expect(p.clearFortune).toBe(true);
    expect(p.clearLikeConfirm).toBe(true);
    expect(p.clearContactShare).toBe(true);
    expect(p.showKickToast).toBe(true);
  });

  it('no-ops when already locked', () => {
    const p = planFunctionsLockTransition({
      wasLocked: true,
      nowLocked: true,
      view: 'chat',
      mainTab: 'my',
      hasFortuneModal: true,
      hasLikeConfirm: false,
      hasContactShare: false,
    });
    expect(p.showKickToast).toBe(false);
    expect(p.closeChatOrGroup).toBe(false);
  });
});
