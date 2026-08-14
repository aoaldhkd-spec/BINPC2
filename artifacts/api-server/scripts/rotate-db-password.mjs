import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ENV_PATH = resolve(ROOT, '.env');
const OUT_PATH = resolve(ROOT, '.security-credentials.txt');

const envText = readFileSync(ENV_PATH, 'utf8');
const oldUrl = envText.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!oldUrl) throw new Error('DATABASE_URL missing');

const userMatch = oldUrl.match(/postgresql:\/\/([^:]+):/);
const user = userMatch?.[1] ?? 'postgres.dlliqqlqdtdkfakdtwyw';
const poolerHost = oldUrl.match(/@([^/]+)\//)?.[1] ?? 'aws-0-ap-northeast-2.pooler.supabase.com:5432';
const projectRef = user.includes('.') ? user.split('.')[1] : 'dlliqqlqdtdkfakdtwyw';
const hosts = [`db.${projectRef}.supabase.co:5432`, poolerHost];

const newPw = randomBytes(24).toString('base64url');
let altered = false;
for (const host of hosts) {
  const connUrl = oldUrl.replace(/@[^/]+/, `@${host}`);
  const client = new pg.Client({ connectionString: connUrl, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    await client.query(`ALTER USER postgres WITH PASSWORD '${newPw.replace(/'/g, "''")}'`);
    console.log(`[db] ALTER USER ok via ${host}`);
    altered = true;
    break;
  } catch (e) {
    console.log(`[db] ${host}: ${e.message}`);
  } finally {
    await client.end().catch(() => {});
  }
}
if (!altered) throw new Error('Could not ALTER USER — reset in Supabase Dashboard or set SUPABASE_ACCESS_TOKEN');

const newUrl = `postgresql://${user}:${encodeURIComponent(newPw)}@${poolerHost}/postgres`;
for (let i = 0; i < 8; i++) {
  const v = new pg.Client({ connectionString: newUrl, ssl: { rejectUnauthorized: false } });
  try {
    await v.connect();
    await v.query('SELECT 1');
    await v.end();
    console.log('[db] verify ok');
    break;
  } catch (e) {
    await v.end().catch(() => {});
    if (i === 7) throw e;
    console.log(`[db] verify retry ${i + 1}/8`);
    await new Promise((r) => setTimeout(r, 8000));
  }
}

writeFileSync(ENV_PATH, envText.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${newUrl}`), 'utf8');
appendFileSync(OUT_PATH, `\n--- DB password ${new Date().toISOString()} ---\nDB password: ${newPw}\nDATABASE_URL updated in local .env\n`, 'utf8');
console.log('[db] local .env updated');
