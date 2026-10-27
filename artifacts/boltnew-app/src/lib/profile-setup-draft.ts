import { ls } from './storage';
import { MATCHING_DRAFT_KEY, MATCHING_LAST_RESET_KEY } from './constants';
import type { NicknameSetupInput } from './nickname-registration';
export type ProfileSetupDraft = Partial<NicknameSetupInput> & {lastStep?: number; pushDecision?: 'enable'|'skip'};
export function readProfileSetupDraft(): ProfileSetupDraft {
  try {
    const row = JSON.parse(ls.getItem(MATCHING_DRAFT_KEY) ?? 'null');
    if (!row || row.version !== 1 || row.reset !== ls.getItem(MATCHING_LAST_RESET_KEY)
      || Date.now() - row.savedAt > 86400000 || row.savedAt > Date.now()) return {};
    const data = row.data;
    if (!data || typeof data !== 'object') return {};
    // Only editable profile fields. Never store account/PIN/session or bank credentials here.
    return {
      nickname: typeof data.nickname === 'string' ? data.nickname.slice(0,30) : undefined,
      mbti: typeof data.mbti === 'string' ? data.mbti.slice(0,4) : undefined,
      birthYear: Number.isInteger(data.birthYear) ? data.birthYear : undefined,
      location: typeof data.location === 'string' ? data.location.slice(0,40) : undefined,
      interests: Array.isArray(data.interests) ? data.interests.filter((v: unknown) => typeof v === 'string').slice(0,20) : [],
      personalityScore: typeof data.personalityScore === 'number' ? data.personalityScore : undefined,
      idealMsg: typeof data.idealMsg === 'string' ? data.idealMsg.slice(0,500) : undefined,
      featureMsg: typeof data.featureMsg === 'string' ? data.featureMsg.slice(0,500) : undefined,
      lastStep: Math.max(1, Math.min(6, Number(data.lastStep) || 1)),
      // Consent/notification choices must be confirmed again after reload.
    };
  } catch { return {}; }
}
export function saveProfileSetupDraft(data: ProfileSetupDraft): void {
  const {nickname,mbti,birthYear,location,interests,personalityScore,idealMsg,featureMsg,lastStep} = data;
  ls.setItem(MATCHING_DRAFT_KEY, JSON.stringify({
    version: 1, savedAt: Date.now(), reset: ls.getItem(MATCHING_LAST_RESET_KEY),
    data: {nickname,mbti,birthYear,location,interests,personalityScore,idealMsg,featureMsg,lastStep},
  }));
}

export function preserveDraftForEarlierReset(serverReset:string):boolean {
 try {
  const row=JSON.parse(ls.getItem(MATCHING_DRAFT_KEY)??"null");
  if (!row || !Number.isFinite(Date.parse(serverReset)) || row.savedAt<=Date.parse(serverReset)) return false;
  row.reset=serverReset;ls.setItem(MATCHING_DRAFT_KEY,JSON.stringify(row));return true;
 }catch{return false;}
}
