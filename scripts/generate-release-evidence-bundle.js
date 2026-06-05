const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const outputFile = process.env.RELEASE_EVIDENCE_BUNDLE_FILE || 'docs/release-evidence-bundle.json';

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const readOptionalJson = (filePath) => {
  try {
    return fs.existsSync(filePath) ? readJson(filePath) : null;
  } catch (error) {
    return { status: 'invalid', error: error.message };
  }
};
const writeJson = (filePath, value) => {
  const target = path.resolve(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
  return target;
};
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
};

const appConfig = readJson('app.json').expo;
const easConfig = readJson('eas.json');
const packageJson = readJson('package.json');
const storePacket = readJson('docs/store-submission-packet.json');

const statusRun = run(process.execPath, ['scripts/release-status.js', '--json']);
if (statusRun.status !== 0) {
  console.error('Could not generate release evidence bundle because release:status failed.');
  console.error(statusRun.stderr || statusRun.stdout);
  process.exit(statusRun.status || 1);
}

let releaseStatus;
try {
  releaseStatus = JSON.parse(statusRun.stdout);
} catch (error) {
  console.error(`Could not parse release status JSON: ${error.message}`);
  process.exit(1);
}

const gatesWithoutBundle = releaseStatus.gates.filter(gate => gate.id !== 'release-evidence-bundle');
const summaryWithoutBundle = gatesWithoutBundle.reduce((counts, gate) => {
  counts[gate.status] = (counts[gate.status] || 0) + 1;
  return counts;
}, {});

const localProofGateIds = [
  'clone-identity',
  'retired-sit-step',
  'inventory-admin-connector',
  'inventory-source-validator',
  'machine-scan-examples',
  'reconstruction-package',
  'api-deployment-smoke',
  'policy-hosting-smoke',
  'store-submission-packet-smoke',
  'store-review-safety-packet',
  'store-screenshot-planning',
  'external-release-runbook',
  'objective-readiness-audit',
  'web-flow-smoke',
  'native-release-config-evidence',
  'store-console-pending-evidence',
  'local-release-ci-evidence',
  'release-local-ci-workflow',
  'store-console-copy-packet',
  'release-next-actions-packet',
  'preview-host-target-discovery',
  'preview-host-smoke',
  'hosted-api',
  'store-operator-packet',
  'hosted-operator-packet',
];
const externalGateIds = [
  'hosted-policy-urls',
  'real-connector-smoke',
  'eas-project-linkage',
  'eas-submit-config',
  'native-qa-evidence',
  'store-console-records',
  'native-screenshots',
];

const gateById = Object.fromEntries(gatesWithoutBundle.map(gate => [gate.id, gate]));
const missingLocalProofs = localProofGateIds.filter(id => gateById[id]?.status !== 'pass');
const pendingExternalGates = externalGateIds
  .map(id => gateById[id])
  .filter(Boolean)
  .map(gate => ({
    id: gate.id,
    group: gate.group,
    title: gate.title,
    evidence: gate.evidence,
    nextStep: gate.nextStep,
  }));

const evidenceFiles = {
  apiDeploymentSmoke: readOptionalJson('docs/api-deployment-smoke-evidence.json'),
  apiHostedPreflight: readOptionalJson('docs/api-hosted-preflight-evidence.json'),
  vercelProtectedApiSmoke: readOptionalJson('docs/vercel-protected-api-smoke-evidence.json'),
  policyHostingSmoke: readOptionalJson('docs/policy-hosting-smoke-evidence.json'),
  previewHostSmoke: readOptionalJson('docs/preview-host-smoke-evidence.json'),
  previewHostTarget: readOptionalJson('docs/preview-host-target.json'),
  objectiveReadinessAudit: readOptionalJson('docs/objective-readiness-audit.json'),
  storeSubmissionSmoke: readOptionalJson('docs/store-submission-smoke-evidence.json'),
  storeReviewSafety: readOptionalJson('docs/store-review-safety-evidence.json'),
  screenshotPlanning: readOptionalJson('docs/store-screenshots/planning-evidence.json'),
  webFlowSmoke: readOptionalJson('docs/web-flow-smoke-evidence.json'),
  nativeReleaseConfig: readOptionalJson('docs/native-release-config-evidence.json'),
  storeConsolePending: readOptionalJson('docs/store-console-pending-evidence.json'),
  storeOperatorPacket: readOptionalJson('docs/store-operator-packet/manifest.json'),
  hostedOperatorPacket: readOptionalJson('docs/hosted-operator-packet/manifest.json'),
  localReleaseCi: readOptionalJson('docs/local-release-ci-evidence.json'),
  releaseNextActions: readOptionalJson('docs/release-next-actions.json'),
};

const gitBranch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);

const bundle = {
  schemaVersion: 1,
  status: missingLocalProofs.length === 0 ? 'pass' : 'pending',
  generatedAt: new Date().toISOString(),
  releaseCandidate: {
    appName: appConfig.name,
    version: appConfig.version,
    slug: appConfig.slug,
    iosBundleId: appConfig.ios?.bundleIdentifier,
    androidPackage: appConfig.android?.package,
    androidVersionCode: appConfig.android?.versionCode,
    iosBuildNumber: appConfig.ios?.buildNumber,
    sku: storePacket.appIdentity?.sku,
  },
  git: {
    branch: gitBranch.status === 0 ? gitBranch.stdout : '',
  },
  releaseStatus: {
    generatedAt: releaseStatus.generatedAt,
    summaryWithoutBundle,
    missingLocalProofs,
    localProofGateIds,
    pendingExternalGateIds: externalGateIds,
    pendingExternalGates,
  },
  appStoreAndPlay: {
    appStoreName: storePacket.appStoreConnect?.name,
    appStoreSubtitle: storePacket.appStoreConnect?.subtitle,
    googlePlayTitle: storePacket.googlePlay?.title,
    googlePlayShortDescription: storePacket.googlePlay?.shortDescription,
    privacyPolicyUrl: storePacket.urls?.privacyPolicyUrl,
    termsUrl: storePacket.urls?.termsUrl,
    supportUrl: storePacket.urls?.supportUrl,
    apiBaseUrl: storePacket.urls?.apiBaseUrl,
    nativeScreenshotsRequired: storePacket.screenshots?.nativeRequired,
    googlePlayFeatureGraphic: storePacket.screenshots?.googlePlayFeatureGraphic,
  },
  permissionsAndPrivacy: {
    androidPermissions: appConfig.android?.permissions || [],
    androidBlockedPermissions: appConfig.android?.blockedPermissions || [],
    cameraUsageDescription: appConfig.ios?.infoPlist?.NSCameraUsageDescription || '',
    appleTracking: storePacket.appStoreConnect?.appPrivacy?.tracking,
    googlePlayTracking: storePacket.googlePlay?.dataSafety?.tracking,
    googlePlayAds: storePacket.googlePlay?.dataSafety?.ads,
    encryptedInTransit: storePacket.googlePlay?.dataSafety?.encryptedInTransit,
  },
  eas: {
    projectId: appConfig.extra?.eas?.projectId || '',
    buildProfiles: Object.keys(easConfig.build || {}),
    previewDistribution: easConfig.build?.preview?.distribution,
    productionAndroidBuildType: easConfig.build?.production?.android?.buildType,
    submitAndroidTrack: easConfig.submit?.production?.android?.track,
    submitIosAscAppIdConfigured: Boolean(easConfig.submit?.production?.ios?.ascAppId),
  },
  evidenceFiles,
  scripts: {
    releaseStatus: 'npm run release:status',
    releaseNextActions: 'npm run release:next-actions',
    releaseNextActionsWrite: 'npm run release:next-actions:write',
    previewHostDiscover: 'npm run preview:discover -- --pr <pull-request-number>',
    releaseObjective: 'npm run release:objective',
    releaseLocalCi: 'npm run release:local-ci',
    storeReviewSafety: 'npm run store:review-safety',
    storeConsoleCopy: 'npm run store:console:copy',
    storeOperatorPacket: 'npm run store:operator-packet',
    hostedOperatorPacket: 'npm run hosted:operator-packet',
    previewHostSmoke: 'PREVIEW_SMOKE_URL=https://your-pr-preview.vercel.app PREVIEW_SMOKE_VERCEL_BYPASS_SECRET=<secret> npm run preview:smoke',
    storePreflightLocal: 'npm run store:preflight:local',
    storeConsolePreflightLocal: 'npm run store:console:preflight:local',
    nativePreflightLocal: 'npm run native:preflight:local',
    hostedApiPreflight: 'EXPO_PUBLIC_API_BASE_URL=https://api.your-domain.example npm run api:preflight',
    vercelProtectedApiSmoke: 'VERCEL_PROTECTED_API_URL=https://your-preview.vercel.app npm run api:vercel-protected-smoke',
    hostedPolicyPreflight: 'npm run policy:preflight -- --check-hosted',
    hostedConnectorSmoke: 'npm run connector:smoke',
    nativeQaPreflight: 'npm run native:qa:preflight',
    storeConsolePreflight: 'npm run store:console:preflight',
  },
  sourceArtifacts: [
    'docs/store-submission-packet.json',
    'docs/store-review-safety-packet.md',
    'docs/store-review-safety-evidence.json',
    'docs/store-console-copy.md',
    'docs/store-operator-packet/manifest.json',
    'docs/store-operator-packet/README.md',
    'docs/hosted-operator-packet/manifest.json',
    'docs/hosted-operator-packet/README.md',
    'docs/api-hosted-preflight-evidence.json',
    'docs/store-console-pending-evidence.json',
    'docs/store-console-evidence.template.json',
    'docs/native-qa-evidence.template.json',
    'docs/local-release-ci-evidence.json',
    'docs/preview-host-target.json',
    'docs/objective-readiness-audit.json',
    'docs/external-release-setup-runbook.md',
    '.github/workflows/release-local-ci.yml',
    'docs/release-action-plan.md',
    'docs/release-next-actions.json',
    'docs/release-next-actions.md',
    'docs/store-readiness.md',
  ],
  notes: [
    'This bundle is local readiness evidence, not App Store Connect or Google Play approval.',
    'Production release still requires hosted API/policy URLs, real connector smoke, EAS linkage, preview builds, native QA, final native screenshots, TestFlight, and Play Internal Testing.',
    'Raw connector secrets must remain server-side and should not appear in mobile app config or evidence files.',
  ],
  packageScriptsAvailable: Object.keys(packageJson.scripts || {}).filter(name => (
    name.startsWith('release:') ||
    name.startsWith('store:') ||
    name.startsWith('native:') ||
    name.startsWith('api:') ||
    name.startsWith('connector:')
  )),
};

const outputPath = writeJson(outputFile, bundle);
console.log(`Release evidence bundle written: ${outputPath}`);
console.log(`Status: ${bundle.status}`);
console.log(`Local proof gaps: ${missingLocalProofs.length}`);
console.log(`External gates still pending: ${pendingExternalGates.length}`);
