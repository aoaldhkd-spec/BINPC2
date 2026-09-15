/**
 * Panel password / secret matching — extracted from routes/db.ts (behavior unchanged).
 * Factory defaults are rejected in production NODE_ENV.
 */
export const PANEL_DEFAULT_PASSWORD = '116606';
export const LEGACY_PANEL_PASSWORDS = ['166606', PANEL_DEFAULT_PASSWORD] as const;

export function collectSecrets(...vals: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const v of vals) {
    const s = (v ?? '').trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

export function isDefaultPanelPassword(pw: string): boolean {
  const s = pw.trim();
  return !s || LEGACY_PANEL_PASSWORDS.some(l => l === s);
}

export function secretMatches(provided: string, secrets: string[]): boolean {
  const p = provided.trim();
  return p.length > 0 && secrets.some(s => s === p);
}

/**
 * Factory credentials are convenient only for local/test bootstrap. Render runs
 * with NODE_ENV=production, where accepting a password published in this
 * repository would make every panel operation publicly accessible.
 */
export function panelSecretsForRuntime(...configured: Array<string | null | undefined>): string[] {
  const secrets = collectSecrets(...configured);
  if (process.env.NODE_ENV !== 'production') {
    return collectSecrets(...secrets, PANEL_DEFAULT_PASSWORD, ...LEGACY_PANEL_PASSWORDS);
  }
  return secrets.filter(secret => !isDefaultPanelPassword(secret));
}

export function panelAdminSecrets(dbAdmin?: string | null): string[] {
  return panelSecretsForRuntime(
    dbAdmin ?? '',
    process.env.BOOTSTRAP_ADMIN_PASSWORD,
  );
}

export function panelTestSecrets(dbTest?: string | null): string[] {
  return panelSecretsForRuntime(
    dbTest ?? '',
    process.env.BOOTSTRAP_TEST_PASSWORD,
  );
}
