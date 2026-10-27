/** Fail before opening a connection: connection-string query options can override the URL host. */
export function isolatedFixtureDatabase(
  raw: string,
  allowedNames: readonly string[],
): URL {
  const url = new URL(raw);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    !allowedNames.includes(url.pathname.slice(1)) ||
    url.hash ||
    [...url.searchParams].some(
      ([key, value]) => key !== "sslmode" || value !== "disable",
    )
  )
    throw new Error(
      "Refusing a non-local or non-fixture PostgreSQL connection",
    );
  return url;
}
