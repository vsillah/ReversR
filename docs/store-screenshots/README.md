# Store Screenshot Capture

This folder documents the screenshot workflow for App Store and Google Play readiness.

Run the web-preview capture after starting the API and Expo web preview:

```bash
npm run web-preview
WEB_SMOKE_APP_URL=http://localhost:5001 npm run web:flow-smoke
npm run screenshots:store
```

Run the smoke first. It fails fast if the scan, inventory match, BOM, quote packet, or vendor draft path is broken, which keeps screenshot output from masking a broken flow.

The script writes generated files to:

```text
docs/store-screenshots/generated/
```

The generated screenshots are intentionally ignored by git. They are review artifacts, not source files.

Captured web-preview screens:

1. Welcome screen with the four phases.
2. Scan screen with machine description mode.
3. Inventory connector validation preview.
4. Design screen with machine match evidence.
5. Build screen with BOM, pricing, manufacturer handoff, and vendor request draft.
6. Privacy route for store metadata review.

Store submission still requires native screenshots captured from iOS and Android preview builds. Use these web screenshots as a composition and metadata review pass before producing final native assets.

Final native screenshots belong in:

```text
docs/store-screenshots/native/
```

The required native screenshot filenames and evidence steps are documented in `docs/store-screenshots/native/README.md` and enforced by `npm run native:qa:preflight` after `docs/native-qa-evidence.json` exists.
