# Store Console Task Answers

Generated: 2026-06-05T13:51:16.296Z

Use this as a task-by-task entry packet for App Store Connect and Google Play Console. It is not proof that any console task has been saved or approved.

## Human Values Still Needed

- Public support email for Google Play contact details
- Final official content rating and age rating questionnaire results
- Native Android and iOS screenshots from preview builds
- Apple login/2FA for EAS iOS preview credentials

## Google Play Tasks

### Set privacy policy

- Status: ready-to-enter
- Save gate: Saving updates the Google Play Console app record.

**Privacy policy URL**

```text
https://reversr.vercel.app/privacy
```

### Sign in details

- Status: ready-to-enter
- Save gate: Saving updates Google Play app content answers.

**Does the app require sign-in?**

```text
No
```

**Reasoning**

```text
Current ReversR Rebuild prototype exposes scan, connector validation, reconstruction package, policy, and support flows without an account login requirement.
```

### Ads

- Status: ready-to-enter
- Save gate: Saving updates Google Play app content answers.

**Contains ads?**

```text
No
```

**Reasoning**

```text
The release packet marks ads as false and no advertising SDK is documented for this build.
```

### Content rating

- Status: review-required
- Save gate: The official questionnaire result must be reviewed before saving as final.

**Expected rating target**

```text
Everyone / low maturity, pending final questionnaire result
```

**Violence, sexual content, controlled substances, gambling, and user-generated public sharing**

```text
No expected affirmative answers based on current app scope.
```

**Camera use**

```text
Camera is used for machine images only, not for public social sharing or user-generated content feeds.
```

### Target audience

- Status: review-required
- Save gate: Target audience answers affect store policy treatment and should be reviewed before saving.

**Recommended target audience**

```text
Adults / workplace users
```

**Children under 13**

```text
No
```

**Reasoning**

```text
The app is for machine reconstruction planning, BOM generation, pricing estimates, and fabrication handoff review.
```

### Data safety

- Status: ready-to-enter
- Save gate: Saving updates Google Play Data safety declarations and should match the final build behavior.

**Data collected**

```text
  - Machine photos or descriptions when submitted for reconstruction planning
  - Inventory connector metadata
  - Generated reconstruction package content
```

**Data shared**

```text
  - Configured AI provider processing when enabled
  - Vendor handoff only when the user explicitly exports or shares a packet
```

**Purposes**

```text
  - App functionality
  - Inventory matching
  - Reconstruction package generation
  - Support and troubleshooting if diagnostics are added later
```

**Encrypted in transit**

```text
Yes
```

**Tracking**

```text
No
```

**Account deletion required**

```text
Not applicable until account/server-side user storage is added.
```

**Required permission**

```text
android.permission.CAMERA
```

**Blocked permissions**

```text
  - android.permission.RECORD_AUDIO
  - android.permission.READ_EXTERNAL_STORAGE
  - android.permission.WRITE_EXTERNAL_STORAGE
  - android.permission.READ_MEDIA_IMAGES
  - android.permission.READ_MEDIA_VIDEO
```

### Government apps

- Status: ready-to-enter
- Save gate: Saving updates Google Play app content answers.

**Is this a government app?**

```text
No
```

### Financial features

- Status: ready-to-enter
- Save gate: Saving updates Google Play app content answers.

**Financial products or services?**

```text
No
```

**Reasoning**

```text
The app produces reconstruction planning and quote packet materials; it does not offer lending, banking, trading, payments, insurance, or financial advice.
```

### Health

- Status: ready-to-enter
- Save gate: Saving updates Google Play app content answers.

**Health features?**

```text
No
```

### Select an app category and provide contact details

- Status: partial-human-value-needed
- Save gate: Saving publishes contact metadata inside Google Play Console; public support email needs Vambah confirmation.

**App or game**

```text
App
```

**Category**

```text
Productivity
```

**Website**

```text
https://reversr.vercel.app/support
```

**Email**

```text
HITL_REQUIRED_PUBLIC_SUPPORT_EMAIL
```

**Phone**

```text
Optional / leave blank unless Vambah wants public phone support listed
```

### Set up your store listing

- Status: partial-native-assets-needed
- Save gate: Store listing can be drafted, but final screenshot upload must use native preview captures.

**App name/title**

```text
ReversR Rebuild
```

**Short description**

```text
Scan machines and create BOM, assembly, pricing, and fabrication packets.
```

**Full description**

```text
ReversR Rebuild helps teams move from machine scan to reconstruction plan.

Capture or describe a machine, connect an approved inventory source, and match the visible machine to a known record. The app prepares a practical reconstruction package with machine evidence, assembly steps, bill of materials, pricing estimates, technical specs, and fabrication handoff files.

Core capabilities:
- Machine scan or manual description intake
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

**App icon**

```text
1024x1024 release icon already present per store asset preflight
```

**Feature graphic**

```text
docs/store-assets/google-play-feature-graphic.png
```

**Phone screenshots**

```text
Pending final native Android screenshots in docs/store-screenshots/native/
```


## App Store Connect Tasks

### Create iOS app record

- Status: completed-recorded
- Save gate: Record exists. Continue with metadata, privacy, age rating, TestFlight, and screenshot tasks.

**Platform**

```text
iOS
```

**Name**

```text
ReversR Rebuild
```

**Primary language**

```text
English (U.S.)
```

**Bundle ID**

```text
ReversR Rebuild - com.vsillah.reversrrebuild
```

**SKU**

```text
reversr-rebuild-001
```

**User access**

```text
Full Access
```

**Apple ID**

```text
6777091538
```

**Record URL**

```text
https://appstoreconnect.apple.com/apps/6777091538/distribution/ios/version/inflight
```

### App information

- Status: ready-after-record-create
- Save gate: Requires App Store Connect app record and saved console edits.

**Subtitle**

```text
Machine rebuild packages
```

**Primary category**

```text
Productivity
```

**Secondary category**

```text
Business
```

**Privacy policy URL**

```text
https://reversr.vercel.app/privacy
```

### Version metadata

- Status: ready-after-record-create
- Save gate: Requires App Store Connect app record and saved console edits.

**Promotional text**

```text
Scan or describe a machine, match it to an approved inventory record, and prepare a reviewable reconstruction package.
```

**Description**

```text
ReversR Rebuild helps teams move from machine scan to reconstruction plan.

Capture or describe a machine, connect an approved inventory source, and match the visible machine to a known record. The app prepares a practical reconstruction package with machine evidence, assembly steps, bill of materials, pricing estimates, technical specs, and fabrication handoff files.

The workflow is designed for human review. Inventory matches, procurement decisions, fabrication files, and assembly steps should be checked by a qualified person before parts are ordered or machines are rebuilt.

Core capabilities:
- Machine scan or manual description intake
- Admin inventory connector validation
- Machine matching against approved records
- Bill of materials generation
- Assembly sequence planning
- Pricing estimate ranges
- Manufacturer quote packet export
- User-reviewed vendor request draft

ReversR Rebuild does not automatically order parts, submit manufacturing jobs, or transmit files to vendors. It prepares reviewable handoff materials so users can make controlled decisions.
```

**Keywords**

```text
machine,rebuild,BOM,parts,inventory,assembly,repair,fabrication,3D
```

**Support URL**

```text
https://reversr.vercel.app/support
```

**Marketing URL**

```text
https://reversr.vercel.app/support
```

**Review notes**

```text
Camera access is used only to capture machine images for inventory matching and reconstruction planning. The app does not use camera data for advertising or tracking. Authenticated inventory connectors use backend credential references so raw ERP/API secrets are not stored in the mobile app. Quote packets and vendor request drafts require explicit user review; the app does not automatically submit manufacturing jobs, transmit files, order parts, or purchase services.
```

### App Privacy

- Status: ready-to-review
- Save gate: Final App Privacy answers must match final build behavior before saving.

**Tracking**

```text
No
```

**Data used for advertising**

```text
No
```

**Contact info collected**

```text
No
```

**Identifiers collected**

```text
No
```

**Diagnostics collected**

```text
No
```

**User content processed**

```text
  - Machine images
  - Machine descriptions
  - Inventory connector metadata
  - Reconstruction outputs
```

**Third-party processing**

```text
  - Configured AI provider processing when enabled
  - User-initiated export or vendor handoff only
```

### Age rating

- Status: review-required
- Save gate: Official questionnaire result must be reviewed before saving as final.

**Expected rating target**

```text
4+ / low maturity, pending official questionnaire result
```

**Human review note**

```text
Answer the official questionnaire based on machine reconstruction planning, camera use, and no public user-generated content feed.
```


## Safety Boundaries

- Do not mark any store-console task complete until saved in the relevant console and verified.
- Do not submit to public app review from this packet.
- Do not add secrets, private connector credentials, or raw Apple/Google account data to evidence files.
