const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const outputDir = process.env.STORE_OPERATOR_PACKET_DIR || 'docs/store-operator-packet';
const manifestFile = path.join(outputDir, 'manifest.json');
const readmeFile = path.join(outputDir, 'README.md');

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const readText = (filePath) => fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
const exists = (filePath) => fs.existsSync(filePath);
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

const list = (items) => (items || []).map(item => `- ${item}`).join('\n');
const sourceStatus = (filePath) => ({
  path: filePath,
  exists: exists(filePath),
});

const statusRun = run(process.execPath, ['scripts/release-status.js', '--json']);
if (statusRun.status !== 0) {
  console.error('Could not generate store operator packet because release status failed.');
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
const apple = packet.appStoreConnect || {};
const google = packet.googlePlay || {};
const screenshots = packet.screenshots || {};
const pendingGates = releaseStatus.gates
  .filter(gate => gate.status !== 'pass')
  .map(gate => ({
    id: gate.id,
    group: gate.group,
    title: gate.title,
    nextStep: gate.nextStep,
  }));

const sourceArtifacts = [
  'docs/store-submission-packet.json',
  'docs/store-console-copy.md',
  'docs/store-review-safety-packet.md',
  'docs/store-console-evidence.template.json',
  'docs/store-console-browser-handoff.json',
  'docs/native-qa-evidence.template.json',
  'docs/store-screenshots/planning-evidence.json',
  'docs/store-assets/google-play-feature-graphic.png',
  'docs/release-next-actions.md',
  'docs/release-evidence-bundle.json',
  'docs/objective-readiness-audit.json',
  'docs/external-release-setup-runbook.md',
];
const consoleEntryOrder = [
  'Create App Store Connect record for com.vsillah.reversrrebuild and SKU reversr-rebuild-001.',
  'Create Google Play Console record for com.vsillah.reversrrebuild.',
  'Use the configured Vercel production privacy, terms, support, and API URLs in store console drafts.',
  'Copy App Store and Google Play text from docs/store-console-copy.md.',
  'Complete App Privacy, Data safety, age rating, App content, and review notes from the packet.',
  'Copy docs/store-console-evidence.template.json to docs/store-console-evidence.json and fill record evidence.',
  'Build Android and iOS preview binaries, complete docs/native-qa-evidence.json, and capture native screenshots.',
  'Run npm run store:console:preflight and npm run native:qa:preflight before TestFlight or Play Internal Testing submission.',
];

const manifest = {
  schemaVersion: 1,
  status: 'pass',
  generatedAt: new Date().toISOString(),
  releaseStatus: {
    generatedAt: releaseStatus.generatedAt,
    summary: releaseStatus.summary,
    pendingGateIds: pendingGates.map(gate => gate.id),
  },
  appIdentity: {
    name: app.name,
    version: app.version,
    iosBundleId: app.iosBundleId,
    androidPackage: app.androidPackage,
    sku: app.sku,
    primaryLanguage: app.primaryLanguage,
    category: app.category,
  },
  appStoreConnect: {
    name: apple.name,
    subtitle: apple.subtitle,
    keywordsLength: Array.from(String(apple.keywords || '')).length,
    reviewNotesPresent: Boolean(String(apple.reviewNotes || '').trim()),
    privacyDraftReady: apple.appPrivacy?.tracking === false && apple.appPrivacy?.dataUsedForAdvertising === false,
  },
  googlePlay: {
    title: google.title,
    shortDescriptionLength: Array.from(String(google.shortDescription || '')).length,
    dataSafetyDraftReady: google.dataSafety?.tracking === false && google.dataSafety?.ads === false,
    requiredPermissions: google.dataSafety?.requiredPermissions || [],
  },
  assets: {
    featureGraphic: sourceStatus('docs/store-assets/google-play-feature-graphic.png'),
    nativeScreenshotsRequired: screenshots.nativeRequired === true,
    requiredNativeScreenshotCount: screenshots.requiredSet?.length || 0,
    webPlanningEvidence: sourceStatus('docs/store-screenshots/planning-evidence.json'),
  },
  sourceArtifacts: sourceArtifacts.map(sourceStatus),
  consoleEntryOrder,
  pendingGates,
  safetyBoundary: [
    'This packet is store-console setup support, not approval to submit production builds.',
    'Final native screenshots must come from Android and iOS preview builds.',
    'Quote packets and vendor request drafts remain explicit human-review handoffs.',
    'Raw connector secrets must stay server-side behind credentialRef references.',
  ],
};

const readme = `# ReversR Rebuild Store Operator Packet

Generated at: ${manifest.generatedAt}

This folder is the store-console handoff packet for App Store Connect and Google Play Console setup. It is a preparation packet, not proof that Apple or Google have accepted the app.

## Release Identity

- App name: ${app.name}
- Version: ${app.version}
- iOS bundle ID: \`${app.iosBundleId}\`
- Android package: \`${app.androidPackage}\`
- SKU: \`${app.sku}\`
- Primary language: ${app.primaryLanguage}
- Apple categories: ${app.category?.applePrimary} / ${app.category?.appleSecondary}
- Google category: ${app.category?.googleCategory}

## Current Status

- Release pass gates: ${releaseStatus.summary.pass || 0}
- Release pending gates: ${releaseStatus.summary.pending || 0}
- Release blocked gates: ${releaseStatus.summary.blocked || 0}
- Release warnings: ${releaseStatus.summary.warn || 0}

Pending gates:

${pendingGates.map(gate => `- ${gate.id}: ${gate.nextStep || gate.title}`).join('\n')}

## Operator Entry Order

${consoleEntryOrder.map((item, index) => `${index + 1}. ${item}`).join('\n')}

## Copy Sources

Use these files when filling console drafts:

${list(sourceArtifacts)}

## App Store Connect Fields

- Name: ${apple.name}
- Subtitle: ${apple.subtitle}
- Keywords length: ${manifest.appStoreConnect.keywordsLength}/100
- Review notes present: ${manifest.appStoreConnect.reviewNotesPresent}
- Privacy draft ready: ${manifest.appStoreConnect.privacyDraftReady}

## Google Play Fields

- Title: ${google.title}
- Short description length: ${manifest.googlePlay.shortDescriptionLength}/80
- Data safety draft ready: ${manifest.googlePlay.dataSafetyDraftReady}
- Required permissions: ${(manifest.googlePlay.requiredPermissions || []).join(', ') || '(none)'}

## Assets

- Google Play feature graphic: \`docs/store-assets/google-play-feature-graphic.png\`
- Native screenshots required: ${manifest.assets.nativeScreenshotsRequired}
- Required native screenshot set count: ${manifest.assets.requiredNativeScreenshotCount}
- Web planning evidence: \`docs/store-screenshots/planning-evidence.json\`

## Safety Boundary

${list(manifest.safetyBoundary)}
`;

const manifestPath = writeJson(manifestFile, manifest);
const readmePath = writeText(readmeFile, readme);

console.log(`Store operator packet manifest written: ${manifestPath}`);
console.log(`Store operator packet README written: ${readmePath}`);
console.log(`Pending gates included: ${pendingGates.length}`);
