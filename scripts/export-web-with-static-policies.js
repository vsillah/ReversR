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

const tracePartsAssets = [
  {
    source: 'assets/welcome/reversr-welcome-poster.png',
    target: 'traceparts-assets/reversr-welcome-poster.png',
  },
  {
    source: 'assets/welcome/reversr-welcome-intro.mp4',
    target: 'traceparts-assets/reversr-welcome-intro.mp4',
  },
  {
    source: 'docs/store-screenshots/google-play-phone/google-play-phone-01-welcome.png',
    target: 'traceparts-assets/screenshots/welcome.png',
  },
  {
    source: 'docs/store-screenshots/google-play-phone/google-play-phone-02-scan.png',
    target: 'traceparts-assets/screenshots/scan.png',
  },
  {
    source: 'docs/store-screenshots/google-play-phone/google-play-phone-03-inventory-validation.png',
    target: 'traceparts-assets/screenshots/inventory-validation.png',
  },
  {
    source: 'docs/store-screenshots/google-play-phone/google-play-phone-04-design-match.png',
    target: 'traceparts-assets/screenshots/design-match.png',
  },
  {
    source: 'docs/store-screenshots/google-play-phone/google-play-phone-05-build-handoff.png',
    target: 'traceparts-assets/screenshots/build-handoff.png',
  },
];

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

const tracePartsPageTemplate = () => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>TraceParts API Evaluation | ReversR Rebuild</title>
  <style>
    :root {
      color-scheme: dark;
      --background: #07090d;
      --panel: #101722;
      --panel-soft: #151f2d;
      --text: #f6f8fb;
      --muted: #c5ccd8;
      --dim: #8490a3;
      --accent: #37d7b2;
      --accent-warm: #f7c948;
      --border: #253244;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--background);
      color: var(--text);
      line-height: 1.55;
    }
    main { max-width: 1120px; margin: 0 auto; padding: 44px 24px 72px; }
    header { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(280px, 0.9fr); gap: 32px; align-items: center; margin-bottom: 40px; }
    h1 { font-size: clamp(34px, 6vw, 60px); line-height: 1; margin: 10px 0 18px; letter-spacing: 0; }
    h2 { font-size: 25px; margin: 0 0 14px; }
    h3 { font-size: 16px; margin: 0 0 8px; color: var(--accent); text-transform: uppercase; letter-spacing: 0; }
    p, li { color: var(--muted); font-size: 16px; }
    a { color: var(--accent-warm); }
    .eyebrow { color: var(--accent); font-weight: 700; text-transform: uppercase; font-size: 13px; letter-spacing: 0; }
    .lede { font-size: 19px; color: #e5ebf5; max-width: 690px; }
    .meta { color: var(--dim); font-size: 14px; margin-top: 24px; }
    .hero-media {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 24px 90px rgba(0, 0, 0, 0.34);
    }
    .hero-media img { display: block; width: 100%; height: auto; }
    section { margin: 28px 0; padding: 28px; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
    .steps { counter-reset: step; display: grid; gap: 14px; }
    .step { position: relative; padding-left: 44px; }
    .step::before {
      counter-increment: step;
      content: counter(step);
      position: absolute;
      left: 0;
      top: 2px;
      width: 28px;
      height: 28px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      color: #06100d;
      background: var(--accent);
      font-weight: 800;
    }
    .media-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
    figure { margin: 0; background: var(--panel-soft); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    figure img { display: block; width: 100%; height: auto; }
    figcaption { padding: 10px; color: var(--muted); font-size: 13px; }
    video { display: block; width: 100%; border-radius: 8px; background: #000; border: 1px solid var(--border); }
    .boundary { border-color: rgba(247, 201, 72, 0.55); background: #171607; }
    @media (max-width: 860px) {
      header, .grid, .media-grid { grid-template-columns: 1fr; }
      main { padding: 32px 18px 56px; }
      section { padding: 22px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <p class="eyebrow">TraceParts API evaluation</p>
        <h1>ReversR Rebuild turns machine scans into reviewable rebuild packages.</h1>
        <p class="lede">ReversR Rebuild is a mobile-first workflow for repair shops and engineering teams. A user scans or describes a machine, matches it against approved professional inventory records, and produces a BOM, build sheet, source-backed visual evidence, and human-reviewed handoff materials.</p>
        <p class="meta">Unlisted vendor evaluation page. Last updated: June 22, 2026.</p>
      </div>
      <div class="hero-media">
        <img src="/traceparts-assets/reversr-welcome-poster.png" alt="ReversR Rebuild welcome screen poster">
      </div>
    </header>

    <section>
      <h2>Where TraceParts Fits</h2>
      <div class="grid">
        <div>
          <h3>Catalog lookup</h3>
          <p>Use TraceParts as a professional component source for matching machine descriptions, visible components, manufacturer part numbers, and catalog identifiers.</p>
        </div>
        <div>
          <h3>CAD and format availability</h3>
          <p>Check whether a matched component has source-backed DWG, DXF, STEP, IGES, STL, 3D PDF, or provider viewer metadata before ReversR falls back to generated visuals.</p>
        </div>
        <div>
          <h3>Engineering and procurement flow</h3>
          <p>Help repair teams move from inspection to BOM/build-sheet outputs while keeping the underlying TraceParts data provider-linked and reviewable.</p>
        </div>
        <div>
          <h3>AI-assisted matching boundary</h3>
          <p>AI can assist with scan interpretation and candidate ranking, but ReversR will not train on TraceParts data or redistribute raw CAD assets unless a separate license permits it.</p>
        </div>
      </div>
    </section>

    <section>
      <h2>User Journey</h2>
      <div class="steps">
        <div class="step"><strong>Scan or describe.</strong> The user captures a machine image or enters notes such as actuator type, motion module, visible labels, materials, and failure context.</div>
        <div class="step"><strong>Match inventory.</strong> ReversR validates configured professional sources and ranks candidate inventory records.</div>
        <div class="step"><strong>Check TraceParts evidence.</strong> The app requests catalog/CAD availability and displays provider-backed evidence before using any AI-generated sketch or placeholder.</div>
        <div class="step"><strong>Generate rebuild artifacts.</strong> The matched record drives BOM, build-sheet steps, technical specs, cost ranges, and fabrication handoff notes.</div>
        <div class="step"><strong>Human review.</strong> A qualified reviewer checks parts, formats, tolerances, licensing, and vendor handoff before ordering or fabrication.</div>
      </div>
    </section>

    <section>
      <h2>Initial TraceParts Scope</h2>
      <p>The first pilot focuses on source-backed linear actuator and motion-module rebuild packages, then expands into related mechanical parts where catalog metadata can improve matching and BOM accuracy.</p>
      <ul>
        <li>Target component families: linear actuators, motion modules, rails, bearings, couplings, motors, brackets, fasteners, and related mechanical assemblies.</li>
        <li>Desired identifiers: manufacturer, manufacturer part number, TraceParts part family or classification identifiers, selection path, CAD format IDs, and provider viewer links.</li>
        <li>Desired formats: DWG/DXF for source-backed 2D proof; STEP, IGES, STL, 3D PDF, and viewer metadata for source-backed 3D proof.</li>
        <li>Requested guidance: the best TraceParts catalogs and API approach for industrial machine repair, reconstruction, and sourcing workflows.</li>
      </ul>
    </section>

    <section>
      <h2>Current App Screens</h2>
      <div class="media-grid">
        <figure>
          <img src="/traceparts-assets/screenshots/welcome.png" alt="Welcome phase map screenshot">
          <figcaption>Workflow map</figcaption>
        </figure>
        <figure>
          <img src="/traceparts-assets/screenshots/scan.png" alt="Scan step screenshot">
          <figcaption>Scan or type</figcaption>
        </figure>
        <figure>
          <img src="/traceparts-assets/screenshots/inventory-validation.png" alt="Inventory validation screenshot">
          <figcaption>Inventory validation</figcaption>
        </figure>
        <figure>
          <img src="/traceparts-assets/screenshots/design-match.png" alt="Design match screenshot">
          <figcaption>Source evidence</figcaption>
        </figure>
        <figure>
          <img src="/traceparts-assets/screenshots/build-handoff.png" alt="Build handoff screenshot">
          <figcaption>BOM and handoff</figcaption>
        </figure>
      </div>
    </section>

    <section>
      <h2>Short Demo Asset</h2>
      <p>This internal intro asset shows the current ReversR Rebuild positioning and workflow direction. It is included for evaluation context, not as a final marketing asset.</p>
      <video controls preload="metadata" poster="/traceparts-assets/reversr-welcome-poster.png">
        <source src="/traceparts-assets/reversr-welcome-intro.mp4" type="video/mp4">
      </video>
    </section>

    <section class="boundary">
      <h2>Business Model and Licensing Boundary</h2>
      <ul>
        <li>Business model: repair-shop subscription and reconstruction journey credits for preparing reviewable rebuild packages.</li>
        <li>No automatic ordering: ReversR prepares packets and drafts; users must explicitly review and send vendor or procurement requests.</li>
        <li>No data resale: TraceParts catalog data would be used to support matches and evidence inside the ReversR workflow, not resold as a raw dataset.</li>
        <li>No direct CAD redistribution by default: provider CAD/render assets stay linked to TraceParts unless license terms explicitly allow storage, caching, or redistribution.</li>
        <li>AI boundary: ReversR can use AI for scan interpretation and fallback visuals, but source-backed TraceParts evidence takes priority whenever available.</li>
      </ul>
    </section>
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
        body: 'For privacy questions, contact vambah@amadutown.com.',
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
        body: 'For questions, contact vambah@amadutown.com.',
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
        body: 'For deletion or privacy requests, include the email address or account identifier used with the app if production accounts are enabled. The current prototype stores reconstruction history locally unless a configured backend stores it later.',
      },
      {
        title: 'Safety Boundary',
        body: 'Do not use support responses as approval to fabricate, order, assemble, or operate a machine. Reconstruction outputs require qualified human review before action.',
      },
    ],
  },
};

const copyStaticFile = (sourcePath, targetPath) => {
  const source = path.resolve(sourcePath);
  if (!fs.existsSync(source)) {
    throw new Error(`Missing static asset for export: ${sourcePath}`);
  }
  const target = path.join(outputDir, targetPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
};

const copyPublicAssets = () => {
  const publicDir = path.resolve('public');
  if (!fs.existsSync(publicDir)) return [];

  const copied = [];
  const copyEntry = (source, relativePath = '') => {
    const stats = fs.statSync(source);
    const target = path.join(outputDir, relativePath);
    if (stats.isDirectory()) {
      fs.mkdirSync(target, { recursive: true });
      for (const entry of fs.readdirSync(source)) {
        copyEntry(path.join(source, entry), path.join(relativePath, entry));
      }
      return;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    copied.push(relativePath);
  };

  copyEntry(publicDir);
  return copied;
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

const tracePartsPageDir = path.join(outputDir, 'traceparts');
fs.mkdirSync(tracePartsPageDir, { recursive: true });
fs.writeFileSync(path.join(tracePartsPageDir, 'index.html'), tracePartsPageTemplate());
for (const asset of tracePartsAssets) {
  copyStaticFile(asset.source, asset.target);
}

const copiedPublicAssets = copyPublicAssets();

console.log(`Static pages written to ${outputDir}/privacy, ${outputDir}/terms, ${outputDir}/support, and ${outputDir}/traceparts.`);
console.log(`Copied ${tracePartsAssets.length} TraceParts overview asset(s) into ${outputDir}/traceparts-assets.`);
if (copiedPublicAssets.length > 0) {
  console.log(`Copied ${copiedPublicAssets.length} public asset(s) into ${outputDir}.`);
}
