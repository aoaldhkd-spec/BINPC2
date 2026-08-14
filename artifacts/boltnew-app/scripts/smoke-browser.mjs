import { chromium } from '@playwright/test';

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
});
const results = [];

async function inspectPage(name, url, viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  const failedRequests = [];
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('requestfailed', request => {
    if (!request.url().includes('/api/db/events')) failedRequests.push(request.url());
  });

  const response = await page.goto(url, { waitUntil: 'networkidle' });
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  results.push({
    name,
    status: response?.status() ?? 0,
    horizontalOverflow,
    errors,
    failedRequests,
  });
  await page.close();
}

await inspectPage('user-desktop', 'http://localhost:3000', { width: 1280, height: 800 });
await inspectPage('user-mobile', 'http://localhost:3000', { width: 390, height: 844 });
await inspectPage('admin', 'http://localhost:3000/admin', { width: 1280, height: 800 });

const testPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const postRequests = [];
const testErrors = [];
const errorResponses = [];
testPage.on('console', message => {
  if (message.type() === 'error') testErrors.push(message.text());
});
testPage.on('request', request => {
  if (request.method() === 'POST') {
    postRequests.push({ url: request.url(), body: request.postData() });
  }
});
testPage.on('response', response => {
  if (response.status() >= 400) {
    errorResponses.push({
      status: response.status(),
      url: response.url(),
      body: response.request().postData(),
    });
  }
});

const testResponse = await testPage.goto('http://localhost:3000/test', { waitUntil: 'networkidle' });
const testPassword = process.env.TEST_DASHBOARD_PASSWORD;
if (testPassword) {
  await testPage.locator('input[type=password]').fill(testPassword);
  await testPage.locator('button[type=submit]').click();
  await testPage.waitForTimeout(1_000);
}
results.push({
  name: 'test-gate',
  status: testResponse?.status() ?? 0,
  rpcVerified: postRequests.some(request => request.url.includes('/rpc/test_verify_password')),
  leakedSettingsQuery: postRequests.some(request =>
    request.url.includes('/op') && request.body?.includes('test_password')),
  dashboardLoaded: testPassword
    ? await testPage.getByText('테스트 대시보드').count() > 0
    : undefined,
  errorResponses,
  errors: testErrors,
});

await testPage.close();
await browser.close();

console.log(JSON.stringify(results, null, 2));
const failed = results.some(result =>
  result.status !== 200 ||
  result.horizontalOverflow === true ||
  result.errors?.length ||
  result.failedRequests?.length ||
  result.leakedSettingsQuery === true ||
  (testPassword && result.name === 'test-gate' &&
    (result.rpcVerified !== true || result.dashboardLoaded !== true))
);
if (failed) process.exitCode = 1;
