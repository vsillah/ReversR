const fs = require('fs');
const { spawnSync } = require('child_process');

const args = new Set(process.argv.slice(2));
const allowPlaceholder = args.has('--allow-placeholder');

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const exists = (path) => fs.existsSync(path);
const readPngSize = (path) => {
  const buffer = fs.readFileSync(path);
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') {
    throw new Error(`${path} is not a PNG file.`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
};

const failures = [];
const warnings = [];

const fail = (message) => failures.push(message);
const warn = (message) => warnings.push(message);

const runCheck = (label, command, args) => {
  const result = spawnSync(command, args, { stdio: 'pipe', encoding: 'utf8' });
  if (result.status !== 0) {
    fail(`${label} failed: ${(result.stderr || result.stdout || '').trim()}`);
  }
};

const appConfig = readJson('app.json').expo;
const easConfig = readJson('eas.json');
const pkg = readJson('package.json');

const expected = {
  name: 'ReversR Rebuild',
  slug: 'reversr-rebuild',
  iosBundleId: 'com.vsillah.reversrrebuild',
  androidPackage: 'com.vsillah.reversrrebuild',
};

if (appConfig.name !== expected.name) fail(`Expected app name "${expected.name}", found "${appConfig.name}".`);
if (appConfig.slug !== expected.slug) fail(`Expected slug "${expected.slug}", found "${appConfig.slug}".`);
if (appConfig.ios?.bundleIdentifier !== expected.iosBundleId) {
  fail(`Expected iOS bundleIdentifier "${expected.iosBundleId}".`);
}
if (appConfig.android?.package !== expected.androidPackage) {
  fail(`Expected Android package "${expected.androidPackage}".`);
}

if (!/^[1-9]\d*$/.test(String(appConfig.android?.versionCode || ''))) {
  fail('Android versionCode must be a positive integer for Google Play builds.');
}

if (!/^[1-9]\d*(\.\d+)*$/.test(String(appConfig.ios?.buildNumber || ''))) {
  fail('iOS buildNumber must be set to a positive build number for App Store builds.');
}

const androidPermissions = appConfig.android?.permissions || [];
const blockedPermissions = appConfig.android?.blockedPermissions || [];
const disallowedPermissions = [
  'android.permission.RECORD_AUDIO',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.MANAGE_EXTERNAL_STORAGE',
];

if (!androidPermissions.includes('android.permission.CAMERA')) {
  fail('Android CAMERA permission is required for machine scanning.');
}

for (const permission of disallowedPermissions) {
  if (androidPermissions.includes(permission)) {
    fail(`Disallowed Android permission is explicitly requested: ${permission}`);
  }
}

for (const permission of disallowedPermissions.slice(0, 5)) {
  if (!blockedPermissions.includes(permission)) {
    fail(`Android blockedPermissions should include ${permission} to keep the store permission story narrow.`);
  }
}

const allDependencies = {
  ...(pkg.dependencies || {}),
  ...(pkg.devDependencies || {}),
};

if (allDependencies['expo-media-library']) {
  fail('expo-media-library is installed; remove it unless broad photo/media permissions are intentionally needed.');
}

if (!allDependencies['expo-camera']) fail('expo-camera must stay installed for machine scanning.');
if (!allDependencies['expo-sharing']) fail('expo-sharing must stay installed for reconstruction package export.');
if (!allDependencies['expo-file-system']) fail('expo-file-system must stay installed for local package export.');

runCheck('Accessibility preflight', process.execPath, ['scripts/accessibility-preflight.js']);
runCheck(
  'Store submission packet preflight',
  process.execPath,
  ['scripts/store-submission-preflight.js', ...(allowPlaceholder ? ['--allow-placeholder'] : [])]
);
runCheck(
  'Policy hosting preflight',
  process.execPath,
  ['scripts/policy-hosting-preflight.js', ...(allowPlaceholder ? ['--allow-placeholder'] : [])]
);

const requiredPngAssets = [
  ['expo.icon', appConfig.icon, 1024, 1024],
  ['android.adaptiveIcon.foregroundImage', appConfig.android?.adaptiveIcon?.foregroundImage, 1024, 1024],
  ['splash.image', appConfig.splash?.image, 1024, 1024],
  ['web.favicon', appConfig.web?.favicon, 1024, 1024],
];

for (const [label, path, expectedWidth, expectedHeight] of requiredPngAssets) {
  if (!path || !exists(path)) {
    fail(`Missing required release asset ${label}: ${path || '(not configured)'}`);
    continue;
  }

  try {
    const { width, height } = readPngSize(path);
    if (width !== expectedWidth || height !== expectedHeight) {
      fail(`Release asset ${label} must be ${expectedWidth}x${expectedHeight}; found ${width}x${height} at ${path}.`);
    }
  } catch (error) {
    fail(error.message);
  }
}

const profiles = easConfig.build || {};
for (const [profile, environment] of [['development', 'development'], ['preview', 'preview'], ['production', 'production']]) {
  if (profiles[profile]?.environment !== environment) {
    fail(`EAS build profile "${profile}" must set environment "${environment}".`);
  }
}

if (profiles.production?.android?.buildType !== 'app-bundle') {
  fail('Production Android EAS build must use app-bundle for Google Play.');
}

const isPlaceholderUrl = (value) => (
  !value ||
  value.includes('example.com') ||
  value.includes('example.net') ||
  value.includes('example.org') ||
  value.includes('localhost')
);
const isHttpsUrl = (value) => /^https:\/\/[^/]+\.[^/]+/i.test(value || '');

const configuredApiBase = process.env.EXPO_PUBLIC_API_BASE_URL || appConfig.extra?.apiBaseUrl || '';
const placeholderApi = isPlaceholderUrl(configuredApiBase);
if (placeholderApi && !allowPlaceholder) {
  fail('Set EXPO_PUBLIC_API_BASE_URL to the production API URL before store builds. Use --allow-placeholder only for local prototype checks.');
}
if (placeholderApi && allowPlaceholder) {
  warn('Using placeholder API URL because --allow-placeholder was provided.');
}

const requiredHostedUrls = [
  ['privacyPolicyUrl', process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL || appConfig.extra?.privacyPolicyUrl],
  ['termsUrl', process.env.EXPO_PUBLIC_TERMS_URL || appConfig.extra?.termsUrl],
  ['supportUrl', process.env.EXPO_PUBLIC_SUPPORT_URL || appConfig.extra?.supportUrl],
];
for (const [key, value] of requiredHostedUrls) {
  if ((isPlaceholderUrl(value) || !isHttpsUrl(value)) && !allowPlaceholder) {
    fail(`Set expo.extra.${key} to a real hosted HTTPS URL before store builds. Use --allow-placeholder only for local prototype checks.`);
  }
  if ((isPlaceholderUrl(value) || !isHttpsUrl(value)) && allowPlaceholder) {
    warn(`Using placeholder or non-production ${key} because --allow-placeholder was provided.`);
  }
}

const requiredDocs = [
  'docs/privacy-policy.md',
  'docs/terms-of-service.md',
  'docs/inventory-connector-spec.md',
  'docs/store-readiness.md',
  'docs/store-metadata.md',
  'docs/store-submission-packet.json',
  'docs/store-console-evidence.template.json',
  'docs/policy-hosting-deployment.md',
  'docs/production-api-deployment.md',
  'docs/native-release-runbook.md',
  'docs/eas-submit-configuration.md',
  'docs/native-qa-evidence.template.json',
  'docs/store-screenshots/README.md',
  'Dockerfile',
  '.dockerignore',
  'vercel.json',
  'app/privacy.tsx',
  'app/terms.tsx',
  'app/support.tsx',
  'scripts/native-release-preflight.js',
  'scripts/native-qa-preflight.js',
  'scripts/release-status.js',
  'scripts/inventory-connector-preflight.js',
  'scripts/hosted-connector-smoke.js',
  'scripts/policy-hosting-preflight.js',
  'scripts/store-submission-preflight.js',
  'scripts/store-console-preflight.js',
  'scripts/capture-store-screenshots.js',
  'scripts/web-flow-smoke.js',
];
for (const doc of requiredDocs) {
  if (!exists(doc)) fail(`Missing required store/readiness document: ${doc}`);
}

if (!exists('app.config.js')) {
  fail('Missing app.config.js; production builds need environment-driven API and policy/support URL binding.');
}

if (!appConfig.ios?.infoPlist?.NSCameraUsageDescription) {
  fail('iOS NSCameraUsageDescription is required.');
}

if (!appConfig.plugins?.some(plugin => Array.isArray(plugin) && plugin[0] === 'expo-camera')) {
  fail('expo-camera plugin must be configured with camera permission copy.');
}

if (warnings.length > 0) {
  console.log('Warnings:');
  for (const message of warnings) console.log(`- ${message}`);
}

if (failures.length > 0) {
  console.error('Store preflight failed:');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log('Store preflight passed.');
