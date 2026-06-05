const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const outputPath = process.env.EAS_PRODUCTION_BUILD_SYNC_FILE || 'docs/eas-production-build-sync-evidence.json';
const limit = process.env.EAS_PRODUCTION_BUILD_SYNC_LIMIT || '20';

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

const summarizeBuild = (build) => build ? {
  id: build.id,
  status: build.status,
  readinessStatus: buildStatus(build.status),
  platform: build.platform,
  distribution: build.distribution || '',
  buildProfile: build.buildProfile || '',
  buildUrl: buildPageUrl(build),
  artifactUrl: build.artifacts?.applicationArchiveUrl || build.artifacts?.buildUrl || '',
  artifactType: build.platform === 'ANDROID' ? 'aab' : 'ipa',
  appVersion: build.appVersion || '',
  appBuildVersion: build.appBuildVersion || '',
  gitCommitHash: build.gitCommitHash || '',
  gitCommitMessage: build.gitCommitMessage || '',
  createdAt: build.createdAt || '',
  updatedAt: build.updatedAt || '',
  completedAt: build.completedAt || '',
  expirationDate: build.expirationDate || '',
} : null;

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
const productionBuilds = builds
  .filter(build => build.buildProfile === 'production')
  .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

const latestByPlatform = {
  ANDROID: productionBuilds.find(build => build.platform === 'ANDROID') || null,
  IOS: productionBuilds.find(build => build.platform === 'IOS') || null,
};

const evidence = {
  schemaVersion: 1,
  status: latestByPlatform.ANDROID?.status === 'FINISHED' && latestByPlatform.IOS?.status === 'FINISHED'
    ? 'pass'
    : 'pending',
  generatedAt: new Date().toISOString(),
  dryRun,
  command: `npx eas-cli@20.0.0 build:list --platform all --limit ${limit} --json --non-interactive`,
  buildsChecked: builds.length,
  productionBuildsChecked: productionBuilds.length,
  latestProductionBuilds: {
    android: summarizeBuild(latestByPlatform.ANDROID),
    ios: summarizeBuild(latestByPlatform.IOS),
  },
  nextActions: [
    ...(latestByPlatform.ANDROID?.status === 'FINISHED'
      ? []
      : ['Wait for the Android production AAB build to finish, then rerun npm run native:eas:sync-production-builds.']),
    ...(latestByPlatform.IOS
      ? []
      : ['Complete the interactive EAS Apple credential validation flow, then start an iOS production/TestFlight build.']),
    'Do not submit production builds to App Store Connect or Google Play until native QA, screenshots, store-console declarations, and human signoff are complete.',
  ],
};

if (!dryRun) writeJson(outputPath, evidence);

console.log(`EAS production build sync ${dryRun ? 'checked' : 'wrote'} ${path.resolve(outputPath)}.`);
console.log(`Android production build: ${latestByPlatform.ANDROID ? `${latestByPlatform.ANDROID.id} (${latestByPlatform.ANDROID.status})` : 'not found'}`);
console.log(`iOS production build: ${latestByPlatform.IOS ? `${latestByPlatform.IOS.id} (${latestByPlatform.IOS.status})` : 'not found'}`);
