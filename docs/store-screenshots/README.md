# Store Screenshot Capture

This folder documents the screenshot workflow for App Store and Google Play readiness.

Run the web-preview capture after starting the API and Expo web preview:

```bash
npm run web-preview
npm run screenshots:store
```

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
