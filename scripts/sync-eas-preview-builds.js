const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const evidencePath = process.env.NATIVE_QA_EVIDENCE_FILE || 'docs/native-qa-evidence.json';
const syncEvidencePath = process.env.EAS_PREVIEW_BUILD_SYNC_FILE || 'docs/eas-preview-build-sync-evidence.json';
const limit = process.env.EAS_BUILD_SYNC_LIMIT || '20';

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJson = (filePath, value) => {
  const target = path.resolve(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
  return target;
};

const run = (command, commandArgs) => {
  const result = spawnSync(command, commandArgs, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error,
  };
};

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const parseBuilds = (stdout) => {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    fail(`Could not parse EAS build:list JSON: ${error.message}`);
  }
};

const buildPageUrl = (build) => {
  const owner = build.project?.ownerAccount?.name;
  const slug = build.project?.slug;
  return owner && slug && build.id
    ? `https://expo.dev/accounts/${owner}/projects/${slug}/builds/${build.id}`
    : '';
};

const buildStatus = (status) => {
  if (status === 'FINISHED') return 'pass';
  if (['CANCELED', 'ERRORED'].includes(status)) return 'blocked';
  return 'pending';
};

const artifactType = (platform, build) => {
  if (platform === 'ANDROID') {
    return build.buildProfile === 'preview' ? 'apk' : 'aab';
  }
  return build.isForIosSimulator ? 'simulator' : 'ipa';
};

const updateBuildEvidence = (target, build) => {
  const platform = build.platform;
  target.status = buildStatus(build.status);
  target.profile = build.buildProfile || target.profile || 'preview';
  target.buildUrl = buildPageUrl(build) || target.buildUrl || '';
  target.artifactUrl = build.artifacts?.applicationArchiveUrl || build.artifacts?.buildUrl || '';
  target.artifactType = artifactType(platform, build);
  if (platform === 'ANDROID') {
    target.versionCode = Number(build.appBuildVersion || target.versionCode || 0);
  } else {
    target.buildNumber = String(build.appBuildVersion || target.buildNumber || '');
  }
  target.completedAt = build.completedAt || '';
};

const result = run('npx', [
  'eas-cli@20.0.0',
  'build:list',
  '--platform',
  'all',
  '--limit',
  String(limit),
  '--json',
  '--non-interactive',
]);

if (result.error) fail(`Could not run EAS CLI: ${result.error.message}`);
if (result.status !== 0) fail((result.stderr || result.stdout || 'EAS build:list failed.').trim());

const builds = parseBuilds(result.stdout);
const previewBuilds = builds
  .filter(build => build.buildProfile === 'preview')
  .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

const latestByPlatform = {
  ANDROID: previewBuilds.find(build => build.platform === 'ANDROID') || null,
  IOS: previewBuilds.find(build => build.platform === 'IOS') || null,
};

const evidence = readJson(evidencePath);
if (latestByPlatform.ANDROID && evidence.builds?.androidPreview) {
  updateBuildEvidence(evidence.builds.androidPreview, latestByPlatform.ANDROID);
}
if (latestByPlatform.IOS && evidence.builds?.iosPreview) {
  updateBuildEvidence(evidence.builds.iosPreview, latestByPlatform.IOS);
}

const syncEvidence = {
  schemaVersion: 1,
  status: 'pass',
  generatedAt: new Date().toISOString(),
  dryRun,
  command: `npx eas-cli@20.0.0 build:list --platform all --limit ${limit} --json --non-interactive`,
  evidenceFile: evidencePath,
  buildsChecked: builds.length,
  previewBuildsChecked: previewBuilds.length,
  latestPreviewBuilds: {
    android: latestByPlatform.ANDROID ? {
      id: latestByPlatform.ANDROID.id,
      status: latestByPlatform.ANDROID.status,
      buildUrl: buildPageUrl(latestByPlatform.ANDROID),
      artifactUrl: latestByPlatform.ANDROID.artifacts?.applicationArchiveUrl || latestByPlatform.ANDROID.artifacts?.buildUrl || '',
      completedAt: latestByPlatform.ANDROID.completedAt || '',
      appBuildVersion: latestByPlatform.ANDROID.appBuildVersion || '',
    } : null,
    ios: latestByPlatform.IOS ? {
      id: latestByPlatform.IOS.id,
      status: latestByPlatform.IOS.status,
      buildUrl: buildPageUrl(latestByPlatform.IOS),
      artifactUrl: latestByPlatform.IOS.artifacts?.applicationArchiveUrl || latestByPlatform.IOS.artifacts?.buildUrl || '',
      completedAt: latestByPlatform.IOS.completedAt || '',
      appBuildVersion: latestByPlatform.IOS.appBuildVersion || '',
      isForIosSimulator: latestByPlatform.IOS.isForIosSimulator === true,
    } : null,
  },
  nextActions: [
    ...(latestByPlatform.IOS ? [] : ['Complete EAS iOS preview credentials, start an iOS preview build, then rerun npm run native:eas:sync-builds.']),
    'After Android and iOS preview builds are recorded, install them on test devices and complete docs/native-qa-evidence.json device QA and screenshot records.',
  ],
};

if (!dryRun) {
  writeJson(evidencePath, evidence);
  writeJson(syncEvidencePath, syncEvidence);
}

console.log(`EAS preview build sync ${dryRun ? 'checked' : 'updated'} ${path.resolve(evidencePath)}.`);
console.log(`Android preview build: ${latestByPlatform.ANDROID ? latestByPlatform.ANDROID.id : 'not found'}`);
console.log(`iOS preview build: ${latestByPlatform.IOS ? latestByPlatform.IOS.id : 'not found'}`);
if (!dryRun) console.log(`Sync evidence: ${path.resolve(syncEvidencePath)}`);
