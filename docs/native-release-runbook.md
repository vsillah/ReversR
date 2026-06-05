# ReversR Rebuild Native Release Runbook

Last updated: June 5, 2026

This runbook is the operator path from the current prototype to TestFlight, Google Play Internal Testing, and then production review.

The app is still draft-release ready, not store-published. Do not submit production builds until the hosted API, hosted policy URLs, native camera QA, native screenshots, and store console records are complete.

## 1. Confirm Local Readiness

```bash
npm install
npm run release:status
npm run typecheck
npm run accessibility:preflight
npm run inventory:preflight
npm run store:assets:preflight
npm run policy:preflight:local
npm run store:preflight:local
npm run native:preflight:local
npm run native:qa:preflight:local
npx expo-doctor
```

`native:preflight:local` allows placeholder URLs, missing EAS CLI, and missing EAS project linkage so the local repo can still be checked before account-level setup is complete.

Run the local web happy-path smoke before screenshot capture or preview binaries:

```bash
npm run web-preview
WEB_SMOKE_APP_URL=http://localhost:5001 npm run web:flow-smoke
```

The smoke verifies scan, demo inventory validation, machine matching, BOM generation, manufacturer quote packet controls, and vendor request draft controls. On success it writes `docs/web-flow-smoke-evidence.json`, which `npm run release:status` uses as local proof before preview binaries.

Keep this as local proof only; final release evidence still requires native Android and iOS preview-build QA.

## 2. Install Or Run EAS CLI

Use the pinned CLI command without committing `eas-cli` into this repo:

```bash
npx eas-cli@20.0.0 --version
npx eas-cli@20.0.0 login
npx eas-cli@20.0.0 whoami --non-interactive
```

The CLI is intentionally not a committed dev dependency because the current CLI dependency tree adds high-severity dev-only audit findings. Use the pinned `npx eas-cli@20.0.0` command or a globally installed `eas` binary for release operations.

`npm run native:preflight` accepts either a global `eas` binary or the pinned `npx eas-cli@20.0.0` path. It still fails strict release checks when the CLI cannot verify a non-interactive login.

## 3. Link The Expo Project

Create or link the EAS project for the clone identity:

```bash
npx eas-cli@20.0.0 init
```

Confirm that `app.json` gains:

```json
{
  "expo": {
    "extra": {
      "eas": {
        "projectId": "replace-with-eas-project-id"
      }
    }
  }
}
```

Do not reuse the original ReversR project ID if this clone is meant to ship as a distinct app.

## 4. Configure Hosted Environments

Deploy the API container and hosted policy/support routes first. For policy/support pages, follow `docs/policy-hosting-deployment.md` and verify:

```bash
EXPO_PUBLIC_PRIVACY_POLICY_URL=https://your-domain.example/privacy \
EXPO_PUBLIC_TERMS_URL=https://your-domain.example/terms \
EXPO_PUBLIC_SUPPORT_URL=https://your-domain.example/support \
npm run policy:preflight -- --check-hosted
```

Then set EAS production environment variables:

```bash
npx eas-cli@20.0.0 env:create --environment production --name EXPO_PUBLIC_API_BASE_URL --value https://api.your-domain.example --visibility plaintext --non-interactive
npx eas-cli@20.0.0 env:create --environment production --name EXPO_PUBLIC_PRIVACY_POLICY_URL --value https://your-domain.example/privacy --visibility plaintext --non-interactive
npx eas-cli@20.0.0 env:create --environment production --name EXPO_PUBLIC_TERMS_URL --value https://your-domain.example/terms --visibility plaintext --non-interactive
npx eas-cli@20.0.0 env:create --environment production --name EXPO_PUBLIC_SUPPORT_URL --value https://your-domain.example/support --visibility plaintext --non-interactive
```

Server-side API settings and secrets such as `API_CORS_ORIGINS`, `API_REQUEST_BODY_LIMIT`, `AI_INTEGRATIONS_GEMINI_API_KEY`, `ADMIN_API_TOKEN`, and inventory connector credentials belong on the API host, not in the mobile EAS environment.

## 5. Configure Store Credentials

Android:

```bash
npx eas-cli@20.0.0 credentials --platform android
```

Create or attach the keystore for `com.vsillah.reversrrebuild`. For Google Play submission, configure a Play Console service account with the minimum release-management permissions needed for internal testing.

iOS:

```bash
npx eas-cli@20.0.0 credentials --platform ios
```

Create or attach the Apple distribution certificate and provisioning profile for `com.vsillah.reversrrebuild`. Confirm the bundle ID exists in Apple Developer and App Store Connect before production submission.

After the App Store Connect app record exists, copy its Apple ID into the EAS submit profile:

```json
{
  "submit": {
    "production": {
      "ios": {
        "ascAppId": "replace-with-app-store-connect-apple-id"
      }
    }
  }
}
```

The Android submit profile is already pointed at the Google Play `internal` track. See `docs/eas-submit-configuration.md` for the repeatable submit configuration gate.

## 6. Run Strict Preflight

After project linkage and hosted URLs are configured:

```bash
EXPO_PUBLIC_API_BASE_URL=https://api.your-domain.example \
EXPO_PUBLIC_PRIVACY_POLICY_URL=https://your-domain.example/privacy \
EXPO_PUBLIC_TERMS_URL=https://your-domain.example/terms \
EXPO_PUBLIC_SUPPORT_URL=https://your-domain.example/support \
npm run native:preflight
```

Then verify the hosted backend:

```bash
EXPO_PUBLIC_API_BASE_URL=https://api.your-domain.example npm run api:preflight
```

Then verify the hosted inventory connector:

```bash
EXPO_PUBLIC_API_BASE_URL=https://api.your-domain.example \
CONNECTOR_SMOKE_SOURCE_NAME="Production Machine Inventory" \
CONNECTOR_SMOKE_SOURCE_URL=https://inventory.your-domain.example/machines.json \
CONNECTOR_SMOKE_CONNECTOR_TYPE=json \
CONNECTOR_SMOKE_AUTH_MODE=api_key \
CONNECTOR_SMOKE_CREDENTIAL_REF=partsledger-prod \
npm run connector:smoke
```

Set `CONNECTOR_SMOKE_EXPECTED_MACHINE_ID` and `CONNECTOR_SMOKE_ANALYSIS_JSON` when the production smoke should validate a known machine record. Raw connector secrets must already be configured on the API host.

## 7. Build Preview Binaries

```bash
npx eas-cli@20.0.0 build --platform android --profile preview
npx eas-cli@20.0.0 build --platform ios --profile preview
```

Run device QA before store submission:

```bash
cp docs/native-qa-evidence.template.json docs/native-qa-evidence.json
```

Fill `docs/native-qa-evidence.json` with Android and iOS build URLs, devices, tester names, completion timestamps, check statuses, and evidence notes.
Final native screenshot files should be placed under `docs/store-screenshots/native/` and referenced in the `screenshots` array in `docs/native-qa-evidence.json`.

Required checks include:

- install and launch,
- camera permission prompt and scan flow,
- manual machine description fallback,
- inventory connector validation,
- machine matching,
- BOM generation,
- assembly steps and reconstruction plan,
- quote packet export,
- vendor request draft,
- policy/support links,
- screen-reader labels and tap targets,
- offline/error states for API and connector failures,
- final native screenshot capture.

Before TestFlight or Play Internal Testing submission:

```bash
npm run native:qa:preflight
```

After App Store Connect and Play Console records exist, record console-side evidence:

```bash
cp docs/store-console-evidence.template.json docs/store-console-evidence.json
npm run store:console:preflight
```

## 8. Capture Final Native Screenshots

Use `npm run screenshots:store` only for web-preview composition planning. Final App Store and Google Play screenshots must come from native preview builds.

Required screenshot set:

1. Welcome screen with the four reconstruction phases.
2. Scan screen with camera or description mode.
3. Inventory connector validation preview.
4. Machine match evidence in Design.
5. Build screen with assembly steps, pricing, BOM, quote packet, and vendor draft controls.

## 9. Build Production Binaries

```bash
npx eas-cli@20.0.0 build --platform android --profile production
npx eas-cli@20.0.0 build --platform ios --profile production
```

Production Android output must be an AAB. Production iOS output must target the linked App Store Connect record.

## 10. Submit To Review Lanes

Start with limited review lanes:

```bash
npx eas-cli@20.0.0 submit --platform android --profile production
npx eas-cli@20.0.0 submit --platform ios --profile production
```

Use Google Play Internal Testing and Apple TestFlight first. Production release should wait until those builds pass install, camera, inventory, reconstruction, export, and policy-link QA.
