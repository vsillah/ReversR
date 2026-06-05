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

Authenticated connectors are intentionally blocked in this prototype until server-side secret storage and admin access controls are added.

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
    "authMode": "none"
  }
}
```

Response:

```json
{
  "status": "ok",
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

- Add authenticated connector support on the server, not in the mobile bundle.
- Store connector secrets in a server-side secret manager.
- Add admin roles before allowing private ERP/API connectors.
- Keep procurement, vendor submission, and fabrication as explicit human-approved actions.
- Log connector source, record ID, match confidence, and admin approval status for auditability.
