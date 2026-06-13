const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const APP_URL = process.env.WEB_SMOKE_APP_URL || process.env.APP_URL || 'http://localhost:5001';
const API_URL = process.env.WEB_SMOKE_API_URL || 'http://localhost:3001';
const EVIDENCE_FILE = process.env.WEB_SMOKE_EVIDENCE_FILE || 'docs/web-flow-smoke-evidence.json';
const MACHINE_DESCRIPTION = process.env.WEB_SMOKE_MACHINE_DESCRIPTION || [
  'A FarmBot Genesis v1.8 CNC farming machine with track extrusions, gantry main beam,',
  'gantry columns, cross-slide plate, z-axis extrusion, Farmduino, Raspberry Pi, motors,',
  'encoders, UTM PCB, solenoid valve, vacuum pump, watering tools, seeder, camera, belts, pulleys, and v-wheels.',
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

const writeEvidence = (evidence) => {
  const target = path.resolve(EVIDENCE_FILE);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(evidence, null, 2)}\n`);
  return target;
};

const checkApi = async () => {
  const health = await fetch(`${API_URL}/api/health`);
  assert(health.ok, `API health check failed at ${API_URL}/api/health (${health.status}). Start npm run web-preview before running this smoke.`);
  const healthBody = await health.json().catch(() => ({}));

  const retiredSit = await fetch(`${API_URL}/api/apply-pattern`, { method: 'POST' });
  assert(retiredSit.status === 404, 'Legacy /api/apply-pattern route should stay retired.');

  return {
    healthStatus: health.status,
    healthOk: health.ok,
    healthBody,
    retiredSitRouteStatus: retiredSit.status,
  };
};

(async () => {
  const apiEvidence = await checkApi();

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const consoleErrors = [];
  const pageErrors = [];
  const verified = {};

  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));

  try {
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 45000 });
    await waitForText(page, 'Machine Reconstruction Engine');
    await assertTextAbsent(page, 'Systematic Inventive');
    verified.welcome = true;
    verified.legacySitAbsent = true;

    await clickText(page, 'New Reconstruction');
    await waitForText(page, 'Phase 1: Scan');
    await fillMachineDescription(page);
    await clickText(page, 'Start Machine Scan');
    verified.scan = true;

    await waitForText(page, 'Phase 2: Inventory', 45000);
    await assertTextPresent(page, 'Inventory Match');
    await assertTextPresent(page, 'Using');
    await assertTextPresent(page, 'FarmBot Genesis v1.8');
    verified.inventoryValidation = true;

    await clickText(page, 'Use Selected Machine');
    await waitForText(page, 'Phase 3: Design', 45000);
    await assertTextPresent(page, 'FarmBot Genesis v1.8');
    await assertTextPresent(page, 'Inventory Match');
    await clickText(page, 'Continue to Build');
    verified.machineMatch = true;

    await waitForText(page, 'Phase 4: Build', 30000);
    await clickText(page, 'Generate BOM', 'first');
    await waitForText(page, 'Export Quote Packet', 45000);
    await assertTextPresent(page, 'Bill of Materials');
    verified.bom = true;
    await assertTextPresent(page, 'Manufacturer Handoff');
    verified.quotePacket = true;
    await assertTextPresent(page, 'Vendor Request Draft');
    await assertTextPresent(page, 'Reviewer Approval');
    await assertTextPresent(page, 'Saved Approval Required');
    verified.vendorRequestDraft = true;
    await assertTextPresent(page, 'Manufacturing Readiness');
    verified.manufacturingReadiness = true;

    assert(pageErrors.length === 0, `Page errors detected:\n${pageErrors.join('\n')}`);
    assert(consoleErrors.length === 0, `Console errors detected:\n${consoleErrors.join('\n')}`);

    const evidencePath = writeEvidence({
      schemaVersion: 1,
      status: 'pass',
      generatedAt: new Date().toISOString(),
      appUrl: APP_URL,
      apiUrl: API_URL,
      viewport: { width: 390, height: 844 },
      machineDescription: MACHINE_DESCRIPTION,
      api: apiEvidence,
      verified,
      observed: {
        matchedMachineName: 'FarmBot Genesis v1.8',
        flow: 'scan -> inventory validation -> machine match -> BOM -> quote packet/vendor draft',
      },
      errors: {
        console: consoleErrors,
        page: pageErrors,
      },
    });

    console.log('Web flow smoke passed.');
    console.log(`App URL: ${APP_URL}`);
    console.log(`Evidence: ${evidencePath}`);
    console.log('Verified: scan -> inventory validation -> machine match -> BOM -> quote packet/vendor draft.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error('Web flow smoke failed:');
  console.error(error.message || error);
  process.exit(1);
});
