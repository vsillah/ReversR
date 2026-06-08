const fs = require('fs');

const args = new Set(process.argv.slice(2));
const allowPending = args.has('--allow-pending');
const evidencePath = process.env.NATIVE_QA_EVIDENCE_FILE || 'docs/native-qa-evidence.json';
const templatePath = 'docs/native-qa-evidence.template.json';

const failures = [];
const warnings = [];

const fail = (message) => failures.push(message);
const warn = (message) => warnings.push(message);
const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const exists = (path) => fs.existsSync(path);
const readPngSize = (path) => {
  const buffer = fs.readFileSync(path);
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error(`${path} is not a PNG file.`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
};

const appConfig = readJson('app.json').expo;
const evidence = exists(evidencePath) ? readJson(evidencePath) : readJson(templatePath);
const usingTemplate = !exists(evidencePath);

const validStatuses = new Set(['pass', 'fail', 'blocked', 'pending']);
const release = evidence.releaseCandidate || {};

const requireOrWarn = (condition, message) => {
  if (condition) return;
  if (allowPending) warn(message);
  else fail(message);
};

if (usingTemplate) {
  requireOrWarn(false, `Native QA evidence file is missing. Copy ${templatePath} to ${evidencePath} after EAS preview builds exist.`);
}

if (release.appName !== appConfig.name) fail('Native QA evidence appName must match app.json.');
if (release.version !== appConfig.version) fail('Native QA evidence version must match app.json.');
if (release.iosBundleId !== appConfig.ios?.bundleIdentifier) fail('Native QA evidence iOS bundle ID must match app.json.');
if (release.androidPackage !== appConfig.android?.package) fail('Native QA evidence Android package must match app.json.');

for (const [key, value] of Object.entries(evidence.builds || {})) {
  if (!['pass', 'blocked', 'pending'].includes(value.status)) {
    fail(`Build ${key} has invalid status "${value.status}".`);
  }
  requireOrWarn(value.status === 'pass', `Build ${key} is not passed yet.`);
  requireOrWarn(Boolean(value.buildUrl), `Build ${key} is missing buildUrl evidence.`);
  requireOrWarn(Boolean(value.device), `Build ${key} is missing tested device.`);
  requireOrWarn(Boolean(value.tester), `Build ${key} is missing tester.`);
  requireOrWarn(Boolean(value.completedAt), `Build ${key} is missing completedAt.`);
}

const checks = evidence.checks || [];
if (checks.length < 10) fail('Native QA evidence must include the full release check set.');

for (const check of checks) {
  if (!check.id) fail('Every native QA check needs an id.');
  if (!check.label) fail(`Native QA check ${check.id || '(missing id)'} needs a label.`);
  if (!Array.isArray(check.requiredPlatforms) || check.requiredPlatforms.length === 0) {
    fail(`Native QA check ${check.id} must list requiredPlatforms.`);
  }
  if (!check.evidence && !allowPending) fail(`Native QA check ${check.id} is missing evidence notes.`);

  for (const platform of check.requiredPlatforms || []) {
    const status = check[platform];
    if (!validStatuses.has(status)) fail(`Native QA check ${check.id} has invalid ${platform} status "${status}".`);
    requireOrWarn(status === 'pass', `Native QA check ${check.id} is ${status} on ${platform}.`);
  }
}

const requiredIds = [
  'install-launch',
  'camera-permission',
  'manual-description',
  'inventory-validation',
  'machine-match',
  'bom-generation',
  'assembly-steps',
  'quote-packet-export',
  'vendor-request-draft',
  'policy-links',
  'accessibility',
  'offline-api-error',
  'connector-auth-error',
  'native-screenshots',
];
const ids = new Set(checks.map(check => check.id));
for (const id of requiredIds) {
  if (!ids.has(id)) fail(`Native QA evidence is missing required check "${id}".`);
}

const screenshotStatuses = new Set(['pass', 'fail', 'blocked', 'pending']);
const requiredScreenshotIds = [
  'welcome',
  'scan',
  'inventory-validation',
  'design-match',
  'build-handoff',
];
const screenshots = evidence.screenshots || [];
const screenshotIds = new Set(screenshots.map(screenshot => screenshot.id));
if (screenshots.length < requiredScreenshotIds.length) {
  fail('Native QA evidence must include the full native screenshot set.');
}
for (const id of requiredScreenshotIds) {
  if (!screenshotIds.has(id)) fail(`Native QA evidence is missing required screenshot "${id}".`);
}

for (const screenshot of screenshots) {
  if (!screenshot.id) fail('Every native screenshot entry needs an id.');
  if (!screenshot.label) fail(`Native screenshot ${screenshot.id || '(missing id)'} needs a label.`);
  if (!Array.isArray(screenshot.requiredPlatforms) || screenshot.requiredPlatforms.length === 0) {
    fail(`Native screenshot ${screenshot.id} must list requiredPlatforms.`);
  }

  for (const platform of screenshot.requiredPlatforms || []) {
    const platformEvidence = screenshot[platform] || {};
    const status = platformEvidence.status;
    if (!screenshotStatuses.has(status)) {
      fail(`Native screenshot ${screenshot.id} has invalid ${platform} status "${status}".`);
    }
    requireOrWarn(status === 'pass', `Native screenshot ${screenshot.id} is ${status} on ${platform}.`);
    requireOrWarn(Boolean(platformEvidence.file), `Native screenshot ${screenshot.id} is missing ${platform} file path.`);
    requireOrWarn(Boolean(platformEvidence.device), `Native screenshot ${screenshot.id} is missing ${platform} device evidence.`);
    requireOrWarn(Boolean(platformEvidence.capturedAt), `Native screenshot ${screenshot.id} is missing ${platform} capturedAt.`);

    if (status === 'pass' || (!allowPending && platformEvidence.file)) {
      requireOrWarn(exists(platformEvidence.file), `Native screenshot ${screenshot.id} file does not exist for ${platform}: ${platformEvidence.file || '(missing)'}.`);
      if (exists(platformEvidence.file)) {
        try {
          const size = readPngSize(platformEvidence.file);
          if (size.width < 320 || size.height < 568) {
            fail(`Native screenshot ${screenshot.id} for ${platform} is too small for store review: ${size.width}x${size.height}.`);
          }
        } catch (error) {
          fail(error.message);
        }
      }
    }
  }
}

const signoff = evidence.signoff || {};
requireOrWarn(signoff.approvedForTestFlight === true, 'Native QA is not approved for TestFlight yet.');
requireOrWarn(signoff.approvedForPlayInternalTesting === true, 'Native QA is not approved for Play Internal Testing yet.');
requireOrWarn(signoff.approvedForProductionSubmission === true, 'Native QA is not approved for production submission yet.');
requireOrWarn(Boolean(signoff.releaseOwner), 'Native QA signoff is missing releaseOwner.');
requireOrWarn(Boolean(signoff.qaReviewer), 'Native QA signoff is missing qaReviewer.');
requireOrWarn(Boolean(signoff.signedAt), 'Native QA signoff is missing signedAt.');

if (warnings.length > 0) {
  console.log('Warnings:');
  for (const message of warnings) console.log(`- ${message}`);
}

if (failures.length > 0) {
  console.error('Native QA preflight failed:');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log('Native QA preflight passed.');
