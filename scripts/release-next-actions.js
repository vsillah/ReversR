const { spawnSync } = require('child_process');

const args = new Set(process.argv.slice(2));
const asJson = args.has('--json');

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

const actionPlan = {
  'hosted-api': {
    owner: 'Release operator',
    phase: 'Hosted backend',
    action: 'Deploy the API container behind HTTPS and bind production API env.',
    steps: [
      'Create a production API env file from docs/production-api-env.example.',
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
      'Deploy the web export or route host that serves /privacy, /terms, and /support.',
      'Set EXPO_PUBLIC_PRIVACY_POLICY_URL, EXPO_PUBLIC_TERMS_URL, and EXPO_PUBLIC_SUPPORT_URL to the hosted URLs.',
      'Run npm run policy:preflight -- --check-hosted with those env vars set.',
    ],
    evidence: [
      'All three policy/support URLs return reachable HTTPS pages.',
      'npm run policy:preflight -- --check-hosted passes.',
    ],
  },
  'real-connector-smoke': {
    owner: 'Inventory/admin operator',
    phase: 'Production inventory connector',
    action: 'Validate the real machine inventory export and smoke the hosted connector path.',
    steps: [
      'Run npm run inventory:source:validate -- <inventory.csv-or-json> on the real export.',
      'Configure the connector credential on the hosted API as a server-side credentialRef.',
      'Run npm run connector:smoke with EXPO_PUBLIC_API_BASE_URL, CONNECTOR_SMOKE_SOURCE_URL, CONNECTOR_SMOKE_AUTH_MODE, and CONNECTOR_SMOKE_CREDENTIAL_REF.',
      'Set CONNECTOR_SMOKE_EXPECTED_MACHINE_ID for a known machine when possible.',
    ],
    evidence: [
      'Inventory source validation passes for the real export.',
      'Hosted connector smoke validates the source, matches a machine, and generates a BOM.',
      'No raw connector secret appears in app responses or evidence.',
    ],
  },
  'eas-project-linkage': {
    owner: 'Apple/Google release operator',
    phase: 'EAS project setup',
    action: 'Log in to EAS and link the clone identity to its own EAS project.',
    steps: [
      'Run npx eas-cli@20.0.0 login.',
      'Run npx eas-cli@20.0.0 whoami --non-interactive to confirm the account.',
      'Run npx eas-cli@20.0.0 init for ReversR Rebuild.',
      'Confirm app.json contains expo.extra.eas.projectId for the clone.',
      'Run npm run native:preflight:local, then strict npm run native:preflight after hosted URLs are configured.',
    ],
    evidence: [
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
    action: 'Build Android/iOS preview binaries and record device QA evidence.',
    steps: [
      'Run npx eas-cli@20.0.0 build --platform android --profile preview.',
      'Run npx eas-cli@20.0.0 build --platform ios --profile preview.',
      'Copy docs/native-qa-evidence.template.json to docs/native-qa-evidence.json.',
      'Fill build URLs, devices, testers, timestamps, platform check statuses, screenshot records, and signoff fields.',
      'Run npm run native:qa:preflight.',
    ],
    evidence: [
      'docs/native-qa-evidence.json exists and references both preview builds.',
      'All required Android and iOS checks pass.',
      'npm run native:qa:preflight passes.',
    ],
  },
  'store-console-records': {
    owner: 'Store release operator',
    phase: 'Store console setup',
    action: 'Create App Store Connect and Google Play Console records and fill console evidence.',
    steps: [
      'Create the App Store Connect app record for com.vsillah.reversrrebuild.',
      'Create the Google Play Console app record for com.vsillah.reversrrebuild.',
      'Copy metadata from docs/store-submission-packet.json into both console drafts.',
      'Complete App Privacy, age rating, Data safety, and App content forms.',
      'Copy docs/store-console-evidence.template.json to docs/store-console-evidence.json and fill record URLs, Apple ID, privacy URL, metadata, asset, review-gate, and signoff fields.',
      'Run npm run store:console:preflight.',
    ],
    evidence: [
      'docs/store-console-evidence.json exists with both console records.',
      'npm run store:console:preflight passes.',
    ],
  },
  'native-screenshots': {
    owner: 'QA/release operator',
    phase: 'Native store screenshots',
    action: 'Capture final screenshots from Android and iOS preview builds.',
    steps: [
      'Install the latest Android preview build and capture the five required Android screenshots.',
      'Install the latest iOS preview build and capture the five required iOS screenshots.',
      'Save PNGs under docs/store-screenshots/native/ using the documented filenames.',
      'Reference each PNG in docs/native-qa-evidence.json with device and capturedAt metadata.',
      'Run npm run native:qa:preflight.',
    ],
    evidence: [
      'All ten native screenshot PNGs exist.',
      'docs/native-qa-evidence.json marks each screenshot pass on Android and iOS.',
      'npm run native:qa:preflight passes.',
    ],
  },
};

const pendingGates = releaseStatus.gates
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
  generatedAt: releaseStatus.generatedAt,
  summary: releaseStatus.summary,
  nextRecommendedGate: pendingGates[0]?.id || null,
  pendingGates,
};

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('ReversR Rebuild next release actions');
  console.log(`Pass: ${releaseStatus.summary.pass || 0} | Pending: ${releaseStatus.summary.pending || 0} | Blocked: ${releaseStatus.summary.blocked || 0} | Warn: ${releaseStatus.summary.warn || 0}`);
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
