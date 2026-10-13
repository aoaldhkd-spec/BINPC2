import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
const routes = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../routes/db.ts'), 'utf8');

describe('Push device registration persisted before ack', () => {
  it('waits for PostgreSQL persistence before returning ok to mobile phone', () => {
    const fragment = routes.split("router.post('/push/subscribe',")[1]?.split("router.post('/push/unsubscribe',")[0] ?? '';
    expect(fragment).toContain("await dbPersistRow('push_subscriptions', plan.row)");
    expect(fragment.indexOf('await dbPersistRow')).toBeLessThan(fragment.indexOf('res.json({ ok: true })'));
    expect(fragment).not.toContain("dbPersistRow('push_subscriptions', plan.row).catch");
    expect(fragment).toContain('verifySseToken(userId, token)');
  });

  it('unsubscribes only the token-owned endpoint', () => {
    const fragment = routes.split("router.post('/push/unsubscribe',")[1]?.split('// ─── Push notify endpoint')[0] ?? '';
    expect(fragment).toContain('verifySseToken(userId, token)');
    expect(fragment).toContain('s.user_id === userId && s.endpoint === endpoint');
    expect(fragment).toContain("await dbDeleteRows('push_subscriptions', ids)");
  });
});
