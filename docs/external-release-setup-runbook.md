# ReversR Rebuild External Release Setup Runbook

Last updated: June 5, 2026

This runbook covers the account-side work that cannot be completed from the local repo alone. Use it after the local clone, release scripts, policy pages, store packet, and preflight evidence are present.

The release identity is:

- App name: `ReversR Rebuild`
- Version: `1.0.0`
- iOS bundle ID: `com.vsillah.reversrrebuild`
- Android package: `com.vsillah.reversrrebuild`
- SKU: `reversr-rebuild-001`
- Google Play feature graphic: `docs/store-assets/google-play-feature-graphic.png`
- Store console final evidence file: `docs/store-console-evidence.json`
- Native QA final evidence file: `docs/native-qa-evidence.json`

Do not use the original ReversR app record, bundle ID, package name, EAS project, or store listing unless this clone is intentionally being merged back into the original app.

## 1. Local Proof Before Account Setup

Run these checks before creating store records:

```bash
npm install
npm run release:status
npm run release:next-actions
npm run typecheck
npm run accessibility:preflight
npm run release:local-ci
npm run release:evidence
npm run store:preflight:local
npm run native:preflight:local
npm run store:console:preflight:local
```

Confirm the expected local state:

- `npm run release:status` shows the clone, store-local, local web, native config, and store-console pending evidence gates as passed.
- `docs/local-release-ci-evidence.json` exists with all local checks passed.
- `docs/release-evidence-bundle.json` exists with `status: pass`.
- Hosted API, hosted policies, real inventory connector, EAS linkage, App Store Connect, Google Play Console, preview builds, native QA, and final screenshots remain pending until external evidence exists.
- `docs/store-console-pending-evidence.json` exists and says both App Store Connect and Google Play setup are still pending.

If a Vercel PR preview exists, record deployed-preview route evidence before production hosting work:

```bash
PREVIEW_SMOKE_URL=https://your-pr-preview.vercel.app npm run preview:smoke
npm run release:evidence
```

The preview smoke should pass for `/`, `/privacy`, `/terms`, and `/support`, while production hosted API, hosted policy URLs, native QA, and store-console gates remain pending until their external evidence exists.

If Vercel preview deployment protection is enabled, create or use a Protection Bypass for Automation secret in the Vercel project settings, then rerun with the bypass secret in the environment:

```bash
PREVIEW_SMOKE_URL=https://your-pr-preview.vercel.app \
PREVIEW_SMOKE_VERCEL_BYPASS_SECRET=<vercel-automation-bypass-secret> \
npm run preview:smoke
```

The smoke sends the secret as the `x-vercel-protection-bypass` header and requests the Vercel bypass cookie with `x-vercel-set-bypass-cookie=true`. The evidence records only whether a bypass was configured, not the secret value.

## 2. App Store Connect Record

Required Apple role: Account Holder, Admin, or App Manager.

1. Open App Store Connect.
2. Go to `Apps`.
3. Click the add button `+` in the upper-left area.
4. Choose `New App`.
5. Select platform `iOS`.
6. Set app name to `ReversR Rebuild`.
7. Set primary language to `English (U.S.)` or `en-US`.
8. Choose bundle ID `com.vsillah.reversrrebuild`.
9. Set SKU to `reversr-rebuild-001`.
10. Choose the appropriate user access option for the team.
11. Click `Create`.
12. Open the new app record.
13. Go to the app information section and copy the Apple ID assigned by App Store Connect.
14. Paste that Apple ID into `eas.json` at `submit.production.ios.ascAppId`.
15. Add the hosted privacy policy URL once the policy route is deployed.
16. Copy App Store metadata from `docs/store-submission-packet.json`.
17. Complete App Privacy, age rating, review notes, and TestFlight readiness.

Record evidence in `docs/store-console-evidence.json`:

- `appStoreConnect.status`: `pass`
- `appStoreConnect.recordUrl`: the HTTPS App Store Connect record URL
- `appStoreConnect.appleId`: the Apple ID from the app information section
- `appStoreConnect.bundleIdStatus`: `pass`
- `appStoreConnect.privacyPolicyUrl`: hosted production `/privacy` URL
- `appStoreConnect.metadataCopiedFromPacket`: `true`
- `appStoreConnect.appPrivacyCompleted`: `true`
- `appStoreConnect.ageRatingCompleted`: `true`
- `appStoreConnect.testFlightReady`: `true` after TestFlight upload is ready

Then run:

```bash
npm run native:preflight
npm run store:console:preflight
```

## 3. Google Play Console Record

1. Open Play Console.
2. Go to `Home`.
3. Click `Create app`.
4. Select the default language.
5. Set app name to `ReversR Rebuild`.
6. Select `App`, not game.
7. Choose free or paid according to the release decision.
8. Add the support email from `docs/store-submission-packet.json`.
9. Accept the Developer Program Policies declaration.
10. Accept the U.S. export laws declaration.
11. Accept the Play App Signing Terms of Service.
12. Create the app record.
13. Keep package name alignment with `com.vsillah.reversrrebuild`; package names are permanent after the first uploaded bundle.
14. Copy Google Play metadata from `docs/store-submission-packet.json`.
15. Upload `docs/store-assets/google-play-feature-graphic.png` for the feature graphic.
16. Complete Data safety and App content forms using the packet's camera-only, no-ads, no-tracking answers.
17. Configure the `Internal testing` track for first review.

Record evidence in `docs/store-console-evidence.json`:

- `googlePlay.status`: `pass`
- `googlePlay.recordUrl`: the HTTPS Play Console app record URL
- `googlePlay.packageName`: `com.vsillah.reversrrebuild`
- `googlePlay.privacyPolicyUrl`: hosted production `/privacy` URL
- `googlePlay.metadataCopiedFromPacket`: `true`
- `googlePlay.dataSafetyCompleted`: `true`
- `googlePlay.appContentCompleted`: `true`
- `googlePlay.internalTestingReady`: `true`
- `requiredAssets.featureGraphicCaptured`: `true`
- `requiredAssets.featureGraphicPath`: `docs/store-assets/google-play-feature-graphic.png`

Then run:

```bash
npm run store:console:preflight
```

## 4. EAS Project And Environment Setup

Run EAS commands from the repo root:

```bash
npx eas-cli@20.0.0 login
npx eas-cli@20.0.0 whoami --non-interactive
npx eas-cli@20.0.0 init
```

Confirm `app.json` has a clone-specific project ID:

```json
{
  "expo": {
    "extra": {
      "eas": {
        "projectId": "replace-with-reversr-rebuild-eas-project-id"
      }
    }
  }
}
```

Set preview and production EAS public values after hosted URLs exist. These are safe public build-time values; Gemini keys stay in 1Password and the hosted API secret manager.

```bash
npx eas-cli@20.0.0 env:create --environment preview --name EXPO_PUBLIC_API_BASE_URL --value https://api.your-domain.example --visibility plaintext --non-interactive
npx eas-cli@20.0.0 env:create --environment preview --name EXPO_PUBLIC_PRIVACY_POLICY_URL --value https://your-domain.example/privacy --visibility plaintext --non-interactive
npx eas-cli@20.0.0 env:create --environment preview --name EXPO_PUBLIC_TERMS_URL --value https://your-domain.example/terms --visibility plaintext --non-interactive
npx eas-cli@20.0.0 env:create --environment preview --name EXPO_PUBLIC_SUPPORT_URL --value https://your-domain.example/support --visibility plaintext --non-interactive
npx eas-cli@20.0.0 env:create --environment preview --name EXPO_PUBLIC_FORCE_MANAGED_AI_SETTINGS --value true --visibility plaintext --non-interactive
npx eas-cli@20.0.0 env:list --environment preview

npx eas-cli@20.0.0 env:create --environment production --name EXPO_PUBLIC_API_BASE_URL --value https://api.your-domain.example --visibility plaintext --non-interactive
npx eas-cli@20.0.0 env:create --environment production --name EXPO_PUBLIC_PRIVACY_POLICY_URL --value https://your-domain.example/privacy --visibility plaintext --non-interactive
npx eas-cli@20.0.0 env:create --environment production --name EXPO_PUBLIC_TERMS_URL --value https://your-domain.example/terms --visibility plaintext --non-interactive
npx eas-cli@20.0.0 env:create --environment production --name EXPO_PUBLIC_SUPPORT_URL --value https://your-domain.example/support --visibility plaintext --non-interactive
npx eas-cli@20.0.0 env:create --environment production --name EXPO_PUBLIC_FORCE_MANAGED_AI_SETTINGS --value true --visibility plaintext --non-interactive
npx eas-cli@20.0.0 env:list --environment production
```

Leave `EXPO_PUBLIC_ENABLE_LOCAL_PROVIDER_SETTINGS` and `EXPO_PUBLIC_ENABLE_ADMIN_CREDENTIAL_SETTINGS` unset or `false` for TestFlight, Google Play internal, and production review builds. Those controls are for controlled development/admin builds only.

Configure credentials:

```bash
npx eas-cli@20.0.0 credentials --platform android
npx eas-cli@20.0.0 credentials --platform ios
```

If the Apple account signs in with a passkey and no known password, do not keep retrying the EAS CLI Apple password prompt. Passkeys cannot be converted into a text password for the CLI. Use the browser/App Store Connect API-key path:

1. Sign in to App Store Connect with the passkey.
2. Open `Users and Access`.
3. Open `Integrations`.
4. Open `App Store Connect API`.
5. Create an API key for EAS iOS release operations. Use an Admin-capable key when EAS needs to check or repair Apple build credentials.
6. Download the `.p8` key once and keep it outside git. This repo ignores `*.p8`, `.p12`, `.mobileprovision`, and related native credential files.
7. Export `EXPO_ASC_API_KEY_PATH`, `EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID`, `EXPO_APPLE_TEAM_ID`, and `EXPO_APPLE_TEAM_TYPE` in the local terminal session before starting the iOS preview build.
8. Run `npm run native:ios:preview-build -- --dry-run`, then `npm run native:ios:preview-build`.

Do not commit Apple passwords, App Store Connect API keys, Google service account JSON, inventory API keys, or Gemini keys into the repo.

Server-only values belong on the API host:

- `API_CORS_ORIGINS`
- `API_REQUEST_BODY_LIMIT`
- `AI_INTEGRATIONS_GEMINI_API_KEY`
- `GEMINI_API_KEYS`
- `ADMIN_API_TOKEN`
- `INVENTORY_CONNECTOR_SECRETS_JSON` or `INVENTORY_CONNECTOR_SECRETS_FILE`

Then run:

```bash
npm run native:preflight
```

## 5. Hosted API And Policy URLs

Deploy the API before production native builds:

```bash
npm run api:deployment-smoke
# Deploy Dockerfile to the chosen HTTPS host.
EXPO_PUBLIC_API_BASE_URL=https://api.your-domain.example npm run api:preflight
```

Deploy policy/support routes before store metadata is final:

```bash
npm run policy:preflight:local
EXPO_PUBLIC_PRIVACY_POLICY_URL=https://your-domain.example/privacy \
EXPO_PUBLIC_TERMS_URL=https://your-domain.example/terms \
EXPO_PUBLIC_SUPPORT_URL=https://your-domain.example/support \
npm run policy:preflight -- --check-hosted
```

After both checks pass, update `docs/store-submission-packet.json` hosted URLs if the packet is being used as the copy source for console setup.

## 6. Production Inventory Connector

Before using a real inventory system:

```bash
npm run inventory:source:validate -- <inventory.csv-or-json>
```

Configure the connector secret only on the hosted API. The mobile app should store only a `credentialRef`.

Then smoke the hosted connector:

```bash
EXPO_PUBLIC_API_BASE_URL=https://api.your-domain.example \
CONNECTOR_SMOKE_SOURCE_NAME="Production Machine Inventory" \
CONNECTOR_SMOKE_SOURCE_URL=https://inventory.your-domain.example/machines.json \
CONNECTOR_SMOKE_CONNECTOR_TYPE=json \
CONNECTOR_SMOKE_AUTH_MODE=api_key \
CONNECTOR_SMOKE_CREDENTIAL_REF=partsledger-prod \
CONNECTOR_SMOKE_EXPECTED_MACHINE_ID=known-machine-id \
npm run connector:smoke
```

Passing evidence must show:

- the hosted API validates the inventory source,
- the app can match a known machine,
- BOM generation succeeds,
- no raw connector secret appears in responses or evidence.

## 7. Preview Builds, Native QA, And Screenshots

Build preview binaries:

```bash
npx eas-cli@20.0.0 build --platform android --profile preview
npm run native:ios:preview-build -- --dry-run
npm run native:ios:preview-build
npm run native:eas:sync-builds
```

Create the native QA evidence file:

```bash
cp docs/native-qa-evidence.template.json docs/native-qa-evidence.json
```

Fill Android and iOS build URLs, tester names, devices, timestamps, QA check statuses, screenshot records, and signoff fields.

Capture final native screenshots from installed Android and iOS preview builds. Save the files under `docs/store-screenshots/native/`:

- `android-01-welcome.png`
- `android-02-scan.png`
- `android-03-inventory-validation.png`
- `android-04-design-match.png`
- `android-05-build-handoff.png`
- `ios-01-welcome.png`
- `ios-02-scan.png`
- `ios-03-inventory-validation.png`
- `ios-04-design-match.png`
- `ios-05-build-handoff.png`

Then run:

```bash
npm run native:qa:preflight
```

## 8. Production Builds And First Review Lanes

Build production binaries:

```bash
npx eas-cli@20.0.0 build --platform android --profile production
npx eas-cli@20.0.0 build --platform ios --profile production
```

Submit to first review lanes:

```bash
npx eas-cli@20.0.0 submit --platform android --profile production
npx eas-cli@20.0.0 submit --platform ios --profile production
```

The Android submit profile targets Google Play Internal Testing. The iOS submit profile targets TestFlight through `submit.production.ios.ascAppId`.

Do not submit for public production review until:

```bash
npm run release:status
npm run api:preflight
npm run policy:preflight -- --check-hosted
npm run connector:smoke
npm run native:preflight
npm run native:qa:preflight
npm run store:console:preflight
```

## 9. Stop Conditions

Pause instead of submitting when any of these are true:

- App Store Connect Apple ID is missing from `eas.json`.
- Hosted API health does not report restricted CORS.
- Policy/support URLs are placeholder URLs or not public HTTPS.
- Real inventory connector smoke has not passed.
- Native screenshots are from web preview instead of Android/iOS preview builds.
- Data Safety or App Privacy answers no longer match the app's actual data behavior.
- A build introduces broad media, microphone, location, account, analytics, tracking, or advertising permissions.
- Manufacturer quote packet or vendor request flows are changed to auto-submit without explicit human review.

## 10. Official Source Links

- Apple App Store Connect: Add a new app: https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/
- Apple App Store Connect: App information reference: https://developer.apple.com/help/app-store-connect/reference/app-information
- Google Play Console: Create and set up your app: https://support.google.com/googleplay/android-developer/answer/9859152
- Google Play Console: Set up internal testing: https://support.google.com/googleplay/android-developer/answer/9845334
- Google Play Console: Prepare and roll out a release: https://support.google.com/googleplay/android-developer/answer/9859348
- Expo EAS environment variables: https://docs.expo.dev/eas/environment-variables/manage/
- Expo EAS Build config: https://docs.expo.dev/build/eas-json/
- Expo EAS Submit: https://docs.expo.dev/submit/introduction/
