# EAS Submit Configuration

Last updated: June 5, 2026

This app uses EAS Submit for the first store review lanes:

- Google Play Internal Testing through `submit.production.android.track = internal`.
- Apple TestFlight through `submit.production.ios.ascAppId` after the App Store Connect app record exists.

Current state:

- Android submit track is configured for the internal testing lane.
- iOS submit profile is intentionally incomplete until App Store Connect provides the app's Apple ID.

Do not put Apple account passwords, App Store Connect API keys, or Google service account JSON in this repo. Configure those through EAS credentials, EAS environment variables, local ignored files, or the store consoles.

After the App Store Connect record exists, update `eas.json`:

```json
{
  "submit": {
    "production": {
      "android": {
        "track": "internal"
      },
      "ios": {
        "ascAppId": "1234567890"
      }
    }
  }
}
```

Then run:

```bash
npm run native:preflight
npx eas-cli@20.0.0 submit --platform android --profile production
npx eas-cli@20.0.0 submit --platform ios --profile production
```

References:

- Expo EAS Submit overview: https://docs.expo.dev/submit/introduction/
- Expo EAS Submit configuration: https://docs.expo.dev/submit/eas-json/
