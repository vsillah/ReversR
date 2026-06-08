const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const args = new Set(process.argv.slice(2));
const asJson = args.has('--json');
const shouldWrite = args.has('--write');
const jsonOutputFile = process.env.RELEASE_NEXT_ACTIONS_JSON_FILE || 'docs/release-next-actions.json';
const markdownOutputFile = process.env.RELEASE_NEXT_ACTIONS_MD_FILE || 'docs/release-next-actions.md';

const summarizeGates = (gates) => gates.reduce((counts, gate) => {
  counts[gate.status] = (counts[gate.status] || 0) + 1;
  return counts;
}, {});

const writeText = (filePath, value) => {
  const target = path.resolve(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
  return target;
};

const writeJson = (filePath, value) => writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);

const renderList = (items, prefix = '-') => (
  items && items.length > 0
    ? items.map((item, index) => `${prefix === '1.' ? `${index + 1}.` : prefix} ${item}`).join('\n')
    : '- None recorded.'
);

const renderMarkdown = (result) => {
  const lines = [
    '# ReversR Rebuild Release Next Actions',
    '',
    `Generated at: ${result.generatedAt}`,
    `Release status generated at: ${result.releaseStatusGeneratedAt}`,
    '',
    'This generated packet is the external-operator action list for the clone release. It does not mark the app store-ready; it preserves the pending hosted, EAS, native QA, screenshot, and store-console gates.',
    '',
    '## Summary',
    '',
    `- Pass: ${result.summary.pass || 0}`,
    `- Pending: ${result.summary.pending || 0}`,
    `- Blocked: ${result.summary.blocked || 0}`,
    `- Warn: ${result.summary.warn || 0}`,
    `- Next recommended gate: ${result.nextRecommendedGate || 'none'}`,
    '',
  ];

  if (result.pendingGates.length === 0) {
    lines.push('No pending gates remain.', '');
    return `${lines.join('\n')}\n`;
  }

  result.pendingGates.forEach((gate, index) => {
    lines.push(
      `## ${index + 1}. ${gate.title}`,
      '',
      `- Gate ID: ${gate.id}`,
      `- Group: ${gate.group}`,
      `- Status: ${gate.status}`,
      `- Owner: ${gate.action.owner}`,
      `- Phase: ${gate.action.phase}`,
      `- Next action: ${gate.action.action}`,
      '',
      'Current gate evidence:',
      '',
      gate.evidence || 'No current evidence recorded.',
      '',
      'Current gate next step:',
      '',
      gate.nextStep || 'No gate-specific next step recorded.',
      '',
      'Steps:',
      '',
      renderList(gate.action.steps, '1.'),
      '',
      'Evidence required:',
      '',
      renderList(gate.action.evidence),
      ''
    );
  });

  return `${lines.join('\n')}\n`;
};

const statusResult = spawnSync(process.execPath, ['scripts/release-status.js', '--json'], {
  encoding: 'utf8',
});

if (statusResult.status !== 0) {
  console.error('Could not read release status:');
  console.error((statusResult.stderr || statusResult.stdout || '').trim());
  process.exit(statusResult.status || 1);
}

let releaseStatus;
try {
  releaseStatus = JSON.parse(statusResult.stdout);
} catch (error) {
  console.error(`Could not parse release status JSON: ${error.message}`);
  process.exit(1);
}

const readOptionalJson = (filePath) => {
  try {
    return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : null;
  } catch {
    return null;
  }
};
const nativeQaEvidence = readOptionalJson('docs/native-qa-evidence.json');
const storeConsoleEvidence = readOptionalJson('docs/store-console-evidence.json');
const nativeDeviceHandoff = readOptionalJson('docs/native-device-handoff.json');
const easProductionBuildSync = readOptionalJson('docs/eas-production-build-sync-evidence.json');
const easIosSubmitAttemptEvidence = readOptionalJson('docs/eas-ios-submit-attempt-evidence.json');
const easAndroidSubmitAttemptEvidence = readOptionalJson('docs/eas-android-submit-attempt-evidence.json');
const requiredScreenshotIds = [
  'welcome',
  'scan',
  'inventory-validation',
  'design-match',
  'build-handoff',
];
const screenshotStatus = (platform) => {
  const screenshots = nativeQaEvidence?.screenshots || [];
  const byId = new Map(screenshots.map((screenshot) => [screenshot.id, screenshot]));
  return requiredScreenshotIds.every((id) => {
    const platformEvidence = byId.get(id)?.[platform];
    return platformEvidence?.status === 'pass' && Boolean(platformEvidence.file);
  });
};
const androidPreviewRecorded = nativeQaEvidence?.builds?.androidPreview?.status === 'pass' && Boolean(nativeQaEvidence?.builds?.androidPreview?.buildUrl);
const iosPreviewRecorded = nativeQaEvidence?.builds?.iosPreview?.status === 'pass' && Boolean(nativeQaEvidence?.builds?.iosPreview?.buildUrl);
const iosProductionStoreBuildRecorded = (
  easProductionBuildSync?.latestProductionBuilds?.ios?.readinessStatus === 'pass' &&
  Boolean(easProductionBuildSync?.latestProductionBuilds?.ios?.buildUrl)
);
const androidScreenshotsRecorded = screenshotStatus('android');
const iosScreenshotsRecorded = screenshotStatus('ios');
const appStoreRecordRecorded = storeConsoleEvidence?.appStoreConnect?.status === 'pass' && Boolean(storeConsoleEvidence?.appStoreConnect?.appleId);
const googlePlayRecordRecorded = storeConsoleEvidence?.googlePlay?.status === 'pass' && Boolean(storeConsoleEvidence?.googlePlay?.recordUrl);
const appStoreApiAccessGateVisible = easIosSubmitAttemptEvidence?.status === 'blocked-hitl' &&
  easIosSubmitAttemptEvidence?.appStoreConnectScreen?.visibleAction === 'Request Access';
const googlePlayServiceAccountGateVisible = easAndroidSubmitAttemptEvidence?.status === 'blocked-hitl' &&
  /Google Service Account Keys/i.test(easAndroidSubmitAttemptEvidence?.result?.stdoutTail || '');
const googlePlayAndroidDeveloperApiGateVisible = (
  easAndroidSubmitAttemptEvidence?.status === 'blocked-google-api-disabled' ||
  /Google Play Android Developer API.*disabled/i.test(easAndroidSubmitAttemptEvidence?.result?.stdoutTailSanitized || '') ||
  /androidpublisher\.googleapis\.com/i.test(easAndroidSubmitAttemptEvidence?.remainingVerificationGate?.nextAction || '')
);
const iosDeviceRegistrationPending = [
  ...(nativeDeviceHandoff?.nextNativeQaActions || []),
  ...(nativeDeviceHandoff?.notCompletedByAutomation || []),
].some(item => /device-registration|register.*device|registration profile/i.test(item));
const iosInternalDeviceUnavailable = [
  ...(nativeDeviceHandoff?.nextNativeQaActions || []),
  ...(nativeDeviceHandoff?.notCompletedByAutomation || []),
].some(item => /no iOS device|internal preview path is not viable|TestFlight\/App Store distribution credentials|production\/TestFlight credentials/i.test(item));

const actionPlan = {
  'preview-host-smoke': {
    owner: 'Release operator',
    phase: 'Vercel preview access',
    action: 'Create or use a Vercel Protection Bypass for Automation secret and rerun the deployed preview smoke.',
    steps: [
      'Run npm run preview:discover -- --pr <pull-request-number> to refresh docs/preview-host-target.json.',
      'Copy the previewUrl or nextSmokeCommand from docs/preview-host-target.json.',
      'Open the Vercel project for the PR preview deployment.',
      'Go to Deployment Protection or Protection Bypass for Automation settings.',
      'Create or copy the automation bypass secret for the project.',
      'Run PREVIEW_SMOKE_URL=<vercel-preview-url> PREVIEW_SMOKE_VERCEL_BYPASS_SECRET=<secret> npm run preview:smoke.',
      'Confirm docs/preview-host-smoke-evidence.json has status pass and automationBypass.vercelBypassConfigured true.',
      'Run npm run release:evidence, then npm run release:status.',
    ],
    evidence: [
      'docs/preview-host-target.json records the current Vercel PR preview URL.',
      'docs/preview-host-smoke-evidence.json proves /, /privacy, /terms, and /support render on the deployed preview.',
      'The evidence records that a bypass was configured but does not contain the bypass secret.',
      'npm run release:status passes the preview-host-smoke gate.',
    ],
  },
  'hosted-api': {
    owner: 'Release operator',
    phase: 'Hosted backend',
    action: 'Deploy the API container behind HTTPS and bind production API env.',
    steps: [
      'Create a production API env file from docs/production-api-env.example.',
      'Follow docs/external-release-setup-runbook.md section 5 for hosted API and policy URL sequencing.',
      'Set API_CORS_ORIGINS to the hosted app origins, not *.',
      'Set AI_INTEGRATIONS_GEMINI_API_KEY, ADMIN_API_TOKEN, API_REQUEST_BODY_LIMIT, and connector secret settings on the API host.',
      'Run npm run api:deployment-smoke and confirm docs/api-deployment-smoke-evidence.json is updated.',
      'Deploy the Dockerfile to the chosen host.',
      'Run EXPO_PUBLIC_API_BASE_URL=https://api.your-domain.example npm run api:preflight.',
    ],
    evidence: [
      'docs/api-deployment-smoke-evidence.json records restricted CORS, body limit, and demo inventory validation.',
      'Hosted /api/health returns status ok.',
      'Runtime config reports restricted CORS.',
      'npm run api:preflight passes against the hosted URL.',
    ],
  },
  'hosted-policy-urls': {
    owner: 'Release operator',
    phase: 'Hosted policies',
    action: 'Deploy privacy, terms, and support pages to public HTTPS URLs.',
    steps: [
      'Run npm run policy:preflight:local and confirm docs/policy-hosting-smoke-evidence.json is updated.',
      'Follow docs/external-release-setup-runbook.md section 5 for hosted API and policy URL sequencing.',
      'Deploy the web export or route host that serves /privacy, /terms, and /support.',
      'Set EXPO_PUBLIC_PRIVACY_POLICY_URL, EXPO_PUBLIC_TERMS_URL, and EXPO_PUBLIC_SUPPORT_URL to the hosted URLs.',
      'Run npm run policy:preflight -- --check-hosted with those env vars set.',
    ],
    evidence: [
      'docs/policy-hosting-smoke-evidence.json records static export files, SPA rewrite, and required policy/support copy.',
      'All three policy/support URLs return reachable HTTPS pages.',
      'npm run policy:preflight -- --check-hosted passes.',
    ],
  },
  'real-connector-smoke': {
    owner: 'Inventory/admin operator',
    phase: 'Public inventory connector',
    action: 'Validate the public FarmBot machine inventory export and smoke the hosted connector path.',
    steps: [
      'Run npm run inventory:farmbot:validate on the public FarmBot export.',
      'Publish or reference the JSON source at a public HTTPS URL.',
      'Run npm run connector:smoke with EXPO_PUBLIC_API_BASE_URL, CONNECTOR_SMOKE_SOURCE_URL, CONNECTOR_SMOKE_AUTH_MODE=none, and CONNECTOR_SMOKE_EXPECTED_MACHINE_ID=FARMBOT-GENESIS-V1-8.',
      'Confirm docs/hosted-connector-smoke-evidence.json has status pass.',
    ],
    evidence: [
      'Inventory source validation passes for public/inventory/farmbot-genesis-v1.8.json.',
      'Hosted connector smoke validates the source, matches a machine, and generates a BOM.',
      'No raw connector secret appears in app responses or evidence.',
    ],
  },
  'eas-project-linkage': {
    owner: 'Apple/Google release operator',
    phase: 'EAS project setup',
    action: 'Log in to EAS and link the clone identity to its own EAS project.',
    steps: [
      'Run npm run native:preflight:local and confirm docs/native-release-config-evidence.json is updated.',
      'Follow docs/external-release-setup-runbook.md section 4 for EAS login, project linkage, env, and credentials.',
      'Run npx eas-cli@20.0.0 login.',
      'Run npx eas-cli@20.0.0 whoami --non-interactive to confirm the account.',
      'Run npx eas-cli@20.0.0 init for ReversR Rebuild.',
      'Confirm app.json contains expo.extra.eas.projectId for the clone.',
      'Run npm run native:preflight:local, then strict npm run native:preflight after hosted URLs are configured.',
    ],
    evidence: [
      'docs/native-release-config-evidence.json records native identity, camera permissions, EAS profile shape, submit profile shape, CLI availability, and remaining external gates.',
      'EAS whoami returns the intended account.',
      'app.json has the clone projectId.',
      'Native preflight no longer reports missing EAS project linkage.',
    ],
  },
  'eas-submit-config': {
    owner: 'Apple release operator',
    phase: 'EAS submit setup',
    action: 'Create the App Store Connect app record and add its Apple ID to eas.json.',
    steps: [
      'Create the App Store Connect app record for com.vsillah.reversrrebuild.',
      'Follow docs/external-release-setup-runbook.md sections 2 and 4.',
      'Copy the App Store Connect Apple ID from the app information page.',
      'Set eas.json submit.production.ios.ascAppId to that Apple ID.',
      'Keep Android submit.production.android.track set to internal for Google Play Internal Testing.',
      'Run npm run native:preflight.',
    ],
    evidence: [
      'eas.json has submit.production.ios.ascAppId.',
      'Native preflight no longer reports missing iOS ascAppId.',
    ],
  },
  'native-qa-evidence': {
    owner: 'QA/release operator',
    phase: 'Native preview QA',
    action: androidPreviewRecorded && !iosPreviewRecorded
      ? iosProductionStoreBuildRecorded
        ? 'Use the finished iOS store build for the TestFlight path, then record remaining device/simulator QA evidence.'
        : 'Complete iOS preview credentials/build, then record Android and iOS device QA evidence.'
      : 'Build Android/iOS preview binaries and record device QA evidence.',
    steps: [
      ...(androidPreviewRecorded
        ? ['Use the recorded Android preview build already in docs/native-qa-evidence.json.']
        : ['Run npx eas-cli@20.0.0 build --platform android --profile preview.']),
      'Follow docs/external-release-setup-runbook.md section 7 for preview QA evidence and screenshot files.',
      ...(iosPreviewRecorded
        ? ['Use the recorded iOS preview build already in docs/native-qa-evidence.json.']
        : iosInternalDeviceUnavailable ? [
            ...(androidScreenshotsRecorded
              ? ['Do not repeat Android screenshot capture unless a visual regression is found; Android Pixel screenshot evidence is already recorded in docs/native-qa-evidence.json.']
              : ['Reconnect the Android phone and finish Android preview QA/screenshots; make sure adb devices lists exactly one device.']),
            'Use the production/TestFlight iOS path instead of the internal device-registration path because no iOS device is available.',
            ...(iosProductionStoreBuildRecorded
              ? ['Use the finished iOS production/store build recorded in docs/eas-production-build-sync-evidence.json.']
              : [
                  'Configure iOS production/TestFlight credentials instead of internal preview credentials.',
                  'After EAS finishes creating App Store/TestFlight distribution credentials, start an iOS store build and record the build URL.',
                ]),
            'Use the installed Xcode 26.5, iOS 26.5 Simulator runtime, and CocoaPods 1.16.2 for local simulator screenshots only after CoreSimulator recovers; otherwise use the processed TestFlight build on an iOS device.',
          ] : iosDeviceRegistrationPending ? [
            'Complete the active EAS iOS device-registration prompt by opening the generated registration URL on the target iPhone/iPad and installing the profile.',
            'After the device registration profile is installed, return to the EAS credentials terminal and press any key so provisioning profile creation can continue.',
            'After EAS finishes creating the iOS provisioning profile, run npm run native:ios:preview-build and record the build URL after it starts.',
            'Run npm run native:eas:sync-builds to refresh docs/native-qa-evidence.json and docs/eas-preview-build-sync-evidence.json from EAS build:list.',
          ] : [
            'If the Apple account uses passkey-only login, create or connect an App Store Connect API key in the browser instead of retrying the EAS Apple password prompt.',
            'Run npm run native:ios:preview-build -- --dry-run to record the exact iOS preview build command and any missing local App Store Connect API env.',
            'After the Apple credential/API-key gate is complete, run npm run native:ios:preview-build and record the build URL after it starts.',
            'Run npm run native:eas:sync-builds to refresh docs/native-qa-evidence.json and docs/eas-preview-build-sync-evidence.json from EAS build:list.',
          ]),
      ...(nativeQaEvidence
        ? ['Update docs/native-qa-evidence.json with device QA results.']
        : ['Copy docs/native-qa-evidence.template.json to docs/native-qa-evidence.json.']),
      'Fill build URLs, devices, testers, timestamps, platform check statuses, screenshot records, and signoff fields.',
      'Run npm run native:qa:preflight.',
    ],
    evidence: [
      iosProductionStoreBuildRecorded
        ? 'docs/eas-production-build-sync-evidence.json records a finished iOS production/store build for the TestFlight path.'
        : 'docs/native-qa-evidence.json exists and references both preview builds.',
      'All required Android and iOS checks pass.',
      'npm run native:qa:preflight passes.',
    ],
  },
  'store-console-records': {
    owner: 'Store release operator',
    phase: 'Store console final review',
    action: appStoreRecordRecorded && googlePlayRecordRecorded
      ? appStoreApiAccessGateVisible
        ? 'Request App Store Connect API access and configure Google Play service account submit credentials before retrying store uploads; continue pending store signoff without public submission.'
        : 'Resolve the remaining App Store Connect and Google Play review/signoff gates without starting public submission.'
      : 'Create App Store Connect and Google Play Console records and fill console evidence.',
    steps: [
      ...(appStoreRecordRecorded
        ? ['Use the recorded App Store Connect app record and Apple ID in docs/store-console-evidence.json.']
        : ['Create the App Store Connect app record for com.vsillah.reversrrebuild.']),
      'Follow docs/external-release-setup-runbook.md sections 2 and 3.',
      ...(googlePlayRecordRecorded
        ? ['Use the recorded Google Play Console app dashboard URL in docs/store-console-evidence.json.']
        : ['Create the Google Play Console app record for com.vsillah.reversrrebuild.']),
      'Run npm run store:submission:preflight:local and confirm docs/store-submission-smoke-evidence.json is updated.',
      'Run npm run store:console:preflight:local and confirm docs/store-console-pending-evidence.json is updated.',
      'Review the saved App Store Connect metadata, age rating, content rights, and configured App Privacy answers.',
      'Only after explicit approval, publish App Privacy and complete any Apple legal/accuracy attestation.',
      'Complete TestFlight tester/group readiness or explicitly decide to proceed without TestFlight tester expansion.',
      'Review the saved Google Play metadata, Data Safety, App Content, content rating, target audience, Advertising ID, and internal-testing release.',
      'Only after explicit approval, complete Google Play internal-testing tester access/review readiness and any Send for review action.',
      ...(appStoreApiAccessGateVisible ? [
        'In App Store Connect, use Users and Access > Integrations > App Store Connect API.',
        'Request App Store Connect API access only after explicit account-holder approval.',
        'After access exists, configure an App Store Connect API key for EAS Submit or rerun the documented iOS submit command through an approved authenticated path.',
      ] : []),
      ...(googlePlayServiceAccountGateVisible ? [
        'Configure a Google Play service account key for EAS Submit only after explicit account-holder approval.',
        'Keep Android submit on the internal track; do not start a production rollout.',
        'After the service account key exists, rerun the documented Android internal-track submit command.',
      ] : []),
      ...(googlePlayAndroidDeveloperApiGateVisible ? [
        'Open the Google Cloud Console page for Google Play Android Developer API on the Kinflo Project.',
        'Enable androidpublisher.googleapis.com only after explicit account-holder approval for this Google Cloud account-side action.',
        'After the API is enabled, wait a few minutes for propagation if Google says it may be needed.',
        'Rerun the documented Android EAS submit command with the target track still set to internal.',
        'Do not click Google Play Send for review or start a production rollout.',
      ] : []),
      'Update docs/store-console-evidence.json with final console task results, review-gate, and signoff fields.',
      'Run npm run store:console:preflight:local for pending-safe proof; run strict npm run store:console:preflight only after final signoff fields are complete.',
    ],
    evidence: [
      'docs/store-submission-smoke-evidence.json records App Store metadata, Google Play metadata, privacy/data-safety answers, native screenshot requirements, and open gates.',
      'docs/store-console-pending-evidence.json records pending App Store Connect and Google Play setup requirements.',
      ...(appStoreApiAccessGateVisible
        ? ['docs/eas-ios-submit-attempt-evidence.json records the App Store Connect API Request Access gate before TestFlight upload.']
        : []),
      ...(googlePlayServiceAccountGateVisible
        ? ['docs/eas-android-submit-attempt-evidence.json records the Google service account key gate before internal-track upload.']
        : []),
      ...(googlePlayAndroidDeveloperApiGateVisible
        ? ['docs/eas-android-submit-attempt-evidence.json records the Google Play Android Developer API enablement gate after the internal-track EAS submission reached Fastlane.']
        : []),
      'docs/store-console-evidence.json exists with both console records.',
      'npm run store:console:preflight:local passes with only explicitly gated warnings until final signoff is complete.',
    ],
  },
  'native-screenshots': {
    owner: 'QA/release operator',
    phase: 'Native store screenshots',
    action: androidScreenshotsRecorded && !iosScreenshotsRecorded
      ? 'Use the recorded Android screenshots and capture the remaining iOS screenshot set.'
      : 'Capture final screenshots from Android and iOS preview builds.',
    steps: [
      'Run npm run screenshots:store against the local web preview and confirm docs/store-screenshots/planning-evidence.json is updated.',
      ...(androidScreenshotsRecorded
        ? ['Use the five recorded Android Pixel screenshots already saved under docs/store-screenshots/native/.']
        : ['Install the latest Android preview build and capture the five required Android screenshots.']),
      ...(iosScreenshotsRecorded
        ? ['Use the five recorded iOS screenshots already saved under docs/store-screenshots/native/.']
        : [
            'Install the latest iOS preview/TestFlight build on an iPhone/iPad, or recover CoreSimulator on this Mac and use the installed iOS 26.5 Simulator runtime.',
            'Capture the five required iOS screenshots.',
          ]),
      'Save PNGs under docs/store-screenshots/native/ using the documented filenames.',
      'Reference each PNG in docs/native-qa-evidence.json with device and capturedAt metadata.',
      'Run npm run native:qa:preflight.',
    ],
    evidence: [
      'docs/store-screenshots/planning-evidence.json maps the web planning captures to the required native screenshot filenames.',
      ...(androidScreenshotsRecorded
        ? ['Five Android native screenshot PNGs exist and are referenced in docs/native-qa-evidence.json.']
        : ['Five Android native screenshot PNGs exist.']),
      'Five iOS native screenshot PNGs exist.',
      'docs/native-qa-evidence.json marks each screenshot pass on Android and iOS.',
      'npm run native:qa:preflight passes.',
    ],
  },
  'release-evidence-bundle': {
    owner: 'Release operator',
    phase: 'Release evidence bundle',
    action: 'Generate the consolidated local proof packet before external account work resumes.',
    steps: [
      'Run npm run release:evidence.',
      'Confirm docs/release-evidence-bundle.json has status pass.',
      'Run npm run release:status and confirm the release-evidence-bundle gate passes.',
      'Use the bundle together with docs/external-release-setup-runbook.md during hosted, EAS, and store-console setup.',
    ],
    evidence: [
      'docs/release-evidence-bundle.json exists.',
      'The bundle includes local proof gate IDs, pending external gate IDs, app identity, permission story, EAS profile summary, and evidence file statuses.',
      'npm run release:status passes the release-evidence-bundle gate.',
    ],
  },
  'local-release-ci-evidence': {
    owner: 'Release operator',
    phase: 'Local release CI',
    action: 'Run the repeatable local validation suite and record evidence before external release work.',
    steps: [
      'Run npm run release:local-ci.',
      'Confirm docs/local-release-ci-evidence.json has status pass.',
      'Run npm run release:evidence to refresh the consolidated proof packet.',
      'Run npm run release:status and confirm the local-release-ci-evidence gate passes.',
    ],
    evidence: [
      'docs/local-release-ci-evidence.json exists with all local commands passed.',
      'The evidence names the external gates still required.',
      'npm run release:status passes the local-release-ci-evidence gate.',
    ],
  },
};

const externalActionGateIds = [
  'preview-host-smoke',
  'hosted-api',
  'hosted-policy-urls',
  'real-connector-smoke',
  'eas-project-linkage',
  'eas-submit-config',
  'native-qa-evidence',
  'store-console-records',
  'native-screenshots',
];
const gatesForActions = releaseStatus.gates.filter(gate => externalActionGateIds.includes(gate.id));
const pendingGates = gatesForActions
  .filter(gate => gate.status !== 'pass')
  .map(gate => ({
    ...gate,
    action: actionPlan[gate.id] || {
      owner: 'Release operator',
      phase: gate.group,
      action: gate.nextStep || 'Resolve the pending release gate.',
      steps: gate.nextStep ? [gate.nextStep] : [],
      evidence: [gate.evidence],
    },
  }));

const result = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  releaseStatusGeneratedAt: releaseStatus.generatedAt,
  summary: summarizeGates(gatesForActions),
  nextRecommendedGate: pendingGates[0]?.id || null,
  pendingGates,
};

if (shouldWrite) {
  const jsonPath = writeJson(jsonOutputFile, result);
  const markdownPath = writeText(markdownOutputFile, renderMarkdown(result));
  if (!asJson) {
    console.log(`Release next actions JSON written: ${jsonPath}`);
    console.log(`Release next actions Markdown written: ${markdownPath}`);
    console.log(`Pending gates: ${pendingGates.length}`);
    console.log(`Next recommended gate: ${result.nextRecommendedGate || '(none)'}`);
  }
}

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else if (!shouldWrite) {
  console.log('ReversR Rebuild next release actions');
  console.log(`Pass: ${result.summary.pass || 0} | Pending: ${result.summary.pending || 0} | Blocked: ${result.summary.blocked || 0} | Warn: ${result.summary.warn || 0}`);
  console.log('');

  if (pendingGates.length === 0) {
    console.log('No pending gates remain.');
  }

  for (const gate of pendingGates) {
    console.log(`[${gate.action.phase}] ${gate.title}`);
    console.log(`Owner: ${gate.action.owner}`);
    console.log(`Action: ${gate.action.action}`);
    if (gate.nextStep) console.log(`Current gate next step: ${gate.nextStep}`);
    if (gate.action.steps.length > 0) {
      console.log('Steps:');
      gate.action.steps.forEach((step, index) => console.log(`${index + 1}. ${step}`));
    }
    if (gate.action.evidence.length > 0) {
      console.log('Evidence required:');
      gate.action.evidence.forEach(item => console.log(`- ${item}`));
    }
    console.log('');
  }
}
