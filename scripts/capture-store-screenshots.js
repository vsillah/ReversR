const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const APP_URL = process.env.STORE_SCREENSHOT_URL || 'http://localhost:5001';
const OUT_DIR = process.env.STORE_SCREENSHOT_DIR || path.join('docs', 'store-screenshots', 'generated');
const EVIDENCE_FILE = process.env.STORE_SCREENSHOT_EVIDENCE_FILE || path.join('docs', 'store-screenshots', 'planning-evidence.json');
const MACHINE_DESCRIPTION = 'A FarmBot Genesis v1.8 CNC farming machine with track extrusions, gantry beam, z-axis, Farmduino, Raspberry Pi, motors, encoders, UTM PCB, solenoid valve, vacuum pump, watering tools, seeder, camera, belts, pulleys, and v-wheels.';

const viewports = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 1024, height: 1366 },
];
const expectedScreenIds = [
  'welcome',
  'scan',
  'inventory-validation',
  'design-match',
  'build-handoff',
  'privacy',
];
const finalNativeFilenames = [
  'android-01-welcome.png',
  'android-02-scan.png',
  'android-03-inventory-validation.png',
  'android-04-design-match.png',
  'android-05-build-handoff.png',
  'ios-01-welcome.png',
  'ios-02-scan.png',
  'ios-03-inventory-validation.png',
  'ios-04-design-match.png',
  'ios-05-build-handoff.png',
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

const clickTextIfPresent = async (page, label, occurrence = 'last') => {
  const group = page.getByText(label, { exact: false });
  const locator = occurrence === 'first' ? group.first() : group.last();
  if (!(await locator.count())) {
    return false;
  }
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.click({ timeout: 15000 });
  await wait(800);
  return true;
};

const waitForAnyText = async (page, labels, timeout = 20000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const label of labels) {
      if (await page.getByText(label, { exact: false }).first().count()) {
        return label;
      }
    }
    await wait(250);
  }

  const body = await page.locator('body').innerText().catch(() => '');
  throw new Error(`Could not find any of: ${labels.join(', ')}. Current page text: ${body.slice(0, 1200)}`);
};

const fillFirstTextarea = async (page, value) => {
  const textarea = page.locator('textarea').first();
  if (!(await textarea.count())) throw new Error('Could not find machine description textarea.');
  await textarea.fill(value);
};

const enterAppIfIntroVisible = async (page) => {
  const enterButton = page.getByText('Enter ReversR', { exact: false }).first();
  if (await enterButton.count()) {
    await enterButton.click({ timeout: 15000 });
    await wait(1200);
    return;
  }

  const skipButton = page.getByText('Skip', { exact: true }).first();
  if (await skipButton.count()) {
    await skipButton.click({ timeout: 15000 });
    await wait(1200);
  }
};

const screenshot = async (page, fileName) => {
  const filePath = path.join(OUT_DIR, fileName);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
};

const readPngSize = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error(`${filePath} is not a PNG file.`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
};

const buildCaptureEvidence = (files) => files.map(filePath => {
  const fileName = path.basename(filePath);
  const match = fileName.match(/^(phone|tablet)-(\d+)-(.+)\.png$/);
  const size = readPngSize(filePath);
  return {
    file: filePath,
    viewport: match?.[1] || 'unknown',
    sequence: match ? Number(match[2]) : null,
    screenId: match?.[3] || 'unknown',
    width: size.width,
    height: size.height,
  };
});

const captureViewport = async (browser, viewport) => {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  const files = [];

  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 45000 });
  await enterAppIfIntroVisible(page);
  files.push(await screenshot(page, `${viewport.name}-01-welcome.png`));

  await clickText(page, 'New Reconstruction');
  await fillFirstTextarea(page, MACHINE_DESCRIPTION);
  files.push(await screenshot(page, `${viewport.name}-02-scan.png`));

  await clickText(page, 'Start Machine Scan');
  await wait(2500);
  if (await clickTextIfPresent(page, 'Validate Connector')) {
    await wait(1200);
  }
  await waitForAnyText(page, ['Inventory Match', 'Phase 2: Inventory'], 30000);
  files.push(await screenshot(page, `${viewport.name}-03-inventory-validation.png`));

  if (!(await clickTextIfPresent(page, 'Use Selected Machine'))) {
    await clickText(page, 'Match Machine & Build Plan');
  }
  await wait(2500);
  await waitForAnyText(page, ['Phase 3: Design', 'Continue to Build'], 30000);
  files.push(await screenshot(page, `${viewport.name}-04-design-match.png`));

  await clickText(page, 'Continue to Build');
  await wait(1500);
  await waitForAnyText(page, ['Phase 4: Build', 'Generate BOM'], 30000);
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

  const captures = buildCaptureEvidence(captured);
  const capturedByViewport = Object.fromEntries(viewports.map(viewport => [
    viewport.name,
    expectedScreenIds.every(screenId => captures.some(capture => capture.viewport === viewport.name && capture.screenId === screenId)),
  ]));
  const evidence = {
    schemaVersion: 1,
    status: 'pass',
    generatedAt: manifest.generatedAt,
    appUrl: APP_URL,
    outputDir: OUT_DIR,
    note: manifest.note,
    viewports,
    expectedScreenIds,
    capturedByViewport,
    captures,
    nativeRequirement: {
      finalNativeScreenshotsStillRequired: true,
      directory: 'docs/store-screenshots/native/',
      filenames: finalNativeFilenames,
    },
  };
  const evidencePath = path.resolve(EVIDENCE_FILE);
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

  console.log(`Captured ${captured.length} screenshots.`);
  console.log(`Manifest: ${manifestPath}`);
  console.log(`Evidence: ${evidencePath}`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
