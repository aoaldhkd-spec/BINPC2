import { describe,it,expect,beforeEach,afterEach,vi } from 'vitest';
import { readProfileSetupDraft,saveProfileSetupDraft } from './profile-setup-draft';
import { ls } from './storage';
import { MATCHING_DRAFT_KEY,MATCHING_LAST_RESET_KEY } from './constants';
beforeEach(()=>{ls.removeItem(MATCHING_DRAFT_KEY);ls.removeItem(MATCHING_LAST_RESET_KEY);});
afterEach(()=>vi.useRealTimers());
describe('unfinished profile recovery',()=>{
  it('preserves steps and entered values while excluding passwords, PIN and consent grants',()=>{
    saveProfileSetupDraft({nickname:'초안',mbti:'INTJ',birthYear:1995,location:'부산',interests:['영화','음악'],lastStep:4});
    const recovered=readProfileSetupDraft();
    expect(recovered.nickname).toBe('초안');expect(recovered.lastStep).toBe(4);
    expect(recovered).not.toHaveProperty('privacyConsent');expect(recovered).not.toHaveProperty('password');
  });
  it('does not resurrect a draft after the genuine reset or its local retention window',()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-30T13:00:00Z'));
    saveProfileSetupDraft({nickname:'초안',lastStep:3});
    ls.setItem(MATCHING_LAST_RESET_KEY,'new-cycle');expect(readProfileSetupDraft()).toEqual({});
    ls.removeItem(MATCHING_LAST_RESET_KEY);vi.advanceTimersByTime(86400001);expect(readProfileSetupDraft()).toEqual({});
  });
});
