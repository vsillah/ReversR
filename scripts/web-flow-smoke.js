const { chromium } = require('playwright');

const APP_URL = process.env.WEB_SMOKE_APP_URL || process.env.APP_URL || 'http://localhost:5001';
const API_URL = process.env.WEB_SMOKE_API_URL || 'http://localhost:3001';
const MACHINE_DESCRIPTION = process.env.WEB_SMOKE_MACHINE_DESCRIPTION || [
  'A desktop FDM 3D printer with aluminum extrusion frame, heated bed, extruder, belts, rails,',
  'stepper motors, control board, power supply, nozzle, and display.',
].join(' ');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const getPageText = async (page) => (
  await page.locator('body').innerText({ timeout: 10000 }).catch(() => '')
);

const waitForText = async (page, text, timeout = 30000) => {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout });
};

const clickText = async (page, text, occurrence = 'last') => {
  const locatorGroup = page.getByText(text, { exact: false });
  const locator = occurrence === 'first' ? locatorGroup.first() : locatorGroup.last();
  const count = await locator.count();
  if (!count) {
    const body = await getPageText(page);
    throw new Error(`Could not find "${text}". Current page text:\n${body.slice(0, 1600)}`);
  }
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.click({ timeout: 15000 });
  await wait(500);
};

const fillMachineDescription = async (page) => {
  const descriptionInput = page.locator('textarea').first();
  assert(await descriptionInput.count(), 'Could not find machine description input.');
  await descriptionInput.fill(MACHINE_DESCRIPTION);
};

const assertTextPresent = async (page, text) => {
  const body = await getPageText(page);
  assert(body.includes(text), `Expected to find "${text}" in page text.`);
};

const assertTextAbsent = async (page, text) => {
  const body = await getPageText(page);
  assert(!body.includes(text), `Unexpected legacy text found: "${text}".`);
};

const checkApi = async () => {
  const health = await fetch(`${API_URL}/api/health`);
  assert(health.ok, `API health check failed at ${API_URL}/api/health (${health.status}). Start npm run web-preview before running this smoke.`);

  const retiredSit = await fetch(`${API_URL}/api/apply-pattern`, { method: 'POST' });
  assert(retiredSit.status === 404, 'Legacy /api/apply-pattern route should stay retired.');
};

(async () => {
  await checkApi();

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));

  try {
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 45000 });
    await waitForText(page, 'Machine Reconstruction Engine');
    await assertTextAbsent(page, 'Systematic Inventive');

    await clickText(page, 'New Reconstruction');
    await waitForText(page, 'Phase 1: Scan');
    await fillMachineDescription(page);
    await clickText(page, 'Start Machine Scan');

    await waitForText(page, 'Phase 2: Inventory', 45000);
    await assertTextPresent(page, 'Admin Inventory Connector');
    await clickText(page, 'Validate Connector');
    await waitForText(page, 'Inventory Preview', 30000);
    await assertTextPresent(page, 'Desktop FDM 3D Printer');

    await clickText(page, 'Match Machine & Build Plan');
    await waitForText(page, 'Phase 3: Design', 45000);
    await assertTextPresent(page, 'Desktop FDM 3D Printer');
    await assertTextPresent(page, 'Inventory Match');
    await clickText(page, 'Continue to Build');

    await waitForText(page, 'Phase 4: Build', 30000);
    await clickText(page, 'Generate BOM', 'first');
    await waitForText(page, 'Export Quote Packet', 45000);
    await assertTextPresent(page, 'Bill of Materials');
    await assertTextPresent(page, 'Manufacturer Handoff');
    await assertTextPresent(page, 'Vendor Request Draft');
    await assertTextPresent(page, 'Prepare Request Email');
    await assertTextPresent(page, 'Manufacturing Readiness');

    assert(pageErrors.length === 0, `Page errors detected:\n${pageErrors.join('\n')}`);
    assert(consoleErrors.length === 0, `Console errors detected:\n${consoleErrors.join('\n')}`);

    console.log('Web flow smoke passed.');
    console.log(`App URL: ${APP_URL}`);
    console.log('Verified: scan -> inventory validation -> machine match -> BOM -> quote packet/vendor draft.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error('Web flow smoke failed:');
  console.error(error.message || error);
  process.exit(1);
});
