const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const outputFile = process.env.PREVIEW_SMOKE_EVIDENCE_FILE || 'docs/preview-host-smoke-evidence.json';
const rawPreviewUrl = process.env.PREVIEW_SMOKE_URL || process.argv[2] || '';
const timeoutMs = Number(process.env.PREVIEW_SMOKE_TIMEOUT_MS || 30000);

const normalizeBaseUrl = (value) => value.trim().replace(/\/+$/, '');
const previewUrl = normalizeBaseUrl(rawPreviewUrl);
const isHttpsUrl = (value) => /^https:\/\/[^/]+\.[^/]+/i.test(value || '');
const sanitizeUrlForEvidence = (value) => (
  value.includes('https://vercel.com/login')
    ? 'https://vercel.com/login'
    : value
);

const routeChecks = [
  {
    id: 'app-root',
    path: '/',
    expectedTexts: [
      'Machine Reconstruction Engine',
      'New Reconstruction',
      'Start with a scan or description',
    ],
  },
  {
    id: 'privacy',
    path: '/privacy',
    expectedTexts: [
      'Privacy Policy',
      'Camera access is used only to capture machine images',
      'Manufacturer quote packets and email drafts require explicit user action',
    ],
  },
  {
    id: 'terms',
    path: '/terms',
    expectedTexts: [
      'Terms of Service',
      'No Automatic Vendor Submission',
      'it does not automatically submit orders',
    ],
  },
  {
    id: 'support',
    path: '/support',
    expectedTexts: [
      'Support',
      'vsillah@gmail.com',
      'Do not send raw API keys or OAuth tokens',
    ],
  },
];

const writeJson = (filePath, value) => {
  const target = path.resolve(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
  return target;
};

const failEarly = (message) => {
  const evidence = {
    schemaVersion: 1,
    status: 'fail',
    generatedAt: new Date().toISOString(),
    previewUrl: rawPreviewUrl,
    routes: [],
    finalProductionHostedUrlsStillRequired: true,
    error: message,
  };
  const target = writeJson(outputFile, evidence);
  console.error(`Preview host smoke failed: ${message}`);
  console.error(`Evidence written: ${target}`);
  process.exit(1);
};

if (!isHttpsUrl(previewUrl)) {
  failEarly('Set PREVIEW_SMOKE_URL or pass an HTTPS preview URL argument.');
}

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });

  const routes = [];

  try {
    for (const check of routeChecks) {
      const url = `${previewUrl}${check.path}`;
      const checkedAt = new Date().toISOString();
      let responseStatus = null;
      let finalUrl = '';
      let bodyText = '';
      let error = '';

      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
        responseStatus = response?.status() || null;
        await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => {});
        await page.waitForTimeout(750);
        finalUrl = sanitizeUrlForEvidence(page.url());
        bodyText = (await page.locator('body').innerText({ timeout: timeoutMs })).replace(/\s+/g, ' ').trim();
      } catch (routeError) {
        error = routeError.message;
      }

      const expectedTextFound = Object.fromEntries(
        check.expectedTexts.map(text => [text, bodyText.includes(text)])
      );
      const pass = (
        !error &&
        responseStatus !== null &&
        responseStatus >= 200 &&
        responseStatus < 400 &&
        check.expectedTexts.every(text => expectedTextFound[text] === true)
      );

      routes.push({
        id: check.id,
        path: check.path,
        url,
        finalUrl,
        status: pass ? 'pass' : 'fail',
        httpStatus: responseStatus,
        expectedTextFound,
        checkedAt,
        error,
      });
    }
  } finally {
    await browser.close();
  }

  const failedRoutes = routes.filter(route => route.status !== 'pass');
  const deploymentProtectionLikely = (
    failedRoutes.length === routes.length &&
    failedRoutes.every(route => (
      route.httpStatus === 401 &&
      route.finalUrl.includes('vercel.com/login')
    ))
  );
  const evidence = {
    schemaVersion: 1,
    status: failedRoutes.length === 0 ? 'pass' : deploymentProtectionLikely ? 'pending' : 'fail',
    generatedAt: new Date().toISOString(),
    previewUrl,
    routeCount: routes.length,
    routes,
    finalProductionHostedUrlsStillRequired: true,
    deploymentProtectionLikely,
    notes: [
      failedRoutes.length === 0
        ? 'This proves the current PR preview renders the app and policy/support routes.'
        : 'This records the current PR preview route result for release gating.',
      'It does not replace hosted production API, hosted production policy URLs, EAS native QA, App Store Connect, or Google Play Console evidence.',
      deploymentProtectionLikely
        ? 'The preview appears to be protected by Vercel authentication; rerun with a public preview URL or approved bypass.'
        : '',
    ].filter(Boolean),
  };

  const target = writeJson(outputFile, evidence);
  console.log(`Preview host smoke evidence written: ${target}`);
  console.log(`Status: ${evidence.status}`);
  console.log(`Routes passed: ${routes.length - failedRoutes.length}/${routes.length}`);

  if (failedRoutes.length > 0) {
    console.error(`Failed routes: ${failedRoutes.map(route => route.id).join(', ')}`);
    process.exit(1);
  }
};

run().catch((error) => {
  failEarly(error.message);
});
