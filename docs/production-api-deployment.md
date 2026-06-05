# ReversR Rebuild Production API Deployment

Last updated: June 5, 2026

This package prepares the Express API for a hosted backend that native Android and iOS builds can call through `EXPO_PUBLIC_API_BASE_URL`.

The container is a production-host bootstrap. It is suitable for review, demos, and controlled pilots after secrets are configured. Before real customer machine inventories are connected, move connector secrets into the hosting provider's managed secret store and add admin identity/role controls.

## Required Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `API_PORT` | Yes | Port the API listens on. The Docker image defaults to `3001`. |
| `API_CORS_ORIGINS` | Yes for production | Comma-separated HTTPS origins allowed to call the API from browser contexts. Leave open only for local prototype checks. |
| `API_REQUEST_BODY_LIMIT` | Recommended | Express JSON body limit for scan/image payloads. Defaults to `50mb`. |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | Recommended | Primary Gemini key for AI-backed analysis, matching, design generation, and BOM generation. |
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
API_PORT=3001
API_CORS_ORIGINS=https://reversr-rebuild.example.com
API_REQUEST_BODY_LIMIT=50mb
AI_INTEGRATIONS_GEMINI_API_KEY=
GEMINI_API_KEYS=
ADMIN_API_TOKEN=replace-with-long-random-token
INVENTORY_CONNECTOR_SECRETS_JSON={}
INVENTORY_PRIVATE_NETWORK_ENABLED=false
```

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
- demo inventory validation through `POST /api/inventory/validate`
- admin credential registry listing when `ADMIN_API_TOKEN` is present

For a hosted production API, `npm run api:preflight` fails if `/api/health` reports open CORS. Set `API_CORS_ORIGINS` to the hosted web origins before store builds. For controlled prototype checks only, use:

```bash
EXPO_PUBLIC_API_BASE_URL=https://api.your-domain.example npm run api:preflight -- --allow-open-cors
```

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
npm run api:preflight
npm run accessibility:preflight
npm run store:preflight
```

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
- EAS production has the same `EXPO_PUBLIC_API_BASE_URL`,
- connector secrets are managed server-side,
- native Android and iOS builds can complete the scan, inventory match, BOM, quote packet, and vendor draft flow against the hosted API.
