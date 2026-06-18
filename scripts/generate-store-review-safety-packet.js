const fs = require('fs');
const path = require('path');

const outputFile = process.env.STORE_REVIEW_SAFETY_PACKET_FILE || 'docs/store-review-safety-packet.md';
const evidenceFile = process.env.STORE_REVIEW_SAFETY_EVIDENCE_FILE || 'docs/store-review-safety-evidence.json';

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const readText = (filePath) => fs.readFileSync(filePath, 'utf8');
const writeText = (filePath, value) => {
  const target = path.resolve(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
  return target;
};
const writeJson = (filePath, value) => {
  const target = path.resolve(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
  return target;
};

const packet = readJson('docs/store-submission-packet.json');
const appConfig = readJson('app.json').expo;
const privacy = readText('docs/privacy-policy.md');
const terms = readText('docs/terms-of-service.md');
const storeConsoleCopy = readText('docs/store-console-copy.md');

const combinedText = [
  packet.appStoreConnect?.description,
  packet.appStoreConnect?.reviewNotes,
  packet.googlePlay?.fullDescription,
  privacy,
  terms,
  storeConsoleCopy,
].filter(Boolean).join('\n');

const requiredPhrases = [
  'Camera access is used only to capture machine images',
  'Photo library access is used only when a user chooses a profile image',
  'does not automatically order parts',
  'does not automatically submit',
  'explicit human review',
  'qualified person',
  'Raw inventory connector secrets must remain server-side',
  'does not use camera or photo-library data for advertising or tracking',
  'configured AI provider',
];
const requiredPacketFields = [
  ['appStoreConnect.appPrivacy.tracking', packet.appStoreConnect?.appPrivacy?.tracking === false],
  ['appStoreConnect.appPrivacy.dataUsedForAdvertising', packet.appStoreConnect?.appPrivacy?.dataUsedForAdvertising === false],
  ['googlePlay.dataSafety.tracking', packet.googlePlay?.dataSafety?.tracking === false],
  ['googlePlay.dataSafety.ads', packet.googlePlay?.dataSafety?.ads === false],
  ['googlePlay.dataSafety.encryptedInTransit', packet.googlePlay?.dataSafety?.encryptedInTransit === true],
  ['googlePlay.dataSafety.requiredPermissions.cameraAndProfilePhoto', JSON.stringify(packet.googlePlay?.dataSafety?.requiredPermissions || []) === JSON.stringify([
    'android.permission.CAMERA',
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.READ_MEDIA_IMAGES',
  ])],
  ['android.permissions.cameraConfigured', (appConfig.android?.permissions || []).includes('android.permission.CAMERA')],
  ['expoImagePicker.pluginConfigured', (appConfig.plugins || []).some(plugin => plugin === 'expo-image-picker' || (Array.isArray(plugin) && plugin[0] === 'expo-image-picker'))],
];
const blockedPermissionsRequired = [
  'android.permission.RECORD_AUDIO',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.READ_MEDIA_VIDEO',
];
const blockedPermissions = appConfig.android?.blockedPermissions || [];
const blockedPermissionChecks = blockedPermissionsRequired.map(permission => [
  `android.blockedPermissions.${permission}`,
  blockedPermissions.includes(permission),
]);
const profilePhotoPermissionChecks = [
  ['android.profilePhotoPermission.READ_EXTERNAL_STORAGE.allowed', !blockedPermissions.includes('android.permission.READ_EXTERNAL_STORAGE')],
  ['android.profilePhotoPermission.READ_MEDIA_IMAGES.allowed', !blockedPermissions.includes('android.permission.READ_MEDIA_IMAGES')],
];

const phraseChecks = requiredPhrases.map(phrase => ({
  phrase,
  found: combinedText.includes(phrase),
}));
const fieldChecks = [...requiredPacketFields, ...blockedPermissionChecks, ...profilePhotoPermissionChecks].map(([field, pass]) => ({
  field,
  pass: Boolean(pass),
}));
const failures = [
  ...phraseChecks.filter(check => !check.found).map(check => `Missing required phrase: ${check.phrase}`),
  ...fieldChecks.filter(check => !check.pass).map(check => `Field check failed: ${check.field}`),
];

const markdown = `# ReversR Rebuild Store Review Safety Packet

Generated from \`docs/store-submission-packet.json\`, \`docs/privacy-policy.md\`, \`docs/terms-of-service.md\`, app config, and \`docs/store-console-copy.md\`.

## Review Position

ReversR Rebuild is a review-driven machine reconstruction planning app. It helps users capture or describe a machine, match that input to an approved inventory record, and prepare a reconstruction package with a BOM, assembly sequence, pricing estimates, and fabrication handoff materials.

The app is not positioned as an autonomous manufacturing, purchasing, or safety-certification system. Generated outputs require qualified human review before procurement, vendor submission, fabrication, assembly, or machine operation.

## Safety Boundaries

- Camera access is used only to capture machine images for inventory matching and reconstruction planning.
- Photo library access is used only when a user chooses a profile image for the account chip.
- Camera data is not used for advertising, tracking, marketing, or unrelated profiling.
- Profile images are stored with the local profile settings and are not used for advertising or tracking.
- Reconstruction outputs may be incomplete, inaccurate, or unsuitable for a specific machine revision.
- A qualified person must verify machine matches, BOMs, pricing, assembly instructions, vendor files, and safety implications before action.
- The app does not automatically order parts, submit manufacturing jobs, transmit files to vendors, or purchase services.
- Quote packets and vendor request drafts require explicit human review and user action.
- Authenticated inventory secrets remain server-side behind credential references; raw ERP/API secrets should not be stored in the mobile app.

## AI And Data Handling

- AI provider processing is used only when configured.
- Local model processing can be used where available.
- Store copy states that configured cloud AI processing may process submitted machine images or descriptions.
- Generated reconstruction packages are review artifacts, not manufacturing guarantees.

## Permission Story

- Required Android permissions:
  - \`android.permission.CAMERA\`
  - \`android.permission.READ_EXTERNAL_STORAGE\`
  - \`android.permission.READ_MEDIA_IMAGES\`
- Blocked Android permissions:
${blockedPermissionsRequired.map(permission => `  - \`${permission}\``).join('\n')}

## Store Review Notes

Use this short note when a reviewer asks how the app handles safety-sensitive machine reconstruction output:

\`\`\`text
ReversR Rebuild creates reviewable machine reconstruction planning packets. Camera access is used only for machine identification. Photo library access is used only when a user chooses a profile image. The app does not use camera or photo-library data for advertising or tracking. Inventory connectors use backend credential references so raw ERP/API secrets are not stored in the mobile app. Generated machine matches, BOMs, pricing estimates, assembly steps, quote packets, and vendor request drafts require qualified human review. The app does not automatically order parts, submit manufacturing jobs, transmit files, or purchase services.
\`\`\`

## Evidence Checks

${phraseChecks.map(check => `- ${check.found ? 'PASS' : 'FAIL'} Required phrase: \`${check.phrase}\``).join('\n')}
${fieldChecks.map(check => `- ${check.pass ? 'PASS' : 'FAIL'} ${check.field}`).join('\n')}
`;

const markdownPath = writeText(outputFile, markdown);
const evidence = {
  schemaVersion: 1,
  status: failures.length === 0 ? 'pass' : 'fail',
  generatedAt: new Date().toISOString(),
  outputFile,
  sources: [
    'docs/store-submission-packet.json',
    'docs/privacy-policy.md',
    'docs/terms-of-service.md',
    'docs/store-console-copy.md',
    'app.json',
  ],
  phraseChecks,
  fieldChecks,
  failures,
  summary: {
    phrasePassCount: phraseChecks.filter(check => check.found).length,
    phraseCount: phraseChecks.length,
    fieldPassCount: fieldChecks.filter(check => check.pass).length,
    fieldCount: fieldChecks.length,
  },
};
const evidencePath = writeJson(evidenceFile, evidence);

console.log(`Store review safety packet written: ${markdownPath}`);
console.log(`Store review safety evidence written: ${evidencePath}`);
console.log(`Status: ${evidence.status}`);

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
