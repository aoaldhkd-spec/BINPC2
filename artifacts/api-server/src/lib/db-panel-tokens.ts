/**
 * Admin/test panel session token HMAC — extracted from routes/db.ts.
 * Pure derive + timing-safe verify against secret list; getTable stays in db.ts.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

function sessionSecret(): string {
  return process.env.SESSION_SECRET ?? 'fallback-secret';
}

export function deriveAdminToken(adminPassword: string): string {
  const secret = sessionSecret() + adminPassword;
  return createHmac('sha256', secret).update('admin-session').digest('hex');
}

export function deriveTestToken(testPassword: string): string {
  const secret = sessionSecret() + testPassword;
  return createHmac('sha256', secret).update('test-session').digest('hex');
}

/** Timing-safe hex compare of provided token against any derived secret. */
export function verifyPanelTokenAgainstSecrets(
  provided: string | null | undefined,
  secrets: string[],
  derive: (secret: string) => string,
): boolean {
  if (!provided || typeof provided !== 'string' || !secrets.length) return false;
  return secrets.some((s) => {
    const expected = derive(s);
    try {
      return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  });
}

export function verifyAdminPanelToken(
  provided: string | null | undefined,
  secrets: string[],
): boolean {
  return verifyPanelTokenAgainstSecrets(provided, secrets, deriveAdminToken);
}

export function verifyTestPanelToken(
  provided: string | null | undefined,
  secrets: string[],
): boolean {
  return verifyPanelTokenAgainstSecrets(provided, secrets, deriveTestToken);
}

export type ClearDbErrorsReject = { status: number; body: { ok: false; error: string } };

export function clearDbErrorsInvalidBodyReject(): ClearDbErrorsReject {
  return { status: 400, body: { ok: false, error: 'Request body must be a JSON object' } };
}

/**
 * /admin/clear-db-errors — accept admin HMAC token OR plaintext password match.
 */
export function planClearDbErrorsAuth(input: {
  tokenOk: boolean;
  adminPassword: unknown;
  expectedPassword: string;
}): { ok: true } | { ok: false; reject: ClearDbErrorsReject } {
  const passwordOk =
    typeof input.adminPassword === 'string'
    && !!input.expectedPassword
    && input.adminPassword === input.expectedPassword;
  if (!input.tokenOk && !passwordOk) {
    return {
      ok: false,
      reject: { status: 403, body: { ok: false, error: 'Admin authentication required' } },
    };
  }
  return { ok: true };
}

export function clearDbErrorsInternalReject(): ClearDbErrorsReject {
  return { status: 500, body: { ok: false, error: 'Internal server error' } };
}

