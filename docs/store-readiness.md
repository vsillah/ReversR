# ReversR Rebuild Store Readiness

Last updated: June 5, 2026

## Current Status

ReversR Rebuild is prototype-ready, not store-ready.

The app now has:

- Distinct app identity: `ReversR Rebuild`
- Android package: `com.vsillah.reversrrebuild`
- iOS bundle identifier: `com.vsillah.reversrrebuild`
- Explicit Android `versionCode` and iOS `buildNumber`
- Camera-only Android permission
- Explicit Android permission blocks for microphone and broad photo/media access
- Inventory connector validation
- Machine matching against demo, CSV, JSON, HTTP(S), and local file fixtures
- Reconstruction package generation with assembly steps, pricing, BOM, and manufacturer handoff surfaces
- Manufacturer quote packet export for human-reviewed 3D modeling and fabrication requests
- Vendor request draft flow for preparing a user-reviewed quote email after the quote packet is exported
- Consolidated release status audit: `npm run release:status`
- Generated external-gate action plan: `npm run release:next-actions`
- Consolidated release evidence bundle: `npm run release:evidence`
- Repeatable local release CI evidence: `npm run release:local-ci`
- GitHub Actions local release CI workflow: `.github/workflows/release-local-ci.yml`
- Store preflight script: `npm run store:preflight`
- Store preflight checks for native build numbers and required 1024x1024 PNG release assets
- Store submission packet: `docs/store-submission-packet.json`
- Store console copy/paste packet: `docs/store-console-copy.md`
- Store submission packet evidence: `docs/store-submission-smoke-evidence.json`
- Store submission packet preflight for App Store Connect and Google Play metadata limits, hosted URLs, privacy/data-safety answers, and native screenshot requirements
- Store console evidence template and preflight: `npm run store:console:preflight`
- Store console pending evidence: `docs/store-console-pending-evidence.json`
- Release evidence bundle for external operators: `docs/release-evidence-bundle.json`
- Local release CI evidence: `docs/local-release-ci-evidence.json`
- PR release CI workflow: `.github/workflows/release-local-ci.yml`
- External release account setup runbook: `docs/external-release-setup-runbook.md`
- Google Play feature graphic generation and validation: `npm run store:assets:generate` and `npm run store:assets:preflight`
- Web-preview screenshot planning evidence: `docs/store-screenshots/planning-evidence.json`
- Protected inventory connector preflight: `npm run inventory:preflight`
- Hosted connector smoke gate: `npm run connector:smoke`
- Accessibility preflight script for critical scan, inventory, design, build, Settings, and policy controls
- Web-preview store screenshot capture script: `npm run screenshots:store`
- Web-preview happy-path smoke script and evidence file: `npm run web:flow-smoke` writes `docs/web-flow-smoke-evidence.json`
- Vercel preview host smoke script and evidence file: `PREVIEW_SMOKE_URL=<preview-url> npm run preview:smoke` writes `docs/preview-host-smoke-evidence.json`; protected previews can use `PREVIEW_SMOKE_VERCEL_BYPASS_SECRET`
- Web routes for `/privacy`, `/terms`, and `/support`
- Static web export and policy hosting preflight for the store privacy, terms, and support URLs
- Policy/support static export evidence: `docs/policy-hosting-smoke-evidence.json`
- Expo Doctor passes all project health checks
- API health endpoint: `GET /api/health`
- API Dockerfile and production deployment runbook for hosted backend readiness
- Production API environment template and preflight: `npm run api:env:preflight`
- Production-style local API deployment smoke evidence: `npm run api:deployment-smoke`
- API runtime config health reporting for CORS mode, body limit, admin route state, registry-write state, and private-network connector state
- Machine inventory source validation before hosting: `npm run inventory:source:validate`
- Native release runbook and `npm run native:preflight` gate for EAS project, URL, CLI, and release-profile readiness
- Native release config evidence: `docs/native-release-config-evidence.json`
- EAS submit configuration notes for Google Play Internal Testing and TestFlight upload
- Native QA evidence template and `npm run native:qa:preflight` gate for Android/iOS preview-build testing, including five required native screenshots per platform
- Server-side credential references for authenticated inventory connectors
- Admin-token protected credential registry endpoints for prototype operations
- Settings-based admin credential reference manager for listing, saving, and deleting backend registry credentials
- In-app Settings links for privacy policy, terms, support, and camera/data-use explanation

## Store Submission Requirements

### Apple App Store

Apple requires a privacy policy link in App Store Connect metadata and inside the app. The policy must clearly identify collected data, collection methods, and uses. Source: [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).

Apple also requires App Privacy details in App Store Connect, including data collected by third-party partners. Source: [Apple App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/).

Open gates:

- Create App Store Connect app record for `com.vsillah.reversrrebuild`.
- Provide privacy policy URL reachable outside the app.
- Fill App Privacy details for camera images, machine descriptions, inventory connector metadata, diagnostics, and any AI/provider processing.
- Run TestFlight build and native camera smoke.
- Confirm no camera/photo data is used for advertising, marketing, or unrelated data mining.

### Google Play

Google Play sensitive-permission policy expects apps to request only permissions needed for core functionality and use privacy-oriented alternatives where possible. Source: [Google Play Permissions and APIs that Access Sensitive Information](https://support.google.com/googleplay/android-developer/answer/16558241).

Expo permissions are configured with `android.permissions` and `android.blockedPermissions`; libraries can add permissions automatically, so blocking unused media/microphone permissions is part of the release gate. Source: [Expo Permissions](https://docs.expo.dev/guides/permissions/).

Open gates:

- Create Play Console app record for `com.vsillah.reversrrebuild`.
- Complete App content and Data safety forms.
- Explain camera access as core functionality for machine scan and inventory matching.
- Confirm the app does not request broad media library permissions, all-files access, package visibility, microphone, location, SMS, call logs, or other high-risk permissions.
- Run internal testing release before production.

### Expo/EAS

Expo documents EAS Build and EAS Submit as the build/submit path for App Store and Google Play binaries. Sources: [Expo distribution overview](https://docs.expo.dev/distribution/introduction/) and [Expo submit to app stores](https://docs.expo.dev/deploy/submit-to-app-stores/).

EAS build profiles can bind to `development`, `preview`, and `production` environments, and `EXPO_PUBLIC_` variables are available to app code during builds. Sources: [Configure EAS Build with eas.json](https://docs.expo.dev/build/eas-json/) and [Environment variables in EAS](https://docs.expo.dev/eas/environment-variables/).

Open gates:

- Run `eas init` for the new clone identity.
- Set `EXPO_PUBLIC_API_BASE_URL` in the EAS production environment.
- Run `npm run api:preflight` against the hosted API.
- Run `npm run inventory:preflight` locally before store builds to verify protected connector matching and BOM generation.
- Run `npm run connector:smoke` against the hosted API and real inventory connector before preview builds are release candidates.
- Run `npm run policy:preflight -- --check-hosted` after policy/support routes are hosted.
- Run `npm run store:preflight` before production builds to confirm package IDs, build numbers, release assets, permissions, hosted URLs, and EAS profile shape.
- Run `npm run store:submission:preflight` before entering copy into App Store Connect or Play Console.
- Run `npm run store:console:preflight` after App Store Connect and Play Console records are created and `docs/store-console-evidence.json` is filled.
- Run `npm run native:preflight` after EAS project linkage and hosted URLs are configured.
- Run `npm run native:qa:preflight` after Android and iOS preview-build QA evidence is recorded.
- Configure Android credentials and iOS credentials.
- Build:
  - `eas build --platform android --profile production`
  - `eas build --platform ios --profile production`
- Submit:
  - `eas submit --platform android --profile production`
  - `eas submit --platform ios --profile production`

## Technical Gaps Before Store Review

- Production API host: a Dockerfile, deployment runbook, environment template/preflight, local deployment smoke, and runtime config health checks exist, but the API still needs to be deployed behind HTTPS with restricted `API_CORS_ORIGINS` and verified with `npm run api:env:preflight` plus `npm run api:preflight` before native store builds.
- Authenticated connectors: API key and OAuth sources are supported through backend credential references, admin-token registry endpoints, and a Settings-based prototype admin manager, but production should move registry-file secrets into a managed secret store and add user/admin roles.
- Protected connector QA: `npm run inventory:source:validate` validates the machine export shape before hosting, `npm run inventory:preflight` validates the local credentialRef path, and `npm run connector:smoke` now defines the hosted real-inventory gate. The hosted smoke still needs a deployed API and authorized production inventory source.
- Web happy-path QA: `npm run web:flow-smoke` verifies the local scan, demo inventory, machine match, BOM, quote packet, and vendor draft path against a running web preview, then records `docs/web-flow-smoke-evidence.json`; native device QA is still required before store submission.
- Privacy policy, terms, and support: web routes, static export, local policy evidence, deployed PR preview smoke evidence, and hosting preflight exist, but the routes must still be deployed to production hosted HTTPS URLs and reviewed before submission.
- Native QA: a required evidence template exists, but camera flow and reconstruction/export checks still need real iOS and Android preview-build testing.
- EAS linkage: local native release config evidence exists, but `eas init` still needs to create the clone project ID before strict native release preflight can pass.
- EAS submit profile: Android is configured for Google Play Internal Testing, but iOS still needs the App Store Connect `ascAppId` after the app record exists.
- Visual generation: local no-key image fallback is intentionally minimal; production should use configured AI image generation or deterministic diagram rendering.
- Vendor handoff: quote packet export and user-reviewed email drafts are available, but the app still does not automatically submit files, request live pricing, purchase services, or place fabrication orders.
- Accessibility: critical-path labels are covered by `npm run accessibility:preflight`, but native screen-reader and tap-target QA still need device validation before submission.
- Store assets: metadata draft, required 1024x1024 PNG assets, Google Play feature graphic, web-preview screenshot planning evidence, and web policy/support routes exist, but final native screenshots, hosted support/privacy/terms URLs, and final icon review are not complete.
- Store console packet: copy/paste metadata, review notes, privacy answers, and data-safety draft are structured in JSON and backed by `docs/store-submission-smoke-evidence.json`, but still need final hosted URLs and console-side review.
- Store console evidence: pending evidence and a template/preflight now exist, but `docs/store-console-evidence.json` still needs to be filled after App Store Connect and Play Console records exist.
- External account setup: `docs/external-release-setup-runbook.md` now gives exact App Store Connect, Google Play Console, EAS, hosted API/policy, connector, preview QA, screenshot, and stop-condition steps, but those account-side actions still require real account access.
- Dependency audit: `npm audit fix` removed the high-severity findings; remaining moderate transitive Expo-tooling findings require a breaking Expo SDK 56 upgrade path and should be handled as a separate native upgrade gate.

## Recommended Next Sequence

1. Run `npm run release:status` to see passed local gates and pending hosted/native/store-console gates from the current repo state.
2. Run `npm run release:next-actions` to expand each pending gate into owner, action, exact steps, and evidence required. The durable version is `docs/release-action-plan.md`.
3. Run `npm run release:local-ci` to rerun the repeatable local validation suite and write `docs/local-release-ci-evidence.json`.
4. Run `npm run release:evidence` to package the current local proof files and pending external gates into `docs/release-evidence-bundle.json`.
5. Run `npm run inventory:source:validate -- <inventory.csv-or-json>` on the machine export that will back the hosted connector.
6. Run `npm run inventory:preflight` to confirm the protected connector, match, and BOM path locally.
7. Run `npm run store:assets:preflight` to verify the Google Play feature graphic before console setup.
8. Start `npm run web-preview`, then run `WEB_SMOKE_APP_URL=http://localhost:5001 npm run web:flow-smoke` to prove the web happy path and write `docs/web-flow-smoke-evidence.json` before screenshot or native preview work.
9. After the PR preview deploys, run `PREVIEW_SMOKE_URL=https://your-pr-preview.vercel.app npm run preview:smoke` to prove the deployed preview app and policy/support routes render before production hosting work. If Vercel preview protection is enabled, add `PREVIEW_SMOKE_VERCEL_BYPASS_SECRET=<secret>`.
10. Fill a production API env from `docs/production-api-env.example`, run `npm run api:env:preflight`, run `npm run api:deployment-smoke`, deploy the API container behind HTTPS with `API_CORS_ORIGINS` and `API_REQUEST_BODY_LIMIT`, then run `npm run api:preflight` against the hosted URL.
11. Move connector credentials from the prototype registry file into a managed secret store, add admin roles, and run `npm run connector:smoke` against a real authorized inventory source.
12. Run `npm run policy:preflight:local`, deploy the web `/privacy`, `/terms`, and `/support` routes, run `npm run policy:preflight -- --check-hosted`, then set `EXPO_PUBLIC_PRIVACY_POLICY_URL`, `EXPO_PUBLIC_TERMS_URL`, and `EXPO_PUBLIC_SUPPORT_URL` in EAS production.
13. Set `EXPO_PUBLIC_API_BASE_URL` in EAS production, then run `npm run store:preflight`.
14. Run `npm run store:submission:preflight` with hosted URLs, confirm `docs/store-submission-smoke-evidence.json` is updated, then run `npm run store:console:copy` and copy `docs/store-console-copy.md` into App Store Connect and Play Console drafts.
15. Follow `docs/external-release-setup-runbook.md`, run `npm run store:console:preflight:local`, then copy `docs/store-console-evidence.template.json` to `docs/store-console-evidence.json`, fill App Store Connect and Play Console record evidence, and run `npm run store:console:preflight`.
16. Run `npm run native:preflight:local`, link the clone with `eas init`, then run `npm run native:preflight`.
17. Run EAS preview builds.
18. Copy `docs/native-qa-evidence.template.json` to `docs/native-qa-evidence.json`, complete Android/iOS device QA, then run `npm run native:qa:preflight`.
19. Run `npm run screenshots:store`, confirm `docs/store-screenshots/planning-evidence.json` is updated, then capture final native screenshots and finalize store metadata.
20. Run `npm run accessibility:preflight`, then native Android/iOS screen-reader and tap-target QA.
21. Plan the Expo SDK 56 upgrade if audit policy requires zero moderate findings before release.
22. Submit to TestFlight and Google Play Internal Testing.
23. Resolve review feedback, then submit production releases.
