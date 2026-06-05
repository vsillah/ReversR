const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const evidenceFile = process.env.EAS_IOS_PREVIEW_BUILD_START_FILE || 'docs/eas-ios-preview-build-start-evidence.json';

const writeJson = (filePath, value) => {
  const target = path.resolve(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
  return target;
};

const tail = (value, maxLength = 5000) => {
  const text = String(value || '').trim();
  return text.length > maxLength ? text.slice(text.length - maxLength) : text;
};

const parseJsonOutput = (stdout) => {
  const text = String(stdout || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const firstJsonLine = text
      .split('\n')
      .map(line => line.trim())
      .find(line => line.startsWith('{') || line.startsWith('['));
    if (!firstJsonLine) return null;
    try {
      return JSON.parse(firstJsonLine);
    } catch {
      return null;
    }
  }
};

const buildPageUrl = (build) => {
  const owner = build?.project?.ownerAccount?.name || build?.accountName;
  const slug = build?.project?.slug || build?.projectName || 'reversr-rebuild';
  return owner && slug && build?.id
    ? `https://expo.dev/accounts/${owner}/projects/${slug}/builds/${build.id}`
    : '';
};

const localAscEnv = {
  apiKeyPath: process.env.EXPO_ASC_API_KEY_PATH || '',
  keyId: process.env.EXPO_ASC_KEY_ID || '',
  issuerId: process.env.EXPO_ASC_ISSUER_ID || '',
  appleTeamId: process.env.EXPO_APPLE_TEAM_ID || '',
  appleTeamType: process.env.EXPO_APPLE_TEAM_TYPE || '',
};

const missingLocalAscEnv = Object.entries(localAscEnv)
  .filter(([, value]) => !value)
  .map(([key]) => key);

const command = [
  'npx',
  'eas-cli@20.0.0',
  'build',
  '--platform',
  'ios',
  '--profile',
  'preview',
  '--non-interactive',
  '--no-wait',
  '--json',
];

const baseEvidence = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  command: command.join(' '),
  evidenceFile,
  releaseGate: 'native-qa-evidence',
  intent: 'Start an iOS EAS preview build without entering an Apple password in the CLI.',
  credentialContext: {
    nonInteractiveApplePasswordPromptSupported: false,
    passkeyFallbackDocumented: true,
    preferredPath: 'Complete EAS-managed Apple credentials through the interactive CLI flow, or use an App Store Connect API key when password entry is not available.',
    localAscEnvConfigured: missingLocalAscEnv.length === 0,
    missingLocalAscEnv,
    localAscEnvNames: Object.keys(localAscEnv),
    secretHandling: 'Do not commit .p8 files, Apple passwords, App Store Connect API keys, or team secrets. This repo ignores *.p8 and related native credential files.',
  },
  nextActions: [
    'If using passkey-only Apple login, create an App Store Connect API key in the browser and keep the downloaded .p8 file outside git.',
    'Export EXPO_ASC_API_KEY_PATH, EXPO_ASC_KEY_ID, EXPO_ASC_ISSUER_ID, EXPO_APPLE_TEAM_ID, and EXPO_APPLE_TEAM_TYPE in the local terminal session.',
    'Run npm run native:ios:preview-build after the API key/team variables are available, then run npm run native:eas:sync-builds.',
    'After Android and iOS preview builds are recorded, install them on devices and complete docs/native-qa-evidence.json plus final native screenshots.',
  ],
};

if (dryRun) {
  const evidencePath = writeJson(evidenceFile, {
    ...baseEvidence,
    status: 'dry-run',
    dryRun: true,
    didStartBuild: false,
  });
  console.log(`iOS preview build dry-run evidence written: ${evidencePath}`);
  console.log(`Command: ${command.join(' ')}`);
  if (missingLocalAscEnv.length > 0) {
    console.log(`Missing local App Store Connect API env: ${missingLocalAscEnv.join(', ')}`);
  }
  process.exit(0);
}

const result = spawnSync(command[0], command.slice(1), {
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});

const parsed = parseJsonOutput(result.stdout);
const builds = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
const build = builds.find(item => item?.platform === 'IOS') || builds[0] || null;
const didStartBuild = result.status === 0 && Boolean(build?.id || parsed);

const evidence = {
  ...baseEvidence,
  status: result.status === 0 ? 'pending' : 'pending-hitl',
  dryRun: false,
  didStartBuild,
  exitCode: result.status,
  build: build ? {
    id: build.id || '',
    status: build.status || '',
    buildUrl: buildPageUrl(build),
    appBuildVersion: build.appBuildVersion || '',
    createdAt: build.createdAt || '',
  } : null,
  stdoutTail: tail(result.stdout),
  stderrTail: tail(result.stderr),
  error: result.error ? result.error.message : '',
};

if (result.status !== 0) {
  evidence.nextActions.unshift(
    'The iOS preview build did not start. Complete the Apple credential/API-key gate, then rerun npm run native:ios:preview-build.'
  );
}

const evidencePath = writeJson(evidenceFile, evidence);
console.log(`iOS preview build start evidence written: ${evidencePath}`);
if (didStartBuild) {
  console.log(`iOS preview build started${evidence.build?.buildUrl ? `: ${evidence.build.buildUrl}` : '.'}`);
} else {
  console.log('iOS preview build did not start.');
}

process.exit(result.status || 0);
