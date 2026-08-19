import { defineConfig } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

/** Local-only specs that use about:blank — no dev server required. */
export default defineConfig({
  testDir: './tests',
  testMatch: ['chat-refresh-queue.spec.ts', 'heart-notif-list-sync.spec.ts'],
  timeout: 30_000,
  workers: 1,
  reporter: 'line',
  projects: [
    {
      name: 'chromium',
      use: {
        headless: true,
        viewport: { width: 390, height: 844 },
        launchOptions: executablePath ? { executablePath } : undefined,
      },
    },
  ],
});
