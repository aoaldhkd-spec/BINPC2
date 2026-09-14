/**
 * Badge / count helpers for received hearts awaiting action.
 */
import type { HeartType } from './constants';

export function isPendingReceivedHeart(input: {
  likerId: string;
  heartType: HeartType | string | undefined;
  acknowledgedComplimentIds: ReadonlySet<string>;
  contactSharedWithIds: ReadonlySet<string>;
}): boolean {
  const ht = input.heartType ?? 'red';
  if (ht === 'green') return !input.acknowledgedComplimentIds.has(input.likerId);
  return !input.contactSharedWithIds.has(input.likerId);
}

export function countPendingHearts(
  receivedLikers: ReadonlyArray<{ id: string }>,
  receivedHeartTypes: ReadonlyMap<string, HeartType | string>,
  acknowledgedComplimentIds: ReadonlySet<string>,
  contactSharedWithIds: ReadonlySet<string>,
): number {
  let n = 0;
  for (const l of receivedLikers) {
    if (isPendingReceivedHeart({
      likerId: l.id,
      heartType: receivedHeartTypes.get(l.id),
      acknowledgedComplimentIds,
      contactSharedWithIds,
    })) n += 1;
  }
  return n;
}
