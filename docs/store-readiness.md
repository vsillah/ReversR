# ReversR Rebuild Store Readiness

Last updated: June 5, 2026

## Current Status

ReversR Rebuild is prototype-ready, not store-ready.

The app now has:

- Distinct app identity: `ReversR Rebuild`
- Android package: `com.vsillah.reversrrebuild`
- iOS bundle identifier: `com.vsillah.reversrrebuild`
- Camera-only Android permission
- Explicit Android permission blocks for microphone and broad photo/media access
- Inventory connector validation
- Machine matching against demo, CSV, JSON, HTTP(S), and local file fixtures
- Reconstruction package generation with assembly steps, pricing, BOM, and manufacturer handoff surfaces
- Manufacturer quote packet export for human-reviewed 3D modeling and fabrication requests
- Store preflight script: `npm run store:preflight`
- API health endpoint: `GET /api/health`
- Server-side credential references for authenticated inventory connectors
- Admin-token protected credential registry endpoints for prototype operations

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
- Run `npm run store:preflight` before production builds.
- Configure Android credentials and iOS credentials.
- Build:
  - `eas build --platform android --profile production`
  - `eas build --platform ios --profile production`
- Submit:
  - `eas submit --platform android --profile production`
  - `eas submit --platform ios --profile production`

## Technical Gaps Before Store Review

- Production API host: mobile builds currently point non-web requests to a placeholder backend URL in `hooks/useGemini.ts` and `app.json`.
- Authenticated connectors: API key and OAuth sources are supported through backend credential references and admin-token registry endpoints, but production should move registry-file secrets into a managed secret store and add user/admin roles.
- Privacy policy and terms: updated drafts exist, but they still need a hosted public URL and legal review.
- Native QA: camera flow needs real iOS and Android device testing.
- Visual generation: local no-key image fallback is intentionally minimal; production should use configured AI image generation or deterministic diagram rendering.
- Vendor handoff: quote packet export is available, but the app still does not automatically submit files, request live pricing, purchase services, or place fabrication orders.
- Accessibility: needs screen-reader and tap-target QA before submission.
- Store assets: metadata draft exists in [store-metadata.md](./store-metadata.md), but native screenshots, support URL, hosted privacy URL, and final icon review are not complete.

## Recommended Next Sequence

1. Host the API and update `hooks/useGemini.ts` to use the production backend for native builds.
2. Move connector credentials from the prototype registry file into a managed secret store and add admin roles.
3. Host privacy policy and terms.
4. Set `EXPO_PUBLIC_API_BASE_URL` in EAS production, then run `npm run api:preflight` and `npm run store:preflight`.
5. Run native Android/iOS camera QA.
6. Run EAS preview builds.
7. Capture native screenshots and finalize store metadata.
8. Submit to TestFlight and Google Play Internal Testing.
9. Resolve review feedback, then submit production releases.
