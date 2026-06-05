import React from 'react';
import PolicyPage from '../components/PolicyPage';

export default function SupportRoute() {
  return (
    <PolicyPage
      title="Support"
      updated="June 5, 2026"
      intro="Use this page to route ReversR Rebuild support, privacy, deletion, and store-review questions."
      sections={[
        {
          title: 'Contact',
          bullets: [
            'Email: vsillah@gmail.com',
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
          body: 'For deletion or privacy requests, include the email address or account identifier used with the app if production accounts are enabled. The current prototype stores reconstruction history locally unless a configured backend stores it later.',
        },
        {
          title: 'Safety Boundary',
          body: 'Do not use support responses as approval to fabricate, order, assemble, or operate a machine. Reconstruction outputs require qualified human review before action.',
        },
      ]}
    />
  );
}
