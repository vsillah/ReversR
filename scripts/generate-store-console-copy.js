const fs = require('fs');
const path = require('path');

const outputFile = process.env.STORE_CONSOLE_COPY_FILE || 'docs/store-console-copy.md';

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const valueOrPending = (value) => String(value || '').trim() || 'PENDING_HOSTED_URL';
const list = (items) => (items || []).map(item => `- ${item}`).join('\n');
const fenced = (value) => `\n\`\`\`text\n${String(value || '').trim()}\n\`\`\`\n`;

const packet = readJson('docs/store-submission-packet.json');
const app = packet.appIdentity || {};
const apple = packet.appStoreConnect || {};
const google = packet.googlePlay || {};
const urls = packet.urls || {};

const content = `# ReversR Rebuild Store Console Copy Packet

Generated from \`docs/store-submission-packet.json\`.

Use this as the copy/paste source for App Store Connect and Google Play Console drafts. Replace placeholder hosted URLs only after the production policy/support routes and API are deployed and verified.

## Release Identity

- App name: ${app.name}
- Version: ${app.version}
- iOS bundle ID: \`${app.iosBundleId}\`
- Android package: \`${app.androidPackage}\`
- SKU: \`${app.sku}\`
- Primary language: ${app.primaryLanguage}
- Apple primary category: ${app.category?.applePrimary}
- Apple secondary category: ${app.category?.appleSecondary}
- Google category: ${app.category?.googleCategory}
- Age rating target: ${app.ageRatingTarget}

## Hosted URLs

- Privacy policy URL: ${valueOrPending(urls.privacyPolicyUrl)}
- Terms URL: ${valueOrPending(urls.termsUrl)}
- Support URL: ${valueOrPending(urls.supportUrl)}
- API base URL: ${valueOrPending(urls.apiBaseUrl)}

## App Store Connect

### Name
${fenced(apple.name)}
### Subtitle
${fenced(apple.subtitle)}
### Promotional Text
${fenced(apple.promotionalText)}
### Description
${fenced(apple.description)}
### Keywords
${fenced(apple.keywords)}
### Review Notes
${fenced(apple.reviewNotes)}
### App Privacy Draft

- Tracking: ${apple.appPrivacy?.tracking}
- Data used for advertising: ${apple.appPrivacy?.dataUsedForAdvertising}
- Contact info collected: ${apple.appPrivacy?.contactInfoCollected}
- Identifiers collected: ${apple.appPrivacy?.identifiersCollected}
- Diagnostics collected: ${apple.appPrivacy?.diagnosticsCollected}

User content processed:

${list(apple.appPrivacy?.userContentProcessed)}

Data linked to user:

${fenced(apple.appPrivacy?.dataLinkedToUser)}
Third-party processing:

${list(apple.appPrivacy?.thirdPartyProcessing)}

## Google Play Console

### Title
${fenced(google.title)}
### Short Description
${fenced(google.shortDescription)}
### Full Description
${fenced(google.fullDescription)}
### Data Safety Draft

Data collected:

${list(google.dataSafety?.dataCollected)}

Data shared:

${list(google.dataSafety?.dataShared)}

Purposes:

${list(google.dataSafety?.purposes)}

- Encrypted in transit: ${google.dataSafety?.encryptedInTransit}
- Tracking: ${google.dataSafety?.tracking}
- Ads: ${google.dataSafety?.ads}
- Account deletion required: ${google.dataSafety?.accountDeletionRequired}

Required permissions:

${list(google.dataSafety?.requiredPermissions)}

Blocked permissions:

${list(google.dataSafety?.blockedPermissions)}

## Screenshots And Feature Graphic

- Native screenshots required: ${packet.screenshots?.nativeRequired}
- Web-preview planning screenshots: \`${packet.screenshots?.webPreviewOnly}\`
- Google Play feature graphic: \`${packet.screenshots?.googlePlayFeatureGraphic}\`

Required native screenshot set:

${list(packet.screenshots?.requiredSet)}

## Release Notes
${fenced(packet.releaseNotes?.initialRelease)}
## Open Gates Before Public Submission

${list(packet.openGates)}

## Safety Notes

- Final screenshots must come from Android and iOS preview builds, not web preview captures.
- Quote packets and vendor request drafts require explicit human review.
- The app does not automatically order parts, submit manufacturing jobs, transmit files to vendors, or purchase services.
- Raw inventory connector secrets must remain server-side behind \`credentialRef\` references.
`;

const target = path.resolve(outputFile);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, content);
console.log(`Store console copy packet written: ${target}`);
