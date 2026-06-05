const fs = require('fs');
const { spawnSync } = require('child_process');

const args = new Set(process.argv.slice(2));
const allowPlaceholder = args.has('--allow-placeholder');
const allowMissingCli = args.has('--allow-missing-cli');
const allowUnlinkedEas = args.has('--allow-unlinked-eas');
const allowNotLoggedIn = args.has('--allow-not-logged-in');

const failures = [];
const warnings = [];

const fail = (message) => failures.push(message);
const warn = (message) => warnings.push(message);
const exists = (path) => fs.existsSync(path);
const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));

const appConfig = readJson('app.json').expo;
const easConfig = readJson('eas.json');

const isPlaceholderUrl = (value) => (
  !value ||
  value.includes('example.com') ||
  value.includes('example.net') ||
  value.includes('example.org') ||
  value.includes('localhost')
);
const isHttpsUrl = (value) => /^https:\/\/[^/]+\.[^/]+/i.test(value || '');

const requireOrWarn = (condition, message, allowFlag) => {
  if (condition) return;
  if (allowFlag) warn(message);
  else fail(message);
};

const expected = {
  name: 'ReversR Rebuild',
  slug: 'reversr-rebuild',
  iosBundleId: 'com.vsillah.reversrrebuild',
  androidPackage: 'com.vsillah.reversrrebuild',
};

if (appConfig.name !== expected.name) fail(`Expected app name "${expected.name}", found "${appConfig.name}".`);
if (appConfig.slug !== expected.slug) fail(`Expected slug "${expected.slug}", found "${appConfig.slug}".`);
if (appConfig.ios?.bundleIdentifier !== expected.iosBundleId) fail(`Expected iOS bundle ID "${expected.iosBundleId}".`);
if (appConfig.android?.package !== expected.androidPackage) fail(`Expected Android package "${expected.androidPackage}".`);

if (!/^[1-9]\d*$/.test(String(appConfig.android?.versionCode || ''))) {
  fail('Android versionCode must be a positive integer before Google Play builds.');
}
if (!/^[1-9]\d*(\.\d+)*$/.test(String(appConfig.ios?.buildNumber || ''))) {
  fail('iOS buildNumber must be set before App Store builds.');
}

requireOrWarn(
  Boolean(appConfig.extra?.eas?.projectId),
  'EAS project is not linked. Run `npx eas-cli@20.0.0 init` or set `expo.extra.eas.projectId` before native release builds.',
  allowUnlinkedEas
);

const profiles = easConfig.build || {};
const submit = easConfig.submit || {};

for (const [profile, environment] of [['development', 'development'], ['preview', 'preview'], ['production', 'production']]) {
  if (profiles[profile]?.environment !== environment) {
    fail(`EAS build profile "${profile}" must set environment "${environment}".`);
  }
}

if (profiles.preview?.distribution !== 'internal') fail('EAS preview profile must use internal distribution for device QA.');
if (profiles.preview?.android?.buildType !== 'apk') fail('EAS preview Android build should produce an APK for fast internal QA.');
if (profiles.production?.android?.buildType !== 'app-bundle') fail('EAS production Android build must use app-bundle for Google Play.');
if (!profiles.production?.autoIncrement) fail('EAS production profile should autoIncrement native build numbers.');
if (!submit.production || typeof submit.production !== 'object') fail('EAS submit.production profile is required before store submission.');

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || appConfig.extra?.apiBaseUrl;
requireOrWarn(
  !isPlaceholderUrl(apiBaseUrl) && isHttpsUrl(apiBaseUrl),
  'Set EXPO_PUBLIC_API_BASE_URL to the hosted HTTPS API before native release builds.',
  allowPlaceholder
);

for (const [key, value] of [
  ['EXPO_PUBLIC_PRIVACY_POLICY_URL', process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL || appConfig.extra?.privacyPolicyUrl],
  ['EXPO_PUBLIC_TERMS_URL', process.env.EXPO_PUBLIC_TERMS_URL || appConfig.extra?.termsUrl],
  ['EXPO_PUBLIC_SUPPORT_URL', process.env.EXPO_PUBLIC_SUPPORT_URL || appConfig.extra?.supportUrl],
]) {
  requireOrWarn(
    !isPlaceholderUrl(value) && isHttpsUrl(value),
    `Set ${key} to a hosted HTTPS URL before native release builds.`,
    allowPlaceholder
  );
}

for (const path of [
  'docs/native-release-runbook.md',
  'docs/native-qa-evidence.template.json',
  'docs/policy-hosting-deployment.md',
  'docs/store-readiness.md',
  'docs/store-metadata.md',
  'docs/production-api-deployment.md',
  'docs/store-screenshots/README.md',
  'scripts/native-qa-preflight.js',
  'scripts/policy-hosting-preflight.js',
]) {
  if (!exists(path)) fail(`Missing native release document: ${path}`);
}

const easVersion = spawnSync('eas', ['--version'], { encoding: 'utf8' });
if (easVersion.status !== 0) {
  requireOrWarn(
    false,
    'EAS CLI is not installed as `eas`. Use `npx eas-cli@20.0.0` or install the CLI before release builds.',
    allowMissingCli
  );
} else {
  const output = `${easVersion.stdout}${easVersion.stderr}`.trim();
  if (output) console.log(`EAS CLI: ${output}`);
  else warn('EAS CLI returned an empty version string.');

  const whoami = spawnSync('eas', ['whoami', '--non-interactive'], { encoding: 'utf8' });
  requireOrWarn(
    whoami.status === 0,
    `EAS CLI is not logged in for non-interactive release work: ${(whoami.stderr || whoami.stdout || '').trim()}`,
    allowNotLoggedIn
  );
}

if (warnings.length > 0) {
  console.log('Warnings:');
  for (const message of warnings) console.log(`- ${message}`);
}

if (failures.length > 0) {
  console.error('Native release preflight failed:');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log('Native release preflight passed.');
