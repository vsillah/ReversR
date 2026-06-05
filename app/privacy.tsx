import React from 'react';
import PolicyPage from '../components/PolicyPage';

export default function PrivacyRoute() {
  return (
    <PolicyPage
      title="Privacy Policy"
      updated="June 5, 2026"
      intro="ReversR Rebuild helps users scan machines, match them against an approved machine inventory, and prepare reconstruction packages with parts, assembly steps, pricing estimates, and fabrication handoff materials."
      sections={[
        {
          title: 'Information We Process',
          bullets: [
            'Machine images captured with the camera for machine identification.',
            'Machine descriptions, visible part notes, model names, and scan context.',
            'Inventory connector metadata such as source name, connector URI, auth mode, credential reference, and admin notes.',
            'Reconstruction outputs including machine match results, assembly steps, bill of materials, pricing estimates, and export packages.',
          ],
        },
        {
          title: 'How We Use Information',
          bullets: [
            'Identify machines from images or descriptions.',
            'Validate approved machine inventory sources.',
            'Generate reconstruction plans, BOMs, assembly steps, pricing estimates, and handoff packages.',
            'Save reconstruction history locally on the device.',
            'Support troubleshooting and reliability review.',
          ],
        },
        {
          title: 'Storage and Sharing',
          bullets: [
            'Reconstruction history is stored locally on the device unless a configured backend stores it later.',
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
            'Use local model processing where available instead of a cloud AI provider.',
          ],
        },
        {
          title: 'Contact',
          body: 'For privacy questions, contact vsillah@gmail.com.',
        },
      ]}
    />
  );
}
