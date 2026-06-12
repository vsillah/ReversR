const fs = require('fs');
const path = require('path');

const outputFile = process.env.FARMBOT_INVENTORY_FILE || 'public/inventory/farmbot-genesis-v1.8.json';
const evidenceFile = process.env.FARMBOT_INVENTORY_EVIDENCE_FILE || 'docs/farmbot-public-inventory-evidence.json';
const repoTreeUrl = 'https://api.github.com/repos/FarmBot-Docs/farmbot-genesis/git/trees/main?recursive=1';
const rawBaseUrl = 'https://raw.githubusercontent.com/FarmBot-Docs/farmbot-genesis/main/';
const docsBaseUrl = 'https://genesis.farm.bot/v1.8';

const majorParts = [
  'Track Extrusion',
  'Gantry Main Beam',
  'Gantry Column',
  'Cross-Slide Plate',
  'Z-Axis Extrusion',
  'Farmduino',
  'Raspberry Pi',
  'Motor',
  'Encoder',
  'UTM PCB',
  'UTM Cable Y',
  'UTM Cable Z',
  'Solenoid Valve',
  'Vacuum Pump',
  'Watering Nozzle Top',
  'Watering Nozzle Bottom',
  'Seeder',
  'Seed Bin',
  'Seed Tray',
  'Rotary Tool Motor',
  'Rotary Tool PCB',
  'Power Supply',
  'Camera',
  'Toolbay 3-Slot',
  'Belt Clip',
  'Pulley',
  'V-Wheel',
];

const referenceImages = [
  {
    id: 'farmbot-genesis-v1-8-official-product-render',
    label: 'Official FarmBot Genesis v1.8 product reference',
    url: 'https://cdn.shopify.com/s/files/1/2040/0289/files/FarmBot_Genesis_v1.8_Beta.png?v=1732328603',
    sourceUrl: 'https://farm.bot/pages/genesis',
    kind: 'official-product-reference',
    licenseNote: 'FarmBot publishes open-source hardware documentation. Verify current license and purchasing terms before reuse outside connector smoke.',
  },
  {
    id: 'farmbot-genesis-v1-8-official-field-photo',
    label: 'Official FarmBot Genesis installed reference',
    url: 'https://farm.bot/cdn/shop/files/DSC00260_2400x_87666fa7-02d0-41eb-9a12-0cc5938f39be_1349x630.jpg?v=1600237043',
    sourceUrl: 'https://farm.bot/pages/genesis',
    kind: 'official-product-photo',
    licenseNote: 'FarmBot publishes open-source hardware documentation. Verify current license and purchasing terms before reuse outside connector smoke.',
  },
];

const assemblySteps = [
  {
    stepNumber: 1,
    title: 'Prepare supporting infrastructure',
    instructions: 'Confirm the raised bed, power, water, and internet requirements before installing the FarmBot frame.',
    parts: ['Track Extrusion', 'Power Supply', 'Raspberry Pi'],
    estimatedTime: '30-60 min',
    qualityCheck: 'Bed, power, water, and network constraints are ready for machine installation.',
  },
  {
    stepNumber: 2,
    title: 'Install tracks',
    instructions: 'Assemble and mount the track extrusions so the gantry can travel across the growing bed.',
    parts: ['Track Extrusion', 'Flathead Wood Screw T10', 'Gantry Joining Bar'],
    estimatedTime: '45-90 min',
    qualityCheck: 'Tracks are parallel, square, and securely fastened.',
  },
  {
    stepNumber: 3,
    title: 'Build the gantry',
    instructions: 'Assemble gantry columns, the gantry main beam, drivetrain hardware, belts, pulleys, and wheel plates.',
    parts: ['Gantry Main Beam', 'Gantry Column', 'Gantry Wheel Plate', 'Belt Clip', 'Pulley', 'V-Wheel'],
    estimatedTime: '60-120 min',
    qualityCheck: 'Gantry moves smoothly along the tracks without binding.',
  },
  {
    stepNumber: 4,
    title: 'Assemble cross-slide and z-axis',
    instructions: 'Install the cross-slide, z-axis extrusion, motor housing, lead motion, and cable carrier supports.',
    parts: ['Cross-Slide Plate', 'Z-Axis Extrusion', 'Motor', 'Encoder', 'Cable Carrier Z Axis'],
    estimatedTime: '60-120 min',
    qualityCheck: 'Cross-slide and z-axis travel smoothly through their expected ranges.',
  },
  {
    stepNumber: 5,
    title: 'Install toolbays and tools',
    instructions: 'Install toolbays and prepare interchangeable tools including watering, seeding, soil sensing, and rotary tooling.',
    parts: ['Toolbay 3-Slot', 'Watering Nozzle Top', 'Seeder', 'Seed Bin', 'Seed Tray', 'Rotary Tool Motor'],
    estimatedTime: '60-120 min',
    qualityCheck: 'Tools dock, undock, and align with the universal tool mount.',
  },
  {
    stepNumber: 6,
    title: 'Wire electronics',
    instructions: 'Mount and wire the Farmduino, Raspberry Pi, motors, encoders, camera, UTM cables, solenoid valve, and power supply.',
    parts: ['Farmduino', 'Raspberry Pi', 'Camera', 'UTM PCB', 'UTM Cable Y', 'UTM Cable Z', 'Solenoid Valve'],
    estimatedTime: '90-180 min',
    qualityCheck: 'Continuity, polarity, motor, encoder, peripheral, and emergency-stop checks pass.',
  },
  {
    stepNumber: 7,
    title: 'Complete calibration and final checks',
    instructions: 'Run final setup, calibrate movement, verify tool operation, and document the rebuild package.',
    parts: ['Farmduino', 'Raspberry Pi', 'Motor', 'Encoder', 'Camera'],
    estimatedTime: '45-90 min',
    qualityCheck: 'FarmBot moves, senses, and operates tools under reviewed configuration.',
  },
];

const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fetch failed ${response.status}: ${url}`);
  return response.json();
};

const fetchText = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fetch failed ${response.status}: ${url}`);
  return response.text();
};

const unquote = (value = '') => value.trim().replace(/^["']|["']$/g, '');

const parseScalar = (value = '') => {
  const trimmed = unquote(value);
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
};

const parseFrontMatter = (text) => {
  if (!text.startsWith('---')) return {};
  const end = text.indexOf('\n---', 3);
  if (end < 0) return {};
  const lines = text.slice(3, end).split(/\r?\n/);
  const data = {};
  let section = null;

  for (const line of lines) {
    if (!line.trim()) continue;
    const topMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (topMatch) {
      const [, key, value] = topMatch;
      if (value === '') {
        data[key] = {};
        section = key;
      } else {
        data[key] = parseScalar(value);
        section = null;
      }
      continue;
    }

    const nestedMatch = line.match(/^\s{2}([A-Za-z0-9_-]+):\s*(.*)$/);
    if (nestedMatch && section && typeof data[section] === 'object') {
      const [, key, value] = nestedMatch;
      data[section][key] = parseScalar(value);
    }
  }

  return data;
};

const moneyNumber = (value) => {
  const match = String(value || '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
};
const quantityNumber = (value) => {
  const parsed = moneyNumber(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const titleCaseFromSlug = (slug = '') => slug
  .split(/[-_]/)
  .filter(Boolean)
  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
  .join(' ');

const loadParts = async () => {
  const tree = await fetchJson(repoTreeUrl);
  const partPaths = tree.tree
    .filter(item => item.type === 'blob')
    .map(item => item.path)
    .filter(itemPath => /^v1\.8\/bom\/[^/]+\/[^/]+\.md$/.test(itemPath))
    .filter(itemPath => !itemPath.includes('/_images/'))
    .sort();

  const parts = [];
  for (const itemPath of partPaths) {
    const text = await fetchText(`${rawBaseUrl}${itemPath}`);
    const meta = parseFrontMatter(text);
    const category = itemPath.split('/')[2];
    const slug = path.basename(itemPath, '.md');
    const name = meta.title || titleCaseFromSlug(slug);
    const standardQuantity = quantityNumber(meta.quantity?.standard || meta.quantity?.genesis || 0);
    const xlQuantity = quantityNumber(meta.quantity?.xl || 0);
    const price = moneyNumber(meta.price);
    const cost = moneyNumber(meta['internal-specs']?.cost);

    if (!name || standardQuantity <= 0) continue;
    parts.push({
      name,
      category,
      slug,
      quantity: standardQuantity,
      xlQuantity,
      price,
      cost,
      description: meta.description || '',
      cad: meta.cad || '',
      sourceUrl: `${docsBaseUrl}/bom/${category}/${slug}`,
    });
  }
  return parts;
};

const sum = (items, selector) => items.reduce((total, item) => total + selector(item), 0);
const formatMoney = (value) => `$${Math.round(value).toLocaleString('en-US')}`;

const writeJson = (filePath, payload) => {
  const target = path.resolve(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);
  return target;
};

const run = async () => {
  const sourceParts = await loadParts();
  if (sourceParts.length < 25) {
    throw new Error(`Expected at least 25 FarmBot source parts, found ${sourceParts.length}.`);
  }

  const partsByName = new Map(sourceParts.map(part => [part.name.toLowerCase(), part]));
  const selectedParts = majorParts
    .map(name => partsByName.get(name.toLowerCase()) || sourceParts.find(part => part.name.toLowerCase().includes(name.toLowerCase())))
    .filter(Boolean);
  const uniqueSelectedParts = Array.from(new Map(selectedParts.map(part => [part.name, part])).values());
  const partsSubtotal = sum(sourceParts, part => part.price * part.quantity);
  const internalCostSubtotal = sum(sourceParts, part => part.cost * part.quantity);
  if (!Number.isFinite(partsSubtotal) || !Number.isFinite(internalCostSubtotal)) {
    throw new Error('FarmBot pricing totals must be finite numbers.');
  }

  const machine = {
    machineId: 'FARMBOT-GENESIS-V1-8',
    machineName: 'FarmBot Genesis v1.8',
    revision: 'v1.8',
    aliases: [
      'FarmBot',
      'FarmBot Genesis',
      'CNC farming machine',
      'garden robot',
      'gantry farming robot',
      'open-source farming robot',
      'robotic gantry gardener',
    ],
    parts: uniqueSelectedParts.map(part => part.name),
    materials: [
      'silver anodized aluminum',
      'UV stabilized gray ABS',
      'stainless steel hardware',
      'electronics',
      '24V power',
      'Raspberry Pi',
    ],
    assemblySteps,
    pricing: {
      partsSubtotal: formatMoney(partsSubtotal),
      modelingEstimate: '$0-$750',
      fabricationEstimate: `${formatMoney(internalCostSubtotal)}-${formatMoney(partsSubtotal)}`,
      assemblyLaborEstimate: '$300-$1,200',
      totalEstimate: `${formatMoney(partsSubtotal + 300)}-${formatMoney(partsSubtotal + 1950)}`,
      confidence: 'medium-public-bom-estimate',
      sourceNote: 'FarmBot BOM prices are informational and exclude shipping, taxes, import duties, minimum order quantities, waste, and sourcing labor.',
    },
    fulfillmentOptions: [
      {
        vendorName: 'FarmBot Shop',
        serviceType: 'official kit and replacement parts',
        url: 'https://farm.bot/products/farmbot-genesis',
        packageRequired: ['FarmBot Genesis version', 'replacement part list', 'quantity list'],
      },
      {
        vendorName: 'Xometry',
        serviceType: 'machining, sheet metal, and fabrication quote',
        url: 'https://www.xometry.com',
        packageRequired: ['BOM JSON', 'CAD links', 'part drawings', 'materials', 'quantities'],
      },
      {
        vendorName: 'Protolabs',
        serviceType: 'rapid prototyping and fabrication quote',
        url: 'https://www.protolabs.com',
        packageRequired: ['BOM JSON', 'CAD links', 'materials', 'quantities'],
      },
    ],
    sourceLinks: {
      product: 'https://farm.bot/pages/genesis',
      openSource: 'https://farm.bot/pages/open-source',
      documentation: 'https://genesis.farm.bot/v1.8',
      bom: 'https://genesis.farm.bot/v1.8/bom',
      github: 'https://github.com/FarmBot-Docs/farmbot-genesis',
    },
    referenceImages,
    sourceParts,
    notes: 'Generated from public FarmBot Genesis v1.8 documentation for ReversR hosted connector smoke. Human review is required before procurement, fabrication, or assembly.',
  };

  const inventory = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceName: 'FarmBot Genesis public hardware documentation',
    sourceLicenseNote: 'FarmBot publishes open-source hardware documentation. Verify current license and purchasing terms before reuse outside connector smoke.',
    machines: [machine],
  };

  const outputPath = writeJson(outputFile, inventory);
  const evidencePath = writeJson(evidenceFile, {
    schemaVersion: 1,
    status: 'pass',
    generatedAt: inventory.generatedAt,
    outputFile,
    sourcePartCount: sourceParts.length,
    selectedPartCount: uniqueSelectedParts.length,
    machineId: machine.machineId,
    machineName: machine.machineName,
    partsSubtotal: machine.pricing.partsSubtotal,
    sourceLinks: machine.sourceLinks,
    sourceCategories: Array.from(new Set(sourceParts.map(part => part.category))).sort(),
  });

  console.log(`FarmBot inventory written: ${outputPath}`);
  console.log(`Evidence written: ${evidencePath}`);
  console.log(`Source parts: ${sourceParts.length}`);
  console.log(`Selected machine parts: ${uniqueSelectedParts.length}`);
};

run().catch(error => {
  console.error(`FarmBot inventory generation failed: ${error.message}`);
  process.exit(1);
});
