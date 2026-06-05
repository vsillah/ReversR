# ReversR Rebuild Release Next Actions

Generated at: 2026-06-05T06:30:17.246Z
Release status generated at: 2026-06-05T06:30:17.243Z

This generated packet is the external-operator action list for the clone release. It does not mark the app store-ready; it preserves the pending hosted, connector, EAS, native QA, screenshot, and store-console gates.

## Summary

- Pass: 0
- Pending: 9
- Blocked: 0
- Warn: 0
- Next recommended gate: preview-host-smoke

## 1. Vercel preview host renders app and policy/support routes before production hosting

- Gate ID: preview-host-smoke
- Group: hosted
- Status: pending
- Owner: Release operator
- Phase: Vercel preview access
- Next action: Create or use a Vercel Protection Bypass for Automation secret and rerun the deployed preview smoke.

Current gate evidence:

docs/preview-host-smoke-evidence.json records Vercel 401 preview protection at 2026-06-05T06:08:09.501Z.

Current gate next step:

Run PREVIEW_SMOKE_URL=<vercel-preview-url> PREVIEW_SMOKE_VERCEL_BYPASS_SECRET=<secret> npm run preview:smoke after the PR preview deploys; if no bypass is available, create one in Vercel Protection Bypass for Automation.

Steps:

1. Open the Vercel project for the PR preview deployment.
2. Go to Deployment Protection or Protection Bypass for Automation settings.
3. Create or copy the automation bypass secret for the project.
4. Run PREVIEW_SMOKE_URL=<vercel-preview-url> PREVIEW_SMOKE_VERCEL_BYPASS_SECRET=<secret> npm run preview:smoke.
5. Confirm docs/preview-host-smoke-evidence.json has status pass and automationBypass.vercelBypassConfigured true.
6. Run npm run release:evidence, then npm run release:status.

Evidence required:

- docs/preview-host-smoke-evidence.json proves /, /privacy, /terms, and /support render on the deployed preview.
- The evidence records that a bypass was configured but does not contain the bypass secret.
- npm run release:status passes the preview-host-smoke gate.

## 2. Hosted HTTPS API URL is configured for native builds

- Gate ID: hosted-api
- Group: hosted
- Status: pending
- Owner: Release operator
- Phase: Hosted backend
- Next action: Deploy the API container behind HTTPS and bind production API env.

Current gate evidence:

No proven hosted API URL in environment or store packet.

Current gate next step:

Deploy the API behind HTTPS, then set EXPO_PUBLIC_API_BASE_URL and run npm run api:preflight.

Steps:

1. Create a production API env file from docs/production-api-env.example.
2. Follow docs/external-release-setup-runbook.md section 5 for hosted API and policy URL sequencing.
3. Set API_CORS_ORIGINS to the hosted app origins, not *.
4. Set AI_INTEGRATIONS_GEMINI_API_KEY, ADMIN_API_TOKEN, API_REQUEST_BODY_LIMIT, and connector secret settings on the API host.
5. Run npm run api:deployment-smoke and confirm docs/api-deployment-smoke-evidence.json is updated.
6. Deploy the Dockerfile to the chosen host.
7. Run EXPO_PUBLIC_API_BASE_URL=https://api.your-domain.example npm run api:preflight.

Evidence required:

- docs/api-deployment-smoke-evidence.json records restricted CORS, body limit, and demo inventory validation.
- Hosted /api/health returns status ok.
- Runtime config reports restricted CORS.
- npm run api:preflight passes against the hosted URL.

## 3. Privacy, terms, and support URLs are hosted and ready for store metadata

- Gate ID: hosted-policy-urls
- Group: hosted
- Status: pending
- Owner: Release operator
- Phase: Hosted policies
- Next action: Deploy privacy, terms, and support pages to public HTTPS URLs.

Current gate evidence:

Hosted policy/support URLs are still placeholders or missing.

Current gate next step:

Deploy /privacy, /terms, and /support, then set the hosted URL env vars.

Steps:

1. Run npm run policy:preflight:local and confirm docs/policy-hosting-smoke-evidence.json is updated.
2. Follow docs/external-release-setup-runbook.md section 5 for hosted API and policy URL sequencing.
3. Deploy the web export or route host that serves /privacy, /terms, and /support.
4. Set EXPO_PUBLIC_PRIVACY_POLICY_URL, EXPO_PUBLIC_TERMS_URL, and EXPO_PUBLIC_SUPPORT_URL to the hosted URLs.
5. Run npm run policy:preflight -- --check-hosted with those env vars set.

Evidence required:

- docs/policy-hosting-smoke-evidence.json records static export files, SPA rewrite, and required policy/support copy.
- All three policy/support URLs return reachable HTTPS pages.
- npm run policy:preflight -- --check-hosted passes.

## 4. Hosted API can validate and match against a real authorized machine inventory

- Gate ID: real-connector-smoke
- Group: hosted
- Status: pending
- Owner: Inventory/admin operator
- Phase: Production inventory connector
- Next action: Validate the real machine inventory export and smoke the hosted connector path.

Current gate evidence:

This requires a deployed API plus a real connector source and server-side connector credential.

Current gate next step:

Run npm run connector:smoke with CONNECTOR_SMOKE_SOURCE_URL and CONNECTOR_SMOKE_CREDENTIAL_REF.

Steps:

1. Run npm run inventory:source:validate -- <inventory.csv-or-json> on the real export.
2. Follow docs/external-release-setup-runbook.md section 6 before connecting real inventory credentials.
3. Configure the connector credential on the hosted API as a server-side credentialRef.
4. Run npm run connector:smoke with EXPO_PUBLIC_API_BASE_URL, CONNECTOR_SMOKE_SOURCE_URL, CONNECTOR_SMOKE_AUTH_MODE, and CONNECTOR_SMOKE_CREDENTIAL_REF.
5. Set CONNECTOR_SMOKE_EXPECTED_MACHINE_ID for a known machine when possible.

Evidence required:

- Inventory source validation passes for the real export.
- Hosted connector smoke validates the source, matches a machine, and generates a BOM.
- No raw connector secret appears in app responses or evidence.

## 5. EAS project is linked for the clone identity

- Gate ID: eas-project-linkage
- Group: native
- Status: pending
- Owner: Apple/Google release operator
- Phase: EAS project setup
- Next action: Log in to EAS and link the clone identity to its own EAS project.

Current gate evidence:

expo.extra.eas.projectId is not set.

Current gate next step:

Run npx eas-cli@20.0.0 init for the clone identity.

Steps:

1. Run npm run native:preflight:local and confirm docs/native-release-config-evidence.json is updated.
2. Follow docs/external-release-setup-runbook.md section 4 for EAS login, project linkage, env, and credentials.
3. Run npx eas-cli@20.0.0 login.
4. Run npx eas-cli@20.0.0 whoami --non-interactive to confirm the account.
5. Run npx eas-cli@20.0.0 init for ReversR Rebuild.
6. Confirm app.json contains expo.extra.eas.projectId for the clone.
7. Run npm run native:preflight:local, then strict npm run native:preflight after hosted URLs are configured.

Evidence required:

- docs/native-release-config-evidence.json records native identity, camera permissions, EAS profile shape, submit profile shape, CLI availability, and remaining external gates.
- EAS whoami returns the intended account.
- app.json has the clone projectId.
- Native preflight no longer reports missing EAS project linkage.

## 6. EAS submit profile is configured for Google Play Internal Testing and TestFlight upload

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

## 7. Android and iOS preview-build QA evidence is recorded

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

## 8. App Store Connect and Google Play Console app records exist

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

## 9. Final native screenshots are captured from Android/iOS preview builds

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

