const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const args = new Set(process.argv.slice(2));
const allowPlaceholder = args.has('--allow-placeholder');
const checkHosted = args.has('--check-hosted');
const outputDir = process.env.POLICY_WEB_EXPORT_DIR || path.join(os.tmpdir(), 'reversr-policy-web-export');
const evidenceFile = process.env.POLICY_HOSTING_EVIDENCE_FILE || 'docs/policy-hosting-smoke-evidence.json';

const failures = [];
const warnings = [];

const fail = (message) => failures.push(message);
const warn = (message) => warnings.push(message);
const exists = (filePath) => fs.existsSync(filePath);
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeEvidence = (evidence) => {
  const target = path.resolve(evidenceFile);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(evidence, null, 2)}\n`);
  return target;
};

const appConfig = readJson('app.json').expo;
const packet = readJson('docs/store-submission-packet.json');

const isPlaceholderUrl = (value) => (
  !value ||
  value.includes('example.com') ||
  value.includes('example.net') ||
  value.includes('example.org') ||
  value.includes('localhost')
);
const isHttpsUrl = (value) => /^https:\/\/[^/]+\.[^/]+/i.test(value || '');

const requireHostedUrl = (label, value) => {
  if (!isPlaceholderUrl(value) && isHttpsUrl(value)) return;
  if (allowPlaceholder) warn(`${label} is placeholder or non-production: ${value || '(missing)'}`);
  else fail(`${label} must be a hosted HTTPS URL before store submission.`);
};

const collectFiles = (dir, predicate, found = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(entryPath, predicate, found);
    else if (predicate(entryPath)) found.push(entryPath);
  }
  return found;
};

const urls = {
  privacyPolicyUrl: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL || packet.urls?.privacyPolicyUrl || appConfig.extra?.privacyPolicyUrl,
  termsUrl: process.env.EXPO_PUBLIC_TERMS_URL || packet.urls?.termsUrl || appConfig.extra?.termsUrl,
  supportUrl: process.env.EXPO_PUBLIC_SUPPORT_URL || packet.urls?.supportUrl || appConfig.extra?.supportUrl,
};
for (const [label, value] of Object.entries(urls)) requireHostedUrl(label, value);

const routeFiles = {
  privacy: 'app/privacy.tsx',
  terms: 'app/terms.tsx',
  support: 'app/support.tsx',
};

if (!exists(routeFiles.privacy)) fail('Missing /privacy route file.');
if (!exists(routeFiles.terms)) fail('Missing /terms route file.');
if (!exists(routeFiles.support)) fail('Missing /support route file.');

const vercelConfig = readJson('vercel.json');
const hasSpaRewrite = (vercelConfig.rewrites || []).some(rewrite => (
  rewrite.source === '/(.*)' && rewrite.destination === '/index.html'
));
if (!hasSpaRewrite) fail('vercel.json must rewrite all paths to /index.html so /privacy, /terms, and /support load as SPA routes.');
if (vercelConfig.outputDirectory !== 'dist') fail('vercel.json outputDirectory must be dist.');

fs.rmSync(outputDir, { recursive: true, force: true });
const exportResult = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', outputDir], {
  encoding: 'utf8',
  stdio: 'pipe',
});
if (exportResult.status !== 0) {
  fail(`Expo web export failed: ${(exportResult.stderr || exportResult.stdout || '').trim()}`);
}

if (!exists(path.join(outputDir, 'index.html'))) fail('Web export missing index.html.');
if (!exists(path.join(outputDir, 'metadata.json'))) fail('Web export missing metadata.json.');
if (!exists(path.join(outputDir, 'favicon.ico'))) fail('Web export missing favicon.ico.');

const expectedBundleTexts = [
  'Privacy Policy',
  'Terms of Service',
  'Support',
  'Camera access is used only to capture machine images',
  'Manufacturer quote packets and email drafts require explicit user action',
  'vsillah@gmail.com',
];
const bundleEvidence = {
  bundleCount: 0,
  expectedTextFound: {},
};

if (exists(outputDir)) {
  const bundles = collectFiles(outputDir, filePath => filePath.endsWith('.js'));
  bundleEvidence.bundleCount = bundles.length;
  if (bundles.length === 0) fail('Web export did not produce a JavaScript bundle.');
  const bundleText = bundles.map(filePath => fs.readFileSync(filePath, 'utf8')).join('\n');
  for (const expectedText of expectedBundleTexts) {
    const found = bundleText.includes(expectedText);
    bundleEvidence.expectedTextFound[expectedText] = found;
    if (!found) {
      fail(`Web export bundle is missing expected policy/support text: ${expectedText}`);
    }
  }
}

const checkHostedUrl = async (label, value, expectedText) => {
  try {
    const response = await fetch(value, { redirect: 'follow' });
    if (!response.ok) {
      fail(`${label} returned HTTP ${response.status}.`);
      return;
    }
    const body = await response.text();
    if (!body.includes(expectedText)) {
      fail(`${label} did not include expected text "${expectedText}".`);
    }
  } catch (error) {
    fail(`${label} hosted check failed: ${error.message}`);
  }
};

const run = async () => {
  const hostedChecks = {};
  if (checkHosted) {
    await Promise.all(Object.entries({
      privacyPolicyUrl: ['Privacy Policy', urls.privacyPolicyUrl],
      termsUrl: ['Terms of Service', urls.termsUrl],
      supportUrl: ['Support', urls.supportUrl],
    }).map(async ([label, [expectedText, value]]) => {
      const beforeFailureCount = failures.length;
      await checkHostedUrl(label, value, expectedText);
      hostedChecks[label] = failures.length === beforeFailureCount ? 'pass' : 'fail';
    }));
  }

  if (warnings.length > 0) {
    console.log('Warnings:');
    for (const message of warnings) console.log(`- ${message}`);
  }

  if (failures.length > 0) {
    console.error('Policy hosting preflight failed:');
    for (const message of failures) console.error(`- ${message}`);
    process.exit(1);
  }

  const evidencePath = writeEvidence({
    schemaVersion: 1,
    status: 'pass',
    generatedAt: new Date().toISOString(),
    outputDir,
    urls,
    urlMode: allowPlaceholder ? 'placeholder-allowed' : 'strict',
    hostedChecksEnabled: checkHosted,
    hostedChecks,
    routeFiles,
    vercelRewrite: {
      hasSpaRewrite,
      outputDirectory: vercelConfig.outputDirectory,
    },
    exportFiles: {
      indexHtml: exists(path.join(outputDir, 'index.html')),
      metadataJson: exists(path.join(outputDir, 'metadata.json')),
      faviconIco: exists(path.join(outputDir, 'favicon.ico')),
    },
    bundle: bundleEvidence,
  });

  console.log(`Policy hosting preflight passed. Web export verified at ${outputDir}`);
  console.log(`Evidence: ${evidencePath}`);
};

run();
