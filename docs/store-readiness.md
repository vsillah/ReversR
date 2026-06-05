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
- Store preflight script: `npm run store:preflight`
- Store preflight checks for native build numbers and required 1024x1024 PNG release assets
- Store submission packet: `docs/store-submission-packet.json`
- Store submission packet preflight for App Store Connect and Google Play metadata limits, hosted URLs, privacy/data-safety answers, and native screenshot requirements
- Accessibility preflight script for critical scan, inventory, design, build, Settings, and policy controls
- Web-preview store screenshot capture script: `npm run screenshots:store`
- Web routes for `/privacy`, `/terms`, and `/support`
- Expo Doctor passes all project health checks
- API health endpoint: `GET /api/health`
- API Dockerfile and production deployment runbook for hosted backend readiness
- Native release runbook and `npm run native:preflight` gate for EAS project, URL, CLI, and release-profile readiness
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
- Run `npm run store:preflight` before production builds to confirm package IDs, build numbers, release assets, permissions, hosted URLs, and EAS profile shape.
- Run `npm run store:submission:preflight` before entering copy into App Store Connect or Play Console.
- Run `npm run native:preflight` after EAS project linkage and hosted URLs are configured.
- Configure Android credentials and iOS credentials.
- Build:
  - `eas build --platform android --profile production`
  - `eas build --platform ios --profile production`
- Submit:
  - `eas submit --platform android --profile production`
  - `eas submit --platform ios --profile production`

## Technical Gaps Before Store Review

- Production API host: a Dockerfile and deployment runbook exist, but the API still needs to be deployed behind HTTPS and verified with `npm run api:preflight` before native store builds.
- Authenticated connectors: API key and OAuth sources are supported through backend credential references, admin-token registry endpoints, and a Settings-based prototype admin manager, but production should move registry-file secrets into a managed secret store and add user/admin roles.
- Privacy policy, terms, and support: web routes and env-driven app config exist, but the routes must be deployed to hosted HTTPS URLs and reviewed before submission.
- Native QA: camera flow needs real iOS and Android device testing.
- EAS linkage: `eas init` still needs to create the clone project ID before strict native release preflight can pass.
- Visual generation: local no-key image fallback is intentionally minimal; production should use configured AI image generation or deterministic diagram rendering.
- Vendor handoff: quote packet export and user-reviewed email drafts are available, but the app still does not automatically submit files, request live pricing, purchase services, or place fabrication orders.
- Accessibility: critical-path labels are covered by `npm run accessibility:preflight`, but native screen-reader and tap-target QA still need device validation before submission.
- Store assets: metadata draft, required 1024x1024 PNG assets, web-preview screenshot capture, and web policy/support routes exist, but final native screenshots, hosted support/privacy/terms URLs, and final icon review are not complete.
- Store console packet: copy/paste metadata, review notes, privacy answers, and data-safety draft are structured in JSON, but still need final hosted URLs and console-side review.
- Dependency audit: `npm audit fix` removed the high-severity findings; remaining moderate transitive Expo-tooling findings require a breaking Expo SDK 56 upgrade path and should be handled as a separate native upgrade gate.

## Recommended Next Sequence

1. Deploy the API container behind HTTPS, then run `npm run api:preflight` against the hosted URL.
2. Move connector credentials from the prototype registry file into a managed secret store and add admin roles.
3. Deploy the web `/privacy`, `/terms`, and `/support` routes, then set `EXPO_PUBLIC_PRIVACY_POLICY_URL`, `EXPO_PUBLIC_TERMS_URL`, and `EXPO_PUBLIC_SUPPORT_URL` in EAS production.
4. Set `EXPO_PUBLIC_API_BASE_URL` in EAS production, then run `npm run store:preflight`.
5. Run `npm run store:submission:preflight` with hosted URLs, then copy the packet into App Store Connect and Play Console drafts.
6. Link the clone with `eas init`, then run `npm run native:preflight`.
7. Run `npm run accessibility:preflight`, then native Android/iOS screen-reader, tap-target, and camera QA.
8. Run EAS preview builds.
9. Run `npm run screenshots:store`, then capture final native screenshots and finalize store metadata.
10. Plan the Expo SDK 56 upgrade if audit policy requires zero moderate findings before release.
11. Submit to TestFlight and Google Play Internal Testing.
12. Resolve review feedback, then submit production releases.
