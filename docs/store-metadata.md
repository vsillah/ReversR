# ReversR Rebuild Store Metadata Draft

Last updated: June 5, 2026

## App Identity

- App name: ReversR Rebuild
- Subtitle: Machine inventory to reconstruction package
- Android package: `com.vsillah.reversrrebuild`
- iOS bundle ID: `com.vsillah.reversrrebuild`
- Android versionCode: `15`
- iOS buildNumber: `1`
- Category recommendation: Productivity or Business
- Age rating target: 4+ / Everyone, pending final review of generated content and vendor links

## Short Description

Scan a machine, match it to an approved inventory record, and generate a reviewable reconstruction package with parts, assembly steps, pricing, and fabrication handoff files.

## Full Description

ReversR Rebuild helps teams move from machine scan to reconstruction plan.

Capture or describe a machine, connect an approved inventory source, and match the visible machine to a known record. The app prepares a practical reconstruction package that can include:

- machine ID and confidence evidence,
- assembly sequence,
- bill of materials,
- estimated parts, modeling, fabrication, and labor ranges,
- technical specs,
- 2D and 3D export references,
- manufacturer quote packet,
- user-reviewed vendor email draft,
- manufacturer handoff notes.

The app is designed for review-driven workflows. Inventory matching, procurement, fabrication, and vendor handoff should be checked by a qualified human before parts are ordered or machines are rebuilt.

## Keywords

machine, inventory, reconstruction, bill of materials, BOM, manufacturing, repair, parts, assembly, fabrication, 3D modeling

## Support And Policy URLs

These must be hosted before submission:

- Privacy policy URL: deploy the web `/privacy` route and set `EXPO_PUBLIC_PRIVACY_POLICY_URL` to the hosted HTTPS URL.
- Terms of service URL: deploy the web `/terms` route and set `EXPO_PUBLIC_TERMS_URL` to the hosted HTTPS URL.
- Support URL: deploy the web `/support` route and set `EXPO_PUBLIC_SUPPORT_URL` to the hosted HTTPS URL.
- User privacy choices URL: optional, pending

## Screenshots Needed

Capture native screenshots after Android and iOS preview builds:

1. Welcome screen showing the four phases.
2. Scan screen with camera/description mode.
3. Inventory connector validation preview.
4. Design screen with machine match evidence.
5. Build screen with assembly steps, pricing, BOM, and manufacturer handoff.

Use `npm run screenshots:store` against the local web preview to generate planning screenshots before final native capture. Generated web screenshots are saved under `docs/store-screenshots/generated/` and ignored by git.

## Apple App Privacy Draft

Apple App Store Connect requires privacy details for data collected by the app and third-party partners. Current expected answers:

- Contact info: Not collected by the app prototype.
- User content: Machine images, machine descriptions, inventory connector metadata, reconstruction outputs.
- Identifiers: Not intentionally collected by the app prototype.
- Usage data: Not collected unless analytics/crash reporting is added later.
- Diagnostics: Not collected unless crash reporting is added later.
- Tracking: No.
- Data linked to user: Not by default in the local prototype; revisit if account/admin roles are added.
- Data used for advertising: No.

Review trigger: If the production API, AI provider, analytics SDK, crash reporter, account system, or connector auth stores user-linked data, update these answers before submission.

## Google Play Data Safety Draft

Google Play Data safety answers should align with the production backend:

- Data collected: photos/videos only if machine images are uploaded to a configured API or AI provider; app activity/content if reconstruction packages are stored server-side.
- Data shared: AI provider processing only when configured; vendor files only when the user explicitly exports or shares them.
- Purpose: app functionality, inventory matching, reconstruction package generation, and support/troubleshooting if diagnostics are enabled.
- Data encrypted in transit: Yes, only use HTTPS production API and HTTPS inventory connectors.
- Users can request deletion: Add a support process before production if server-side accounts or stored reconstruction data are introduced.
- Required permissions: Camera only for machine scanning. Broad media/photo library permissions should remain blocked.

## Review Notes Draft

ReversR Rebuild uses the camera to capture machine images for inventory matching and reconstruction planning. Camera data is not used for advertising or unrelated profiling.

The app does not automatically order parts, submit manufacturing jobs, or transmit files to vendors. Quote packets, vendor request drafts, vendor cards, and exports are handoff tools that require explicit user action.

Authenticated ERP/API connectors use backend credential references so raw secrets are not stored in the app. Prototype operations can register credentials through admin-token protected API routes. Production connector secrets should be moved into a managed secret store and protected by admin roles.

## Pre-Submission Checklist

- Validate the copy/paste console packet with `npm run store:submission:preflight`.
- Host privacy policy, terms, and support pages from the built-in web routes.
- Set `EXPO_PUBLIC_PRIVACY_POLICY_URL`, `EXPO_PUBLIC_TERMS_URL`, and `EXPO_PUBLIC_SUPPORT_URL` in the EAS production environment.
- Deploy the production API container and run `npm run api:preflight` against the hosted URL.
- Set `EXPO_PUBLIC_API_BASE_URL` in the EAS production environment.
- Link the clone with `eas init`, then run `npm run native:preflight`.
- Run `npm run store:preflight`.
- Run `npm run accessibility:preflight`.
- Confirm final app icon, adaptive icon, splash image, and favicon pass the release asset checks.
- Run native Android and iOS camera smoke tests.
- Copy `docs/native-qa-evidence.template.json` to `docs/native-qa-evidence.json`, record Android/iOS preview-build evidence, and run `npm run native:qa:preflight`.
- Run `npm run screenshots:store` for web-preview screenshot planning.
- Capture final native screenshots for both stores.
- Build Android AAB and iOS IPA through EAS.
- Submit to Google Play Internal Testing and TestFlight before production review.
