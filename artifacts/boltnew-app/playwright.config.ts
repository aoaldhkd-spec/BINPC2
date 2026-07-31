import { defineConfig } from '@playwright/test';
import * as fs from 'node:fs';

/**
 * Find the Chromium binary bundled in the Nix store (Replit environment).
 * Playwright 1.62+ uses chromium_headless_shell by default, but the Nix
 * store ships the full chromium binary.  Pointing executablePath at it
 * bypasses the revision check.
 */
function findChromium(): string {
  const candidates = [
    '/nix/store/hvv3n9pvjfq0x8wjw8f3igsyvlaz1ngr-playwright-browsers-chromium/chromium-1091/chrome-linux/chrome',
    '/nix/store/0n9rl5l9syy808xi9bk4f6dhnfrvhkww-playwright-browsers-chromium/chromium-1080/chrome-linux/chrome',
    '/nix/store/gn1jv0wpg8zq97a48bqd5k5ck8hf0n2y-playwright-browsers-chromium/chromium-1091/chrome-linux/chrome',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    'Cannot find Chromium in Nix store.  Run `npx playwright install chromium` or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.',
  );
}

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  reporter: 'line',
  projects: [
    {
      name: 'chromium',
      use: {
        headless: true,
        viewport: { width: 390, height: 844 },
        launchOptions: {
          executablePath: findChromium(),
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
      },
    },
  ],
});
