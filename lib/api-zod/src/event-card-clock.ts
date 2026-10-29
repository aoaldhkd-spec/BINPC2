import type { HubEvent } from './event-hub';
import { eventEndAt } from './event-hub-modules';

/** Admission, card opening, and 17:00 profile/theme expiry are separate clocks. */
export function halloweenCardTimes(event: Pick<HubEvent, 'type' | 'date'>): number[] {
  if (event.type !== 'halloween') return [];
  const midnight = Date.parse(`${event.date}T00:00:00+09:00`);
  return [23, 24, 24.5].map(hour => midnight + hour * 3600000);
}
export function cardSlotAvailable(event: HubEvent, used: number, now: Date): boolean {
  const end = eventEndAt(event);
  if (!Number.isFinite(end) || now.getTime() >= end) return false;
  const slots = halloweenCardTimes(event);
  return event.type !== 'halloween' || (used < slots.length && now.getTime() >= slots[used]);
}
