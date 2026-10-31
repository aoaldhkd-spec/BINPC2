import type {HubApplication,HubEvent} from './event-hub';
export type HalloweenCardEvent=Pick<HubEvent,'id'|'title'|'date'|'start'|'end'|'type'|'campaign'|'cardsEnabled'|'theme'|'themeEnabled'>;
export type OnsiteHalloweenState={event:HalloweenCardEvent|null;cards:HubApplication['cards'];serverNow:string;blockedReason:string|null;prizesGiven:string[];candyGivenAt?:string};
