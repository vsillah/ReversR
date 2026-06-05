# Store Visual Assets

Last updated: June 5, 2026

This folder contains tracked store-listing visual assets that can be prepared before native preview builds exist.

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

The feature graphic is a Google Play preview asset. Final App Store and Google Play screenshots still need to come from native preview builds and be recorded in `docs/native-qa-evidence.json`.

Reference:

- Google Play preview asset requirements: https://support.google.com/googleplay/android-developer/answer/9866151
