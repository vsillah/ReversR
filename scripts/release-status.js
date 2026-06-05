const fs = require('fs');
const { spawnSync } = require('child_process');

const args = new Set(process.argv.slice(2));
const asJson = args.has('--json');
const strict = args.has('--strict');

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const exists = (path) => fs.existsSync(path);
const readText = (path) => exists(path) ? fs.readFileSync(path, 'utf8') : '';
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

const requiredArtifacts = [
  'Dockerfile',
  '.dockerignore',
  'vercel.json',
  'docs/production-api-deployment.md',
  'docs/policy-hosting-deployment.md',
  'docs/native-release-runbook.md',
  'docs/native-qa-evidence.template.json',
  'docs/store-assets/README.md',
  'docs/store-submission-packet.json',
  'docs/store-console-evidence.template.json',
  'scripts/api-preflight.js',
  'scripts/inventory-connector-preflight.js',
  'scripts/hosted-connector-smoke.js',
  'scripts/native-release-preflight.js',
  'scripts/native-qa-preflight.js',
  'scripts/store-preflight.js',
  'scripts/store-submission-preflight.js',
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

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || packet.urls?.apiBaseUrl || appConfig.extra?.apiBaseUrl;
const hostedApiOk = !isPlaceholder(apiBaseUrl) && isHttpsUrl(apiBaseUrl);
addGate(
  'hosted',
  'web-flow-smoke',
  'Local web preview can complete the machine reconstruction happy path',
  'pending',
  exists('scripts/web-flow-smoke.js') ? 'Smoke script is available; execution evidence is produced by npm run web:flow-smoke.' : 'scripts/web-flow-smoke.js is missing.',
  'Run npm run web-preview, then in another shell run WEB_SMOKE_APP_URL=http://localhost:5001 npm run web:flow-smoke.'
);

addGate(
  'hosted',
  'hosted-api',
  'Hosted HTTPS API URL is configured for native builds',
  hostedApiOk ? 'pending' : 'pending',
  hostedApiOk ? `Configured API URL shape: ${apiBaseUrl}` : 'No proven hosted API URL in environment or store packet.',
  hostedApiOk ? 'Run EXPO_PUBLIC_API_BASE_URL=<url> npm run api:preflight against the deployed API.' : 'Deploy the API behind HTTPS, then set EXPO_PUBLIC_API_BASE_URL and run npm run api:preflight.'
);

const hostedPolicyUrls = [
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL || packet.urls?.privacyPolicyUrl || appConfig.extra?.privacyPolicyUrl,
  process.env.EXPO_PUBLIC_TERMS_URL || packet.urls?.termsUrl || appConfig.extra?.termsUrl,
  process.env.EXPO_PUBLIC_SUPPORT_URL || packet.urls?.supportUrl || appConfig.extra?.supportUrl,
];
const hostedPoliciesOk = hostedPolicyUrls.every(value => !isPlaceholder(value) && isHttpsUrl(value));
addGate(
  'hosted',
  'hosted-policy-urls',
  'Privacy, terms, and support URLs are hosted and ready for store metadata',
  hostedPoliciesOk ? 'pending' : 'pending',
  hostedPoliciesOk ? `Configured URL shapes: ${hostedPolicyUrls.join(', ')}` : 'Hosted policy/support URLs are still placeholders or missing.',
  hostedPoliciesOk ? 'Run npm run policy:preflight -- --check-hosted with the hosted URLs.' : 'Deploy /privacy, /terms, and /support, then set the hosted URL env vars.'
);

addGate(
  'hosted',
  'real-connector-smoke',
  'Hosted API can validate and match against a real authorized machine inventory',
  'pending',
  'This requires a deployed API plus a real connector source and server-side connector credential.',
  'Run npm run connector:smoke with CONNECTOR_SMOKE_SOURCE_URL and CONNECTOR_SMOKE_CREDENTIAL_REF.'
);

const easProjectId = appConfig.extra?.eas?.projectId;
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
