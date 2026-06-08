const fs = require('fs');
const path = require('path');

const args = new Set(process.argv.slice(2));
const allowPending = args.has('--allow-pending');
const evidencePath = process.env.STORE_CONSOLE_EVIDENCE_FILE || 'docs/store-console-evidence.json';
const pendingEvidenceFile = process.env.STORE_CONSOLE_PENDING_EVIDENCE_FILE || 'docs/store-console-pending-evidence.json';
const templatePath = 'docs/store-console-evidence.template.json';

const failures = [];
const warnings = [];

const fail = (message) => failures.push(message);
const warn = (message) => warnings.push(message);
const exists = (path) => fs.existsSync(path);
const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const writeJson = (filePath, value) => {
  const target = path.resolve(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
  return target;
};
const isHttpsUrl = (value) => /^https:\/\/[^/]+\.[^/]+/i.test(value || '');
const isPlaceholderUrl = (value) => (
  !value ||
  value.includes('example.com') ||
  value.includes('example.net') ||
  value.includes('example.org') ||
  value.includes('localhost')
);

const requireOrWarn = (condition, message) => {
  if (condition) return;
  if (allowPending) warn(message);
  else fail(message);
};

const appConfig = readJson('app.json').expo;
const packet = readJson('docs/store-submission-packet.json');
const evidence = exists(evidencePath) ? readJson(evidencePath) : readJson(templatePath);
const usingTemplate = !exists(evidencePath);

if (usingTemplate) {
  requireOrWarn(false, `Store console evidence file is missing. Copy ${templatePath} to ${evidencePath} after App Store Connect and Play Console records exist.`);
}

const release = evidence.releaseCandidate || {};
if (release.appName !== appConfig.name) fail('Store console evidence appName must match app.json.');
if (release.version !== appConfig.version) fail('Store console evidence version must match app.json.');
if (release.iosBundleId !== appConfig.ios?.bundleIdentifier) fail('Store console evidence iOS bundle ID must match app.json.');
if (release.androidPackage !== appConfig.android?.package) fail('Store console evidence Android package must match app.json.');
if (release.sku !== packet.appIdentity?.sku) fail('Store console evidence SKU must match docs/store-submission-packet.json.');

const appStore = evidence.appStoreConnect || {};
const googlePlay = evidence.googlePlay || {};
const assets = evidence.requiredAssets || {};
const reviewGates = evidence.reviewGates || {};
const signoff = evidence.signoff || {};

const validStatuses = new Set(['pass', 'blocked', 'pending']);
if (!validStatuses.has(appStore.status)) fail(`appStoreConnect.status must be one of ${Array.from(validStatuses).join(', ')}.`);
if (!validStatuses.has(googlePlay.status)) fail(`googlePlay.status must be one of ${Array.from(validStatuses).join(', ')}.`);

requireOrWarn(appStore.status === 'pass', 'App Store Connect record is not marked pass.');
requireOrWarn(Boolean(appStore.recordUrl) && isHttpsUrl(appStore.recordUrl), 'App Store Connect recordUrl is missing or not HTTPS.');
requireOrWarn(Boolean(appStore.appleId), 'App Store Connect Apple ID is missing.');
requireOrWarn(appStore.bundleIdStatus === 'pass', 'App Store Connect bundle ID status is not pass.');
if (appStore.sku !== packet.appIdentity?.sku) fail('App Store Connect SKU evidence must match the submission packet.');
requireOrWarn(Boolean(appStore.privacyPolicyUrl) && !isPlaceholderUrl(appStore.privacyPolicyUrl), 'App Store Connect privacyPolicyUrl must be the hosted production policy URL.');
requireOrWarn(appStore.metadataCopiedFromPacket === true, 'App Store Connect metadata is not marked copied from the submission packet.');
requireOrWarn(appStore.appPrivacyCompleted === true, 'App Store Connect App Privacy details are not marked complete.');
requireOrWarn(appStore.ageRatingCompleted === true, 'App Store Connect age rating is not marked complete.');
requireOrWarn(appStore.testFlightReady === true, 'App Store Connect TestFlight readiness is not marked complete.');

requireOrWarn(googlePlay.status === 'pass', 'Google Play Console record is not marked pass.');
requireOrWarn(Boolean(googlePlay.recordUrl) && isHttpsUrl(googlePlay.recordUrl), 'Google Play Console recordUrl is missing or not HTTPS.');
if (googlePlay.packageName !== appConfig.android?.package) fail('Google Play packageName evidence must match app.json.');
requireOrWarn(Boolean(googlePlay.privacyPolicyUrl) && !isPlaceholderUrl(googlePlay.privacyPolicyUrl), 'Google Play privacyPolicyUrl must be the hosted production policy URL.');
requireOrWarn(googlePlay.metadataCopiedFromPacket === true, 'Google Play metadata is not marked copied from the submission packet.');
requireOrWarn(googlePlay.dataSafetyCompleted === true, 'Google Play Data safety form is not marked complete.');
requireOrWarn(googlePlay.appContentCompleted === true, 'Google Play App content form is not marked complete.');
requireOrWarn(googlePlay.internalTestingReady === true, 'Google Play Internal Testing readiness is not marked complete.');

requireOrWarn(assets.nativeScreenshotsCaptured === true, 'Final native screenshots are not marked captured.');
requireOrWarn(assets.appIconReviewed === true, 'Final app icon review is not marked complete.');
requireOrWarn(assets.featureGraphicCaptured === true, 'Google Play feature graphic is not marked captured/upload-ready.');
requireOrWarn(assets.featureGraphicPath === 'docs/store-assets/google-play-feature-graphic.png', 'Store console evidence featureGraphicPath must point to docs/store-assets/google-play-feature-graphic.png.');
requireOrWarn(Boolean(assets.evidenceFolder), 'Store asset evidenceFolder is missing.');

for (const [key, value] of Object.entries(reviewGates)) {
  requireOrWarn(value === true, `Review gate ${key} is not marked true.`);
}

requireOrWarn(signoff.productionSubmissionApproved === true || reviewGates.productionSubmissionApproved === true, 'Production submission is not approved.');
requireOrWarn(Boolean(signoff.releaseOwner), 'Store console signoff is missing releaseOwner.');
requireOrWarn(Boolean(signoff.storeReviewer), 'Store console signoff is missing storeReviewer.');
requireOrWarn(Boolean(signoff.signedAt), 'Store console signoff is missing signedAt.');

if (warnings.length > 0) {
  console.log('Warnings:');
  for (const message of warnings) console.log(`- ${message}`);
}

if (failures.length > 0) {
  console.error('Store console preflight failed:');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

if (allowPending) {
  const pendingEvidencePath = writeJson(pendingEvidenceFile, {
    schemaVersion: 1,
    status: 'pending',
    generatedAt: new Date().toISOString(),
    source: usingTemplate ? templatePath : evidencePath,
    finalEvidenceFile: evidencePath,
    warnings,
    releaseCandidate: {
      appName: release.appName,
      version: release.version,
      iosBundleId: release.iosBundleId,
      androidPackage: release.androidPackage,
      sku: release.sku,
      matchesAppConfig: {
        appName: release.appName === appConfig.name,
        version: release.version === appConfig.version,
        iosBundleId: release.iosBundleId === appConfig.ios?.bundleIdentifier,
        androidPackage: release.androidPackage === appConfig.android?.package,
        sku: release.sku === packet.appIdentity?.sku,
      },
    },
    appStoreConnect: {
      status: appStore.status,
      recordUrlPresent: Boolean(appStore.recordUrl) && isHttpsUrl(appStore.recordUrl),
      appleIdPresent: Boolean(appStore.appleId),
      bundleIdStatus: appStore.bundleIdStatus,
      privacyPolicyUrlReady: Boolean(appStore.privacyPolicyUrl) && !isPlaceholderUrl(appStore.privacyPolicyUrl),
      metadataCopiedFromPacket: appStore.metadataCopiedFromPacket === true,
      appPrivacyCompleted: appStore.appPrivacyCompleted === true,
      ageRatingCompleted: appStore.ageRatingCompleted === true,
      testFlightReady: appStore.testFlightReady === true,
    },
    googlePlay: {
      status: googlePlay.status,
      recordUrlPresent: Boolean(googlePlay.recordUrl) && isHttpsUrl(googlePlay.recordUrl),
      packageNameMatches: googlePlay.packageName === appConfig.android?.package,
      privacyPolicyUrlReady: Boolean(googlePlay.privacyPolicyUrl) && !isPlaceholderUrl(googlePlay.privacyPolicyUrl),
      metadataCopiedFromPacket: googlePlay.metadataCopiedFromPacket === true,
      dataSafetyCompleted: googlePlay.dataSafetyCompleted === true,
      appContentCompleted: googlePlay.appContentCompleted === true,
      internalTestingReady: googlePlay.internalTestingReady === true,
    },
    requiredAssets: {
      nativeScreenshotsCaptured: assets.nativeScreenshotsCaptured === true,
      appIconReviewed: assets.appIconReviewed === true,
      featureGraphicCaptured: assets.featureGraphicCaptured === true,
      featureGraphicPathReady: assets.featureGraphicPath === 'docs/store-assets/google-play-feature-graphic.png',
      evidenceFolderPresent: Boolean(assets.evidenceFolder),
    },
    reviewGates: Object.fromEntries(Object.entries(reviewGates).map(([key, value]) => [key, value === true])),
    signoff: {
      productionSubmissionApproved: signoff.productionSubmissionApproved === true || reviewGates.productionSubmissionApproved === true,
      releaseOwnerPresent: Boolean(signoff.releaseOwner),
      storeReviewerPresent: Boolean(signoff.storeReviewer),
      signedAtPresent: Boolean(signoff.signedAt),
    },
  });
  console.log(`Pending evidence: ${pendingEvidencePath}`);
}

console.log('Store console preflight passed.');
