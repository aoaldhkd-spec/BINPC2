import { effectiveHalloweenHours } from "./event-policy-halloween";
import { eventCycleMilestones } from "./event-cycle-clock";
import type { HubEvent, HubSettings } from "./event-hub";
export const DEFAULT_CAMPAIGN_MODULES = { halloweenDraw: true, tourDraw: true };
export function eventEndAt(
  e: Pick<HubEvent, "date" | "start" | "end"> & Partial<Pick<HubEvent,"type"|"campaign">>,
): number {
  const hours=effectiveHalloweenHours(e);
  return (
    Date.parse(`${e.date}T${hours.end}:00+09:00`) +
    (hours.end <= hours.start ? 86400000 : 0)
  );
}
export function eventEnded(
  e: Pick<HubEvent, "date" | "start" | "end">,
  now: Date,
) {
  const end = eventEndAt(e);
  return !Number.isFinite(end) || now.getTime() >= end;
}
/** Halloween theme/cards last until the same existing next 17:00 cycle reset.
 * Admission and recruitment still use eventEnded (01:00).
 */
export function eventExpiryAt(e: Pick<HubEvent, "date" | "start" | "end" | "type">) {
  if (e.type === "halloween") {
    return eventCycleMilestones(`${e.date}T${e.start}:00+09:00`)?.resetAt.getTime() ?? NaN;
  }
  return eventEndAt(e);
}
export function eventExpired(e: Pick<HubEvent, "date" | "start" | "end" | "type">, now: Date) {
  const end = eventExpiryAt(e);
  return !Number.isFinite(end) || now.getTime() >= end;
}
export function effectiveEventTheme(
  e: Pick<
    HubEvent,
    "date" | "start" | "end" | "theme" | "themeEnabled" | "type"
  >,
  now: Date = new Date(),
) {
  return e.themeEnabled &&
    !(e.theme === "halloween" && e.type !== "halloween") &&
    !eventExpired(e, now)
    ? (e.theme ?? "default")
    : "default";
}
export function drawModuleEnabled(
  e: Pick<HubEvent, "campaign" | "cardsEnabled" | "type">,
  settings: Pick<HubSettings, "campaignModules">,
) {
  if (!e.cardsEnabled) return false;
  if (!e.campaign)
    return e.type === "tour"
      ? false
      : e.type === "halloween"
        ? (settings.campaignModules?.halloweenDraw ?? true)
        : true;
  return e.campaign.kind === "tour"
    ? (settings.campaignModules?.tourDraw ?? true)
    : (settings.campaignModules?.halloweenDraw ?? true);
}

export const EVENT_THEME_PRESETS = {
  default: { background: "#f0fdfa", color: "#0f172a", border: "#99f6e4" },
  halloween: { background: "#251034", color: "#fed7aa", border: "#f28d36" },
  christmas: { background: "#12372a", color: "#fef3c7", border: "#e11d48" },
  yearend: { background: "#172554", color: "#fef9c3", border: "#eab308" },
} as const;
