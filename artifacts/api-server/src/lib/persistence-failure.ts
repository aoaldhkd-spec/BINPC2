/** Classify infrastructure failures without copying DB details, queries or credentials. */
export function persistenceFailureCode(error: unknown): string {
  const e = error as { code?: unknown; message?: unknown };
  if (e?.code === "55P03") return "DB_LOCK_TIMEOUT";
  if (e?.code === "40P01") return "DB_DEADLOCK";
  if (e?.code === "53300") return "DB_CONNECTION_LIMIT";
  if (e?.code === "57P01" || e?.code === "57P02" || e?.code === "57P03")
    return "DB_RESTARTING";
  if (
    typeof e?.message === "string" &&
    /timeout exceeded when trying to connect|connection terminated due to connection timeout/i.test(
      e.message,
    )
  )
    return "POOL_CONNECTION_TIMEOUT";
  return typeof e?.code === "string" && /^[A-Z0-9_]{2,40}$/.test(e.code)
    ? e.code
    : "UNKNOWN";
}
