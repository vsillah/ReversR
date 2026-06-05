# ReversR Rebuild Release Next Actions

Generated at: 2026-06-05T10:51:01.645Z
Release status generated at: 2026-06-05T10:51:01.641Z

This generated packet is the external-operator action list for the clone release. It does not mark the app store-ready; it preserves the pending hosted, EAS, native QA, screenshot, and store-console gates.

## Summary

- Pass: 5
- Pending: 4
- Blocked: 0
- Warn: 0
- Next recommended gate: eas-submit-config

## 1. EAS submit profile is configured for Google Play Internal Testing and TestFlight upload

- Gate ID: eas-submit-config
- Group: native
- Status: pending
- Owner: Apple release operator
- Phase: EAS submit setup
- Next action: Create the App Store Connect app record and add its Apple ID to eas.json.

Current gate evidence:

android.track=internal; ios.ascAppId=(missing).

Current gate next step:

After App Store Connect record creation, set submit.production.ios.ascAppId in eas.json, then run npm run native:preflight.

Steps:

1. Create the App Store Connect app record for com.vsillah.reversrrebuild.
2. Follow docs/external-release-setup-runbook.md sections 2 and 4.
3. Copy the App Store Connect Apple ID from the app information page.
4. Set eas.json submit.production.ios.ascAppId to that Apple ID.
5. Keep Android submit.production.android.track set to internal for Google Play Internal Testing.
6. Run npm run native:preflight.

Evidence required:

- eas.json has submit.production.ios.ascAppId.
- Native preflight no longer reports missing iOS ascAppId.

## 2. Android and iOS preview-build QA evidence is recorded

- Gate ID: native-qa-evidence
- Group: native
- Status: pending
- Owner: QA/release operator
- Phase: Native preview QA
- Next action: Build Android/iOS preview binaries and record device QA evidence.

Current gate evidence:

docs/native-qa-evidence.json is missing.

Current gate next step:

Build EAS preview binaries, copy docs/native-qa-evidence.template.json, fill evidence, then run npm run native:qa:preflight.

Steps:

1. Run npx eas-cli@20.0.0 build --platform android --profile preview.
2. Follow docs/external-release-setup-runbook.md section 7 for preview QA evidence and screenshot files.
3. Run npx eas-cli@20.0.0 build --platform ios --profile preview.
4. Copy docs/native-qa-evidence.template.json to docs/native-qa-evidence.json.
5. Fill build URLs, devices, testers, timestamps, platform check statuses, screenshot records, and signoff fields.
6. Run npm run native:qa:preflight.

Evidence required:

- docs/native-qa-evidence.json exists and references both preview builds.
- All required Android and iOS checks pass.
- npm run native:qa:preflight passes.

## 3. App Store Connect and Google Play Console app records exist

- Gate ID: store-console-records
- Group: store-console
- Status: pending
- Owner: Store release operator
- Phase: Store console setup
- Next action: Create App Store Connect and Google Play Console records and fill console evidence.

Current gate evidence:

Expected iOS bundle com.vsillah.reversrrebuild; expected Android package com.vsillah.reversrrebuild; docs/store-console-evidence.json is missing.

Current gate next step:

Create the App Store Connect and Play Console app records, copy docs/store-console-evidence.template.json, fill evidence, then run npm run store:console:preflight.

Steps:

1. Create the App Store Connect app record for com.vsillah.reversrrebuild.
2. Follow docs/external-release-setup-runbook.md sections 2 and 3.
3. Create the Google Play Console app record for com.vsillah.reversrrebuild.
4. Run npm run store:submission:preflight:local and confirm docs/store-submission-smoke-evidence.json is updated.
5. Run npm run store:console:preflight:local and confirm docs/store-console-pending-evidence.json is updated.
6. Copy metadata from docs/store-submission-packet.json into both console drafts.
7. Complete App Privacy, age rating, Data safety, and App content forms.
8. Copy docs/store-console-evidence.template.json to docs/store-console-evidence.json and fill record URLs, Apple ID, privacy URL, metadata, asset, review-gate, and signoff fields.
9. Run npm run store:console:preflight.

Evidence required:

- docs/store-submission-smoke-evidence.json records App Store metadata, Google Play metadata, privacy/data-safety answers, native screenshot requirements, and open gates.
- docs/store-console-pending-evidence.json records pending App Store Connect and Google Play setup requirements.
- docs/store-console-evidence.json exists with both console records.
- npm run store:console:preflight passes.

## 4. Final native screenshots are captured from Android/iOS preview builds

- Gate ID: native-screenshots
- Group: store-console
- Status: pending
- Owner: QA/release operator
- Phase: Native store screenshots
- Next action: Capture final screenshots from Android and iOS preview builds.

Current gate evidence:

Web-preview screenshots are planning artifacts only; native screenshots are not represented in repo evidence yet.

Current gate next step:

Capture final screenshots from EAS preview builds and record them in docs/native-qa-evidence.json.

Steps:

1. Run npm run screenshots:store against the local web preview and confirm docs/store-screenshots/planning-evidence.json is updated.
2. Install the latest Android preview build and capture the five required Android screenshots.
3. Install the latest iOS preview build and capture the five required iOS screenshots.
4. Save PNGs under docs/store-screenshots/native/ using the documented filenames.
5. Reference each PNG in docs/native-qa-evidence.json with device and capturedAt metadata.
6. Run npm run native:qa:preflight.

Evidence required:

- docs/store-screenshots/planning-evidence.json maps the web planning captures to the required native screenshot filenames.
- All ten native screenshot PNGs exist.
- docs/native-qa-evidence.json marks each screenshot pass on Android and iOS.
- npm run native:qa:preflight passes.

