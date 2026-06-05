# ReversR Rebuild

ReversR Rebuild is a clone direction for the original ReversR app. The old ideation phase has been replaced with an inventory connector and machine reconstruction workflow.

## Workflow

1. Scan or describe a machine.
2. Validate an admin inventory connector.
3. Match the scan to a machine record.
4. Generate a reconstruction package:
   - machine ID and confidence,
   - assembly steps,
   - pricing estimate,
   - bill of materials,
   - 3D modeling and fabrication handoff.

## Run Locally

```bash
npm install
npm run web-preview
```

Local services:

- API: `http://localhost:3001`
- Expo web: `http://localhost:5001`

## Connector Fixtures

Use the built-in connector:

```text
demo://sample-machines
```

Or validate the sample CSV fixture:

```text
file:///Users/vambahsillah/Documents/ReversR/original-ReversR/docs/sample-machine-inventory.csv
```

See [docs/inventory-connector-spec.md](docs/inventory-connector-spec.md).

## Store Readiness

The prototype is not store-ready yet. See [docs/store-readiness.md](docs/store-readiness.md) and [docs/store-metadata.md](docs/store-metadata.md) for the Apple App Store, Google Play, and EAS gates.

Run the local readiness check with the placeholder API allowed:

```bash
npm run store:preflight:local
```

Before real store builds, set `EXPO_PUBLIC_API_BASE_URL` to the hosted production API and run:

```bash
npm run store:preflight
```
