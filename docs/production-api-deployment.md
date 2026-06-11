# ReversR Rebuild Production API Deployment

Last updated: June 5, 2026

This package prepares the Express API for a hosted backend that native Android and iOS builds can call through `EXPO_PUBLIC_API_BASE_URL`.

The container is a production-host bootstrap. It is suitable for review, demos, and controlled pilots after secrets are configured. Before real customer machine inventories are connected, move connector secrets into the hosting provider's managed secret store and add admin identity/role controls.

## Required Environment

Use `docs/production-api-env.example` as the non-secret template. Copy the values into the hosting provider's environment manager and keep filled secrets out of git.

| Variable | Required | Purpose |
| --- | --- | --- |
| `API_PORT` | Yes | Port the API listens on. The Docker image defaults to `3001`. |
| `API_CORS_ORIGINS` | Yes for production | Comma-separated HTTPS origins allowed to call the API from browser contexts. Leave open only for local prototype checks. |
| `API_REQUEST_BODY_LIMIT` | Recommended | Express JSON body limit for scan/image payloads. Defaults to `50mb`. |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | Required for tester/review builds | Primary Gemini key for AI-backed analysis, matching, design generation, and BOM generation. Without this or `GEMINI_API_KEYS`, hosted preflight fails so TestFlight and Play Internal testers do not see fallback-only behavior. |
| `GEMINI_API_KEYS` | Optional | Comma-separated backup Gemini keys for rate-limit rotation. |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | Optional | Alternate Gemini-compatible base URL. Leave empty for the default provider. |
| `OLLAMA_HOST` | Optional | Local model endpoint for controlled non-production tests. Do not rely on localhost Ollama for store builds. |
| `ADMIN_API_TOKEN` | Recommended | Enables admin-only connector credential registry endpoints. |
| `INVENTORY_CONNECTOR_SECRETS_JSON` | Optional | Static server-side credential map for connector references. Use managed secrets in production. |
| `INVENTORY_CONNECTOR_SECRETS_FILE` | Optional | Runtime registry file path for prototype admin credential writes. Mount persistent storage if used. |
| `INVENTORY_PRIVATE_NETWORK_ENABLED` | Optional | Set to `true` only on a controlled API host with network controls for private inventory systems. |

## Build And Run Locally

```bash
npm run api:docker:build
docker run --rm \
  -p 3001:3001 \
  --env-file .env.production \
  reversr-rebuild-api
```

For a local smoke without real connector secrets, `.env.production` can start with:

```text
See docs/production-api-env.example
```

Validate the template or a provider-exported env file before treating the API as production-bound:

```bash
npm run api:env:preflight:local
API_ENV_FILE=/path/to/provider-env-export npm run api:env:preflight
```

The strict preflight expects restricted HTTPS CORS origins, an intentional body limit, at least one Gemini key for production photo analysis, a non-placeholder admin token, valid connector-secret JSON, and private-network connectors disabled unless explicitly approved.

Before deploying, run the local production-style smoke:

```bash
npm run api:deployment-smoke
```

This starts the API with restricted CORS, a configured request body limit, admin-token protected routes, private-network connectors disabled, and demo inventory enabled. On success it writes `docs/api-deployment-smoke-evidence.json`, which `npm run release:status` uses as local proof before hosted deployment.

## Health Checks

The API exposes two health endpoints:

```bash
curl http://localhost:3001/health
curl http://localhost:3001/api/health
```

Expected response fields include:

- `status: "ok"`
- `service: "reversr-rebuild-api"`
- configured Gemini key count
- inventory source support
- credential registry status
- authenticated connector status
- runtime config summary, including CORS mode and request body limit

## Hosted API Preflight

After the API is deployed behind HTTPS, set the app build URL and run:

```bash
EXPO_PUBLIC_API_BASE_URL=https://api.your-domain.example npm run api:preflight
```

If the admin credential registry is enabled, include the admin token to verify the protected registry endpoint:

```bash
ADMIN_API_TOKEN=replace-with-token \
EXPO_PUBLIC_API_BASE_URL=https://api.your-domain.example \
npm run api:preflight
```

The preflight checks:

- `GET /api/health`
- hardened runtime config from `/api/health`
- at least one configured Gemini key on hosted APIs, unless `--allow-missing-gemini` is explicitly passed for a controlled prototype check
- demo inventory validation through `POST /api/inventory/validate`
- admin credential registry listing when `ADMIN_API_TOKEN` is present

For a hosted production API, `npm run api:preflight` fails if `/api/health` reports open CORS. Set `API_CORS_ORIGINS` to the hosted web origins before store builds. For controlled prototype checks only, use:

```bash
EXPO_PUBLIC_API_BASE_URL=https://api.your-domain.example npm run api:preflight -- --allow-open-cors
```

For controlled prototype checks without Gemini, `--allow-missing-gemini` is available. Do not use it for TestFlight, Play Internal, or production review candidates.

## Hosted Connector Smoke

After the API host has the real connector credential in its server-side secret store, run a connector smoke against the deployed API:

```bash
EXPO_PUBLIC_API_BASE_URL=https://api.your-domain.example \
CONNECTOR_SMOKE_SOURCE_NAME="Production Machine Inventory" \
CONNECTOR_SMOKE_SOURCE_URL=https://inventory.your-domain.example/machines.json \
CONNECTOR_SMOKE_CONNECTOR_TYPE=json \
CONNECTOR_SMOKE_AUTH_MODE=api_key \
CONNECTOR_SMOKE_CREDENTIAL_REF=partsledger-prod \
CONNECTOR_SMOKE_EXPECTED_MACHINE_ID=INV-FDM-100 \
npm run connector:smoke
```

The smoke sends only connector metadata and `credentialRef`. It verifies `POST /api/inventory/validate`, `POST /api/gemini/match-machine`, and `POST /api/gemini/generate-bom` against the hosted API and real connector. If the real connector is not a 3D printer inventory, set `CONNECTOR_SMOKE_ANALYSIS_JSON` or `CONNECTOR_SMOKE_COMPONENTS_JSON` to a representative machine scan before running it.

## Store Build Binding

Set these EAS production environment variables before native builds:

```text
EXPO_PUBLIC_API_BASE_URL=https://api.your-domain.example
EXPO_PUBLIC_PRIVACY_POLICY_URL=https://your-domain.example/privacy
EXPO_PUBLIC_TERMS_URL=https://your-domain.example/terms
EXPO_PUBLIC_SUPPORT_URL=https://your-domain.example/support
```

Then run:

```bash
npm run release:status
npm run api:deployment-smoke
npm run api:env:preflight
npm run inventory:preflight
npm run api:preflight
npm run connector:smoke
npm run accessibility:preflight
npm run store:preflight
```

`npm run inventory:preflight` is local by design. It starts a protected fixture inventory and local API server to prove credential-reference validation, inventory matching, BOM generation, and no-secret response handling before the hosted API is bound into native builds.

`npm run connector:smoke` is hosted by design. It should run against the production API and real inventory connector before EAS preview builds are treated as release candidates.

## Connector Secret Handling

The mobile app should send only `connector.credentialRef`. It should not store raw API keys, bearer tokens, headers, private-network credentials, or ERP credentials.

For prototype operations, `ADMIN_API_TOKEN` plus `INVENTORY_CONNECTOR_SECRETS_FILE` enables the Settings admin credential manager and protected server endpoints.

For production:

- store connector secrets in the hosting platform's managed secret store,
- restrict credential management to authenticated admins,
- rotate `ADMIN_API_TOKEN` or replace it with role-based admin auth,
- disable `INVENTORY_PRIVATE_NETWORK_ENABLED` unless the API host has an approved network path,
- log credential-reference actions without logging secret values,
- run `npm run api:preflight` after every secret or host change.

## Store Release Gate

The production API gate is not complete until:

- the API is hosted behind HTTPS,
- `API_CORS_ORIGINS` is restricted to approved hosted origins,
- `API_REQUEST_BODY_LIMIT` is set intentionally for scan/image payloads,
- `/api/health` passes from an external network,
- `npm run api:preflight` passes against the hosted URL,
- `npm run connector:smoke` passes against the real inventory connector,
- EAS production has the same `EXPO_PUBLIC_API_BASE_URL`,
- connector secrets are managed server-side,
- native Android and iOS builds can complete the scan, inventory match, BOM, quote packet, and vendor draft flow against the hosted API.
