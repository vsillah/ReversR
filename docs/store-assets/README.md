# Store Visual Assets

Last updated: June 5, 2026

This folder contains tracked store-listing visual assets that can be prepared before store-console upload.

## Google Play App Icon

Asset:

```text
docs/store-assets/google-play-icon.png
```

Requirements:

- 512px by 512px.
- PNG generated from the tracked app icon.
- Verified with `npm run store:assets:preflight`.

## Google Play Feature Graphic

Asset:

```text
docs/store-assets/google-play-feature-graphic.png
```

Requirements:

- 1024px by 500px.
- PNG with no alpha channel.
- Generated locally with `npm run store:assets:generate`.
- Verified with `npm run store:assets:preflight`.

## Google Play Phone Screenshots

Upload-ready phone screenshots:

```text
docs/store-screenshots/google-play-phone/google-play-phone-01-welcome.png
docs/store-screenshots/google-play-phone/google-play-phone-02-scan.png
docs/store-screenshots/google-play-phone/google-play-phone-03-inventory-validation.png
docs/store-screenshots/google-play-phone/google-play-phone-04-design-match.png
docs/store-screenshots/google-play-phone/google-play-phone-05-build-handoff.png
```

These are generated from the Android native Pixel captures with:

```bash
npm run store:screenshots:google-play
```

The raw Pixel captures are taller than Play's 9:16 phone screenshot frame. The generated files preserve the full native captures inside 1080px by 1920px PNG canvases without cropping.

Final Google Play upload and App Store iOS screenshots remain human-in-the-loop store-console actions.

Reference:

- Google Play preview asset requirements: https://support.google.com/googleplay/android-developer/answer/9866151
