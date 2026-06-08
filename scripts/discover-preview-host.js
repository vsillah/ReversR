const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const outputFile = process.env.PREVIEW_HOST_TARGET_FILE || 'docs/preview-host-target.json';
const args = process.argv.slice(2);
const prArgIndex = args.findIndex(arg => arg === '--pr');
const prNumber = (
  process.env.PREVIEW_DISCOVERY_PR ||
  (prArgIndex >= 0 ? args[prArgIndex + 1] : '') ||
  ''
).trim();

const writeJson = (filePath, value) => {
  const target = path.resolve(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
  return target;
};

const runGh = (ghArgs) => {
  const result = spawnSync('gh', ghArgs, { encoding: 'utf8' });
  return {
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
};

const isHttpsUrl = (value) => /^https:\/\/[^/]+\.[^/]+/i.test(value || '');
const parsePreviewUrl = (body) => {
  const markdownMatch = body.match(/\[Preview\]\((https:\/\/[^)\s]+)\)/i);
  if (markdownMatch?.[1]) return markdownMatch[1];

  const urlMatch = body.match(/https:\/\/[a-z0-9.-]+\.vercel\.app/iu);
  return urlMatch?.[0] || '';
};

const parseInspectorUrl = (body) => {
  const readyMatch = body.match(/\[Ready\]\((https:\/\/vercel\.com\/[^)\s]+)\)/i);
  return readyMatch?.[1] || '';
};

const ghArgs = [
  'pr',
  'view',
  ...(prNumber ? [prNumber] : []),
  '--json',
  'number,url,headRefName,comments',
];
const prResult = runGh(ghArgs);

if (prResult.status !== 0) {
  const evidence = {
    schemaVersion: 1,
    status: 'fail',
    generatedAt: new Date().toISOString(),
    source: 'github-pr-comments',
    previewUrl: '',
    error: prResult.stderr || prResult.stdout || 'gh pr view failed.',
  };
  const target = writeJson(outputFile, evidence);
  console.error(`Preview host target discovery failed: ${evidence.error}`);
  console.error(`Evidence written: ${target}`);
  process.exit(1);
}

let pr;
try {
  pr = JSON.parse(prResult.stdout);
} catch (error) {
  const evidence = {
    schemaVersion: 1,
    status: 'fail',
    generatedAt: new Date().toISOString(),
    source: 'github-pr-comments',
    previewUrl: '',
    error: `Could not parse gh pr JSON: ${error.message}`,
  };
  const target = writeJson(outputFile, evidence);
  console.error(`Preview host target discovery failed: ${evidence.error}`);
  console.error(`Evidence written: ${target}`);
  process.exit(1);
}

const vercelComments = (pr.comments || [])
  .filter(comment => /vercel/i.test(comment.body || ''))
  .map(comment => ({
    author: comment.author?.login || '',
    body: comment.body || '',
    createdAt: comment.createdAt || '',
  }));
const latestWithPreview = [...vercelComments]
  .reverse()
  .find(comment => parsePreviewUrl(comment.body));
const previewUrl = latestWithPreview ? parsePreviewUrl(latestWithPreview.body) : '';
const inspectorUrl = latestWithPreview ? parseInspectorUrl(latestWithPreview.body) : '';
const status = isHttpsUrl(previewUrl) ? 'pass' : 'pending';

const evidence = {
  schemaVersion: 1,
  status,
  generatedAt: new Date().toISOString(),
  source: 'github-pr-comments',
  pr: {
    number: pr.number,
    url: pr.url,
    headRefName: pr.headRefName,
  },
  previewUrl,
  inspectorUrl,
  vercelCommentCount: vercelComments.length,
  command: prNumber ? `gh pr view ${prNumber} --json number,url,headRefName,comments` : 'gh pr view --json number,url,headRefName,comments',
  nextSmokeCommand: previewUrl
    ? `PREVIEW_SMOKE_URL=${previewUrl} PREVIEW_SMOKE_VERCEL_BYPASS_SECRET=<secret> npm run preview:smoke`
    : '',
  previewSmokeStillRequired: true,
  notes: [
    previewUrl
      ? 'This discovers the current Vercel PR preview URL; it does not prove the preview renders.'
      : 'No Vercel preview URL was found in PR comments.',
    'Run preview:smoke with the discovered URL and an approved bypass secret when deployment protection is enabled.',
  ],
};

const target = writeJson(outputFile, evidence);
console.log(`Preview host target evidence written: ${target}`);
console.log(`Status: ${evidence.status}`);
console.log(`Preview URL: ${evidence.previewUrl || '(missing)'}`);

if (status !== 'pass') {
  process.exit(1);
}
