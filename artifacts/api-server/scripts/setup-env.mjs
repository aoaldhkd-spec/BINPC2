import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import webpush from 'web-push';

const envPath = new URL('../.env', import.meta.url);
const existing = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';

function currentValue(name) {
  const match = existing.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return match?.[1]?.trim() ?? '';
}

const vapid = webpush.generateVAPIDKeys();
const values = {
  DATABASE_URL: currentValue('DATABASE_URL'),
  SESSION_SECRET: currentValue('SESSION_SECRET') || randomBytes(48).toString('base64url'),
  PORT: currentValue('PORT') || '8080',
  VAPID_PUBLIC_KEY: currentValue('VAPID_PUBLIC_KEY') || vapid.publicKey,
  VAPID_PRIVATE_KEY: currentValue('VAPID_PRIVATE_KEY') || vapid.privateKey,
};

writeFileSync(
  envPath,
  Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n',
  { encoding: 'utf8', mode: 0o600 },
);

console.log(values.DATABASE_URL
  ? 'Local environment file is ready.'
  : 'Local secrets generated. Add DATABASE_URL to artifacts/api-server/.env.');
