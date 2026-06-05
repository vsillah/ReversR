# ReversR Rebuild Release Next Actions

Generated at: 2026-06-05T14:44:56.818Z
Release status generated at: 2026-06-05T14:44:56.811Z

This generated packet is the external-operator action list for the clone release. It does not mark the app store-ready; it preserves the pending hosted, EAS, native QA, screenshot, and store-console gates.

## Summary

- Pass: 6
- Pending: 3
- Blocked: 0
- Warn: 0
- Next recommended gate: native-qa-evidence

## 1. Android and iOS preview-build QA evidence is recorded

- Gate ID: native-qa-evidence
- Group: native
- Status: pending
- Owner: QA/release operator
- Phase: Native preview QA
- Next action: Complete iOS preview credentials/build, then record Android and iOS device QA evidence.

Current gate evidence:

docs/native-qa-evidence.json exists; run npm run native:qa:preflight for proof.

Current gate next step:

Run npm run native:qa:preflight and resolve any failures.

Steps:

1. Use the recorded Android preview build already in docs/native-qa-evidence.json.
2. Follow docs/external-release-setup-runbook.md section 7 for preview QA evidence and screenshot files.
3. Use the Android phone for Android preview QA and screenshots now; make sure adb devices lists exactly one device.
4. Abort the active EAS iOS internal device-registration prompt because no iOS device is available.
5. Configure iOS production/TestFlight credentials instead of internal preview credentials.
6. After EAS finishes creating App Store/TestFlight distribution credentials, start an iOS store build and record the build URL.
7. Install full Xcode later if local iOS Simulator screenshots are needed without a physical iOS device.
8. Update docs/native-qa-evidence.json with device QA results.
9. Fill build URLs, devices, testers, timestamps, platform check statuses, screenshot records, and signoff fields.
10. Run npm run native:qa:preflight.

Evidence required:

- docs/native-qa-evidence.json exists and references both preview builds.
- All required Android and iOS checks pass.
- npm run native:qa:preflight passes.

## 2. App Store Connect and Google Play Console app records exist

- Gate ID: store-console-records
- Group: store-console
- Status: pending
- Owner: Store release operator
- Phase: Store console setup
- Next action: Complete App Store Connect and Google Play metadata, policy forms, testing setup, and console evidence.

Current gate evidence:

docs/store-console-evidence.json exists; run npm run store:console:preflight for proof.

Current gate next step:

Run npm run store:console:preflight and resolve any failures.

Steps:

1. Use the recorded App Store Connect app record and Apple ID in docs/store-console-evidence.json.
2. Follow docs/external-release-setup-runbook.md sections 2 and 3.
3. Use the recorded Google Play Console app dashboard URL in docs/store-console-evidence.json.
4. Run npm run store:submission:preflight:local and confirm docs/store-submission-smoke-evidence.json is updated.
5. Run npm run store:console:preflight:local and confirm docs/store-console-pending-evidence.json is updated.
6. Copy or authorize saved entry of metadata from docs/store-submission-packet.json into both console drafts.
7. Complete App Privacy, age rating, Data safety, and App content forms.
8. Update docs/store-console-evidence.json with saved console task results, privacy URL, metadata, asset, review-gate, and signoff fields.
9. Run npm run store:console:preflight.

Evidence required:

- docs/store-submission-smoke-evidence.json records App Store metadata, Google Play metadata, privacy/data-safety answers, native screenshot requirements, and open gates.
- docs/store-console-pending-evidence.json records pending App Store Connect and Google Play setup requirements.
- docs/store-console-evidence.json exists with both console records.
- npm run store:console:preflight passes.

## 3. Final native screenshots are captured from Android/iOS preview builds

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

