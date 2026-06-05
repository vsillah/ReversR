# Native Store Screenshots

Last updated: June 5, 2026

Final App Store and Google Play screenshots must be captured from Android and iOS preview builds, not from the Expo web preview.

Expected filenames:

```text
android-01-welcome.png
android-02-scan.png
android-03-inventory-validation.png
android-04-design-match.png
android-05-build-handoff.png
ios-01-welcome.png
ios-02-scan.png
ios-03-inventory-validation.png
ios-04-design-match.png
ios-05-build-handoff.png
```

After EAS preview builds exist:

1. Install the Android APK and iOS preview build on the named test devices.
2. Capture the five required screens on each platform.
3. Place the PNG files in this folder.
4. Copy `docs/native-qa-evidence.template.json` to `docs/native-qa-evidence.json`.
5. Mark each screenshot entry with `status: "pass"`, device, capture timestamp, and notes.
6. Run `npm run native:qa:preflight`.

The web-preview screenshots in `docs/store-screenshots/generated/` are planning artifacts only.
