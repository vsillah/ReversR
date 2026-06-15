import React from 'react';
import PolicyPage from '../components/PolicyPage';

export default function PrivacyRoute() {
  return (
    <PolicyPage
      title="Privacy Policy"
      updated="June 15, 2026"
      intro="ReversR Rebuild helps users scan machines, match them against an approved machine inventory, and prepare reconstruction packages with parts, assembly steps, pricing estimates, and fabrication handoff materials."
      sections={[
        {
          title: 'Information We Process',
          bullets: [
            'Machine images captured with the camera for machine identification.',
            'Machine descriptions, visible part notes, model names, and scan context.',
            'Repair shop profile details such as name, work email, shop name, role, plan, and monthly reconstruction journey credit usage.',
            'Inventory connector metadata such as source name, connector URI, auth mode, credential reference, and admin notes.',
            'Reconstruction outputs including machine match results, assembly steps, bill of materials, pricing estimates, and export packages.',
            'Billing identifiers and subscription status from Stripe or Google Play when a shop uses hosted web billing or Android in-app subscriptions.',
          ],
        },
        {
          title: 'How We Use Information',
          bullets: [
            'Identify machines from images or descriptions.',
            'Validate approved machine inventory sources.',
            'Generate reconstruction plans, BOMs, assembly steps, pricing estimates, and handoff packages.',
            'Meter reconstruction journey credits and enforce plan entitlements.',
            'Save reconstruction history locally on the device.',
            'Support account, shop, and subscription management.',
            'Support troubleshooting and reliability review.',
          ],
        },
        {
          title: 'Storage and Sharing',
          bullets: [
            'Reconstruction history remains local by default; signed-in or configured shop accounts may use backend storage for profile, entitlement, usage, and future cloud-history records.',
            'Stripe processes payments and billing details for hosted web checkout and customer portal sessions. Google Play processes Android in-app subscription payments. The app stores billing identifiers and subscription status, not full card numbers.',
            'Exported sketches, specs, BOMs, and reconstruction packages are written to app-controlled storage before the user chooses whether to share them.',
            'Cloud AI processing is used only when a cloud provider is configured.',
            'Manufacturer quote packets and email drafts require explicit user action and are not sent automatically.',
          ],
        },
        {
          title: 'Camera Access',
          body: 'Camera access is used only to capture machine images for inventory matching and reconstruction planning. Camera access is not used for advertising, marketing, or unrelated profiling.',
        },
        {
          title: 'Your Choices',
          bullets: [
            'Use text description instead of camera capture.',
            'Delete app data by clearing app storage or uninstalling the app.',
            'Request account or shop profile deletion by contacting support until self-service deletion is available.',
            'Use local model processing where available instead of a cloud AI provider.',
          ],
        },
        {
          title: 'Contact',
          body: 'For privacy questions, contact vambah@amadutown.com.',
        },
      ]}
    />
  );
}
