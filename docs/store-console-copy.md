# ReversR Rebuild Store Console Copy Packet

Generated from `docs/store-submission-packet.json`.

Use this as the copy/paste source for App Store Connect and Google Play Console drafts. Replace placeholder hosted URLs only after the production policy/support routes and API are deployed and verified.

## Release Identity

- App name: ReversR Rebuild
- Version: 1.0.0
- iOS bundle ID: `com.vsillah.reversrrebuild`
- Android package: `com.vsillah.reversrrebuild`
- SKU: `reversr-rebuild-001`
- Primary language: en-US
- Apple primary category: Productivity
- Apple secondary category: Business
- Google category: Productivity
- Age rating target: 4+ / Everyone, pending final store questionnaire review

## Hosted URLs

- Privacy policy URL: https://reversr.vercel.app/privacy
- Terms URL: https://reversr.vercel.app/terms
- Support URL: https://reversr.vercel.app/support
- API base URL: https://reversr.vercel.app

## App Store Connect

### Name

```text
ReversR Rebuild
```

### Subtitle

```text
Machine rebuild packages
```

### Promotional Text

```text
Scan or describe a machine, match it to an approved inventory record, and prepare a reviewable reconstruction package.
```

### Description

```text
ReversR Rebuild helps teams move from machine scan to reconstruction plan.

Capture or describe a machine, connect an approved inventory source, and match the visible machine to a known record. The app prepares a practical reconstruction package with machine evidence, assembly steps, bill of materials, pricing estimates, technical specs, and fabrication handoff files.

The workflow is designed for human review. Inventory matches, procurement decisions, fabrication files, and assembly steps should be checked by a qualified person before parts are ordered or machines are rebuilt.

Core capabilities:
- Machine scan or manual description intake
- Repair shop profile, plan, and journey credit status
- Admin inventory connector validation
- Machine matching against approved records
- Bill of materials generation
- Assembly sequence planning
- Pricing estimate ranges
- Manufacturer quote packet export
- User-reviewed vendor request draft

ReversR Rebuild does not automatically order parts, submit manufacturing jobs, or transmit files to vendors. It prepares reviewable handoff materials so users can make controlled decisions.
```

### Keywords

```text
machine,rebuild,BOM,parts,inventory,assembly,repair,fabrication,3D
```

### Review Notes

```text
Camera access is used only to capture machine images for inventory matching and reconstruction planning. The app does not use camera data for advertising or tracking. Repair shop profiles, plan status, and reconstruction journey credit status are used for account and entitlement functionality. Paid billing is managed on the hosted web account page for web/Stripe billing and through Google Play Billing for eligible Android in-app subscriptions; mobile builds do not include Stripe checkout purchase links. Authenticated inventory connectors use backend credential references so raw ERP/API secrets are not stored in the mobile app. Quote packets and vendor request drafts require explicit user review; the app does not automatically submit manufacturing jobs, transmit files, order parts, or purchase services.
```

### TestFlight What To Test

```text
Please focus on the core reconstruction workflow:
- Start a new reconstruction using Type mode and a machine description.
- Validate the demo or approved inventory connector.
- Confirm the app matches the machine to an inventory record.
- Generate the BOM and review parts, quantities, pricing ranges, and supplier guidance.
- Review assembly steps, quote packet controls, policy links, and error handling.
- Open Settings and confirm the Repair Shop Account panel shows profile, plan, and journey credit status.

Do not submit real purchase orders or send vendor requests from this build. Treat generated BOMs and assembly steps as review drafts that require qualified human validation before use.
```

### App Privacy Draft

- Tracking: false
- Data used for advertising: false
- Contact info collected: true
- Identifiers collected: true
- Diagnostics collected: false

User content processed:

- Machine images
- Machine descriptions
- Inventory connector metadata
- Reconstruction outputs

Data linked to user:


```text
Repair shop profile, shop account, billing status, and reconstruction journey credit usage are linked to the account or shop when commercial account features are enabled.
```

Third-party processing:

- Configured AI provider processing when enabled
- User-initiated export or vendor handoff only

## Google Play Console

### Title

```text
ReversR Rebuild
```

### Short Description

```text
Scan machines and create BOM, assembly, pricing, and fabrication packets.
```

### Full Description

```text
ReversR Rebuild helps teams move from machine scan to reconstruction plan.

Capture or describe a machine, connect an approved inventory source, and match the visible machine to a known record. The app prepares a practical reconstruction package with machine evidence, assembly steps, bill of materials, pricing estimates, technical specs, and fabrication handoff files.

Core capabilities:
- Machine scan or manual description intake
- Repair shop profile, plan, and journey credit status
- Admin inventory connector validation
- Machine matching against approved records
- Bill of materials generation
- Assembly sequence planning
- Pricing estimate ranges
- Manufacturer quote packet export
- User-reviewed vendor request draft

ReversR Rebuild is designed for review-driven workflows. Inventory matching, procurement, fabrication, and vendor handoff should be checked by a qualified human before parts are ordered or machines are rebuilt.

The app does not automatically order parts, submit manufacturing jobs, transmit files to vendors, or purchase services. It prepares reviewable handoff materials so users can make controlled decisions.
```

### Data Safety Draft

Data collected:

- Machine photos or descriptions when submitted for reconstruction planning
- Repair shop profile details when entered
- Account/shop identifiers, subscription status, and reconstruction journey credit usage
- Inventory connector metadata
- Generated reconstruction package content

Data shared:

- Configured AI provider processing when enabled
- Vendor handoff only when the user explicitly exports or shares a packet

Purposes:

- App functionality
- Inventory matching
- Reconstruction package generation
- Subscription entitlement and journey credit metering
- Support and troubleshooting if diagnostics are added later

- Encrypted in transit: true
- Tracking: false
- Ads: false
- Account deletion required: Yes. Until self-service deletion is implemented, users request deletion through support.

Required permissions:

- android.permission.CAMERA

Blocked permissions:

- android.permission.RECORD_AUDIO
- android.permission.READ_EXTERNAL_STORAGE
- android.permission.WRITE_EXTERNAL_STORAGE
- android.permission.READ_MEDIA_IMAGES
- android.permission.READ_MEDIA_VIDEO

## Screenshots And Feature Graphic

- Native screenshots required: true
- Web-preview planning screenshots: `docs/store-screenshots/generated/`
- Google Play feature graphic: `docs/store-assets/google-play-feature-graphic.png`

Required native screenshot set:

- Welcome screen showing the four reconstruction phases
- Scan screen with camera or description mode
- Inventory connector validation preview
- Design screen with machine match evidence
- Build screen with assembly steps, pricing, BOM, quote packet, and vendor draft controls

## Release Notes

```text
Initial ReversR Rebuild release for scan-to-inventory machine reconstruction planning, BOM generation, pricing estimates, and reviewable fabrication handoff.
```

## Open Gates Before Public Submission

- Deploy API behind HTTPS and run npm run api:preflight.
- Deploy hosted privacy, terms, and support routes.
- Set EAS production environment URLs.
- Run eas init for the clone identity.
- Set eas.json submit.production.ios.ascAppId after the App Store Connect record exists.
- Configure App Store Connect and Play Console records.
- Run native Android and iOS preview builds.
- Capture final native screenshots.
- Complete native camera, accessibility, and export QA.
- Submit to TestFlight and Google Play Internal Testing before production review.

## Safety Notes

- Final screenshots must come from Android and iOS preview builds, not web preview captures.
- Quote packets and vendor request drafts require explicit human review.
- The app does not automatically order parts, submit manufacturing jobs, transmit files to vendors, or purchase services.
- Raw inventory connector secrets must remain server-side behind `credentialRef` references.
