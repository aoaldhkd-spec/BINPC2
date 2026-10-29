import { AsyncLocalStorage } from 'node:async_hooks';
// Set only after the full-site gate verifies the durable owner login grant.
// Never derive this capability from JSON, query parameters, IP or admin headers.
const access = new AsyncLocalStorage<boolean>();
export const withVerifiedBossParticipation = <T>(next: () => T): T => access.run(true, next);
export const bossParticipationAllowed = () => access.getStore() === true;
