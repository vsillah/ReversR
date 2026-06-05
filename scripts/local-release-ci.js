const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const outputFile = process.env.LOCAL_RELEASE_CI_EVIDENCE_FILE || 'docs/local-release-ci-evidence.json';
const startedAt = new Date().toISOString();
const target = path.resolve(outputFile);
const localPolicyEvidenceFile = path.join(os.tmpdir(), 'reversr-local-release-ci-policy-hosting-smoke-evidence.json');

const writeEvidence = (value) => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
};

const commands = [
  ['typecheck', ['run', 'typecheck'], 'TypeScript compile surface has no static errors.'],
  ['accessibility-preflight', ['run', 'accessibility:preflight'], 'Critical scan, inventory, design, build, Settings, and policy controls have required labels/copy.'],
  ['store-assets-preflight', ['run', 'store:assets:preflight'], 'Google Play feature graphic exists at the required 1024x500 size.'],
  ['inventory-preflight', ['run', 'inventory:preflight'], 'Protected local credentialRef inventory connector can validate, match a machine, and generate a BOM.'],
  ['policy-preflight-local', ['run', 'policy:preflight:local'], 'Privacy, terms, and support web export content is ready before hosted deployment.', {
    POLICY_HOSTING_EVIDENCE_FILE: localPolicyEvidenceFile,
  }],
  ['store-submission-preflight-local', ['run', 'store:submission:preflight:local'], 'App Store and Google Play packet copy, privacy, data-safety, and screenshot requirements fit local constraints.'],
  ['store-review-safety', ['run', 'store:review-safety'], 'Store review safety packet proves human review, camera-only data use, and no automatic vendor submission.'],
  ['store-console-copy', ['run', 'store:console:copy'], 'App Store Connect and Google Play Console copy/paste packet is generated from submission metadata.'],
  ['store-operator-packet', ['run', 'store:operator-packet'], 'Store-console operator handoff packet is generated from release evidence and submission metadata.'],
  ['hosted-operator-packet', ['run', 'hosted:operator-packet'], 'Hosted API, policy URL, preview, and connector operator packet is generated.'],
  ['release-next-actions-write', ['run', 'release:next-actions:write'], 'External release next actions are generated as durable JSON and Markdown artifacts.'],
  ['objective-readiness-audit', ['run', 'release:objective'], 'Original user objective is mapped to proven local work and pending external release gates.'],
  ['store-console-preflight-local', ['run', 'store:console:preflight:local'], 'Store-console pending evidence records account-side requirements without claiming final console proof.'],
  ['native-preflight-local', ['run', 'native:preflight:local'], 'Native identity, permissions, EAS profile shape, and remaining external native gates are recorded.'],
  ['native-qa-preflight-local', ['run', 'native:qa:preflight:local'], 'Native QA evidence template is structurally valid while preview-build evidence remains pending.'],
  ['store-preflight-local', ['run', 'store:preflight:local'], 'The full local store preflight passes with placeholder hosted URLs explicitly allowed.', {
    POLICY_HOSTING_EVIDENCE_FILE: localPolicyEvidenceFile,
  }],
].map(([id, args, proves, env = {}]) => ({ id, command: 'npm', args, proves, env }));

const runCommand = ({ command, args, env = {} }) => {
  const started = Date.now();
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return {
    status: result.status === 0 ? 'pass' : 'fail',
    exitCode: result.status,
    durationMs: Date.now() - started,
    command: [command, ...args].join(' '),
    stdoutTail: (result.stdout || '').trim().split('\n').slice(-12).join('\n'),
    stderrTail: (result.stderr || '').trim().split('\n').slice(-12).join('\n'),
  };
};

writeEvidence({
  schemaVersion: 1,
  status: 'running',
  startedAt,
  completedAt: '',
  commandCount: commands.length,
  passedCount: 0,
  failedCount: 0,
  notRun: commands.map(command => command.id),
  results: [],
  externalGatesStillRequired: [],
  notes: ['Local release CI is currently running.'],
});

const results = [];
for (const item of commands) {
  const result = runCommand(item);
  results.push({
    id: item.id,
    proves: item.proves,
    ...result,
  });
  if (result.status !== 'pass') break;
}

const failed = results.filter(result => result.status !== 'pass');
const notRun = commands
  .filter(command => !results.some(result => result.id === command.id))
  .map(command => command.id);
const completedAt = new Date().toISOString();

const evidence = {
  schemaVersion: 1,
  status: failed.length === 0 && notRun.length === 0 ? 'pass' : 'fail',
  startedAt,
  completedAt,
  commandCount: commands.length,
  passedCount: results.filter(result => result.status === 'pass').length,
  failedCount: failed.length,
  notRun,
  results,
  externalGatesStillRequired: [
    'eas-project-linkage',
    'eas-submit-config',
    'native-qa-evidence',
    'store-console-records',
    'native-screenshots',
  ],
  notes: [
    'This is a local CI pass for pre-store readiness only.',
    'EAS linkage, store records, preview builds, native QA, and final screenshots remain external gates.',
  ],
};

writeEvidence(evidence);

console.log(`Local release CI evidence written: ${target}`);
console.log(`Status: ${evidence.status}`);
console.log(`Passed: ${evidence.passedCount}/${evidence.commandCount}`);

if (failed.length > 0) {
  console.error(`Failed command: ${failed[0].id}`);
  process.exit(1);
}
