export function readHubBrowserValue(
  scope: "local" | "session",
  key: string,
): string | null {
  try {
    return (scope === "local" ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}
export function writeHubBrowserValue(
  scope: "local" | "session",
  key: string,
  value: string | null,
): boolean {
  try {
    const storage = scope === "local" ? localStorage : sessionStorage;
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
/** Probe before admission commits, so a blocked store cannot leave a half-bound onsite identity. */
export function canStoreHubOnsiteIdentity(): boolean {
  const key = `binpc2_hub_probe_${crypto.randomUUID()}`;
  try {
    for (const scope of ["local", "session"] as const) {
      if (!writeHubBrowserValue(scope, key, "1")) return false;
      if (readHubBrowserValue(scope, key) !== "1") return false;
    }
    return true;
  } finally {
    writeHubBrowserValue("local", key, null);
    writeHubBrowserValue("session", key, null);
  }
}
