const fs = require('fs');
const path = require('path');

const packetPath = 'docs/store-submission-packet.json';
const jsonOut = 'docs/store-console-task-answers.json';
const mdOut = 'docs/store-console-task-answers.md';

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeFile = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
};
const writeJson = (filePath, value) => writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);

const packet = readJson(packetPath);
const readOptionalJson = (filePath) => {
  try {
    return fs.existsSync(filePath) ? readJson(filePath) : null;
  } catch {
    return null;
  }
};
const appIdentity = packet.appIdentity || {};
const urls = packet.urls || {};
const apple = packet.appStoreConnect || {};
const google = packet.googlePlay || {};
const dataSafety = google.dataSafety || {};
const storeEvidence = readOptionalJson('docs/store-console-evidence.json');
const nativeQaEvidence = readOptionalJson('docs/native-qa-evidence.json');
const easConfig = readOptionalJson('eas.json');
const recordedAppleId = storeEvidence?.appStoreConnect?.appleId || easConfig?.submit?.production?.ios?.ascAppId || '';
const recordedAppStoreUrl = storeEvidence?.appStoreConnect?.recordUrl || '';
const appStoreRecordExists = Boolean(recordedAppleId && recordedAppStoreUrl);
const savedGooglePlaySupportEmail = storeEvidence?.googlePlay?.publicSupportEmail || '';
const googlePlayContactDetailsCompleted = storeEvidence?.googlePlay?.contactDetailsCompleted === true && Boolean(savedGooglePlaySupportEmail);
const requiredScreenshotIds = ['welcome', 'scan', 'inventory-validation', 'design-match', 'build-handoff'];
const screenshotStatus = (platform) => {
  const screenshots = nativeQaEvidence?.screenshots || [];
  const byId = new Map(screenshots.map((screenshot) => [screenshot.id, screenshot]));
  return requiredScreenshotIds.every((id) => {
    const platformEvidence = byId.get(id)?.[platform];
    return platformEvidence?.status === 'pass' && Boolean(platformEvidence.file);
  });
};
const nativeScreenshotsCaptured = screenshotStatus('android') && screenshotStatus('ios');

const generatedAt = new Date().toISOString();

const googlePlayTasks = [
  {
    task: 'Set privacy policy',
    status: 'ready-to-enter',
    fields: [
      { label: 'Privacy policy URL', value: urls.privacyPolicyUrl },
    ],
    saveGate: 'Saving updates the Google Play Console app record.',
  },
  {
    task: 'Sign in details',
    status: 'ready-to-enter',
    fields: [
      { label: 'Does the app require sign-in?', value: 'No' },
      { label: 'Reasoning', value: 'Current ReversR Rebuild prototype exposes scan, connector validation, reconstruction package, policy, and support flows without an account login requirement.' },
    ],
    saveGate: 'Saving updates Google Play app content answers.',
  },
  {
    task: 'Ads',
    status: 'ready-to-enter',
    fields: [
      { label: 'Contains ads?', value: dataSafety.ads === true ? 'Yes' : 'No' },
      { label: 'Reasoning', value: 'The release packet marks ads as false and no advertising SDK is documented for this build.' },
    ],
    saveGate: 'Saving updates Google Play app content answers.',
  },
  {
    task: 'Content rating',
    status: 'review-required',
    fields: [
      { label: 'Expected rating target', value: 'Everyone / low maturity, pending final questionnaire result' },
      { label: 'Violence, sexual content, controlled substances, gambling, and user-generated public sharing', value: 'No expected affirmative answers based on current app scope.' },
      { label: 'Camera use', value: 'Camera is used for machine images only, not for public social sharing or user-generated content feeds.' },
    ],
    saveGate: 'The official questionnaire result must be reviewed before saving as final.',
  },
  {
    task: 'Target audience',
    status: 'review-required',
    fields: [
      { label: 'Recommended target audience', value: 'Adults / workplace users' },
      { label: 'Children under 13', value: 'No' },
      { label: 'Reasoning', value: 'The app is for machine reconstruction planning, BOM generation, pricing estimates, and fabrication handoff review.' },
    ],
    saveGate: 'Target audience answers affect store policy treatment and should be reviewed before saving.',
  },
  {
    task: 'Data safety',
    status: 'ready-to-enter',
    fields: [
      { label: 'Data collected', value: dataSafety.dataCollected || [] },
      { label: 'Data shared', value: dataSafety.dataShared || [] },
      { label: 'Purposes', value: dataSafety.purposes || [] },
      { label: 'Encrypted in transit', value: dataSafety.encryptedInTransit === true ? 'Yes' : 'No' },
      { label: 'Tracking', value: dataSafety.tracking === true ? 'Yes' : 'No' },
      { label: 'Account deletion required', value: dataSafety.accountDeletionRequired },
      { label: 'Required permission', value: (dataSafety.requiredPermissions || []).join(', ') },
      { label: 'Blocked permissions', value: dataSafety.blockedPermissions || [] },
    ],
    saveGate: 'Saving updates Google Play Data safety declarations and should match the final build behavior.',
  },
  {
    task: 'Government apps',
    status: 'ready-to-enter',
    fields: [
      { label: 'Is this a government app?', value: 'No' },
    ],
    saveGate: 'Saving updates Google Play app content answers.',
  },
  {
    task: 'Financial features',
    status: 'ready-to-enter',
    fields: [
      { label: 'Financial products or services?', value: 'No' },
      { label: 'Reasoning', value: 'The app produces reconstruction planning and quote packet materials; it does not offer lending, banking, trading, payments, insurance, or financial advice.' },
    ],
    saveGate: 'Saving updates Google Play app content answers.',
  },
  {
    task: 'Health',
    status: 'ready-to-enter',
    fields: [
      { label: 'Health features?', value: 'No' },
    ],
    saveGate: 'Saving updates Google Play app content answers.',
  },
  {
    task: 'Select an app category and provide contact details',
    status: googlePlayContactDetailsCompleted ? 'draft-saved' : 'partial-human-value-needed',
    fields: [
      { label: 'App or game', value: 'App' },
      { label: 'Category', value: 'Productivity' },
      { label: 'Website', value: urls.supportUrl },
      { label: 'Email', value: savedGooglePlaySupportEmail || 'HITL_REQUIRED_PUBLIC_SUPPORT_EMAIL' },
      { label: 'Phone', value: 'Optional / leave blank unless Vambah wants public phone support listed' },
    ],
    saveGate: googlePlayContactDetailsCompleted
      ? 'Saved in Google Play Console; do not click Send for review until final store signoff.'
      : 'Saving publishes contact metadata inside Google Play Console; public support email needs Vambah confirmation.',
  },
  {
    task: 'Set up your store listing',
    status: nativeScreenshotsCaptured ? 'draft-saved-assets-ready' : 'partial-native-assets-needed',
    fields: [
      { label: 'App name/title', value: google.title || appIdentity.appName },
      { label: 'Short description', value: google.shortDescription },
      { label: 'Full description', value: google.fullDescription },
      { label: 'App icon', value: '1024x1024 release icon already present per store asset preflight' },
      { label: 'Feature graphic', value: packet.screenshots?.googlePlayFeatureGraphic },
      {
        label: 'Phone screenshots',
        value: nativeScreenshotsCaptured
          ? 'Final Android and iOS native screenshots are recorded in docs/store-screenshots/native/ and docs/native-qa-evidence.json.'
          : 'Pending final native Android/iOS screenshots in docs/store-screenshots/native/',
      },
    ],
    saveGate: nativeScreenshotsCaptured
      ? 'Store listing assets are available; do not click Send for review until final store signoff.'
      : 'Store listing can be drafted, but final screenshot upload must use native preview captures.',
  },
];

const appStoreConnectTasks = [
  {
    task: 'Create iOS app record',
    status: appStoreRecordExists ? 'completed-recorded' : 'hitl-create-button-staged',
    fields: [
      { label: 'Platform', value: 'iOS' },
      { label: 'Name', value: apple.name || appIdentity.appName },
      { label: 'Primary language', value: 'English (U.S.)' },
      { label: 'Bundle ID', value: `${apple.name || appIdentity.appName} - ${appIdentity.iosBundleId}` },
      { label: 'SKU', value: appIdentity.sku },
      { label: 'User access', value: 'Full Access' },
      { label: 'Apple ID', value: recordedAppleId || 'HITL_REQUIRED_AFTER_CREATE' },
      { label: 'Record URL', value: recordedAppStoreUrl || 'HITL_REQUIRED_AFTER_CREATE' },
    ],
    saveGate: appStoreRecordExists
      ? 'Record exists. Continue with metadata, privacy, age rating, TestFlight, and screenshot tasks.'
      : 'Clicking Create makes the persistent App Store Connect app record and is waiting for HITL.',
  },
  {
    task: 'App information',
    status: 'ready-after-record-create',
    fields: [
      { label: 'Subtitle', value: apple.subtitle },
      { label: 'Primary category', value: 'Productivity' },
      { label: 'Secondary category', value: 'Business' },
      { label: 'Privacy policy URL', value: urls.privacyPolicyUrl },
    ],
    saveGate: 'Requires App Store Connect app record and saved console edits.',
  },
  {
    task: 'Version metadata',
    status: 'ready-after-record-create',
    fields: [
      { label: 'Promotional text', value: apple.promotionalText },
      { label: 'Description', value: apple.description },
      { label: 'Keywords', value: apple.keywords },
      { label: 'Support URL', value: urls.supportUrl },
      { label: 'Marketing URL', value: urls.supportUrl },
      { label: 'Review notes', value: apple.reviewNotes },
    ],
    saveGate: 'Requires App Store Connect app record and saved console edits.',
  },
  {
    task: 'App Privacy',
    status: 'ready-to-review',
    fields: [
      { label: 'Tracking', value: apple.appPrivacy?.tracking === true ? 'Yes' : 'No' },
      { label: 'Data used for advertising', value: apple.appPrivacy?.dataUsedForAdvertising === true ? 'Yes' : 'No' },
      { label: 'Contact info collected', value: apple.appPrivacy?.contactInfoCollected === true ? 'Yes' : 'No' },
      { label: 'Identifiers collected', value: apple.appPrivacy?.identifiersCollected === true ? 'Yes' : 'No' },
      { label: 'Diagnostics collected', value: apple.appPrivacy?.diagnosticsCollected === true ? 'Yes' : 'No' },
      { label: 'User content processed', value: apple.appPrivacy?.userContentProcessed || [] },
      { label: 'Third-party processing', value: apple.appPrivacy?.thirdPartyProcessing || [] },
    ],
    saveGate: 'Final App Privacy answers must match final build behavior before saving.',
  },
  {
    task: 'Age rating',
    status: 'review-required',
    fields: [
      { label: 'Expected rating target', value: '4+ / low maturity, pending official questionnaire result' },
      { label: 'Human review note', value: 'Answer the official questionnaire based on machine reconstruction planning, camera use, and no public user-generated content feed.' },
    ],
    saveGate: 'Official questionnaire result must be reviewed before saving as final.',
  },
];

const packetOut = {
  schemaVersion: 1,
  generatedAt,
  source: packetPath,
  status: 'draft-console-entry-packet',
  appIdentity: {
    appName: appIdentity.appName,
    iosBundleId: appIdentity.iosBundleId,
    androidPackage: appIdentity.androidPackage,
    sku: appIdentity.sku,
  },
  hostedUrls: {
    privacyPolicyUrl: urls.privacyPolicyUrl,
    termsUrl: urls.termsUrl,
    supportUrl: urls.supportUrl,
    apiBaseUrl: urls.apiBaseUrl,
  },
  googlePlayTasks,
  appStoreConnectTasks,
  hitlValuesNeeded: [
    ...(!appStoreRecordExists ? ['App Store Connect Apple ID after the app record is created'] : []),
    ...(!googlePlayContactDetailsCompleted ? ['Public support email for Google Play contact details'] : []),
    'Final official content rating and age rating questionnaire results',
    'Native Android and iOS screenshots from preview builds',
    'Apple login/2FA for EAS iOS preview credentials',
  ],
  safetyBoundaries: [
    'Do not mark any store-console task complete until saved in the relevant console and verified.',
    'Do not submit to public app review from this packet.',
    'Do not add secrets, private connector credentials, or raw Apple/Google account data to evidence files.',
  ],
};

const formatValue = (value) => {
  if (Array.isArray(value)) return value.map(item => `  - ${item}`).join('\n');
  return String(value || '');
};

const taskMarkdown = (task) => [
  `### ${task.task}`,
  '',
  `- Status: ${task.status}`,
  `- Save gate: ${task.saveGate}`,
  '',
  ...task.fields.flatMap(field => [
    `**${field.label}**`,
    '',
    '```text',
    formatValue(field.value),
    '```',
    '',
  ]),
].join('\n');

const markdown = [
  '# Store Console Task Answers',
  '',
  `Generated: ${generatedAt}`,
  '',
  'Use this as a task-by-task entry packet for App Store Connect and Google Play Console. It is not proof that any console task has been saved or approved.',
  '',
  '## Human Values Still Needed',
  '',
  ...packetOut.hitlValuesNeeded.map(item => `- ${item}`),
  '',
  '## Google Play Tasks',
  '',
  ...googlePlayTasks.map(taskMarkdown),
  '',
  '## App Store Connect Tasks',
  '',
  ...appStoreConnectTasks.map(taskMarkdown),
  '',
  '## Safety Boundaries',
  '',
  ...packetOut.safetyBoundaries.map(item => `- ${item}`),
  '',
].join('\n');

writeJson(jsonOut, packetOut);
writeFile(mdOut, markdown);

console.log(`Store console task answers JSON written: ${path.resolve(jsonOut)}`);
console.log(`Store console task answers Markdown written: ${path.resolve(mdOut)}`);
