# ReversR Rebuild Release Action Plan

Last updated: June 5, 2026

This file is the account/operator bridge from the local prototype to TestFlight, Google Play Internal Testing, and production review.

Use the generated gate view first:

```bash
npm run release:status
npm run release:next-actions
```

`release:status` shows what is proven from repo evidence. `release:next-actions` expands each pending gate into owner, action, steps, and evidence required.

Before starting external account or hosted-environment work, refresh the local validation packet:

```bash
npm run release:local-ci
npm run release:evidence
npm run release:status
```

`release:local-ci` reruns the repeatable pre-store checks and writes `docs/local-release-ci-evidence.json`. `release:evidence` packages the local proof files and pending external gates into `docs/release-evidence-bundle.json`.

After the PR preview deploys, record deployed-preview evidence:

```bash
PREVIEW_SMOKE_URL=https://your-pr-preview.vercel.app npm run preview:smoke
npm run release:evidence
npm run release:status
```

This proves the PR preview renders the app and `/privacy`, `/terms`, and `/support`. It does not replace the production hosted API, hosted policy URLs, native QA, or store-console gates.

## Current Critical Path

1. Deploy the API behind HTTPS.
   - Follow `docs/external-release-setup-runbook.md` section 5 for hosted API and policy URL sequencing.
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
   - Follow `docs/external-release-setup-runbook.md` section 5 for hosted API and policy URL sequencing.
   - Host `/privacy`, `/terms`, and `/support` on public HTTPS URLs.
   - Confirm success with:

```bash
EXPO_PUBLIC_PRIVACY_POLICY_URL=https://your-domain.example/privacy \
EXPO_PUBLIC_TERMS_URL=https://your-domain.example/terms \
EXPO_PUBLIC_SUPPORT_URL=https://your-domain.example/support \
npm run policy:preflight -- --check-hosted
```

3. Smoke the real machine inventory connector.
   - Follow `docs/external-release-setup-runbook.md` section 6 before connecting real inventory credentials.
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
   - Follow `docs/external-release-setup-runbook.md` section 4 for EAS login, project linkage, environment variables, and credentials.

```bash
npm run native:preflight:local
```

Then authenticate and link the clone project:

```bash
npx eas-cli@20.0.0 login
npx eas-cli@20.0.0 whoami --non-interactive
npx eas-cli@20.0.0 init
npm run native:preflight:local
```

Confirm `docs/native-release-config-evidence.json` is updated before account setup, then confirm `app.json` contains `expo.extra.eas.projectId` for the clone after `eas init`. Do not reuse the original ReversR project ID if this app is shipping as a separate product.

5. Create store records.
   - Follow `docs/external-release-setup-runbook.md` sections 2 and 3 for App Store Connect and Google Play Console setup.
   - App Store Connect: create `com.vsillah.reversrrebuild`, SKU `reversr-rebuild-001`.
   - Google Play Console: create `com.vsillah.reversrrebuild`.
   - Run `npm run store:submission:preflight:local` and confirm `docs/store-submission-smoke-evidence.json` is updated.
   - Run `npm run store:console:preflight:local` and confirm `docs/store-console-pending-evidence.json` is updated.
   - Copy the App Store Connect Apple ID into `eas.json` at `submit.production.ios.ascAppId`.
   - Copy `docs/store-console-evidence.template.json` to `docs/store-console-evidence.json`.
   - Fill record URLs, Apple ID, hosted privacy URL, metadata status, data/privacy forms, assets, review gates, and signoff.

```bash
npm run store:console:preflight
```

6. Build preview binaries and record native QA.
   - Follow `docs/external-release-setup-runbook.md` section 7 for preview QA evidence and screenshot files.

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
- Preview host smoke evidence is useful, but it is not a substitute for production hosted URLs.
- Final store screenshots must come from native preview builds, not the web preview.
- Manufacturer quote packets and vendor request drafts remain human-reviewed handoff artifacts. The app should not auto-submit vendor requests, purchase parts, or place fabrication orders.
