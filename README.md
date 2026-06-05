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
   - manufacturer quote packet,
   - user-reviewed vendor email draft,
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

The API now has a deployable container bootstrap for production hosting. See [docs/production-api-deployment.md](docs/production-api-deployment.md), then build the API image with:

```bash
npm run api:docker:build
```

The native App Store and Google Play release path is captured in [docs/native-release-runbook.md](docs/native-release-runbook.md). Run the local release-readiness check with account-level gates relaxed:

```bash
npm run native:preflight:local
```

The store console copy/paste packet is in [docs/store-submission-packet.json](docs/store-submission-packet.json). Validate it locally with:

```bash
npm run store:submission:preflight:local
```

Run the local readiness check with the placeholder API allowed:

```bash
npm run store:preflight:local
```

Before real store builds, set `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_PRIVACY_POLICY_URL`, `EXPO_PUBLIC_TERMS_URL`, and `EXPO_PUBLIC_SUPPORT_URL` to hosted HTTPS URLs and run:

```bash
npm run api:preflight
npm run accessibility:preflight
npm run screenshots:store
npm run store:preflight
```

`store:preflight` also requires hosted HTTPS privacy policy, terms, and support URLs from EAS environment variables or `app.json`.
It also checks native build numbers, required release asset files, 1024x1024 PNG dimensions for the icon, adaptive icon, splash image, favicon, and critical-path accessibility labels.

The web app includes deployable `/privacy`, `/terms`, and `/support` routes for store metadata URLs.
