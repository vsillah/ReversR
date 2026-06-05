const fs = require('fs');
const { spawnSync } = require('child_process');

const args = new Set(process.argv.slice(2));
const asJson = args.has('--json');
const strict = args.has('--strict');

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const exists = (path) => fs.existsSync(path);
const readText = (path) => exists(path) ? fs.readFileSync(path, 'utf8') : '';
const readOptionalJson = (path) => {
  try {
    return exists(path) ? readJson(path) : null;
  } catch {
    return null;
  }
};
const isHttpsUrl = (value) => /^https:\/\/[^/]+\.[^/]+/i.test(value || '');
const isPlaceholder = (value = '') => (
  !value ||
  value.includes('example.com') ||
  value.includes('example.net') ||
  value.includes('example.org') ||
  value.includes('localhost')
);

const appConfig = readJson('app.json').expo;
const easConfig = readJson('eas.json');
const packet = readJson('docs/store-submission-packet.json');

const gates = [];
const addGate = (group, id, title, status, evidence, nextStep = '') => {
  gates.push({ group, id, title, status, evidence, nextStep });
};

const readPngSize = (path) => {
  if (!exists(path)) return null;
  const buffer = fs.readFileSync(path);
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
};

const allFilesContain = (checks) => checks.every(([path, needle]) => readText(path).includes(needle));
const noFilesContain = (paths, needle) => paths.every(path => !readText(path).includes(needle));
const pngIs1024 = (path) => {
  const size = readPngSize(path);
  return size?.width === 1024 && size?.height === 1024;
};
const pngIsSize = (path, width, height) => {
  const size = readPngSize(path);
  return size?.width === width && size?.height === height;
};

const expectedIdentity = (
  appConfig.name === 'ReversR Rebuild' &&
  appConfig.slug === 'reversr-rebuild' &&
  appConfig.ios?.bundleIdentifier === 'com.vsillah.reversrrebuild' &&
  appConfig.android?.package === 'com.vsillah.reversrrebuild'
);
addGate(
  'clone',
  'clone-identity',
  'Clone app identity is distinct from the original ReversR app',
  expectedIdentity ? 'pass' : 'blocked',
  `name=${appConfig.name}; slug=${appConfig.slug}; ios=${appConfig.ios?.bundleIdentifier}; android=${appConfig.android?.package}`,
  expectedIdentity ? '' : 'Restore the ReversR Rebuild identity in app.json.'
);

const retiredSit = (
  noFilesContain(['server/index.js', 'components/PhaseOne.tsx', 'components/PhaseTwo.tsx', 'components/PhaseThree.tsx', 'components/PhaseFour.tsx'], 'Systematic Inventive') &&
  noFilesContain(['server/index.js'], '/api/apply-pattern')
);
addGate(
  'clone',
  'retired-sit-step',
  'Original Systematic Inventive Thinking step is removed from the active app/server flow',
  retiredSit ? 'pass' : 'blocked',
  retiredSit ? 'No active SIT route or label found in server/components.' : 'Active SIT text or /api/apply-pattern route is still present.',
  retiredSit ? '' : 'Remove the old SIT route/text from the active flow.'
);

const inventoryUi = allFilesContain([
  ['components/PhaseTwo.tsx', 'Inventory connector URL'],
  ['components/PhaseTwo.tsx', 'credentialRef'],
  ['components/PhaseTwo.tsx', 'Validate inventory connector'],
]);
addGate(
  'clone',
  'inventory-admin-connector',
  'Admin inventory connector form supports URL, auth mode, credentialRef, and validation',
  inventoryUi ? 'pass' : 'blocked',
  inventoryUi ? 'components/PhaseTwo.tsx exposes connector URL, credentialRef, and validation controls.' : 'Inventory connector controls are incomplete.',
  inventoryUi ? '' : 'Restore the Phase 2 connector controls before release testing.'
);

const inventorySourceValidator = allFilesContain([
  ['scripts/validate-machine-inventory.js', 'Machine inventory validation passed'],
  ['docs/inventory-connector-spec.md', 'npm run inventory:source:validate'],
]);
addGate(
  'clone',
  'inventory-source-validator',
  'Machine inventory exports can be validated before connector smoke',
  inventorySourceValidator ? 'pass' : 'blocked',
  inventorySourceValidator ? 'scripts/validate-machine-inventory.js and docs/inventory-connector-spec.md define source validation.' : 'Machine inventory source validator is missing.',
  inventorySourceValidator ? '' : 'Restore npm run inventory:source:validate and the connector spec instructions.'
);

const machineScanExamples = allFilesContain([
  ['components/PhaseOne.tsx', 'desktop FDM 3D printer'],
  ['components/PhaseOne.tsx', 'desktop CNC router'],
  ['components/PhaseOne.tsx', 'Point at a machine, model plate, or visible assembly'],
  ['components/PhaseOne.tsx', 'Sample machine'],
]);
addGate(
  'clone',
  'machine-scan-examples',
  'Default scan examples and camera guidance are machine-specific',
  machineScanExamples ? 'pass' : 'blocked',
  machineScanExamples ? 'Phase 1 presets and camera prompt are aligned to machine reconstruction.' : 'Phase 1 still has generic object/product scan examples.',
  machineScanExamples ? '' : 'Replace generic product/object copy with machine-focused scan examples.'
);

const reconstructionFlow = allFilesContain([
  ['server/index.js', '/api/gemini/match-machine'],
  ['server/index.js', '/api/gemini/generate-bom'],
  ['server/index.js', 'assemblySteps'],
  ['server/index.js', 'pricing'],
  ['components/PhaseFour.tsx', 'Generate BOM'],
  ['components/PhaseFour.tsx', 'Export Quote Packet'],
  ['components/PhaseFour.tsx', 'Vendor Request Draft'],
]);
addGate(
  'clone',
  'reconstruction-package',
  'Machine match produces BOM, assembly, pricing, quote packet, and vendor request surfaces',
  reconstructionFlow ? 'pass' : 'blocked',
  reconstructionFlow ? 'Server and Phase 4 UI include match, BOM, assembly, pricing, quote packet, and vendor draft paths.' : 'Reconstruction package pieces are missing.',
  reconstructionFlow ? '' : 'Restore match/BOM/vendor handoff implementation before release testing.'
);

const apiEnvTemplateOk = allFilesContain([
  ['docs/production-api-env.example', 'API_CORS_ORIGINS='],
  ['docs/production-api-env.example', 'AI_INTEGRATIONS_GEMINI_API_KEY='],
  ['docs/production-api-env.example', 'ADMIN_API_TOKEN='],
  ['scripts/api-env-preflight.js', 'API_CORS_ORIGINS'],
  ['scripts/api-env-preflight.js', 'AI_INTEGRATIONS_GEMINI_API_KEY'],
]);
addGate(
  'store-local',
  'api-env-template',
  'Production API environment template and preflight are present',
  apiEnvTemplateOk ? 'pass' : 'blocked',
  apiEnvTemplateOk ? 'docs/production-api-env.example and scripts/api-env-preflight.js cover CORS, AI key, admin token, and connector-secret settings.' : 'Production API env template or preflight coverage is missing.',
  apiEnvTemplateOk ? '' : 'Restore docs/production-api-env.example and scripts/api-env-preflight.js.'
);

const apiDeploymentSmoke = readOptionalJson('docs/api-deployment-smoke-evidence.json');
const apiDeploymentSmokeOk = (
  apiDeploymentSmoke?.status === 'pass' &&
  apiDeploymentSmoke?.health?.runtimeConfig?.corsMode === 'restricted' &&
  apiDeploymentSmoke?.health?.runtimeConfig?.requestBodyLimit &&
  apiDeploymentSmoke?.checks?.allowedOriginAccepted === true &&
  apiDeploymentSmoke?.checks?.deniedOriginRejected === true &&
  apiDeploymentSmoke?.checks?.retiredSitRouteStatus === 404 &&
  apiDeploymentSmoke?.checks?.demoInventoryValidation?.status === 'ok'
);
addGate(
  'store-local',
  'api-deployment-smoke',
  'Production-style API smoke evidence is recorded before hosted deployment',
  apiDeploymentSmokeOk ? 'pass' : 'pending',
  apiDeploymentSmokeOk
    ? `docs/api-deployment-smoke-evidence.json proves restricted CORS, body limit, retired SIT route, and demo inventory validation at ${apiDeploymentSmoke.generatedAt}.`
    : 'docs/api-deployment-smoke-evidence.json is missing or incomplete.',
  apiDeploymentSmokeOk ? '' : 'Run npm run api:deployment-smoke before deploying the API container.'
);

const policyHostingSmoke = readOptionalJson('docs/policy-hosting-smoke-evidence.json');
const expectedPolicyTexts = [
  'Privacy Policy',
  'Terms of Service',
  'Support',
  'Camera access is used only to capture machine images',
  'Manufacturer quote packets and email drafts require explicit user action',
  'vsillah@gmail.com',
];
const policyHostingSmokeOk = (
  policyHostingSmoke?.status === 'pass' &&
  policyHostingSmoke?.routeFiles?.privacy === 'app/privacy.tsx' &&
  policyHostingSmoke?.routeFiles?.terms === 'app/terms.tsx' &&
  policyHostingSmoke?.routeFiles?.support === 'app/support.tsx' &&
  (
    policyHostingSmoke?.vercelRewrite?.hasSpaRewrite === true ||
    policyHostingSmoke?.vercelRouting?.hasSpaRewrite === true ||
    policyHostingSmoke?.vercelRouting?.hasSpaRoute === true
  ) &&
  policyHostingSmoke?.exportFiles?.indexHtml === true &&
  policyHostingSmoke?.exportFiles?.metadataJson === true &&
  policyHostingSmoke?.exportFiles?.faviconIco === true &&
  Number(policyHostingSmoke?.bundle?.bundleCount || 0) > 0 &&
  expectedPolicyTexts.every(text => policyHostingSmoke?.bundle?.expectedTextFound?.[text] === true)
);
addGate(
  'store-local',
  'policy-hosting-smoke',
  'Policy, terms, and support static export evidence is recorded before hosting',
  policyHostingSmokeOk ? 'pass' : 'pending',
  policyHostingSmokeOk
    ? `docs/policy-hosting-smoke-evidence.json proves static export policy/support content at ${policyHostingSmoke.generatedAt}.`
    : 'docs/policy-hosting-smoke-evidence.json is missing or incomplete.',
  policyHostingSmokeOk ? '' : 'Run npm run policy:preflight:local before deploying policy/support pages.'
);

const storeSubmissionSmoke = readOptionalJson('docs/store-submission-smoke-evidence.json');
const storeSubmissionSmokeOk = (
  storeSubmissionSmoke?.status === 'pass' &&
  storeSubmissionSmoke?.appIdentity?.name === appConfig.name &&
  storeSubmissionSmoke?.appIdentity?.version === appConfig.version &&
  storeSubmissionSmoke?.appIdentity?.iosBundleId === appConfig.ios?.bundleIdentifier &&
  storeSubmissionSmoke?.appIdentity?.androidPackage === appConfig.android?.package &&
  storeSubmissionSmoke?.appStoreConnect?.nameLength <= 30 &&
  storeSubmissionSmoke?.appStoreConnect?.subtitleLength <= 30 &&
  storeSubmissionSmoke?.appStoreConnect?.keywordsLength <= 100 &&
  storeSubmissionSmoke?.appStoreConnect?.privacy?.tracking === false &&
  storeSubmissionSmoke?.appStoreConnect?.privacy?.dataUsedForAdvertising === false &&
  Number(storeSubmissionSmoke?.appStoreConnect?.privacy?.userContentProcessedCount || 0) >= 3 &&
  storeSubmissionSmoke?.googlePlay?.titleLength <= 30 &&
  storeSubmissionSmoke?.googlePlay?.shortDescriptionLength <= 80 &&
  storeSubmissionSmoke?.googlePlay?.dataSafety?.tracking === false &&
  storeSubmissionSmoke?.googlePlay?.dataSafety?.ads === false &&
  storeSubmissionSmoke?.googlePlay?.dataSafety?.encryptedInTransit === true &&
  Array.isArray(storeSubmissionSmoke?.googlePlay?.dataSafety?.requiredPermissions) &&
  storeSubmissionSmoke.googlePlay.dataSafety.requiredPermissions.length === 1 &&
  storeSubmissionSmoke.googlePlay.dataSafety.requiredPermissions[0] === 'android.permission.CAMERA' &&
  storeSubmissionSmoke?.screenshots?.nativeRequired === true &&
  Number(storeSubmissionSmoke?.screenshots?.requiredSetCount || 0) >= 5 &&
  Number(storeSubmissionSmoke?.openGatesCount || 0) >= 5
);
addGate(
  'store-local',
  'store-submission-packet-smoke',
  'Store submission metadata and privacy packet evidence is recorded',
  storeSubmissionSmokeOk ? 'pass' : 'pending',
  storeSubmissionSmokeOk
    ? `docs/store-submission-smoke-evidence.json proves App Store and Google Play packet constraints at ${storeSubmissionSmoke.generatedAt}.`
    : 'docs/store-submission-smoke-evidence.json is missing or incomplete.',
  storeSubmissionSmokeOk ? '' : 'Run npm run store:submission:preflight:local before store console setup.'
);

const storeReviewSafety = readOptionalJson('docs/store-review-safety-evidence.json');
const storeReviewSafetyOk = (
  storeReviewSafety?.status === 'pass' &&
  storeReviewSafety?.summary?.phrasePassCount === storeReviewSafety?.summary?.phraseCount &&
  storeReviewSafety?.summary?.fieldPassCount === storeReviewSafety?.summary?.fieldCount &&
  storeReviewSafety?.phraseChecks?.some(check => check.phrase === 'explicit human review' && check.found === true) &&
  storeReviewSafety?.phraseChecks?.some(check => check.phrase === 'does not automatically submit' && check.found === true) &&
  storeReviewSafety?.fieldChecks?.some(check => check.field === 'android.permissions.cameraOnly' && check.pass === true)
);
addGate(
  'store-local',
  'store-review-safety-packet',
  'Store review safety packet proves human-review and no-auto-submission boundaries',
  storeReviewSafetyOk ? 'pass' : 'pending',
  storeReviewSafetyOk
    ? `docs/store-review-safety-evidence.json proves ${storeReviewSafety.summary.phrasePassCount} phrases and ${storeReviewSafety.summary.fieldPassCount} field checks at ${storeReviewSafety.generatedAt}.`
    : 'docs/store-review-safety-evidence.json is missing or incomplete.',
  storeReviewSafetyOk ? '' : 'Run npm run store:review-safety before store review packet handoff.'
);

const androidPermissions = appConfig.android?.permissions || [];
const blockedPermissions = appConfig.android?.blockedPermissions || [];
const permissionOk = (
  androidPermissions.length === 1 &&
  androidPermissions.includes('android.permission.CAMERA') &&
  [
    'android.permission.RECORD_AUDIO',
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.WRITE_EXTERNAL_STORAGE',
    'android.permission.READ_MEDIA_IMAGES',
    'android.permission.READ_MEDIA_VIDEO',
  ].every(permission => blockedPermissions.includes(permission))
);
addGate(
  'store-local',
  'camera-only-permissions',
  'Android permission story is camera-only with broad media/microphone permissions blocked',
  permissionOk ? 'pass' : 'blocked',
  `permissions=${androidPermissions.join(',') || '(none)'}`,
  permissionOk ? '' : 'Fix app.json android.permissions and blockedPermissions.'
);

const assetsOk = [
  appConfig.icon,
  appConfig.android?.adaptiveIcon?.foregroundImage,
  appConfig.splash?.image,
  appConfig.web?.favicon,
].every(pngIs1024);
addGate(
  'store-local',
  'release-assets',
  'Required release PNG assets are present at 1024x1024',
  assetsOk ? 'pass' : 'blocked',
  assetsOk ? 'icon, adaptive icon foreground, splash, and favicon are 1024x1024 PNGs.' : 'One or more required release PNG assets are missing or wrong size.',
  assetsOk ? '' : 'Regenerate release PNG assets and rerun npm run store:preflight.'
);

const storeListingAssetsOk = pngIsSize('docs/store-assets/google-play-feature-graphic.png', 1024, 500);
addGate(
  'store-local',
  'store-listing-assets',
  'Google Play feature graphic is prepared at 1024x500',
  storeListingAssetsOk ? 'pass' : 'pending',
  storeListingAssetsOk ? 'docs/store-assets/google-play-feature-graphic.png is 1024x500.' : 'Google Play feature graphic is missing or wrong size.',
  storeListingAssetsOk ? '' : 'Run npm run store:assets:generate, then npm run store:assets:preflight.'
);

const screenshotPlanningEvidence = readOptionalJson('docs/store-screenshots/planning-evidence.json');
const expectedScreenshotIds = [
  'welcome',
  'scan',
  'inventory-validation',
  'design-match',
  'build-handoff',
  'privacy',
];
const expectedNativeScreenshotFiles = [
  'android-01-welcome.png',
  'android-02-scan.png',
  'android-03-inventory-validation.png',
  'android-04-design-match.png',
  'android-05-build-handoff.png',
  'ios-01-welcome.png',
  'ios-02-scan.png',
  'ios-03-inventory-validation.png',
  'ios-04-design-match.png',
  'ios-05-build-handoff.png',
];
const screenshotPlanningOk = (
  screenshotPlanningEvidence?.status === 'pass' &&
  screenshotPlanningEvidence?.nativeRequirement?.finalNativeScreenshotsStillRequired === true &&
  expectedScreenshotIds.every(id => screenshotPlanningEvidence?.expectedScreenIds?.includes(id)) &&
  ['phone', 'tablet'].every(viewport => screenshotPlanningEvidence?.capturedByViewport?.[viewport] === true) &&
  expectedNativeScreenshotFiles.every(file => screenshotPlanningEvidence?.nativeRequirement?.filenames?.includes(file)) &&
  Number(screenshotPlanningEvidence?.captures?.length || 0) >= 12
);
addGate(
  'store-local',
  'store-screenshot-planning',
  'Web-preview screenshot planning evidence is recorded before native screenshot capture',
  screenshotPlanningOk ? 'pass' : 'pending',
  screenshotPlanningOk
    ? `docs/store-screenshots/planning-evidence.json proves web planning captures and native screenshot filename mapping at ${screenshotPlanningEvidence.generatedAt}.`
    : 'docs/store-screenshots/planning-evidence.json is missing or incomplete.',
  screenshotPlanningOk ? '' : 'Run npm run screenshots:store against a running web preview before native screenshot capture.'
);

const requiredArtifacts = [
  'Dockerfile',
  '.dockerignore',
  'vercel.json',
  'docs/production-api-deployment.md',
  'docs/production-api-env.example',
  'docs/policy-hosting-deployment.md',
  'docs/policy-hosting-smoke-evidence.json',
  'docs/objective-readiness-audit.json',
  'docs/release-action-plan.md',
  'docs/release-next-actions.json',
  'docs/release-next-actions.md',
  'docs/release-evidence-bundle.json',
  'docs/local-release-ci-evidence.json',
  'docs/farmbot-public-inventory-evidence.json',
  'docs/preview-host-target.json',
  'docs/hosted-operator-packet/manifest.json',
  'docs/hosted-operator-packet/README.md',
  'docs/external-release-setup-runbook.md',
  '.github/workflows/release-local-ci.yml',
  'docs/native-release-runbook.md',
  'docs/native-release-config-evidence.json',
  'docs/native-qa-evidence.template.json',
  'docs/store-assets/README.md',
  'docs/store-screenshots/native/README.md',
  'docs/store-screenshots/planning-evidence.json',
  'docs/store-submission-packet.json',
  'docs/store-console-copy.md',
  'docs/store-operator-packet/manifest.json',
  'docs/store-operator-packet/README.md',
  'docs/store-submission-smoke-evidence.json',
  'docs/store-console-evidence.template.json',
  'docs/store-console-pending-evidence.json',
  'scripts/api-preflight.js',
  'scripts/api-env-preflight.js',
  'scripts/api-deployment-smoke.js',
  'scripts/objective-readiness-audit.js',
  'scripts/release-next-actions.js',
  'scripts/discover-preview-host.js',
  'scripts/generate-hosted-operator-packet.js',
  'scripts/local-release-ci.js',
  'scripts/generate-farmbot-inventory.js',
  'scripts/validate-machine-inventory.js',
  'scripts/inventory-connector-preflight.js',
  'scripts/hosted-connector-smoke.js',
  'scripts/preview-host-smoke.js',
  'scripts/native-release-preflight.js',
  'scripts/native-qa-preflight.js',
  'scripts/store-preflight.js',
  'scripts/store-submission-preflight.js',
  'scripts/generate-store-console-copy.js',
  'scripts/generate-store-operator-packet.js',
  'scripts/store-console-preflight.js',
  'scripts/store-assets-preflight.js',
  'scripts/generate-store-assets.js',
  'scripts/web-flow-smoke.js',
];
const artifactsOk = requiredArtifacts.every(exists);
addGate(
  'store-local',
  'release-artifacts',
  'Release scripts, docs, policy routes, API container, and store packet are present',
  artifactsOk ? 'pass' : 'blocked',
  artifactsOk ? `${requiredArtifacts.length} required release artifacts found.` : 'Required release artifact missing.',
  artifactsOk ? '' : 'Run npm run store:preflight:local to identify missing release artifacts.'
);

const releaseNextActions = readOptionalJson('docs/release-next-actions.json');
const releaseNextActionsMarkdown = readText('docs/release-next-actions.md');
const requiredNextActionGateIds = [
  'eas-project-linkage',
  'eas-submit-config',
  'native-qa-evidence',
  'store-console-records',
  'native-screenshots',
];
const releaseNextActionsOk = (
  releaseNextActions?.schemaVersion === 1 &&
  releaseNextActions?.nextRecommendedGate === 'eas-project-linkage' &&
  releaseNextActions?.summary?.pending === requiredNextActionGateIds.length &&
  releaseNextActions?.summary?.pass >= 1 &&
  Number(releaseNextActions?.pendingGates?.length || 0) === requiredNextActionGateIds.length &&
  requiredNextActionGateIds.every(id => releaseNextActions.pendingGates.some(gate => gate.id === id)) &&
  releaseNextActions.pendingGates.every(gate => (
    gate.action?.owner &&
    gate.action?.phase &&
    gate.action?.steps?.length > 0 &&
    gate.action?.evidence?.length > 0
  )) &&
  releaseNextActionsMarkdown.includes('ReversR Rebuild Release Next Actions') &&
  releaseNextActionsMarkdown.includes('Next recommended gate: eas-project-linkage') &&
  releaseNextActionsMarkdown.includes('This generated packet is the external-operator action list')
);
addGate(
  'store-local',
  'release-next-actions-packet',
  'Durable external-gate next action packet is generated',
  releaseNextActionsOk ? 'pass' : 'pending',
  releaseNextActionsOk
    ? `docs/release-next-actions.json and docs/release-next-actions.md list ${releaseNextActions.pendingGates.length} external gates at ${releaseNextActions.generatedAt}.`
    : 'docs/release-next-actions.json or docs/release-next-actions.md is missing or incomplete.',
  releaseNextActionsOk ? '' : 'Run npm run release:next-actions:write before external account-side release work.'
);

const previewHostTarget = readOptionalJson('docs/preview-host-target.json');
const previewHostTargetOk = (
  previewHostTarget?.schemaVersion === 1 &&
  previewHostTarget?.status === 'pass' &&
  previewHostTarget?.source === 'github-pr-comments' &&
  isHttpsUrl(previewHostTarget?.previewUrl) &&
  previewHostTarget?.previewUrl?.includes('.vercel.app') &&
  previewHostTarget?.nextSmokeCommand?.includes('PREVIEW_SMOKE_URL=') &&
  previewHostTarget?.previewSmokeStillRequired === true
);
addGate(
  'store-local',
  'preview-host-target-discovery',
  'Current Vercel PR preview target is discovered for preview smoke',
  previewHostTargetOk ? 'pass' : 'pending',
  previewHostTargetOk
    ? `docs/preview-host-target.json records ${previewHostTarget.previewUrl} at ${previewHostTarget.generatedAt}.`
    : 'docs/preview-host-target.json is missing or incomplete.',
  previewHostTargetOk ? '' : 'Run npm run preview:discover -- --pr <number>, then rerun npm run release:status.'
);

const externalRunbookChecks = [
  'App Store Connect',
  'Google Play Console',
  'EAS Project And Environment Setup',
  'com.vsillah.reversrrebuild',
  'reversr-rebuild-001',
  'docs/store-console-evidence.json',
  'docs/native-qa-evidence.json',
  'npm run store:console:preflight',
  'npm run native:qa:preflight',
  'npm run connector:smoke',
  'https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/',
  'https://support.google.com/googleplay/android-developer/answer/9859152',
  'https://docs.expo.dev/submit/introduction/',
];
const externalRunbookText = readText('docs/external-release-setup-runbook.md');
const externalRunbookOk = externalRunbookChecks.every(text => externalRunbookText.includes(text));
addGate(
  'store-local',
  'external-release-runbook',
  'External Apple, Google, EAS, hosted API, and connector setup runbook is present',
  externalRunbookOk ? 'pass' : 'pending',
  externalRunbookOk
    ? 'docs/external-release-setup-runbook.md covers account setup, exact clone IDs, evidence files, preflight commands, and official source links.'
    : 'docs/external-release-setup-runbook.md is missing required external setup coverage.',
  externalRunbookOk ? '' : 'Restore the external release setup runbook before account-side release work.'
);

const objectiveReadinessAudit = readOptionalJson('docs/objective-readiness-audit.json');
const expectedObjectiveRequirementIds = [
  'original-codebase-cloned',
  'distinct-clone-identity',
  'remove-systematic-inventive-thinking',
  'admin-machine-inventory-connector',
  'photo-to-inventory-machine-match',
  'bom-assembly-pricing-vendor-handoff',
  'store-readiness-packet',
  'apple-google-store-publication',
];
const objectiveReadinessAuditOk = (
  objectiveReadinessAudit?.schemaVersion === 1 &&
  ['pending', 'pass'].includes(objectiveReadinessAudit?.status) &&
  objectiveReadinessAudit?.completionClaim?.fullObjectiveComplete === false &&
  objectiveReadinessAudit?.completionClaim?.productionSubmissionReady === false &&
  expectedObjectiveRequirementIds.every(id => objectiveReadinessAudit?.requirements?.some(requirement => requirement.id === id)) &&
  objectiveReadinessAudit?.summary?.pendingRequirementIds?.includes('apple-google-store-publication') &&
  !objectiveReadinessAudit?.summary?.pendingRequirementIds?.includes('photo-to-inventory-machine-match')
);
addGate(
  'store-local',
  'objective-readiness-audit',
  'Original objective readiness audit is generated without falsely claiming store completion',
  objectiveReadinessAuditOk ? 'pass' : 'pending',
  objectiveReadinessAuditOk
    ? `docs/objective-readiness-audit.json maps ${objectiveReadinessAudit.summary.requirementCount} objective requirements and keeps full completion pending at ${objectiveReadinessAudit.generatedAt}.`
    : 'docs/objective-readiness-audit.json is missing or does not preserve the pending store/native completion boundary.',
  objectiveReadinessAuditOk ? '' : 'Run npm run release:objective, then npm run release:evidence and npm run release:status.'
);

const releaseEvidenceBundle = readOptionalJson('docs/release-evidence-bundle.json');
const requiredBundleProofs = [
  'clone-identity',
  'retired-sit-step',
  'inventory-admin-connector',
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
  'release-next-actions-packet',
  'preview-host-target-discovery',
  'preview-host-smoke',
  'hosted-api',
  'hosted-policy-urls',
  'real-connector-smoke',
  'store-operator-packet',
  'hosted-operator-packet',
];
const requiredBundlePending = [
  'eas-project-linkage',
  'eas-submit-config',
  'native-qa-evidence',
  'store-console-records',
  'native-screenshots',
];
const releaseEvidenceBundleOk = (
  releaseEvidenceBundle?.status === 'pass' &&
  releaseEvidenceBundle?.releaseCandidate?.appName === appConfig.name &&
  releaseEvidenceBundle?.releaseCandidate?.iosBundleId === appConfig.ios?.bundleIdentifier &&
  releaseEvidenceBundle?.releaseCandidate?.androidPackage === appConfig.android?.package &&
  requiredBundleProofs.every(id => releaseEvidenceBundle?.releaseStatus?.localProofGateIds?.includes(id)) &&
  requiredBundlePending.every(id => releaseEvidenceBundle?.releaseStatus?.pendingExternalGateIds?.includes(id)) &&
  Number(releaseEvidenceBundle?.releaseStatus?.pendingExternalGates?.length || 0) === requiredBundlePending.length &&
  releaseEvidenceBundle?.evidenceFiles?.apiDeploymentSmoke?.status === 'pass' &&
  releaseEvidenceBundle?.evidenceFiles?.apiHostedPreflight?.status === 'pass' &&
  releaseEvidenceBundle?.evidenceFiles?.policyHostingSmoke?.hostedChecksEnabled === true &&
  releaseEvidenceBundle?.evidenceFiles?.webFlowSmoke?.status === 'pass' &&
  releaseEvidenceBundle?.evidenceFiles?.previewHostSmoke?.status === 'pass' &&
  releaseEvidenceBundle?.evidenceFiles?.farmbotPublicInventory?.status === 'pass' &&
  releaseEvidenceBundle?.evidenceFiles?.hostedConnectorSmoke?.status === 'pass' &&
  releaseEvidenceBundle?.evidenceFiles?.storeConsolePending?.status === 'pending' &&
  releaseEvidenceBundle?.evidenceFiles?.releaseNextActions?.schemaVersion === 1 &&
  releaseEvidenceBundle?.evidenceFiles?.previewHostTarget?.status === 'pass' &&
  releaseEvidenceBundle?.evidenceFiles?.storeOperatorPacket?.status === 'pass' &&
  releaseEvidenceBundle?.evidenceFiles?.hostedOperatorPacket?.status === 'pass' &&
  Number(releaseEvidenceBundle?.evidenceFiles?.releaseNextActions?.pendingGates?.length || 0) === requiredBundlePending.length &&
  releaseEvidenceBundle?.evidenceFiles?.localReleaseCi?.status === 'pass'
);
addGate(
  'store-local',
  'release-evidence-bundle',
  'Consolidated release evidence bundle is generated for external operators',
  releaseEvidenceBundleOk ? 'pass' : 'pending',
  releaseEvidenceBundleOk
    ? `docs/release-evidence-bundle.json packages local proofs and ${releaseEvidenceBundle.releaseStatus.pendingExternalGates.length} external gates at ${releaseEvidenceBundle.generatedAt}.`
    : 'docs/release-evidence-bundle.json is missing or incomplete.',
  releaseEvidenceBundleOk ? '' : 'Run npm run release:evidence before external account-side release work.'
);

const localReleaseCiEvidence = readOptionalJson('docs/local-release-ci-evidence.json');
const expectedLocalCiCommands = [
  'typecheck',
  'accessibility-preflight',
  'store-assets-preflight',
  'inventory-preflight',
  'policy-preflight-local',
  'store-submission-preflight-local',
  'store-review-safety',
  'store-console-copy',
  'store-operator-packet',
  'hosted-operator-packet',
  'release-next-actions-write',
  'objective-readiness-audit',
  'store-console-preflight-local',
  'native-preflight-local',
  'native-qa-preflight-local',
  'store-preflight-local',
];
const localReleaseCiOk = (
  localReleaseCiEvidence?.status === 'pass' &&
  localReleaseCiEvidence?.commandCount === expectedLocalCiCommands.length &&
  localReleaseCiEvidence?.passedCount === expectedLocalCiCommands.length &&
  expectedLocalCiCommands.every(id => localReleaseCiEvidence?.results?.some(result => result.id === id && result.status === 'pass')) &&
  Array.isArray(localReleaseCiEvidence?.externalGatesStillRequired) &&
  !localReleaseCiEvidence.externalGatesStillRequired.includes('real-connector-smoke') &&
  localReleaseCiEvidence.externalGatesStillRequired.includes('eas-project-linkage') &&
  localReleaseCiEvidence.externalGatesStillRequired.includes('native-screenshots')
);
addGate(
  'store-local',
  'local-release-ci-evidence',
  'Local release CI evidence records repeatable pre-store validation',
  localReleaseCiOk ? 'pass' : 'pending',
  localReleaseCiOk
    ? `docs/local-release-ci-evidence.json records ${localReleaseCiEvidence.passedCount}/${localReleaseCiEvidence.commandCount} passing local checks at ${localReleaseCiEvidence.completedAt}.`
    : 'docs/local-release-ci-evidence.json is missing or incomplete.',
  localReleaseCiOk ? '' : 'Run npm run release:local-ci before external account-side release work.'
);

const storeOperatorPacket = readOptionalJson('docs/store-operator-packet/manifest.json');
const storeOperatorReadme = readText('docs/store-operator-packet/README.md');
const requiredStoreOperatorSources = [
  'docs/store-submission-packet.json',
  'docs/store-console-copy.md',
  'docs/store-review-safety-packet.md',
  'docs/store-console-evidence.template.json',
  'docs/native-qa-evidence.template.json',
  'docs/store-assets/google-play-feature-graphic.png',
];
const storeOperatorPacketOk = (
  storeOperatorPacket?.schemaVersion === 1 &&
  storeOperatorPacket?.status === 'pass' &&
  storeOperatorPacket?.appIdentity?.iosBundleId === appConfig.ios?.bundleIdentifier &&
  storeOperatorPacket?.appIdentity?.androidPackage === appConfig.android?.package &&
  storeOperatorPacket?.releaseStatus?.pendingGateIds?.includes('store-console-records') &&
  storeOperatorPacket?.releaseStatus?.pendingGateIds?.includes('native-screenshots') &&
  storeOperatorPacket?.assets?.nativeScreenshotsRequired === true &&
  storeOperatorPacket?.appStoreConnect?.privacyDraftReady === true &&
  storeOperatorPacket?.googlePlay?.dataSafetyDraftReady === true &&
  requiredStoreOperatorSources.every(source => storeOperatorPacket?.sourceArtifacts?.some(artifact => artifact.path === source && artifact.exists === true)) &&
  storeOperatorReadme.includes('ReversR Rebuild Store Operator Packet') &&
  storeOperatorReadme.includes('Operator Entry Order') &&
  storeOperatorReadme.includes('This folder is the store-console handoff packet')
);
addGate(
  'store-local',
  'store-operator-packet',
  'Store operator handoff packet is generated for App Store Connect and Google Play setup',
  storeOperatorPacketOk ? 'pass' : 'pending',
  storeOperatorPacketOk
    ? `docs/store-operator-packet/manifest.json packages ${storeOperatorPacket.sourceArtifacts.length} source artifacts at ${storeOperatorPacket.generatedAt}.`
    : 'docs/store-operator-packet/manifest.json or README.md is missing or incomplete.',
  storeOperatorPacketOk ? '' : 'Run npm run store:operator-packet before store-console setup.'
);

const hostedOperatorPacket = readOptionalJson('docs/hosted-operator-packet/manifest.json');
const hostedOperatorReadme = readText('docs/hosted-operator-packet/README.md');
const requiredHostedOperatorSources = [
  'docs/production-api-deployment.md',
  'docs/production-api-env.example',
  'docs/policy-hosting-deployment.md',
  'docs/external-release-setup-runbook.md',
  'docs/farmbot-public-inventory-evidence.json',
  'docs/hosted-connector-smoke-evidence.json',
  'public/inventory/farmbot-genesis-v1.8.json',
  'Dockerfile',
  'vercel.json',
  'scripts/generate-farmbot-inventory.js',
  'scripts/api-preflight.js',
  'scripts/hosted-connector-smoke.js',
  'scripts/policy-hosting-preflight.js',
];
const hostedOperatorPacketOk = (
  hostedOperatorPacket?.schemaVersion === 1 &&
  hostedOperatorPacket?.status === 'pass' &&
  hostedOperatorPacket?.appIdentity?.iosBundleId === appConfig.ios?.bundleIdentifier &&
  hostedOperatorPacket?.appIdentity?.androidPackage === appConfig.android?.package &&
  ['preview-host-smoke', 'hosted-api', 'hosted-policy-urls', 'real-connector-smoke'].every(id => (
    hostedOperatorPacket?.hostedGates?.some(gate => gate.id === id)
  )) &&
  hostedOperatorPacket?.commandSequence?.some(item => item.id === 'api-hosted-preflight') &&
  hostedOperatorPacket?.commandSequence?.some(item => item.id === 'hosted-connector-smoke') &&
  hostedOperatorPacket?.requiredEnv?.includes('API_CORS_ORIGINS') &&
  hostedOperatorPacket?.safetyBoundary?.some(item => item.includes('credentialRef only')) &&
  requiredHostedOperatorSources.every(source => hostedOperatorPacket?.sourceArtifacts?.some(artifact => artifact.path === source && artifact.exists === true)) &&
  hostedOperatorReadme.includes('ReversR Rebuild Hosted Operator Packet') &&
  hostedOperatorReadme.includes('Command Sequence') &&
  hostedOperatorReadme.includes('Hosted Gates')
);
addGate(
  'store-local',
  'hosted-operator-packet',
  'Hosted API, policy, preview, and connector handoff packet is generated',
  hostedOperatorPacketOk ? 'pass' : 'pending',
  hostedOperatorPacketOk
    ? `docs/hosted-operator-packet/manifest.json packages ${hostedOperatorPacket.hostedGates.length} hosted gates at ${hostedOperatorPacket.generatedAt}.`
    : 'docs/hosted-operator-packet/manifest.json or README.md is missing or incomplete.',
  hostedOperatorPacketOk ? '' : 'Run npm run hosted:operator-packet before hosted API/policy/connector work.'
);

const releaseWorkflowChecks = [
  'pull_request',
  'workflow_dispatch',
  'actions/setup-node@v4',
  'npm ci',
  'npm run release:local-ci',
  'npm run release:evidence',
  'npm run release:status',
  'actions/upload-artifact@v4',
  'docs/local-release-ci-evidence.json',
  'docs/release-evidence-bundle.json',
];
const releaseWorkflowText = readText('.github/workflows/release-local-ci.yml');
const releaseWorkflowOk = releaseWorkflowChecks.every(text => releaseWorkflowText.includes(text));
addGate(
  'store-local',
  'release-local-ci-workflow',
  'GitHub Actions workflow runs local release evidence checks on pull requests',
  releaseWorkflowOk ? 'pass' : 'pending',
  releaseWorkflowOk
    ? '.github/workflows/release-local-ci.yml runs local release CI, refreshes the release evidence bundle, verifies release status, and uploads evidence artifacts.'
    : '.github/workflows/release-local-ci.yml is missing required local release CI coverage.',
  releaseWorkflowOk ? '' : 'Restore the release-local-ci GitHub Actions workflow before PR review.'
);

const storeConsoleCopyChecks = [
  'ReversR Rebuild Store Console Copy Packet',
  'App Store Connect',
  'Google Play Console',
  'Machine rebuild packages',
  'Scan machines and create BOM, assembly, pricing, and fabrication packets.',
  'Camera access is used only to capture machine images',
  'android.permission.CAMERA',
  'docs/store-assets/google-play-feature-graphic.png',
  'Quote packets and vendor request drafts require explicit human review',
  'credentialRef',
];
const storeConsoleCopyText = readText('docs/store-console-copy.md');
const storeConsoleCopyOk = storeConsoleCopyChecks.every(text => storeConsoleCopyText.includes(text));
addGate(
  'store-local',
  'store-console-copy-packet',
  'Store console copy/paste packet is generated from submission metadata',
  storeConsoleCopyOk ? 'pass' : 'pending',
  storeConsoleCopyOk
    ? 'docs/store-console-copy.md contains App Store, Google Play, privacy, data-safety, screenshot, release-note, and safety copy.'
    : 'docs/store-console-copy.md is missing or incomplete.',
  storeConsoleCopyOk ? '' : 'Run npm run store:console:copy before App Store Connect or Play Console entry.'
);

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || packet.urls?.apiBaseUrl || appConfig.extra?.apiBaseUrl;
const hostedApiOk = !isPlaceholder(apiBaseUrl) && isHttpsUrl(apiBaseUrl);
const hostedApiPreflight = readOptionalJson('docs/api-hosted-preflight-evidence.json');
const vercelProtectedApiSmoke = readOptionalJson('docs/vercel-protected-api-smoke-evidence.json');
const hostedApiPreflightOk = (
  hostedApiPreflight?.schemaVersion === 1 &&
  hostedApiPreflight?.status === 'pass' &&
  hostedApiPreflight?.localApi === false &&
  !isPlaceholder(hostedApiPreflight?.apiBaseUrl) &&
  isHttpsUrl(hostedApiPreflight?.apiBaseUrl) &&
  hostedApiPreflight?.checks?.health?.status === 'pass' &&
  hostedApiPreflight?.checks?.health?.runtimeConfig?.corsMode === 'restricted' &&
  hostedApiPreflight?.checks?.demoInventoryValidation?.status === 'pass' &&
  Number(hostedApiPreflight?.checks?.demoInventoryValidation?.recordCount || 0) > 0
);
const webFlowEvidence = readOptionalJson('docs/web-flow-smoke-evidence.json');
const requiredWebFlowChecks = [
  'welcome',
  'legacySitAbsent',
  'scan',
  'inventoryValidation',
  'machineMatch',
  'bom',
  'quotePacket',
  'vendorRequestDraft',
  'manufacturingReadiness',
];
const webFlowEvidenceOk = (
  webFlowEvidence?.status === 'pass' &&
  webFlowEvidence?.api?.retiredSitRouteStatus === 404 &&
  requiredWebFlowChecks.every(check => webFlowEvidence?.verified?.[check] === true)
);
addGate(
  'hosted',
  'web-flow-smoke',
  'Local web preview can complete the machine reconstruction happy path',
  webFlowEvidenceOk ? 'pass' : 'pending',
  webFlowEvidenceOk
    ? `docs/web-flow-smoke-evidence.json proves ${requiredWebFlowChecks.length} checkpoints at ${webFlowEvidence.generatedAt}.`
    : exists('scripts/web-flow-smoke.js')
      ? 'Smoke script is available, but docs/web-flow-smoke-evidence.json does not yet prove the full happy path.'
      : 'scripts/web-flow-smoke.js is missing.',
  webFlowEvidenceOk ? '' : 'Run npm run web-preview, then in another shell run WEB_SMOKE_APP_URL=http://localhost:5001 npm run web:flow-smoke.'
);

const previewHostSmoke = readOptionalJson('docs/preview-host-smoke-evidence.json');
const expectedPreviewRouteIds = ['app-root', 'privacy', 'terms', 'support'];
const previewHostSmokeOk = (
  previewHostSmoke?.status === 'pass' &&
  previewHostSmoke?.schemaVersion === 1 &&
  isHttpsUrl(previewHostSmoke?.previewUrl) &&
  previewHostSmoke?.finalProductionHostedUrlsStillRequired === true &&
  expectedPreviewRouteIds.every(id => previewHostSmoke?.routes?.some(route => (
    route.id === id &&
    route.status === 'pass' &&
    route.httpStatus >= 200 &&
    route.httpStatus < 400
  )))
);
addGate(
  'hosted',
  'preview-host-smoke',
  'Vercel preview host renders app and policy/support routes before production hosting',
  previewHostSmokeOk ? 'pass' : 'pending',
  previewHostSmokeOk
    ? `docs/preview-host-smoke-evidence.json proves ${expectedPreviewRouteIds.length} deployed preview routes at ${previewHostSmoke.generatedAt}.`
    : previewHostSmoke?.deploymentProtectionLikely === true
      ? `docs/preview-host-smoke-evidence.json records Vercel 401 preview protection at ${previewHostSmoke.generatedAt}.`
      : 'Preview host evidence is missing, incomplete, or blocked by deployment protection.',
  previewHostSmokeOk ? '' : 'Run PREVIEW_SMOKE_URL=<vercel-preview-url> PREVIEW_SMOKE_VERCEL_BYPASS_SECRET=<secret> npm run preview:smoke after the PR preview deploys; if no bypass is available, create one in Vercel Protection Bypass for Automation.'
);

addGate(
  'hosted',
  'hosted-api',
  'Hosted HTTPS API URL is configured for native builds',
  hostedApiPreflightOk ? 'pass' : 'pending',
  hostedApiPreflightOk
    ? `docs/api-hosted-preflight-evidence.json proves hosted API health and demo inventory validation at ${hostedApiPreflight.generatedAt}.`
    : vercelProtectedApiSmoke?.status === 'pass'
      ? `Protected Vercel preview API works via authenticated CLI at ${vercelProtectedApiSmoke.generatedAt}; public/native API access is still required.`
      : hostedApiOk
        ? `Configured API URL shape: ${apiBaseUrl}; hosted preflight evidence is still required.`
        : 'No proven hosted API URL in environment or store packet.',
  hostedApiPreflightOk ? '' : 'Deploy the API behind HTTPS, then run EXPO_PUBLIC_API_BASE_URL=<url> npm run api:preflight.'
);

const hostedPolicyUrls = [
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL || packet.urls?.privacyPolicyUrl || appConfig.extra?.privacyPolicyUrl,
  process.env.EXPO_PUBLIC_TERMS_URL || packet.urls?.termsUrl || appConfig.extra?.termsUrl,
  process.env.EXPO_PUBLIC_SUPPORT_URL || packet.urls?.supportUrl || appConfig.extra?.supportUrl,
];
const hostedPoliciesOk = hostedPolicyUrls.every(value => !isPlaceholder(value) && isHttpsUrl(value));
const hostedPolicyEvidenceOk = (
  policyHostingSmokeOk &&
  policyHostingSmoke?.hostedChecksEnabled === true &&
  policyHostingSmoke?.urlMode === 'strict' &&
  hostedPolicyUrls.every(value => Object.values(policyHostingSmoke?.urls || {}).includes(value)) &&
  ['privacyPolicyUrl', 'termsUrl', 'supportUrl'].every(key => policyHostingSmoke?.hostedChecks?.[key] === 'pass')
);
addGate(
  'hosted',
  'hosted-policy-urls',
  'Privacy, terms, and support URLs are hosted and ready for store metadata',
  hostedPolicyEvidenceOk ? 'pass' : 'pending',
  hostedPolicyEvidenceOk
    ? `docs/policy-hosting-smoke-evidence.json proves hosted policy/support URLs at ${policyHostingSmoke.generatedAt}.`
    : hostedPoliciesOk
      ? `Configured URL shapes: ${hostedPolicyUrls.join(', ')}; hosted policy preflight evidence is still required.`
      : 'Hosted policy/support URLs are still placeholders or missing.',
  hostedPolicyEvidenceOk ? '' : 'Deploy /privacy, /terms, and /support, then run npm run policy:preflight -- --check-hosted with the hosted URL env vars.'
);

const farmbotPublicInventory = readOptionalJson('docs/farmbot-public-inventory-evidence.json');
const hostedConnectorSmoke = readOptionalJson('docs/hosted-connector-smoke-evidence.json');
const farmbotPublicInventoryOk = (
  farmbotPublicInventory?.schemaVersion === 1 &&
  farmbotPublicInventory?.status === 'pass' &&
  farmbotPublicInventory?.machineId === 'FARMBOT-GENESIS-V1-8' &&
  Number(farmbotPublicInventory?.sourcePartCount || 0) >= 25 &&
  Number(farmbotPublicInventory?.selectedPartCount || 0) >= 10 &&
  exists('public/inventory/farmbot-genesis-v1.8.json')
);
const hostedConnectorSmokeOk = (
  farmbotPublicInventoryOk &&
  hostedConnectorSmoke?.schemaVersion === 1 &&
  hostedConnectorSmoke?.status === 'pass' &&
  hostedConnectorSmoke?.localApi === false &&
  !isPlaceholder(hostedConnectorSmoke?.apiBaseUrl) &&
  isHttpsUrl(hostedConnectorSmoke?.apiBaseUrl) &&
  hostedConnectorSmoke?.connector?.sourceUrl?.includes('/farmbot-genesis-v1.8.json') &&
  isHttpsUrl(hostedConnectorSmoke?.connector?.sourceUrl) &&
  hostedConnectorSmoke?.connector?.authMode === 'none' &&
  hostedConnectorSmoke?.connector?.credentialRefConfigured === false &&
  Number(hostedConnectorSmoke?.validation?.recordCount || 0) >= 1 &&
  ['not-required', 'not_required', ''].includes(hostedConnectorSmoke?.validation?.credentialStatus || '') &&
  hostedConnectorSmoke?.match?.machineId === 'FARMBOT-GENESIS-V1-8' &&
  Number(hostedConnectorSmoke?.match?.confidenceScore || 0) >= 0.2 &&
  Number(hostedConnectorSmoke?.match?.assemblyStepCount || 0) >= 1 &&
  Number(hostedConnectorSmoke?.match?.fulfillmentOptionCount || 0) >= 1 &&
  Number(hostedConnectorSmoke?.bom?.itemCount || 0) >= 1 &&
  !/NaN/i.test(String(hostedConnectorSmoke?.bom?.totalEstimatedCost || '')) &&
  hostedConnectorSmoke?.safety?.rawSecretsIncluded === false
);
addGate(
  'hosted',
  'real-connector-smoke',
  'Hosted API can validate and match against a public machine inventory',
  hostedConnectorSmokeOk ? 'pass' : 'pending',
  hostedConnectorSmokeOk
    ? `docs/hosted-connector-smoke-evidence.json proves FarmBot public inventory validation, machine match, and BOM generation at ${hostedConnectorSmoke.generatedAt}.`
    : farmbotPublicInventoryOk
      ? 'FarmBot public inventory generated, but hosted connector smoke evidence is missing or incomplete.'
      : 'FarmBot public inventory source evidence is missing or incomplete.',
  hostedConnectorSmokeOk ? '' : 'Run npm run inventory:farmbot:validate, publish the JSON at an HTTPS URL, then run npm run connector:smoke against https://reversr.vercel.app.'
);

const easProjectId = appConfig.extra?.eas?.projectId;
const nativeReleaseConfigEvidence = readOptionalJson('docs/native-release-config-evidence.json');
const nativeReleaseConfigOk = (
  nativeReleaseConfigEvidence?.status === 'pass' &&
  nativeReleaseConfigEvidence?.appIdentity?.name === appConfig.name &&
  nativeReleaseConfigEvidence?.appIdentity?.iosBundleId === appConfig.ios?.bundleIdentifier &&
  nativeReleaseConfigEvidence?.appIdentity?.androidPackage === appConfig.android?.package &&
  nativeReleaseConfigEvidence?.permissions?.androidPermissions?.length === 1 &&
  nativeReleaseConfigEvidence?.permissions?.androidPermissions?.includes('android.permission.CAMERA') &&
  nativeReleaseConfigEvidence?.permissions?.cameraPluginConfigured === true &&
  nativeReleaseConfigEvidence?.eas?.buildProfiles?.preview?.distribution === 'internal' &&
  nativeReleaseConfigEvidence?.eas?.buildProfiles?.preview?.androidBuildType === 'apk' &&
  nativeReleaseConfigEvidence?.eas?.buildProfiles?.production?.androidBuildType === 'app-bundle' &&
  nativeReleaseConfigEvidence?.eas?.buildProfiles?.production?.autoIncrement === true &&
  nativeReleaseConfigEvidence?.eas?.submitProfile?.androidTrack === 'internal' &&
  nativeReleaseConfigEvidence?.externalGatesStillRequired?.easProjectLinkage === true &&
  nativeReleaseConfigEvidence?.externalGatesStillRequired?.iosAscAppId === true
);
addGate(
  'native',
  'native-release-config-evidence',
  'Native release config evidence is recorded before EAS account setup',
  nativeReleaseConfigOk ? 'pass' : 'pending',
  nativeReleaseConfigOk
    ? `docs/native-release-config-evidence.json proves native identity, permissions, EAS profiles, and remaining account gates at ${nativeReleaseConfigEvidence.generatedAt}.`
    : 'docs/native-release-config-evidence.json is missing or incomplete.',
  nativeReleaseConfigOk ? '' : 'Run npm run native:preflight:local before EAS project linkage.'
);

addGate(
  'native',
  'eas-project-linkage',
  'EAS project is linked for the clone identity',
  easProjectId ? 'pass' : 'pending',
  easProjectId ? `projectId=${easProjectId}` : 'expo.extra.eas.projectId is not set.',
  easProjectId ? '' : 'Run npx eas-cli@20.0.0 init for the clone identity.'
);

const productionSubmit = easConfig.submit?.production || {};
const easSubmitReady = (
  productionSubmit.android?.track === 'internal' &&
  Boolean(productionSubmit.ios?.ascAppId)
);
addGate(
  'native',
  'eas-submit-config',
  'EAS submit profile is configured for Google Play Internal Testing and TestFlight upload',
  easSubmitReady ? 'pass' : 'pending',
  easSubmitReady
    ? `android.track=${productionSubmit.android.track}; ios.ascAppId configured.`
    : `android.track=${productionSubmit.android?.track || '(missing)'}; ios.ascAppId=${productionSubmit.ios?.ascAppId ? 'configured' : '(missing)'}.`,
  easSubmitReady
    ? ''
    : 'After App Store Connect record creation, set submit.production.ios.ascAppId in eas.json, then run npm run native:preflight.'
);

const easVersion = spawnSync('npx', ['--yes', 'eas-cli@20.0.0', '--version'], { encoding: 'utf8' });
addGate(
  'native',
  'eas-cli-available',
  'Pinned EAS CLI can be invoked for release operations',
  easVersion.status === 0 ? 'pass' : 'pending',
  easVersion.status === 0 ? `${easVersion.stdout || easVersion.stderr}`.trim() : 'npx eas-cli@20.0.0 is not currently available.',
  easVersion.status === 0 ? 'Run npx eas-cli@20.0.0 login and npm run native:preflight.' : 'Install network/cache access for npx eas-cli@20.0.0 or install global eas.'
);

const nativeQaEvidenceExists = exists('docs/native-qa-evidence.json');
addGate(
  'native',
  'native-qa-evidence',
  'Android and iOS preview-build QA evidence is recorded',
  nativeQaEvidenceExists ? 'pending' : 'pending',
  nativeQaEvidenceExists ? 'docs/native-qa-evidence.json exists; run npm run native:qa:preflight for proof.' : 'docs/native-qa-evidence.json is missing.',
  nativeQaEvidenceExists ? 'Run npm run native:qa:preflight and resolve any failures.' : 'Build EAS preview binaries, copy docs/native-qa-evidence.template.json, fill evidence, then run npm run native:qa:preflight.'
);

const storeConsolePendingEvidence = readOptionalJson('docs/store-console-pending-evidence.json');
const storeConsolePendingOk = (
  storeConsolePendingEvidence?.status === 'pending' &&
  storeConsolePendingEvidence?.releaseCandidate?.matchesAppConfig?.appName === true &&
  storeConsolePendingEvidence?.releaseCandidate?.matchesAppConfig?.iosBundleId === true &&
  storeConsolePendingEvidence?.releaseCandidate?.matchesAppConfig?.androidPackage === true &&
  storeConsolePendingEvidence?.appStoreConnect?.status === 'pending' &&
  storeConsolePendingEvidence?.googlePlay?.status === 'pending' &&
  storeConsolePendingEvidence?.googlePlay?.packageNameMatches === true &&
  storeConsolePendingEvidence?.requiredAssets?.featureGraphicPathReady === true &&
  storeConsolePendingEvidence?.reviewGates?.hostedApiPreflightPassed === false &&
  storeConsolePendingEvidence?.reviewGates?.nativeQaPreflightPassed === false
);
addGate(
  'store-console',
  'store-console-pending-evidence',
  'Store console pending evidence records account-side setup requirements',
  storeConsolePendingOk ? 'pass' : 'pending',
  storeConsolePendingOk
    ? `docs/store-console-pending-evidence.json records pending App Store Connect and Google Play setup at ${storeConsolePendingEvidence.generatedAt}.`
    : 'docs/store-console-pending-evidence.json is missing or incomplete.',
  storeConsolePendingOk ? '' : 'Run npm run store:console:preflight:local before creating console records.'
);

const storeConsoleEvidenceExists = exists('docs/store-console-evidence.json');
addGate(
  'store-console',
  'store-console-records',
  'App Store Connect and Google Play Console app records exist',
  storeConsoleEvidenceExists ? 'pending' : 'pending',
  storeConsoleEvidenceExists
    ? 'docs/store-console-evidence.json exists; run npm run store:console:preflight for proof.'
    : `Expected iOS bundle ${appConfig.ios?.bundleIdentifier}; expected Android package ${appConfig.android?.package}; docs/store-console-evidence.json is missing.`,
  storeConsoleEvidenceExists
    ? 'Run npm run store:console:preflight and resolve any failures.'
    : 'Create the App Store Connect and Play Console app records, copy docs/store-console-evidence.template.json, fill evidence, then run npm run store:console:preflight.'
);

addGate(
  'store-console',
  'native-screenshots',
  'Final native screenshots are captured from Android/iOS preview builds',
  'pending',
  'Web-preview screenshots are planning artifacts only; native screenshots are not represented in repo evidence yet.',
  'Capture final screenshots from EAS preview builds and record them in docs/native-qa-evidence.json.'
);

const groups = ['clone', 'store-local', 'hosted', 'native', 'store-console'];
const statusOrder = { blocked: 0, pending: 1, warn: 2, pass: 3 };
const summary = gates.reduce((counts, gate) => {
  counts[gate.status] = (counts[gate.status] || 0) + 1;
  return counts;
}, {});

if (asJson) {
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), summary, gates }, null, 2));
} else {
  console.log('ReversR Rebuild release status');
  console.log(`Pass: ${summary.pass || 0} | Pending: ${summary.pending || 0} | Blocked: ${summary.blocked || 0} | Warn: ${summary.warn || 0}`);
  console.log('');

  for (const group of groups) {
    const groupGates = gates
      .filter(gate => gate.group === group)
      .sort((left, right) => statusOrder[left.status] - statusOrder[right.status]);
    if (groupGates.length === 0) continue;
    console.log(`[${group}]`);
    for (const gate of groupGates) {
      console.log(`- ${gate.status.toUpperCase()} ${gate.title}`);
      console.log(`  Evidence: ${String(gate.evidence).replace(/\s+/g, ' ').trim()}`);
      if (gate.nextStep) console.log(`  Next: ${gate.nextStep}`);
    }
    console.log('');
  }
}

if (strict && gates.some(gate => gate.status !== 'pass')) {
  process.exit(1);
}
