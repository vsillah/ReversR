const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const APP_URL = process.env.STORE_SCREENSHOT_URL || 'http://localhost:5001';
const OUT_DIR = process.env.STORE_SCREENSHOT_DIR || path.join('docs', 'store-screenshots', 'generated');
const MACHINE_DESCRIPTION = 'A desktop FDM 3D printer with aluminum frame, heated bed, extruder, belts, rails, control board, power supply, and display.';

const viewports = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 1024, height: 1366 },
];

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const clickText = async (page, label, occurrence = 'last') => {
  const group = page.getByText(label, { exact: false });
  const locator = occurrence === 'first' ? group.first() : group.last();
  const count = await locator.count();
  if (!count) {
    const body = await page.locator('body').innerText().catch(() => '');
    throw new Error(`Could not find "${label}". Current page text: ${body.slice(0, 1200)}`);
  }
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.click({ timeout: 15000 });
  await wait(800);
};

const fillFirstTextarea = async (page, value) => {
  const textarea = page.locator('textarea').first();
  if (!(await textarea.count())) throw new Error('Could not find machine description textarea.');
  await textarea.fill(value);
};

const screenshot = async (page, fileName) => {
  const filePath = path.join(OUT_DIR, fileName);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
};

const captureViewport = async (browser, viewport) => {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  const files = [];

  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 45000 });
  files.push(await screenshot(page, `${viewport.name}-01-welcome.png`));

  await clickText(page, 'New Reconstruction');
  await fillFirstTextarea(page, MACHINE_DESCRIPTION);
  files.push(await screenshot(page, `${viewport.name}-02-scan.png`));

  await clickText(page, 'Initiate Scan');
  await wait(2500);
  await clickText(page, 'Validate Connector');
  await wait(1200);
  files.push(await screenshot(page, `${viewport.name}-03-inventory-validation.png`));

  await clickText(page, 'Match Machine & Build Plan');
  await wait(2500);
  files.push(await screenshot(page, `${viewport.name}-04-design-match.png`));

  await clickText(page, 'Continue to Build');
  await wait(1500);
  await clickText(page, 'Generate BOM', 'first');
  await wait(4000);
  await page.mouse.wheel(0, 4000);
  await wait(500);
  files.push(await screenshot(page, `${viewport.name}-05-build-handoff.png`));

  await page.goto(`${APP_URL}/privacy`, { waitUntil: 'networkidle', timeout: 45000 });
  files.push(await screenshot(page, `${viewport.name}-06-privacy.png`));

  await page.close();
  return files;
};

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const captured = [];

  try {
    for (const viewport of viewports) {
      captured.push(...await captureViewport(browser, viewport));
    }
  } finally {
    await browser.close();
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    appUrl: APP_URL,
    note: 'Web preview screenshots for store-review planning. Final App Store and Google Play submissions still require native device screenshots from EAS preview builds.',
    files: captured,
  };
  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Captured ${captured.length} screenshots.`);
  console.log(`Manifest: ${manifestPath}`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
