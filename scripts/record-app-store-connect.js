const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const getArg = (name) => {
  const direct = args.find(arg => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
};

const appleId = getArg('--apple-id') || process.env.APP_STORE_CONNECT_APPLE_ID || '';
const recordUrl = getArg('--record-url') || process.env.APP_STORE_CONNECT_RECORD_URL || '';
const privacyPolicyUrl = getArg('--privacy-url') || process.env.APP_STORE_CONNECT_PRIVACY_URL || 'https://reversr.vercel.app/privacy';
const supportUrl = getArg('--support-url') || process.env.APP_STORE_CONNECT_SUPPORT_URL || 'https://reversr.vercel.app/support';

const easPath = 'eas.json';
const storeEvidencePath = 'docs/store-console-evidence.json';
const browserHandoffPath = 'docs/store-console-browser-handoff.json';
const nativeDeviceHandoffPath = 'docs/native-device-handoff.json';
const autopilotHandoffPath = 'docs/release-autopilot-handoff.json';

const usage = () => {
  console.log(`Record App Store Connect app evidence

Usage:
  node scripts/record-app-store-connect.js --apple-id 1234567890 --record-url https://appstoreconnect.apple.com/apps/1234567890/appstore

Environment alternatives:
  APP_STORE_CONNECT_APPLE_ID=1234567890
  APP_STORE_CONNECT_RECORD_URL=https://appstoreconnect.apple.com/apps/1234567890/appstore

This script does not create an App Store Connect record. It only records values
after the app record exists.
`);
};

if (args.includes('--help')) {
  usage();
  process.exit(0);
}

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

if (!/^\d{6,}$/.test(appleId)) {
  fail('Missing or invalid --apple-id. Expected the numeric App Store Connect Apple ID from the created app record.');
}
if (!/^https:\/\/appstoreconnect\.apple\.com\/.+/i.test(recordUrl)) {
  fail('Missing or invalid --record-url. Expected an https://appstoreconnect.apple.com/... URL for the created app record.');
}
if (!/^https:\/\/.+/i.test(privacyPolicyUrl)) fail('Privacy URL must be HTTPS.');
if (!/^https:\/\/.+/i.test(supportUrl)) fail('Support URL must be HTTPS.');

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};
const writeRootJson = (filePath, value) => fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
const appendUnique = (items, value) => {
  if (!items.includes(value)) items.push(value);
};

const now = new Date().toISOString();

const eas = readJson(easPath);
eas.submit = eas.submit || {};
eas.submit.production = eas.submit.production || {};
eas.submit.production.ios = eas.submit.production.ios || {};
eas.submit.production.ios.ascAppId = appleId;
writeRootJson(easPath, eas);

const storeEvidence = readJson(storeEvidencePath);
storeEvidence.appStoreConnect = storeEvidence.appStoreConnect || {};
Object.assign(storeEvidence.appStoreConnect, {
  status: 'pending',
  recordUrl,
  appleId,
  bundleIdStatus: 'pass',
  privacyPolicyUrl,
});
storeEvidence.appStoreConnect.notes = [
  'App Store Connect app record exists for ReversR Rebuild.',
  `Recorded Apple ID ${appleId} and app record URL at ${now}.`,
  'Metadata, App Privacy, age rating, TestFlight readiness, native screenshots, and store signoff remain pending until completed in App Store Connect and verified.',
].join(' ');
writeJson(storeEvidencePath, storeEvidence);

if (fs.existsSync(browserHandoffPath)) {
  const browserHandoff = readJson(browserHandoffPath);
  browserHandoff.generatedAt = now;
  browserHandoff.appStoreConnect = browserHandoff.appStoreConnect || {};
  browserHandoff.appStoreConnect.browserState = 'App Store Connect app record exists; Apple ID and record URL have been copied into repo evidence.';
  browserHandoff.appStoreConnect.url = recordUrl;
  browserHandoff.appStoreConnect.accountGate = 'App Store Connect app record creation gate cleared. Metadata, App Privacy, age rating, TestFlight setup, and native screenshot upload remain pending.';
  browserHandoff.appStoreConnect.nextHumanAction = 'Complete App Store Connect metadata, App Privacy, age rating, TestFlight setup, and native screenshot upload tasks using docs/store-console-task-answers.md.';
  browserHandoff.appStoreConnect.neededValueAfterCreation = '';
  appendUnique(browserHandoff.notes, `App Store Connect Apple ID ${appleId} recorded at ${now}; eas.json submit.production.ios.ascAppId is configured.`);
  writeJson(browserHandoffPath, browserHandoff);
}

if (fs.existsSync(nativeDeviceHandoffPath)) {
  const nativeHandoff = readJson(nativeDeviceHandoffPath);
  nativeHandoff.generatedAt = now;
  nativeHandoff.browserHandoff = nativeHandoff.browserHandoff || {};
  nativeHandoff.browserHandoff.appStoreConnect = {
    url: recordUrl,
    state: `App Store Connect app record exists and Apple ID ${appleId} is recorded in eas.json submit.production.ios.ascAppId. EAS iOS credential login/2FA and iOS preview build remain pending.`,
  };
  nativeHandoff.nextNativeQaActions = (nativeHandoff.nextNativeQaActions || []).filter(action => !action.includes('copy the App Store Connect Apple ID'));
  appendUnique(nativeHandoff.nextNativeQaActions, 'Run npm run native:preflight, then run npx eas-cli@20.0.0 credentials --platform ios and complete Apple login/2FA for the preview profile.');
  nativeHandoff.notCompletedByAutomation = (nativeHandoff.notCompletedByAutomation || []).filter(item => !item.includes('No Apple App Store Connect app record was created'));
  appendUnique(nativeHandoff.notCompletedByAutomation, 'App Store Connect app record exists, but EAS iOS preview credential setup still requires Apple login/2FA.');
  writeJson(nativeDeviceHandoffPath, nativeHandoff);
}

if (fs.existsSync(autopilotHandoffPath)) {
  const autopilot = readJson(autopilotHandoffPath);
  autopilot.generatedAt = now;
  autopilot.activeBrowserState = autopilot.activeBrowserState || {};
  autopilot.activeBrowserState.appStoreConnect = {
    url: recordUrl,
    screen: 'Created App Store Connect app record',
    state: `App Store Connect app record exists; Apple ID ${appleId} is recorded in eas.json and docs/store-console-evidence.json.`,
    fields: {
      appleId,
      recordUrl,
      privacyPolicyUrl,
      supportUrl,
    },
    nextHumanAction: 'Complete App Store Connect metadata, App Privacy, age rating, TestFlight setup, and native screenshots using docs/store-console-task-answers.md.',
    copyBackAfterSuccess: '',
  };
  autopilot.lastStrictFailures = autopilot.lastStrictFailures || {};
  delete autopilot.lastStrictFailures.nativePreflight;
  autopilot.resumeInstructionsForVambah = (autopilot.resumeInstructionsForVambah || []).filter(item => !item.includes('click Create') && !item.includes('copy the Apple ID'));
  appendUnique(autopilot.resumeInstructionsForVambah, 'Complete Apple login/2FA in the EAS iOS preview credentials flow when prompted.');
  writeJson(autopilotHandoffPath, autopilot);
}

console.log(`Recorded App Store Connect Apple ID ${appleId}.`);
console.log(`Updated ${easPath}, ${storeEvidencePath}, and handoff evidence files.`);
console.log('Next: run npm run native:preflight and continue EAS iOS credentials setup.');
