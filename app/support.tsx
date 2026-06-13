import React from 'react';
import PolicyPage from '../components/PolicyPage';

export default function SupportRoute() {
  return (
    <PolicyPage
      title="Support"
      updated="June 13, 2026"
      intro="Use this page to route ReversR Rebuild support, privacy, deletion, and store-review questions."
      sections={[
        {
          title: 'Contact',
          bullets: [
            'Email: vambah@amadutown.com',
            'Location: Boston, Massachusetts, USA',
            'App: ReversR Rebuild',
          ],
        },
        {
          title: 'What To Include',
          bullets: [
            'Device platform and app version.',
            'Whether the issue happened during scan, inventory matching, design, BOM generation, or vendor handoff.',
            'Connector type and credential reference name when relevant. Do not send raw API keys or OAuth tokens.',
            'Screenshots or exported review packets only when you are authorized to share them.',
          ],
        },
        {
          title: 'Privacy and Data Requests',
          body: 'For deletion or privacy requests, include the email address or shop account identifier used with the app. Local reconstruction history can also be cleared by deleting app data or uninstalling the app.',
        },
        {
          title: 'Billing Support',
          body: 'Paid shop billing is managed through the hosted ReversR web account page and Stripe customer portal when configured. Include the shop name and billing email for subscription, invoice, cancellation, or refund questions.',
        },
        {
          title: 'Safety Boundary',
          body: 'Do not use support responses as approval to fabricate, order, assemble, or operate a machine. Reconstruction outputs require qualified human review before action.',
        },
      ]}
    />
  );
}
