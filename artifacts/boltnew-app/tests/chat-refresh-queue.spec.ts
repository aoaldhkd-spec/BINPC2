import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Must match chat-pending-queue.ts — inlined so Playwright needs no TS path alias. */
const PENDING_QUEUE_KEY = 'chat_pending_queue_v1';

const BLANK_FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'blank.html');
const FIXTURE_URL = `file:///${BLANK_FIXTURE.replace(/\\/g, '/')}`;
interface PendingMsg {
  chatId: string;
  content: string;
  clientId: string;
  optimisticId: string;
  userId: string;
}

/**
 * P5 — browser-level offline queue persistence (refresh mid-flow).
 *
 * Local-only: no production hosts. Vitest covers flush logic; this confirms
 * real browser localStorage survives reload (Safari private mode excluded).
 *
 * Not wired to CI verify.yml — run manually:
 *   pnpm --filter @workspace/boltnew-app test:playwright-local
 */

const sampleQueue: PendingMsg[] = [{
  chatId: 'chat-playwright-1',
  content: 'queued after disconnect',
  clientId: 'client-pw-1',
  optimisticId: '__opt_client-pw-1',
  userId: 'user-playwright',
}];

test.describe('chat refresh queue (local)', () => {
  test('pending queue survives page reload in browser storage', async ({ page }) => {    await page.goto(FIXTURE_URL);
    await page.evaluate(([key, queue]) => {
      localStorage.setItem(key, JSON.stringify(queue));
    }, [PENDING_QUEUE_KEY, sampleQueue] as const);

    await page.reload();

    const reloaded = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) as PendingMsg[] : [];
    }, PENDING_QUEUE_KEY);

    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].content).toBe('queued after disconnect');
    expect(reloaded[0].clientId).toBe('client-pw-1');
  });
});
