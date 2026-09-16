/**
 * Pure decisions for participant session-init (post-login profile resolve + share QR gate).
 * Hook owns timers/fetches; App wires setState.
 */
import type { Profile } from '../types/app';
import { findProfileById, isCompleteProfile } from './profile-session';

export const SESSION_INIT_CONTACT_DELAY_MS = 300;
export const SESSION_INIT_MISSING_RETRY_MS = 2000;

export type SessionInitAfterProfilesPlan =
  | { kind: 'empty' }
  | { kind: 'new-reg-complete' }
  | { kind: 'new-reg-incomplete' }
  | { kind: 'missing'; scheduleRetry: true }
  | { kind: 'existing-complete'; me: Profile }
  | { kind: 'existing-incomplete'; me: Profile };

export function planSessionInitAfterProfiles(input: {
  allProfiles: Profile[] | null | undefined;
  currentUserId: string;
  isNewRegistration: boolean;
}): SessionInitAfterProfilesPlan {
  const all = input.allProfiles;
  if (!all || all.length === 0) return { kind: 'empty' };
  if (input.isNewRegistration) {
    const me = findProfileById(all, input.currentUserId);
    return isCompleteProfile(me) ? { kind: 'new-reg-complete' } : { kind: 'new-reg-incomplete' };
  }
  const me = findProfileById(all, input.currentUserId);
  if (!me) return { kind: 'missing', scheduleRetry: true };
  if (isCompleteProfile(me)) return { kind: 'existing-complete', me };
  return { kind: 'existing-incomplete', me };
}

/** Existing complete: do not yank chat/profile/group-chat to main.
 *  loading-main → main is allowed so first paint is not stuck waiting for the boot poll. */
export function shouldForceMainOnExistingComplete(view: string): boolean {
  return view !== 'chat' && view !== 'profile' && view !== 'group-chat';
}

/** Missing-retry complete: do not yank chat/profile/group-chat to main. */
export function shouldForceMainOnMissingRetry(view: string): boolean {
  return view !== 'chat' && view !== 'profile' && view !== 'group-chat';
}

export type SessionInitMissingRetryPlan =
  | { kind: 'enter-main'; me: Profile }
  | { kind: 'recover-cleared' }
  | { kind: 'noop' };

export function planSessionInitMissingRetry(input: {
  retryProfiles: Profile[];
  me: Profile | null | undefined;
}): SessionInitMissingRetryPlan {
  if (input.me && isCompleteProfile(input.me)) {
    return { kind: 'enter-main', me: input.me };
  }
  // Keep the stored identity on a single missing/partial response. The profile
  // may be hidden briefly during a cold start or replica lag; clearing it here
  // made users look logged out after a transient network/DB hiccup.
  return { kind: 'noop' };
}

export function shouldRefreshMissingPin(me: Profile | null | undefined): boolean {
  return Boolean(me && !me.pin_code);
}

export function shouldProcessPendingShare(
  pendingShareId: string | null | undefined,
  currentUserId: string,
): boolean {
  return Boolean(pendingShareId && pendingShareId !== currentUserId);
}

/** Cached deck already has a complete me — enter main without waiting on network. */
export function shouldEnterMainFromCachePlan(
  plan: SessionInitAfterProfilesPlan,
): plan is Extract<SessionInitAfterProfilesPlan, { kind: 'existing-complete' } | { kind: 'new-reg-complete' }> {
  return plan.kind === 'existing-complete' || plan.kind === 'new-reg-complete';
}
