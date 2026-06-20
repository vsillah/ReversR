# ReversR Rebuild Inventory Connector Spec

Last updated: June 12, 2026

## Purpose

Phase 2 replaces the original ideation workflow with an admin-approved machine inventory connector. The connector provides the machine records used to match a scan, identify the machine, and generate a reconstruction package.

The backend owns connector parsing and matching. The mobile client only stores the connector metadata and sends it to the API.

## Supported Prototype Sources

- `demo://sample-machines`: built-in demo records.
- `file:///absolute/path/to/inventory.csv`: local CSV fixture for development.
- `file:///absolute/path/to/inventory.json`: local JSON fixture for development.
- `https://.../inventory.csv`: unauthenticated CSV source.
- `https://.../inventory.json`: unauthenticated JSON source.
- `https://.../inventory.csv` or `https://.../inventory.json` with `authMode: "api_key"` and `credentialRef`.
- `https://.../inventory.csv` or `https://.../inventory.json` with `authMode: "oauth"` and `credentialRef`.

Authenticated connectors are supported through backend credential references. The mobile app stores only `credentialRef`; API keys, OAuth tokens, private-network headers, and other secrets must live in API-server environment configuration.

Private-network connectors remain disabled unless the API host is explicitly configured with `INVENTORY_PRIVATE_NETWORK_ENABLED=true` after network controls are in place.

The prototype Settings screen includes an admin credential registry panel. It lets an admin enter the API admin token for the current session, list redacted backend credential references, save an API-key/OAuth credential reference, and delete registry-file references. Raw credential values are sent to the backend only for the save request and are not persisted by the app.

The Inventory settings editor includes a known-source dropdown for fast setup. Selecting FarmBot, TraceParts, CADENAS, or Documoto fills the connector, authentication, URI, credential reference, and admin notes fields. The last dropdown item is `Add New +`; selecting it clears the form into a custom source entry flow for a new CSV, JSON, API, or ERP connector.

## CSV Columns

Required:

- `machineId`: stable inventory identifier.
- `machineName`: human-readable machine name.
- `parts`: pipe, comma, or semicolon-separated part list.

Recommended:

- `revision`
- `aliases`
- `materials`
- `assemblySteps`: JSON array.
- `pricing`: JSON object.
- `modelingVendors`: JSON array.
- `sourceLinks`: JSON object of source URLs such as product, documentation, BOM, and CAD repositories.
- `referenceImages`: JSON array of source-backed visual references.
- `sourceProvider`: professional source name such as TraceParts, CADENAS, or Documoto.
- `sourceRecordId`: stable external record/catalog identifier when available.
- `manufacturer`
- `manufacturerPartNumber`
- `renderProvider`
- `renderUrl`: provider-hosted 3D render or preview URL.
- `viewerUrl`: provider-hosted 3D/CAD viewer URL.
- `cadModelUrl`: provider-hosted CAD model or download landing URL.
- `cadFormats`: array or delimited list of available formats such as STEP, IGES, STL, or 3D PDF.
- `renderKind`
- `renderProvenance`
- `licenseNote`: required for professional catalog pilots to keep reuse boundaries explicit.
- `lastSyncedAt`
- `notes`

See [sample-machine-inventory.csv](./sample-machine-inventory.csv).

## JSON Shape

The API accepts a top-level array or an object with `machines`, `items`, `records`, or `data`.

```json
{
  "machines": [
    {
      "machineId": "INV-FDM-100",
      "machineName": "Desktop FDM 3D Printer",
      "aliases": ["3d printer", "fdm printer"],
      "parts": ["Frame", "Heated Bed", "Extruder"],
      "assemblySteps": [
        {
          "stepNumber": 1,
          "title": "Verify inventory record",
          "instructions": "Confirm machine ID and revision.",
          "parts": ["Frame"],
          "estimatedTime": "20 min",
          "qualityCheck": "Revision is confirmed."
        }
      ],
      "pricing": {
        "partsSubtotal": "$430-$820",
        "modelingEstimate": "$300-$900",
        "fabricationEstimate": "$500-$1,600",
        "assemblyLaborEstimate": "$240-$640",
        "totalEstimate": "$1,470-$3,960",
        "confidence": "medium"
      },
      "sourceLinks": {
        "product": "https://example.com/machines/inv-fdm-100",
        "documentation": "https://example.com/docs/inv-fdm-100"
      },
      "sourceProvider": "TraceParts",
      "sourceRecordId": "provider-record-id",
      "manufacturerPartNumber": "MFG-123",
      "renderProvider": "TraceParts",
      "viewerUrl": "https://example.com/provider/viewer",
      "cadModelUrl": "https://example.com/provider/cad",
      "cadFormats": ["STEP", "IGES", "STL"],
      "renderKind": "provider-hosted-cad-viewer",
      "renderProvenance": "Provider-hosted catalog viewer metadata.",
      "licenseNote": "Keep provider CAD/render assets linked unless reuse terms permit storage or redistribution.",
      "referenceImages": [
        {
          "id": "inv-fdm-100-product-reference",
          "label": "Official product reference",
          "url": "https://example.com/images/inv-fdm-100.png",
          "sourceUrl": "https://example.com/machines/inv-fdm-100",
          "kind": "official-product-reference",
          "licenseNote": "Verify reuse terms before public export or vendor transmission."
        }
      ]
    }
  ]
}
```

## Reference Visuals

Rebuild visuals should be deterministic and source-backed whenever possible. The app should use this priority order:

1. Database-provided 3D render, provider viewer, or CAD preview metadata from `renderUrl`, `viewerUrl`, or `cadModelUrl`.
2. `referenceImages` from the matched inventory record.
3. A public source image found through approved `sourceLinks`.
4. AI-generated sketch or generated 3D scene only when no database or public reference is available.
5. Built-in placeholder image when external image services are unavailable.

AI-generated images are convenience previews. They are not source truth and should not be treated as professional-grade reconstruction evidence without human review.

Professional catalog integrations should keep third-party CAD and render assets as provider links unless the source license explicitly permits storage or redistribution. The app/API can prove source-backed visual use through `hasDatabase3DRender`, `usedAiVisualFallback`, and `visualEvidenceSource` response fields.

## Professional Source Pilots

Phase 1 professional pilots are:

- `public/inventory/traceparts-industrial-components.json`
- `public/inventory/cadenas-industrial-components.json`

Phase 2 whole-machine parts-book pilot:

- `public/inventory/documoto-equipment-parts-book-phase2.json`

Validate them together:

```bash
npm run inventory:professional:validate
```

The professional fixtures are normalized ReversR pilot records. They do not redistribute vendor CAD files, images, or customer parts books; they store provider URLs, render/CAD metadata, BOM/build-sheet fields, and explicit license notes so source-backed 3D rendering can be proven before authenticated vendor APIs are connected.

## Validation Endpoint

`POST /api/inventory/validate`

Request:

```json
{
  "connector": {
    "sourceName": "FarmBot Genesis Public Inventory",
    "sourceUrl": "demo://sample-machines",
    "connectorType": "demo",
    "authMode": "none",
    "credentialRef": ""
  }
}
```

Response:

```json
{
  "status": "ok",
  "authMode": "none",
  "credentialStatus": "not_required",
  "recordCount": 1,
  "sampleMachines": [
    {
      "machineId": "FARMBOT-GENESIS-V1-8",
      "machineName": "FarmBot Genesis v1.8",
      "revision": "v1.8",
      "partCount": 24
    }
  ]
}
```

## Authenticated Connector Credentials

Backend credentials are configured with `INVENTORY_CONNECTOR_SECRETS_JSON`.

API-key example:

```json
{
  "partsledger-prod": {
    "headerName": "X-API-Key",
    "value": "server-side-secret"
  }
}
```

OAuth bearer example:

```json
{
  "maintenance-oauth": {
    "token": "server-side-token"
  }
}
```

Additional fixed headers can be included under `headers`:

```json
{
  "erp-prod": {
    "headerName": "X-API-Key",
    "value": "server-side-secret",
    "headers": {
      "X-Tenant": "plant-42"
    }
  }
}
```

Client connector metadata for an API-key source:

```json
{
  "connector": {
    "sourceName": "PartsLedger Production",
    "sourceUrl": "https://inventory.example.com/machines.json",
    "connectorType": "api",
    "authMode": "api_key",
    "credentialRef": "partsledger-prod",
    "notes": "Read-only machine inventory export."
  }
}
```

Validation returns `credentialStatus: "configured"` when the server can resolve the reference. If the reference is absent or missing, validation fails before fetching the inventory source.

## Automated Connector Preflight

Validate an exported machine inventory before hosting it:

```bash
npm run inventory:source:validate -- docs/sample-machine-inventory.csv
```

Strict validation requires every record to include:

- stable `machineId`,
- human-readable `machineName`,
- at least three parts/components,
- machine aliases for stronger matching,
- `assemblySteps`,
- `pricing`,
- and modeling/fabrication vendor options.

Pass `-- --allow-fallbacks` only for prototype data where server-generated fallback assembly steps and pricing are acceptable:

```bash
npm run inventory:source:validate -- docs/sample-machine-inventory.csv --allow-fallbacks
```

Run the protected inventory connector smoke before moving a connector flow toward store builds:

```bash
npm run inventory:preflight
```

The preflight starts a local protected JSON inventory fixture and a local API server with `INVENTORY_CONNECTOR_SECRETS_JSON`. It verifies:

- missing credential references are rejected before inventory fetch,
- `POST /api/inventory/validate` resolves the server-side `credentialRef`,
- the protected inventory source is fetched with the configured API-key header,
- `POST /api/gemini/match-machine` identifies the fixture machine,
- `POST /api/gemini/generate-bom` produces BOM items from the matched reconstruction package,
- raw credential values are not returned in validation responses.

Default ports are `3917` for the fixture and `3013` for the API. Override them with `INVENTORY_PREFLIGHT_FIXTURE_PORT` and `INVENTORY_PREFLIGHT_API_PORT` if those ports are in use.

## Hosted Connector Smoke

After the production API is hosted and a real inventory connector is configured on that API host, run:

```bash
EXPO_PUBLIC_API_BASE_URL=https://api.your-domain.example \
CONNECTOR_SMOKE_SOURCE_NAME="Production Machine Inventory" \
CONNECTOR_SMOKE_SOURCE_URL=https://inventory.your-domain.example/machines.json \
CONNECTOR_SMOKE_CONNECTOR_TYPE=json \
CONNECTOR_SMOKE_AUTH_MODE=api_key \
CONNECTOR_SMOKE_CREDENTIAL_REF=partsledger-prod \
npm run connector:smoke
```

Use `CONNECTOR_SMOKE_EXPECTED_MACHINE_ID` when the smoke analysis should match a specific record. Override the default scan analysis with `CONNECTOR_SMOKE_ANALYSIS_JSON` or `CONNECTOR_SMOKE_COMPONENTS_JSON` when testing a different machine class.

The hosted smoke verifies the deployed API health, hardened runtime config, inventory validation, credential-reference status, machine matching, assembly/pricing output, and BOM generation against the real connector metadata. Do not set raw API keys, tokens, fixed headers, or OAuth secrets in the connector smoke environment. Configure those values on the API host and send only `CONNECTOR_SMOKE_CREDENTIAL_REF`.

For controlled local tests against an HTTP fixture, pass `--allow-insecure-connector`. Do not use that flag for store-bound production validation.

For controlled prototype checks against `demo://sample-machines` on a hosted API, pass `--allow-demo-connector`. Do not use that flag as production connector evidence.

## Admin Credential Registry

For runtime credential management, configure:

```bash
ADMIN_API_TOKEN=replace-with-long-random-token
INVENTORY_CONNECTOR_SECRETS_FILE=.reversr-connector-secrets.json
```

The registry file is ignored by git. Admin routes require `Authorization: Bearer <ADMIN_API_TOKEN>`.

List redacted credential references:

```bash
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  "$EXPO_PUBLIC_API_BASE_URL/api/admin/inventory/credentials"
```

Register or update an API-key credential:

```bash
curl -X POST "$EXPO_PUBLIC_API_BASE_URL/api/admin/inventory/credentials" \
  -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "credentialRef": "partsledger-prod",
    "headerName": "X-API-Key",
    "value": "server-side-secret"
  }'
```

Register or update an OAuth bearer credential:

```bash
curl -X POST "$EXPO_PUBLIC_API_BASE_URL/api/admin/inventory/credentials" \
  -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "credentialRef": "maintenance-oauth",
    "token": "server-side-token"
  }'
```

Delete a registry-file credential:

```bash
curl -X DELETE \
  -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  "$EXPO_PUBLIC_API_BASE_URL/api/admin/inventory/credentials/partsledger-prod"
```

Responses never return raw `value`, `apiKey`, `token`, or `accessToken` fields. They return only redacted summaries such as `credentialRef`, configured auth modes, header names, source, and timestamps.

The same registry endpoints are available in the app under Settings -> Admin Connector Credentials. Use the API token from `ADMIN_API_TOKEN`; do not paste raw ERP/API keys into the Phase 2 connector form.

## Matching Logic

The prototype uses deterministic scoring when no Gemini key is configured:

- component overlap between the scan and record parts,
- alias matches against the scanned product name and description,
- material matches when available.

The resulting reconstruction package includes:

- `machineId`
- `machineName`
- `confidenceScore`
- `evidence`
- `assemblySteps`
- `pricing`
- `fulfillmentOptions`
- BOM-ready parts

## Production Gates

- Use admin-token registry endpoints for prototype operations, then move connector credentials from the registry file to a managed secret store for production.
- Add admin roles before allowing production users to create or edit private ERP/API connectors.
- Keep procurement, vendor submission, and fabrication as explicit human-approved actions.
- Log connector source, record ID, match confidence, and admin approval status for auditability.
