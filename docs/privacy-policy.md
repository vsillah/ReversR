# Privacy Policy for ReversR Rebuild

**Last Updated:** June 5, 2026

## Introduction

ReversR Rebuild ("we," "our," or "us") helps users scan machines, match them against an approved machine inventory, and prepare reconstruction packages with parts, assembly steps, pricing estimates, and fabrication handoff materials.

This Privacy Policy explains what information the app handles and how it is used.

## Information We Collect or Process

### Information You Provide

- **Machine images:** Photos captured with the camera for machine identification.
- **Machine descriptions:** Text descriptions, visible part notes, model names, and other scan context.
- **Inventory connector metadata:** Source name, connector URI, connector type, auth mode selection, and admin notes.
- **Reconstruction outputs:** Machine match results, assembly steps, bill of materials, pricing estimates, and export packages.

### Device and Usage Information

If analytics or crash reporting is enabled in a future release, the app may process device type, operating system, app version, crash logs, and performance events. This prototype does not add a new analytics SDK.

## How We Use Information

We use information to:

- Identify machines from images or descriptions.
- Validate and read approved machine inventory sources.
- Match scans to machine records.
- Generate reconstruction plans, BOMs, assembly steps, pricing estimates, and handoff packages.
- Save reconstruction history locally on the device.
- Improve reliability and support troubleshooting.

## Data Storage

- Reconstruction history is stored locally on the device.
- Large base64 images are not stored in long-term local history by default.
- Inventory connector metadata may be saved locally so admins do not need to re-enter it.

## Third-Party Processing

The app may use AI providers such as Google Gemini or local models such as Ollama to analyze machine input and generate reconstruction outputs. If a cloud AI provider is configured, machine descriptions and images may be sent to that provider for processing.

Manufacturer links such as Xometry, Protolabs, Shapeways, or JLCPCB are provided as handoff destinations. The current app does not automatically submit files or orders to those vendors.

## Data Sharing

We do not sell personal information.

Information may be shared only when:

- Required to process a scan through a configured AI provider.
- The user or admin explicitly exports or shares a reconstruction package.
- Required by law.

## Camera Access

Camera access is used only to capture machine images for inventory matching and reconstruction planning. Camera access is not used for advertising, marketing, or unrelated data mining.

## Your Choices

You can:

- Delete app data by clearing app storage or uninstalling the app.
- Avoid camera capture by entering a machine description manually.
- Avoid cloud AI processing by configuring a supported local model where available.

## Security

We use reasonable safeguards for app data and recommend using HTTPS inventory connectors. Authenticated ERP/API connectors should use server-side secret storage before production release.

## Children's Privacy

ReversR Rebuild is not intended for children under 13. We do not knowingly collect information from children under 13.

## Changes to This Policy

We may update this Privacy Policy. Updates will include a new "Last Updated" date.

## Contact Us

For questions, contact:

vsillah@gmail.com

**Location:** Boston, Massachusetts, USA
