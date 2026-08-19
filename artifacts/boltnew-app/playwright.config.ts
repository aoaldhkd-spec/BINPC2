import { defineConfig } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const noServer = process.env.PLAYWRIGHT_NO_SERVER === '1';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  workers: 1,
  reporter: 'line',
  ...(noServer ? {} : { use: { baseURL: `http://127.0.0.1:${port}` } }),
  ...(noServer
    ? {}
    : {
        webServer: {
          command: `pnpm exec vite --config vite.config.ts --host 127.0.0.1 --port ${port}`,
          url: `http://127.0.0.1:${port}`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
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
