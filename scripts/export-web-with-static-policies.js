const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const outputDirIndex = args.lastIndexOf('--output-dir');
const outputDir = outputDirIndex >= 0 && args[outputDirIndex + 1]
  ? args[outputDirIndex + 1]
  : 'dist';

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const pageTemplate = ({ title, updated, intro, sections }) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} | ReversR Rebuild</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0a0a0a; color: #f5f5f5; line-height: 1.6; }
    main { max-width: 820px; margin: 0 auto; padding: 48px 24px 72px; }
    h1 { font-size: 36px; margin: 0 0 8px; }
    h2 { font-size: 21px; margin: 32px 0 10px; color: #f7c948; }
    p, li { color: #d4d4d4; font-size: 16px; }
    .updated { color: #a3a3a3; margin-bottom: 28px; }
    a { color: #f7c948; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p class="updated">Last updated: ${escapeHtml(updated)}</p>
    <p>${escapeHtml(intro)}</p>
    ${sections.map(section => `
      <section>
        <h2>${escapeHtml(section.title)}</h2>
        ${section.body ? `<p>${escapeHtml(section.body)}</p>` : ''}
        ${section.bullets ? `<ul>${section.bullets.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
      </section>
    `).join('')}
  </main>
</body>
</html>
`;

const pages = {
  privacy: {
    title: 'Privacy Policy',
    updated: 'June 5, 2026',
    intro: 'ReversR Rebuild helps users scan machines, match them against an approved machine inventory, and prepare reconstruction packages with parts, assembly steps, pricing estimates, and fabrication handoff materials.',
    sections: [
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
    ],
  },
  terms: {
    title: 'Terms of Service',
    updated: 'June 5, 2026',
    intro: 'By accessing or using ReversR Rebuild, you agree to these terms. If you do not agree, do not use the app.',
    sections: [
      {
        title: 'Service',
        bullets: [
          'Capture or describe a machine.',
          'Validate an admin-approved machine inventory connector.',
          'Match a scan to a machine record.',
          'Generate a reconstruction package with BOM, assembly steps, pricing estimates, and fabrication or 3D modeling handoff information.',
        ],
      },
      {
        title: 'User Responsibilities',
        bullets: [
          'Use the app only for lawful purposes.',
          'Provide accurate inventory connector information.',
          'Verify machine matches, parts, pricing, and assembly instructions before acting on them.',
          'Respect intellectual property, safety, warranty, and regulatory obligations related to machines and parts.',
        ],
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
        body: 'For questions, contact vsillah@gmail.com.',
      },
    ],
  },
  support: {
    title: 'Support',
    updated: 'June 5, 2026',
    intro: 'Use this page to route ReversR Rebuild support, privacy, deletion, and store-review questions.',
    sections: [
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
    ],
  },
};

const exportResult = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', outputDir], {
  encoding: 'utf8',
  stdio: 'inherit',
});

if (exportResult.status !== 0) {
  process.exit(exportResult.status || 1);
}

for (const [slug, page] of Object.entries(pages)) {
  const pageDir = path.join(outputDir, slug);
  fs.mkdirSync(pageDir, { recursive: true });
  fs.writeFileSync(path.join(pageDir, 'index.html'), pageTemplate(page));
}

console.log(`Static policy pages written to ${outputDir}/privacy, ${outputDir}/terms, and ${outputDir}/support.`);
