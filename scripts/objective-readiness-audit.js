const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const outputFile = process.env.OBJECTIVE_READINESS_AUDIT_FILE || 'docs/objective-readiness-audit.json';

const writeJson = (filePath, value) => {
  const target = path.resolve(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
  return target;
};

const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return {
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
};

const releaseStatusRun = run(process.execPath, ['scripts/release-status.js', '--json']);
if (releaseStatusRun.status !== 0) {
  console.error('Could not generate objective readiness audit because release status failed.');
  console.error(releaseStatusRun.stderr || releaseStatusRun.stdout);
  process.exit(releaseStatusRun.status || 1);
}

let releaseStatus;
try {
  releaseStatus = JSON.parse(releaseStatusRun.stdout);
} catch (error) {
  console.error(`Could not parse release status JSON: ${error.message}`);
  process.exit(1);
}

const gitRemote = run('git', ['remote', 'get-url', 'origin']);
const gitBranch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
const gateById = Object.fromEntries(releaseStatus.gates.map(gate => [gate.id, gate]));

const gateStatus = (id) => gateById[id]?.status || 'missing';
const gatesPass = (ids) => ids.every(id => gateStatus(id) === 'pass');
const gatesPending = (ids) => ids.some(id => gateStatus(id) === 'pending' || gateStatus(id) === 'missing');
const gatesBlocked = (ids) => ids.some(id => gateStatus(id) === 'blocked');
const statusFor = (passIds, pendingIds = []) => {
  if (gatesBlocked([...passIds, ...pendingIds])) return 'blocked';
  if (!gatesPass(passIds) || gatesPending(pendingIds)) return 'pending';
  return 'pass';
};
const gateEvidence = (ids) => ids.map(id => ({
  id,
  status: gateStatus(id),
  title: gateById[id]?.title || '',
  evidence: gateById[id]?.evidence || 'Gate missing from release status.',
  nextStep: gateById[id]?.nextStep || '',
}));

const requirements = [
  {
    id: 'original-codebase-cloned',
    requirement: 'Use the original ReversR codebase from GitHub as the starting point.',
    status: gitRemote.status === 0 && gitRemote.stdout.includes('ReversR') ? 'pass' : 'pending',
    evidence: [
      `git.remote.origin=${gitRemote.status === 0 ? gitRemote.stdout : '(missing)'}`,
      `git.branch=${gitBranch.status === 0 ? gitBranch.stdout : '(unknown)'}`,
    ],
    gates: [],
    nextStep: gitRemote.status === 0 && gitRemote.stdout.includes('ReversR')
      ? ''
      : 'Confirm origin points to the original ReversR GitHub repository.',
  },
  {
    id: 'distinct-clone-identity',
    requirement: 'Create a clone version with distinct app identity for store submission.',
    status: statusFor(['clone-identity']),
    evidence: gateEvidence(['clone-identity']),
    gates: ['clone-identity'],
    nextStep: gateById['clone-identity']?.nextStep || '',
  },
  {
    id: 'remove-systematic-inventive-thinking',
    requirement: 'Remove the Systematic Inventive Thinking step from the active app and server flow.',
    status: statusFor(['retired-sit-step']),
    evidence: gateEvidence(['retired-sit-step']),
    gates: ['retired-sit-step'],
    nextStep: gateById['retired-sit-step']?.nextStep || '',
  },
  {
    id: 'admin-machine-inventory-connector',
    requirement: 'Replace that step with an admin-entered link or connector to a machine inventory.',
    status: statusFor(['inventory-admin-connector', 'inventory-source-validator']),
    evidence: gateEvidence(['inventory-admin-connector', 'inventory-source-validator']),
    gates: ['inventory-admin-connector', 'inventory-source-validator'],
    nextStep: '',
  },
  {
    id: 'photo-to-inventory-machine-match',
    requirement: 'When a picture or scan is supplied, identify the matching machine from the approved inventory.',
    status: statusFor(
      ['machine-scan-examples', 'web-flow-smoke'],
      ['native-qa-evidence', 'real-connector-smoke']
    ),
    evidence: gateEvidence(['machine-scan-examples', 'web-flow-smoke', 'native-qa-evidence', 'real-connector-smoke']),
    gates: ['machine-scan-examples', 'web-flow-smoke', 'native-qa-evidence', 'real-connector-smoke'],
    nextStep: 'Run native preview-build QA and hosted real connector smoke to prove real camera-to-inventory matching beyond local prototype evidence.',
  },
  {
    id: 'bom-assembly-pricing-vendor-handoff',
    requirement: 'Build a bill of materials, assembly steps, pricing, and 3D modeling/fabrication handoff package.',
    status: statusFor(['reconstruction-package', 'web-flow-smoke']),
    evidence: gateEvidence(['reconstruction-package', 'web-flow-smoke']),
    gates: ['reconstruction-package', 'web-flow-smoke'],
    nextStep: '',
  },
  {
    id: 'store-readiness-packet',
    requirement: 'Prepare the local release packet needed to approach Google Play and Apple App Store submission.',
    status: statusFor([
      'store-submission-packet-smoke',
      'store-review-safety-packet',
      'store-screenshot-planning',
      'external-release-runbook',
      'release-evidence-bundle',
      'local-release-ci-evidence',
      'release-local-ci-workflow',
      'store-console-copy-packet',
      'release-next-actions-packet',
      'preview-host-target-discovery',
      'native-release-config-evidence',
      'store-console-pending-evidence',
    ]),
    evidence: gateEvidence([
      'store-submission-packet-smoke',
      'store-review-safety-packet',
      'store-screenshot-planning',
      'external-release-runbook',
      'release-evidence-bundle',
      'local-release-ci-evidence',
      'release-local-ci-workflow',
      'store-console-copy-packet',
      'release-next-actions-packet',
      'preview-host-target-discovery',
      'native-release-config-evidence',
      'store-console-pending-evidence',
    ]),
    gates: [
      'store-submission-packet-smoke',
      'store-screenshot-planning',
      'external-release-runbook',
      'release-evidence-bundle',
      'local-release-ci-evidence',
      'release-local-ci-workflow',
      'store-console-copy-packet',
      'release-next-actions-packet',
      'preview-host-target-discovery',
      'native-release-config-evidence',
      'store-console-pending-evidence',
    ],
    nextStep: '',
  },
  {
    id: 'apple-google-store-publication',
    requirement: 'Get as close as possible to release on Google Play and Apple App Store, without falsely claiming external approvals.',
    status: statusFor([], [
      'preview-host-smoke',
      'hosted-api',
      'hosted-policy-urls',
      'real-connector-smoke',
      'eas-project-linkage',
      'eas-submit-config',
      'native-qa-evidence',
      'store-console-records',
      'native-screenshots',
    ]),
    evidence: gateEvidence([
      'preview-host-smoke',
      'hosted-api',
      'hosted-policy-urls',
      'real-connector-smoke',
      'eas-project-linkage',
      'eas-submit-config',
      'native-qa-evidence',
      'store-console-records',
      'native-screenshots',
    ]),
    gates: [
      'preview-host-smoke',
      'hosted-api',
      'hosted-policy-urls',
      'real-connector-smoke',
      'eas-project-linkage',
      'eas-submit-config',
      'native-qa-evidence',
      'store-console-records',
      'native-screenshots',
    ],
    nextStep: 'Clear the listed external gates with real hosted, EAS, App Store Connect, Google Play Console, preview-build, and native screenshot evidence.',
  },
];

const pendingRequirementIds = requirements
  .filter(requirement => requirement.status !== 'pass')
  .map(requirement => requirement.id);
const blockedRequirementIds = requirements
  .filter(requirement => requirement.status === 'blocked')
  .map(requirement => requirement.id);

const audit = {
  schemaVersion: 1,
  status: blockedRequirementIds.length > 0 ? 'blocked' : pendingRequirementIds.length > 0 ? 'pending' : 'pass',
  generatedAt: new Date().toISOString(),
  objective: 'Clone the original ReversR app, remove the Systematic Inventive Thinking step, replace it with admin machine inventory matching from image/scan to reconstruction package, and get as close as possible to Google Play and Apple App Store readiness.',
  completionClaim: {
    fullObjectiveComplete: pendingRequirementIds.length === 0 && blockedRequirementIds.length === 0,
    storeReady: pendingRequirementIds.length === 0 && blockedRequirementIds.length === 0,
    productionSubmissionReady: pendingRequirementIds.length === 0 && blockedRequirementIds.length === 0,
    reason: pendingRequirementIds.length > 0
      ? 'Implementation and local release packet are advanced, but external hosted, EAS, store-console, native QA, and screenshot evidence remain pending.'
      : 'All objective requirements are proven by current release gates.',
  },
  summary: {
    requirementCount: requirements.length,
    passedCount: requirements.filter(requirement => requirement.status === 'pass').length,
    pendingCount: requirements.filter(requirement => requirement.status === 'pending').length,
    blockedCount: blockedRequirementIds.length,
    pendingRequirementIds,
    blockedRequirementIds,
  },
  releaseStatus: {
    generatedAt: releaseStatus.generatedAt,
    summary: releaseStatus.summary,
  },
  requirements,
};

const outputPath = writeJson(outputFile, audit);
console.log(`Objective readiness audit written: ${outputPath}`);
console.log(`Status: ${audit.status}`);
console.log(`Requirements passed: ${audit.summary.passedCount}/${audit.summary.requirementCount}`);
console.log(`Pending requirements: ${pendingRequirementIds.join(', ') || '(none)'}`);

if (audit.status === 'blocked') {
  process.exit(1);
}
