import { expect, test } from '@playwright/test';

/**
 * Local-only failure injection. Production hosts are aborted so this never
 * becomes a destructive live-site test.
 */
test.describe('local failure injection', () => {
  test('API 실패 시에도 앱 셸이 렌더되고 운영 호스트를 치지 않는다', async ({ page }) => {
    const blocked: string[] = [];
    await page.route('https://binpc2.onrender.com/**', async (route) => {
      blocked.push(route.request().url());
      await route.abort();
    });
    await page.route('https://binpc2.netlify.app/**', async (route) => {
      blocked.push(route.request().url());
      await route.abort();
    });
    await page.route('**/api/**', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'injected-failure' }),
      });
    });

    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();
    expect(blocked, 'must not call production').toEqual([]);
  });
});
