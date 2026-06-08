# ReversR Rebuild Store Review Safety Packet

Generated from `docs/store-submission-packet.json`, `docs/privacy-policy.md`, `docs/terms-of-service.md`, app config, and `docs/store-console-copy.md`.

## Review Position

ReversR Rebuild is a review-driven machine reconstruction planning app. It helps users capture or describe a machine, match that input to an approved inventory record, and prepare a reconstruction package with a BOM, assembly sequence, pricing estimates, and fabrication handoff materials.

The app is not positioned as an autonomous manufacturing, purchasing, or safety-certification system. Generated outputs require qualified human review before procurement, vendor submission, fabrication, assembly, or machine operation.

## Safety Boundaries

- Camera access is used only to capture machine images for inventory matching and reconstruction planning.
- Camera data is not used for advertising, tracking, marketing, or unrelated profiling.
- Reconstruction outputs may be incomplete, inaccurate, or unsuitable for a specific machine revision.
- A qualified person must verify machine matches, BOMs, pricing, assembly instructions, vendor files, and safety implications before action.
- The app does not automatically order parts, submit manufacturing jobs, transmit files to vendors, or purchase services.
- Quote packets and vendor request drafts require explicit human review and user action.
- Authenticated inventory secrets remain server-side behind credential references; raw ERP/API secrets should not be stored in the mobile app.

## AI And Data Handling

- AI provider processing is used only when configured.
- Local model processing can be used where available.
- Store copy states that configured cloud AI processing may process submitted machine images or descriptions.
- Generated reconstruction packages are review artifacts, not manufacturing guarantees.

## Permission Story

- Required Android permission: `android.permission.CAMERA`
- Blocked Android permissions:
  - `android.permission.RECORD_AUDIO`
  - `android.permission.READ_EXTERNAL_STORAGE`
  - `android.permission.WRITE_EXTERNAL_STORAGE`
  - `android.permission.READ_MEDIA_IMAGES`
  - `android.permission.READ_MEDIA_VIDEO`

## Store Review Notes

Use this short note when a reviewer asks how the app handles safety-sensitive machine reconstruction output:

```text
ReversR Rebuild creates reviewable machine reconstruction planning packets. Camera access is used only for machine identification. The app does not use camera data for advertising or tracking. Inventory connectors use backend credential references so raw ERP/API secrets are not stored in the mobile app. Generated machine matches, BOMs, pricing estimates, assembly steps, quote packets, and vendor request drafts require qualified human review. The app does not automatically order parts, submit manufacturing jobs, transmit files, or purchase services.
```

## Evidence Checks

- PASS Required phrase: `Camera access is used only to capture machine images`
- PASS Required phrase: `does not automatically order parts`
- PASS Required phrase: `does not automatically submit`
- PASS Required phrase: `explicit human review`
- PASS Required phrase: `qualified person`
- PASS Required phrase: `Raw inventory connector secrets must remain server-side`
- PASS Required phrase: `does not use camera data for advertising or tracking`
- PASS Required phrase: `configured AI provider`
- PASS appStoreConnect.appPrivacy.tracking
- PASS appStoreConnect.appPrivacy.dataUsedForAdvertising
- PASS googlePlay.dataSafety.tracking
- PASS googlePlay.dataSafety.ads
- PASS googlePlay.dataSafety.encryptedInTransit
- PASS googlePlay.dataSafety.requiredPermissions.cameraOnly
- PASS android.permissions.cameraOnly
- PASS android.blockedPermissions.android.permission.RECORD_AUDIO
- PASS android.blockedPermissions.android.permission.READ_EXTERNAL_STORAGE
- PASS android.blockedPermissions.android.permission.WRITE_EXTERNAL_STORAGE
- PASS android.blockedPermissions.android.permission.READ_MEDIA_IMAGES
- PASS android.blockedPermissions.android.permission.READ_MEDIA_VIDEO
