import React from 'react';
import PolicyPage from '../components/PolicyPage';

export default function TermsRoute() {
  return (
    <PolicyPage
      title="Terms of Service"
      updated="June 15, 2026"
      intro="By accessing or using ReversR Rebuild, you agree to these terms. If you do not agree, do not use the app."
      sections={[
        {
          title: 'Service',
          bullets: [
            'Capture or describe a machine.',
            'Validate an admin-approved machine inventory connector.',
            'Match a scan to a machine record.',
            'Generate a reconstruction package with BOM, assembly steps, pricing estimates, and fabrication or 3D modeling handoff information.',
            'Manage repair shop profiles, monthly reconstruction journey credits, paid shop entitlements, hosted web billing, and Android Google Play Billing where configured.',
          ],
        },
        {
          title: 'User Responsibilities',
          bullets: [
            'Use the app only for lawful purposes.',
            'Provide accurate inventory connector information.',
            'Verify machine matches, parts, pricing, and assembly instructions before acting on them.',
            'Respect intellectual property, safety, warranty, and regulatory obligations related to machines and parts.',
            'Keep account, billing, and inventory connector information accurate and authorized.',
          ],
        },
        {
          title: 'Subscriptions and Credits',
          bullets: [
            'Free users receive a limited monthly journey credit trial.',
            'Paid shop plans and upgrades are managed through the hosted web account page and Stripe billing where configured, or through Google Play Billing for eligible Android in-app subscriptions.',
            'One journey credit starts a reconstruction. Specs, sketches, BOMs, exports, and other continuation steps in that same journey do not spend additional credits.',
            'Credit limits, plan features, prices, and add-ons may change with notice before renewal.',
          ],
        },
        {
          title: 'Cancellation and Refunds',
          body: 'Billing changes, cancellations, payment methods, and invoices are managed through the hosted web billing portal when Stripe is configured, or through Google Play subscription management for Android in-app subscriptions. Refund requests should be sent to support or the applicable app store and are reviewed based on account activity, usage, store rules, and applicable law.',
        },
        {
          title: 'Reconstruction Output',
          body: 'Outputs may be incomplete, inaccurate, or unsuitable for a specific machine revision. Review by a qualified person is required before ordering parts, submitting files to a vendor, fabricating parts, assembling a machine, or operating a machine.',
        },
        {
          title: 'No Automatic Vendor Submission',
          body: 'The app may open vendor websites, prepare user-reviewed quote request drafts, or export handoff files, but it does not automatically submit orders, transmit files, or purchase services without user action.',
        },
        {
          title: 'Disclaimer',
          body: 'The app is provided as is without warranties of accuracy, completeness, safety, or suitability for manufacturing.',
        },
        {
          title: 'Contact',
          body: 'For questions, contact vambah@amadutown.com.',
        },
      ]}
    />
  );
}
