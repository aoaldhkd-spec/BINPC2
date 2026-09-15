/**
 * Admin/test panel session token HMAC — extracted from routes/db.ts.
 * Pure derive; verify* stays in db.ts (needs getTable + panel secrets).
 */
import { createHmac } from 'node:crypto';

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
