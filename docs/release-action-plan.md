# ReversR Rebuild Release Action Plan

Last updated: June 5, 2026

This file is the account/operator bridge from the local prototype to TestFlight, Google Play Internal Testing, and production review.

Use the generated gate view first:

```bash
npm run release:status
npm run release:next-actions
```

`release:status` shows what is proven from repo evidence. `release:next-actions` expands each pending gate into owner, action, steps, and evidence required.

## Current Critical Path

1. Deploy the API behind HTTPS.
   - Copy `docs/production-api-env.example` into the host provider's environment settings.
   - Set `API_CORS_ORIGINS` to hosted app origins, not `*`.
   - Set `AI_INTEGRATIONS_GEMINI_API_KEY`, `ADMIN_API_TOKEN`, `API_REQUEST_BODY_LIMIT`, and connector-secret settings on the API host.
   - Run `npm run api:deployment-smoke` locally and confirm `docs/api-deployment-smoke-evidence.json` is updated.
   - Deploy the Dockerfile.
   - Confirm success with:

```bash
EXPO_PUBLIC_API_BASE_URL=https://api.your-domain.example npm run api:preflight
```

2. Deploy policy/support pages.
   - Run `npm run policy:preflight:local` and confirm `docs/policy-hosting-smoke-evidence.json` is updated.
   - Host `/privacy`, `/terms`, and `/support` on public HTTPS URLs.
   - Confirm success with:

```bash
EXPO_PUBLIC_PRIVACY_POLICY_URL=https://your-domain.example/privacy \
EXPO_PUBLIC_TERMS_URL=https://your-domain.example/terms \
EXPO_PUBLIC_SUPPORT_URL=https://your-domain.example/support \
npm run policy:preflight -- --check-hosted
```

3. Smoke the real machine inventory connector.
   - Validate the real export first:

```bash
npm run inventory:source:validate -- <inventory.csv-or-json>
```

   - Configure the server-side `credentialRef` on the API host.
   - Confirm success with:

```bash
EXPO_PUBLIC_API_BASE_URL=https://api.your-domain.example \
CONNECTOR_SMOKE_SOURCE_NAME="Production Machine Inventory" \
CONNECTOR_SMOKE_SOURCE_URL=https://inventory.your-domain.example/machines.json \
CONNECTOR_SMOKE_CONNECTOR_TYPE=json \
CONNECTOR_SMOKE_AUTH_MODE=api_key \
CONNECTOR_SMOKE_CREDENTIAL_REF=partsledger-prod \
CONNECTOR_SMOKE_EXPECTED_MACHINE_ID=<known-machine-id> \
npm run connector:smoke
```

4. Link EAS for the clone identity.

```bash
npx eas-cli@20.0.0 login
npx eas-cli@20.0.0 whoami --non-interactive
npx eas-cli@20.0.0 init
npm run native:preflight:local
```

Confirm `app.json` contains `expo.extra.eas.projectId` for the clone. Do not reuse the original ReversR project ID if this app is shipping as a separate product.

5. Create store records.
   - App Store Connect: create `com.vsillah.reversrrebuild`, SKU `reversr-rebuild-001`.
   - Google Play Console: create `com.vsillah.reversrrebuild`.
   - Run `npm run store:submission:preflight:local` and confirm `docs/store-submission-smoke-evidence.json` is updated.
   - Copy the App Store Connect Apple ID into `eas.json` at `submit.production.ios.ascAppId`.
   - Copy `docs/store-console-evidence.template.json` to `docs/store-console-evidence.json`.
   - Fill record URLs, Apple ID, hosted privacy URL, metadata status, data/privacy forms, assets, review gates, and signoff.

```bash
npm run store:console:preflight
```

6. Build preview binaries and record native QA.

```bash
npx eas-cli@20.0.0 build --platform android --profile preview
npx eas-cli@20.0.0 build --platform ios --profile preview
cp docs/native-qa-evidence.template.json docs/native-qa-evidence.json
```

Fill `docs/native-qa-evidence.json` with build URLs, devices, testers, timestamps, Android/iOS check statuses, screenshot metadata, and signoff.

Before final native screenshot capture, run the web-preview planning pass:

```bash
npm run screenshots:store
```

Confirm `docs/store-screenshots/planning-evidence.json` is updated, then capture the final Android and iOS screenshots from preview builds.

```bash
npm run native:qa:preflight
```

7. Submit to internal review tracks first.

```bash
npx eas-cli@20.0.0 submit --platform android --profile production
npx eas-cli@20.0.0 submit --platform ios --profile production
```

Use Google Play Internal Testing and Apple TestFlight before production submission.

## Evidence Rules

- The old Systematic Inventive Thinking route must remain retired. The local web smoke checks `/api/apply-pattern` returns `404`.
- The real inventory source must pass `inventory:source:validate` before it is used in hosted connector smoke.
- Raw connector secrets must stay server-side. Mobile evidence should show only `credentialRef`.
- Web smoke evidence is useful, but it is not a substitute for native Android/iOS QA.
- Final store screenshots must come from native preview builds, not the web preview.
- Manufacturer quote packets and vendor request drafts remain human-reviewed handoff artifacts. The app should not auto-submit vendor requests, purchase parts, or place fabrication orders.
