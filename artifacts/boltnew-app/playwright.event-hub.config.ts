import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";
const baseURL = process.env.HUB_E2E_BASE_URL;
if (!baseURL || !/^http:\/\/127\.0\.0\.1:300[12]$/.test(baseURL))
  throw new Error(
    "Run event hub E2E only against explicitly prepared isolated localhost:3001",
  );
export default defineConfig({
  testDir: "./tests",
  testMatch: "event-hub-v6.spec.ts",
  workers: 1,
  timeout: 60000,
  reporter: "line",
  outputDir: "test-results/event-hub-v6",
  use: {
    baseURL,
    headless: true,
    launchOptions: existsSync("/usr/bin/chromium")
      ? { executablePath: "/usr/bin/chromium" }
      : {},
    video: "on",
    screenshot: "only-on-failure",
  },
});
