/** Event-hub buckets use only PG-session-authenticated identity, never a caller-supplied ID. */
export function eventHubRateIdentity(
  namespace: string,
  session?: { hubOwner?: string; userId?: string },
): string | undefined {
  if (!namespace.startsWith("hub-")) return undefined;
  return session?.hubOwner
    ? `hub:${session.hubOwner}`
    : session?.userId
      ? `profile:${session.userId}`
      : "";
}
