# ReversR Rebuild Store Operator Packet

Generated at: 2026-06-05T11:45:27.410Z

This folder is the store-console handoff packet for App Store Connect and Google Play Console setup. It is a preparation packet, not proof that Apple or Google have accepted the app.

## Release Identity

- App name: ReversR Rebuild
- Version: 1.0.0
- iOS bundle ID: `com.vsillah.reversrrebuild`
- Android package: `com.vsillah.reversrrebuild`
- SKU: `reversr-rebuild-001`
- Primary language: en-US
- Apple categories: Productivity / Business
- Google category: Productivity

## Current Status

- Release pass gates: 34
- Release pending gates: 5
- Release blocked gates: 0
- Release warnings: 0

Pending gates:

- local-release-ci-evidence: Run npm run release:local-ci before external account-side release work.
- eas-submit-config: After App Store Connect record creation, set submit.production.ios.ascAppId in eas.json, then run npm run native:preflight.
- native-qa-evidence: Run npm run native:qa:preflight and resolve any failures.
- store-console-records: Create the App Store Connect and Play Console app records, copy docs/store-console-evidence.template.json, fill evidence, then run npm run store:console:preflight.
- native-screenshots: Capture final screenshots from EAS preview builds and record them in docs/native-qa-evidence.json.

## Operator Entry Order

1. Create App Store Connect record for com.vsillah.reversrrebuild and SKU reversr-rebuild-001.
2. Create Google Play Console record for com.vsillah.reversrrebuild.
3. Use the configured Vercel production privacy, terms, support, and API URLs in store console drafts.
4. Copy App Store and Google Play text from docs/store-console-copy.md.
5. Complete App Privacy, Data safety, age rating, App content, and review notes from the packet.
6. Copy docs/store-console-evidence.template.json to docs/store-console-evidence.json and fill record evidence.
7. Build Android and iOS preview binaries, complete docs/native-qa-evidence.json, and capture native screenshots.
8. Run npm run store:console:preflight and npm run native:qa:preflight before TestFlight or Play Internal Testing submission.

## Copy Sources

Use these files when filling console drafts:

- docs/store-submission-packet.json
- docs/store-console-copy.md
- docs/store-review-safety-packet.md
- docs/store-console-evidence.template.json
- docs/store-console-browser-handoff.json
- docs/native-device-handoff.json
- docs/native-qa-evidence.template.json
- docs/store-screenshots/planning-evidence.json
- docs/store-assets/google-play-feature-graphic.png
- docs/release-next-actions.md
- docs/release-evidence-bundle.json
- docs/objective-readiness-audit.json
- docs/external-release-setup-runbook.md

## App Store Connect Fields

- Name: ReversR Rebuild
- Subtitle: Machine rebuild packages
- Keywords length: 66/100
- Review notes present: true
- Privacy draft ready: true

## Google Play Fields

- Title: ReversR Rebuild
- Short description length: 73/80
- Data safety draft ready: true
- Required permissions: android.permission.CAMERA

## Assets

- Google Play feature graphic: `docs/store-assets/google-play-feature-graphic.png`
- Native screenshots required: true
- Required native screenshot set count: 5
- Web planning evidence: `docs/store-screenshots/planning-evidence.json`

## Safety Boundary

- This packet is store-console setup support, not approval to submit production builds.
- Final native screenshots must come from Android and iOS preview builds.
- Quote packets and vendor request drafts remain explicit human-review handoffs.
- Raw connector secrets must stay server-side behind credentialRef references.
