# Privacy Policy for ReversR Rebuild

**Last Updated:** June 15, 2026

## Introduction

ReversR Rebuild ("we," "our," or "us") helps users scan machines, match them against an approved machine inventory, and prepare reconstruction packages with parts, assembly steps, pricing estimates, and fabrication handoff materials.

This Privacy Policy explains what information the app handles and how it is used.

## Information We Collect or Process

### Information You Provide

- **Machine images:** Photos captured with the camera for machine identification.
- **Machine descriptions:** Text descriptions, visible part notes, model names, and other scan context.
- **Repair shop profile details:** Name, work email, shop name, role, plan, and monthly reconstruction journey credit usage.
- **Inventory connector metadata:** Source name, connector URI, connector type, auth mode selection, and admin notes.
- **Reconstruction outputs:** Machine match results, assembly steps, bill of materials, pricing estimates, and export packages.
- **Billing metadata:** Stripe customer IDs, Google Play purchase token hashes, subscription IDs, subscription status, plan, and billing period dates when a shop uses hosted web billing or Android in-app subscriptions.

### Device and Usage Information

If analytics or crash reporting is enabled in a future release, the app may process device type, operating system, app version, crash logs, and performance events. This prototype does not add a new analytics SDK.

## How We Use Information

We use information to:

- Identify machines from images or descriptions.
- Validate and read approved machine inventory sources.
- Match scans to machine records.
- Generate reconstruction plans, BOMs, assembly steps, pricing estimates, and handoff packages.
- Meter reconstruction journey credits and enforce plan entitlements.
- Save reconstruction history locally on the device.
- Support repair shop account, subscription, and billing management.
- Improve reliability and support troubleshooting.

## Data Storage

- Reconstruction history is stored locally on the device by default.
- Shop profiles, entitlements, billing identifiers, and credit usage may be stored by the hosted ReversR API when account features are enabled.
- Large base64 images are not stored in long-term local history by default.
- Inventory connector metadata may be saved locally so admins do not need to re-enter it.
- Exported sketches, specs, BOMs, and reconstruction packages are written to app-controlled storage before the user chooses whether to share them.

## Third-Party Processing

The app may use AI providers such as Google Gemini or local models such as Ollama to analyze machine input and generate reconstruction outputs. If a cloud AI provider is configured, machine descriptions and images may be sent to that provider for processing.

Stripe may process payment details when a shop manages billing through the hosted web account page. Google Play may process Android in-app subscription payments. ReversR stores billing identifiers, Google Play purchase token hashes, and subscription status, not full card numbers.

Manufacturer links such as Xometry, Protolabs, Shapeways, or JLCPCB are provided as handoff destinations. The app can export a quote packet and prepare a user-reviewed email draft for handoff, but it does not automatically submit files or orders to those vendors.

## Data Sharing

We do not sell personal information.

Information may be shared only when:

- Required to process a scan through a configured AI provider.
- The user or admin explicitly exports or shares a reconstruction package.
- Required by law.

## Camera Access

Camera access is used only to capture machine images for inventory matching and reconstruction planning. Camera access is not used for advertising, marketing, or unrelated data mining.

The app does not request broad photo library or media library access in the current release path. Generated visual references are exported through app storage and the system share sheet instead of being saved directly to the user's photo library.

## Your Choices

You can:

- Delete app data by clearing app storage or uninstalling the app.
- Request account or shop profile deletion by contacting support until self-service deletion is available.
- Avoid camera capture by entering a machine description manually.
- Avoid cloud AI processing by configuring a supported local model where available.

## Security

We use reasonable safeguards for app data and recommend using HTTPS inventory connectors. Authenticated ERP/API connector secrets are not stored in the mobile app; production connector credentials should be managed in a backend secret store.

## Children's Privacy

ReversR Rebuild is not intended for children under 13. We do not knowingly collect information from children under 13.

## Changes to This Policy

We may update this Privacy Policy. Updates will include a new "Last Updated" date.

## Contact Us

For questions, contact:

vambah@amadutown.com

**Location:** Boston, Massachusetts, USA
