# ReversR Rebuild Inventory Connector Spec

Last updated: June 5, 2026

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
      }
    }
  ]
}
```

## Validation Endpoint

`POST /api/inventory/validate`

Request:

```json
{
  "connector": {
    "sourceName": "Demo Machine Inventory",
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
  "recordCount": 2,
  "sampleMachines": [
    {
      "machineId": "DEMO-FDM-PRINTER-001",
      "machineName": "Desktop FDM 3D Printer",
      "revision": "A",
      "partCount": 10
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
