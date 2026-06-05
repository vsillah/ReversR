# ReversR Rebuild Hosted Operator Packet

Generated at: 2026-06-05T10:08:04.905Z

This folder is the hosted API, policy URL, preview smoke, and real inventory connector handoff packet. It prepares the hosted lane for native builds and store-console metadata. It does not prove that the API, policy pages, or real inventory connector are already deployed.

## Release Identity

- App name: ReversR Rebuild
- Version: 1.0.0
- iOS bundle ID: `com.vsillah.reversrrebuild`
- Android package: `com.vsillah.reversrrebuild`

## Hosted Gates

- preview-host-smoke (pass): Vercel preview host renders app and policy/support routes before production hosting
- hosted-api (pass): Hosted HTTPS API URL is configured for native builds
- hosted-policy-urls (pass): Privacy, terms, and support URLs are hosted and ready for store metadata
- real-connector-smoke (pending): Run npm run connector:smoke with CONNECTOR_SMOKE_SOURCE_URL and CONNECTOR_SMOKE_CREDENTIAL_REF.

## Required Environment

- API_CORS_ORIGINS
- API_REQUEST_BODY_LIMIT
- AI_INTEGRATIONS_GEMINI_API_KEY
- ADMIN_API_TOKEN
- INVENTORY_CONNECTOR_SECRETS_JSON or INVENTORY_CONNECTOR_SECRETS_FILE
- EXPO_PUBLIC_API_BASE_URL
- EXPO_PUBLIC_PRIVACY_POLICY_URL
- EXPO_PUBLIC_TERMS_URL
- EXPO_PUBLIC_SUPPORT_URL

## Command Sequence

1. `API_ENV_FILE=/path/to/provider-env-export npm run api:env:preflight`
   - Validate hosted API CORS, body limit, AI key, admin token, connector-secret, and private-network settings before deploy.
2. `npm run api:deployment-smoke`
   - Refresh local production-style API smoke evidence before deploying the container.
3. `EXPO_PUBLIC_API_BASE_URL=https://api.your-domain.example npm run api:preflight`
   - Prove the deployed API health, restricted CORS, demo inventory validation, and optional admin registry access.
4. `EXPO_PUBLIC_PRIVACY_POLICY_URL=https://your-domain.example/privacy EXPO_PUBLIC_TERMS_URL=https://your-domain.example/terms EXPO_PUBLIC_SUPPORT_URL=https://your-domain.example/support npm run policy:preflight -- --check-hosted`
   - Prove hosted privacy, terms, and support URLs are reachable over public HTTPS.
5. `npm run inventory:source:validate -- <inventory.csv-or-json>`
   - Validate the real machine inventory export before connecting it to the hosted API.
6. `EXPO_PUBLIC_API_BASE_URL=https://api.your-domain.example CONNECTOR_SMOKE_SOURCE_URL=https://inventory.your-domain.example/machines.json CONNECTOR_SMOKE_AUTH_MODE=api_key CONNECTOR_SMOKE_CREDENTIAL_REF=partsledger-prod npm run connector:smoke`
   - Prove hosted machine inventory validation, machine matching, BOM generation, and server-side credentialRef handling.
7. `PREVIEW_SMOKE_URL=<preview-url> PREVIEW_SMOKE_VERCEL_BYPASS_SECRET=<secret> npm run preview:smoke`
   - Prove the PR preview renders the app and policy/support routes before production hosting decisions.

## Source Artifacts

- docs/production-api-deployment.md
- docs/production-api-env.example
- docs/policy-hosting-deployment.md
- docs/external-release-setup-runbook.md
- docs/api-deployment-smoke-evidence.json
- docs/policy-hosting-smoke-evidence.json
- docs/preview-host-target.json
- docs/preview-host-smoke-evidence.json
- docs/sample-machine-inventory.csv
- Dockerfile
- vercel.json
- scripts/api-env-preflight.js
- scripts/api-preflight.js
- scripts/api-deployment-smoke.js
- scripts/policy-hosting-preflight.js
- scripts/hosted-connector-smoke.js
- scripts/preview-host-smoke.js

## Outputs To Refresh After Hosted Work

- docs/preview-host-smoke-evidence.json
- docs/api-deployment-smoke-evidence.json
- docs/policy-hosting-smoke-evidence.json
- docs/store-submission-packet.json hosted URLs, if it remains the console copy source
- docs/native-release-config-evidence.json after EAS hosted env binding
- docs/release-evidence-bundle.json

## Safety Boundary

- Do not put Gemini keys, admin tokens, connector API keys, or OAuth tokens in mobile app config or committed files.
- Restrict API_CORS_ORIGINS to hosted app origins before native release builds.
- Keep INVENTORY_PRIVATE_NETWORK_ENABLED=false unless the API host has approved network controls.
- Connector smoke should send credentialRef only; raw connector secrets must remain server-side.
- Hosted preview and policy evidence does not replace native Android/iOS QA evidence.
