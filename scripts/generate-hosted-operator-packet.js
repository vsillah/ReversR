const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const outputDir = process.env.HOSTED_OPERATOR_PACKET_DIR || 'docs/hosted-operator-packet';
const manifestFile = path.join(outputDir, 'manifest.json');
const readmeFile = path.join(outputDir, 'README.md');

const exists = (filePath) => fs.existsSync(filePath);
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeText = (filePath, value) => {
  const target = path.resolve(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
  return target;
};
const writeJson = (filePath, value) => writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return {
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
};
const sourceStatus = (filePath) => ({ path: filePath, exists: exists(filePath) });
const list = (items) => (items || []).map(item => `- ${item}`).join('\n');

const statusRun = run(process.execPath, ['scripts/release-status.js', '--json']);
if (statusRun.status !== 0) {
  console.error('Could not generate hosted operator packet because release status failed.');
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

const packet = readJson('docs/store-submission-packet.json');
const app = packet.appIdentity || {};
const hostedGateIds = [
  'preview-host-smoke',
  'hosted-api',
  'hosted-policy-urls',
  'real-connector-smoke',
];
const hostedGates = releaseStatus.gates
  .filter(gate => hostedGateIds.includes(gate.id))
  .map(gate => ({
    id: gate.id,
    group: gate.group,
    status: gate.status,
    title: gate.title,
    evidence: gate.evidence,
    nextStep: gate.nextStep,
  }));
const sourceArtifacts = [
  'docs/production-api-deployment.md',
  'docs/production-api-env.example',
  'docs/policy-hosting-deployment.md',
  'docs/external-release-setup-runbook.md',
  'docs/api-deployment-smoke-evidence.json',
  'docs/policy-hosting-smoke-evidence.json',
  'docs/preview-host-target.json',
  'docs/preview-host-smoke-evidence.json',
  'docs/farmbot-public-inventory-evidence.json',
  'docs/hosted-connector-smoke-evidence.json',
  'docs/sample-machine-inventory.csv',
  'public/inventory/farmbot-genesis-v1.8.json',
  'Dockerfile',
  'vercel.json',
  'scripts/generate-farmbot-inventory.js',
  'scripts/api-env-preflight.js',
  'scripts/api-preflight.js',
  'scripts/api-deployment-smoke.js',
  'scripts/policy-hosting-preflight.js',
  'scripts/hosted-connector-smoke.js',
  'scripts/preview-host-smoke.js',
];
const commandSequence = [
  {
    id: 'api-env-preflight',
    command: 'API_ENV_FILE=/path/to/provider-env-export npm run api:env:preflight',
    purpose: 'Validate hosted API CORS, body limit, AI key, admin token, connector-secret, and private-network settings before deploy.',
  },
  {
    id: 'api-deployment-smoke',
    command: 'npm run api:deployment-smoke',
    purpose: 'Refresh local production-style API smoke evidence before deploying the container.',
  },
  {
    id: 'api-hosted-preflight',
    command: 'EXPO_PUBLIC_API_BASE_URL=https://api.your-domain.example npm run api:preflight',
    purpose: 'Prove the deployed API health, restricted CORS, bundled FarmBot inventory validation, and optional admin registry access.',
  },
  {
    id: 'policy-hosted-preflight',
    command: 'EXPO_PUBLIC_PRIVACY_POLICY_URL=https://your-domain.example/privacy EXPO_PUBLIC_TERMS_URL=https://your-domain.example/terms EXPO_PUBLIC_SUPPORT_URL=https://your-domain.example/support npm run policy:preflight -- --check-hosted',
    purpose: 'Prove hosted privacy, terms, and support URLs are reachable over public HTTPS.',
  },
  {
    id: 'inventory-source-validate',
    command: 'npm run inventory:farmbot:validate',
    purpose: 'Generate and validate the public FarmBot Genesis v1.8 machine inventory before connecting it to the hosted API.',
  },
  {
    id: 'hosted-connector-smoke',
    command: 'EXPO_PUBLIC_API_BASE_URL=https://reversr.vercel.app CONNECTOR_SMOKE_SOURCE_URL=https://raw.githubusercontent.com/vsillah/ReversR/refs/heads/codex/inventory-reconstruction-clone/public/inventory/farmbot-genesis-v1.8.json CONNECTOR_SMOKE_AUTH_MODE=none CONNECTOR_SMOKE_EXPECTED_MACHINE_ID=FARMBOT-GENESIS-V1-8 npm run connector:smoke',
    purpose: 'Prove hosted machine inventory validation, machine matching, BOM generation, and no-raw-secret handling against a public source.',
  },
  {
    id: 'preview-smoke',
    command: 'PREVIEW_SMOKE_URL=<preview-url> PREVIEW_SMOKE_VERCEL_BYPASS_SECRET=<secret> npm run preview:smoke',
    purpose: 'Prove the PR preview renders the app and policy/support routes before production hosting decisions.',
  },
];
const requiredEnv = [
  'API_CORS_ORIGINS',
  'API_REQUEST_BODY_LIMIT',
  'AI_INTEGRATIONS_GEMINI_API_KEY',
  'ADMIN_API_TOKEN',
  'INVENTORY_CONNECTOR_SECRETS_JSON or INVENTORY_CONNECTOR_SECRETS_FILE',
  'EXPO_PUBLIC_API_BASE_URL',
  'EXPO_PUBLIC_PRIVACY_POLICY_URL',
  'EXPO_PUBLIC_TERMS_URL',
  'EXPO_PUBLIC_SUPPORT_URL',
  'CONNECTOR_SMOKE_SOURCE_URL',
];
const safetyBoundary = [
  'Do not put Gemini keys, admin tokens, connector API keys, or OAuth tokens in mobile app config or committed files.',
  'Restrict API_CORS_ORIGINS to hosted app origins before native release builds.',
  'Keep INVENTORY_PRIVATE_NETWORK_ENABLED=false unless the API host has approved network controls.',
  'Connector smoke should send credentialRef only; raw connector secrets must remain server-side.',
  'Hosted preview and policy evidence does not replace native Android/iOS QA evidence.',
];

const manifest = {
  schemaVersion: 1,
  status: 'pass',
  generatedAt: new Date().toISOString(),
  releaseStatus: {
    generatedAt: releaseStatus.generatedAt,
    summary: releaseStatus.summary,
  },
  appIdentity: {
    name: app.name,
    version: app.version,
    iosBundleId: app.iosBundleId,
    androidPackage: app.androidPackage,
  },
  hostedGates,
  sourceArtifacts: sourceArtifacts.map(sourceStatus),
  commandSequence,
  requiredEnv,
  outputsToUpdateAfterHostedWork: [
    'docs/preview-host-smoke-evidence.json',
    'docs/api-deployment-smoke-evidence.json',
    'docs/policy-hosting-smoke-evidence.json',
    'docs/store-submission-packet.json hosted URLs, if it remains the console copy source',
    'docs/native-release-config-evidence.json after EAS hosted env binding',
    'docs/release-evidence-bundle.json',
  ],
  safetyBoundary,
};

const readme = `# ReversR Rebuild Hosted Operator Packet

Generated at: ${manifest.generatedAt}

This folder is the hosted API, policy URL, preview smoke, and real inventory connector handoff packet. It prepares the hosted lane for native builds and store-console metadata. It does not prove that the API, policy pages, or real inventory connector are already deployed.

## Release Identity

- App name: ${app.name}
- Version: ${app.version}
- iOS bundle ID: \`${app.iosBundleId}\`
- Android package: \`${app.androidPackage}\`

## Hosted Gates

${hostedGates.map(gate => `- ${gate.id} (${gate.status}): ${gate.nextStep || gate.title}`).join('\n')}

## Required Environment

${list(requiredEnv)}

## Command Sequence

${commandSequence.map((item, index) => `${index + 1}. \`${item.command}\`\n   - ${item.purpose}`).join('\n')}

## Source Artifacts

${list(sourceArtifacts)}

## Outputs To Refresh After Hosted Work

${list(manifest.outputsToUpdateAfterHostedWork)}

## Safety Boundary

${list(safetyBoundary)}
`;

const manifestPath = writeJson(manifestFile, manifest);
const readmePath = writeText(readmeFile, readme);

console.log(`Hosted operator packet manifest written: ${manifestPath}`);
console.log(`Hosted operator packet README written: ${readmePath}`);
console.log(`Hosted gates included: ${hostedGates.length}`);
