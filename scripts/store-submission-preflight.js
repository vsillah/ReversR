const fs = require('fs');

const args = new Set(process.argv.slice(2));
const allowPlaceholder = args.has('--allow-placeholder');

const failures = [];
const warnings = [];

const fail = (message) => failures.push(message);
const warn = (message) => warnings.push(message);
const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));

const packet = readJson('docs/store-submission-packet.json');
const appConfig = readJson('app.json').expo;

const textLength = (value) => Array.from(String(value || '')).length;
const requireText = (path, value) => {
  if (!String(value || '').trim()) fail(`${path} is required.`);
};
const maxLength = (path, value, max) => {
  const length = textLength(value);
  if (length > max) fail(`${path} is ${length} characters; maximum is ${max}.`);
};
const minLength = (path, value, min) => {
  const length = textLength(value);
  if (length < min) fail(`${path} is ${length} characters; minimum is ${min}.`);
};

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

if (packet.appIdentity?.name !== appConfig.name) fail('Submission packet app name must match app.json expo.name.');
if (packet.appIdentity?.version !== appConfig.version) fail('Submission packet version must match app.json expo.version.');
if (packet.appIdentity?.iosBundleId !== appConfig.ios?.bundleIdentifier) fail('Submission packet iOS bundle ID must match app.json.');
if (packet.appIdentity?.androidPackage !== appConfig.android?.package) fail('Submission packet Android package must match app.json.');

const apple = packet.appStoreConnect || {};
requireText('appStoreConnect.name', apple.name);
minLength('appStoreConnect.name', apple.name, 2);
maxLength('appStoreConnect.name', apple.name, 30);
requireText('appStoreConnect.subtitle', apple.subtitle);
maxLength('appStoreConnect.subtitle', apple.subtitle, 30);
maxLength('appStoreConnect.promotionalText', apple.promotionalText, 170);
requireText('appStoreConnect.description', apple.description);
maxLength('appStoreConnect.description', apple.description, 4000);
requireText('appStoreConnect.keywords', apple.keywords);
maxLength('appStoreConnect.keywords', apple.keywords, 100);
requireText('appStoreConnect.reviewNotes', apple.reviewNotes);

if (apple.appPrivacy?.tracking !== false) fail('Apple privacy draft must state tracking=false.');
if (apple.appPrivacy?.dataUsedForAdvertising !== false) fail('Apple privacy draft must state dataUsedForAdvertising=false.');
if (!Array.isArray(apple.appPrivacy?.userContentProcessed) || apple.appPrivacy.userContentProcessed.length < 3) {
  fail('Apple privacy draft must list user content processed by the reconstruction flow.');
}

const google = packet.googlePlay || {};
requireText('googlePlay.title', google.title);
maxLength('googlePlay.title', google.title, 30);
requireText('googlePlay.shortDescription', google.shortDescription);
maxLength('googlePlay.shortDescription', google.shortDescription, 80);
requireText('googlePlay.fullDescription', google.fullDescription);
maxLength('googlePlay.fullDescription', google.fullDescription, 4000);

if (google.dataSafety?.tracking !== false) fail('Google Play Data safety draft must state tracking=false.');
if (google.dataSafety?.ads !== false) fail('Google Play Data safety draft must state ads=false.');
if (google.dataSafety?.encryptedInTransit !== true) fail('Google Play Data safety draft must state encryptedInTransit=true.');
if (!google.dataSafety?.requiredPermissions?.includes('android.permission.CAMERA')) {
  fail('Google Play Data safety draft must include camera as the only required sensitive permission.');
}

const requiredPermissions = google.dataSafety?.requiredPermissions || [];
const unexpectedPermissions = requiredPermissions.filter(permission => permission !== 'android.permission.CAMERA');
if (unexpectedPermissions.length > 0) {
  fail(`Google Play Data safety draft includes unexpected required permissions: ${unexpectedPermissions.join(', ')}`);
}

for (const [label, value] of [
  ['privacyPolicyUrl', process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL || packet.urls?.privacyPolicyUrl],
  ['termsUrl', process.env.EXPO_PUBLIC_TERMS_URL || packet.urls?.termsUrl],
  ['supportUrl', process.env.EXPO_PUBLIC_SUPPORT_URL || packet.urls?.supportUrl],
  ['apiBaseUrl', process.env.EXPO_PUBLIC_API_BASE_URL || packet.urls?.apiBaseUrl],
]) {
  requireHostedUrl(label, value);
}

if (!packet.supportContact?.email?.includes('@')) fail('Support contact email is required.');
if (!Array.isArray(packet.screenshots?.requiredSet) || packet.screenshots.requiredSet.length < 5) {
  fail('Submission packet must list at least five required native screenshots.');
}
if (packet.screenshots?.nativeRequired !== true) fail('Submission packet must mark native screenshots as required.');
if (!Array.isArray(packet.openGates) || packet.openGates.length < 5) fail('Submission packet must list remaining release gates.');

if (warnings.length > 0) {
  console.log('Warnings:');
  for (const message of warnings) console.log(`- ${message}`);
}

if (failures.length > 0) {
  console.error('Store submission preflight failed:');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log('Store submission preflight passed.');
