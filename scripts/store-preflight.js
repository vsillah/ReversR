const fs = require('fs');

const args = new Set(process.argv.slice(2));
const allowPlaceholder = args.has('--allow-placeholder');

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const exists = (path) => fs.existsSync(path);

const failures = [];
const warnings = [];

const fail = (message) => failures.push(message);
const warn = (message) => warnings.push(message);

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

const profiles = easConfig.build || {};
for (const [profile, environment] of [['development', 'development'], ['preview', 'preview'], ['production', 'production']]) {
  if (profiles[profile]?.environment !== environment) {
    fail(`EAS build profile "${profile}" must set environment "${environment}".`);
  }
}

if (profiles.production?.android?.buildType !== 'app-bundle') {
  fail('Production Android EAS build must use app-bundle for Google Play.');
}

const isPlaceholderUrl = (value) => !value || value.includes('example.com') || value.includes('example.org') || value.includes('localhost');
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
  ['privacyPolicyUrl', appConfig.extra?.privacyPolicyUrl],
  ['termsUrl', appConfig.extra?.termsUrl],
  ['supportUrl', appConfig.extra?.supportUrl],
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
];
for (const doc of requiredDocs) {
  if (!exists(doc)) fail(`Missing required store/readiness document: ${doc}`);
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
