const fs = require('fs');

const args = process.argv.slice(2);
const allowFallbacks = args.includes('--allow-fallbacks');
const sourceArg = args.find(arg => !arg.startsWith('--'));
const sourcePath = process.env.MACHINE_INVENTORY_FILE || sourceArg || 'docs/sample-machine-inventory.csv';

const failures = [];
const warnings = [];

const fail = (message) => failures.push(message);
const warn = (message) => warnings.push(message);

const splitList = (value) => {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  if (value == null) return [];
  return String(value)
    .split(/[|;,]/)
    .map(item => item.trim())
    .filter(Boolean);
};

const parseJsonField = (record, field, expectedType) => {
  const value = record[field];
  if (value == null || value === '') return undefined;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(String(value));
    if (expectedType === 'array' && !Array.isArray(parsed)) {
      fail(`${record.machineId || record.id || 'record'} ${field} must be a JSON array.`);
    }
    if (expectedType === 'object' && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) {
      fail(`${record.machineId || record.id || 'record'} ${field} must be a JSON object.`);
    }
    return parsed;
  } catch (error) {
    fail(`${record.machineId || record.id || 'record'} ${field} is not valid JSON: ${error.message}`);
    return undefined;
  }
};

const parseCsv = (text) => {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field);
      if (row.some(value => value.trim() !== '')) rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += char;
  }

  if (field || row.length) {
    row.push(field);
    if (row.some(value => value.trim() !== '')) rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map(header => header.trim());
  return rows.slice(1).map((values, index) => {
    const record = { sourceRow: index + 2 };
    headers.forEach((header, headerIndex) => {
      record[header] = values[headerIndex] == null ? '' : values[headerIndex].trim();
    });
    return record;
  });
};

const recordsFromJson = (payload) => {
  if (Array.isArray(payload)) return payload;
  for (const key of ['machines', 'items', 'records', 'data']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
};

const loadRecords = (filePath) => {
  const text = fs.readFileSync(filePath, 'utf8');
  if (filePath.toLowerCase().endsWith('.csv')) return parseCsv(text);
  return recordsFromJson(JSON.parse(text));
};

if (!fs.existsSync(sourcePath)) {
  fail(`Machine inventory file does not exist: ${sourcePath}`);
}

let records = [];
if (failures.length === 0) {
  try {
    records = loadRecords(sourcePath);
  } catch (error) {
    fail(`Could not parse machine inventory file: ${error.message}`);
  }
}

if (records.length === 0 && failures.length === 0) {
  fail('Machine inventory must contain at least one record.');
}

const ids = new Set();
const names = new Set();
let recordsWithAssembly = 0;
let recordsWithPricing = 0;
let recordsWithVendors = 0;
let recordsWithDatabase3DRender = 0;
let recordsWithCadModelLink = 0;
let totalParts = 0;

records.forEach((record, index) => {
  const rowLabel = record.sourceRow ? `row ${record.sourceRow}` : `record ${index + 1}`;
  const machineId = String(record.machineId || record.id || record.sku || record.assetId || '').trim();
  const machineName = String(record.machineName || record.name || record.title || record.model || '').trim();
  const parts = splitList(record.parts || record.components || record.bomParts || record.requiredParts);

  if (!machineId) fail(`${rowLabel} is missing machineId.`);
  if (!machineName) fail(`${rowLabel} is missing machineName.`);
  if (machineId && ids.has(machineId)) fail(`Duplicate machineId found: ${machineId}`);
  if (machineId) ids.add(machineId);
  if (machineName) names.add(machineName.toLowerCase());

  if (parts.length < 3) fail(`${machineId || rowLabel} must include at least three parts/components for reliable matching.`);
  totalParts += parts.length;

  const aliases = splitList(record.aliases || record.keywords || record.tags);
  if (aliases.length === 0) warn(`${machineId || rowLabel} has no aliases; scan matching may be weaker.`);

  const assemblySteps = parseJsonField(record, 'assemblySteps', 'array') || parseJsonField(record, 'steps', 'array');
  if (Array.isArray(assemblySteps) && assemblySteps.length > 0) {
    recordsWithAssembly += 1;
    assemblySteps.forEach((step, stepIndex) => {
      const prefix = `${machineId || rowLabel} assemblySteps[${stepIndex}]`;
      if (!step.title) fail(`${prefix} is missing title.`);
      if (!step.instructions) fail(`${prefix} is missing instructions.`);
      if (!Array.isArray(step.parts) || step.parts.length === 0) warn(`${prefix} has no step parts.`);
    });
  } else if (!allowFallbacks) {
    fail(`${machineId || rowLabel} is missing assemblySteps. Pass --allow-fallbacks only when server-generated fallback steps are acceptable.`);
  } else {
    warn(`${machineId || rowLabel} will rely on fallback assembly steps.`);
  }

  const pricing = parseJsonField(record, 'pricing', 'object') || parseJsonField(record, 'pricingSnapshot', 'object');
  if (pricing && Object.keys(pricing).length > 0) {
    recordsWithPricing += 1;
    if (!pricing.totalEstimate) warn(`${machineId || rowLabel} pricing is missing totalEstimate.`);
  } else if (!allowFallbacks) {
    fail(`${machineId || rowLabel} is missing pricing. Pass --allow-fallbacks only when server-generated fallback pricing is acceptable.`);
  } else {
    warn(`${machineId || rowLabel} will rely on fallback pricing.`);
  }

  const vendors = parseJsonField(record, 'modelingVendors', 'array') || parseJsonField(record, 'fulfillmentOptions', 'array') || parseJsonField(record, 'vendors', 'array');
  if (Array.isArray(vendors) && vendors.length > 0) {
    recordsWithVendors += 1;
    vendors.forEach((vendor, vendorIndex) => {
      const prefix = `${machineId || rowLabel} vendor[${vendorIndex}]`;
      if (!vendor.vendorName) fail(`${prefix} is missing vendorName.`);
      if (!vendor.serviceType) warn(`${prefix} is missing serviceType.`);
      if (!vendor.url || !/^https:\/\//i.test(vendor.url)) warn(`${prefix} should include an HTTPS vendor URL.`);
    });
  } else {
    warn(`${machineId || rowLabel} has no modeling/fabrication vendor options.`);
  }

  const sourceProvider = String(record.sourceProvider || record.provider || record.catalogProvider || '').trim();
  const renderProvider = String(record.renderProvider || sourceProvider || '').trim();
  const renderUrl = String(record.renderUrl || '').trim();
  const viewerUrl = String(record.viewerUrl || '').trim();
  const cadModelUrl = String(record.cadModelUrl || record.cadUrl || '').trim();
  const cadFormats = splitList(record.cadFormats || record.availableFormats);
  const hasDatabase3DRender = Boolean(renderUrl || viewerUrl || cadModelUrl);

  if (hasDatabase3DRender) {
    recordsWithDatabase3DRender += 1;
    if (!sourceProvider) warn(`${machineId || rowLabel} has source-backed 3D evidence but no sourceProvider.`);
    if (!renderProvider) warn(`${machineId || rowLabel} has source-backed 3D evidence but no renderProvider.`);
    if (!record.renderProvenance) warn(`${machineId || rowLabel} has source-backed 3D evidence but no renderProvenance.`);
    if (!record.licenseNote) warn(`${machineId || rowLabel} has source-backed 3D evidence but no licenseNote.`);
  }

  if (cadModelUrl || cadFormats.length > 0) {
    recordsWithCadModelLink += 1;
    if (cadModelUrl && !/^https:\/\//i.test(cadModelUrl)) warn(`${machineId || rowLabel} cadModelUrl should be HTTPS.`);
    if (cadFormats.length === 0) warn(`${machineId || rowLabel} has a CAD model URL but no cadFormats list.`);
  }
});

if (names.size < records.length) {
  warn('One or more records share a machine name; keep machineId stable for matching and BOM exports.');
}

if (warnings.length > 0) {
  console.log('Warnings:');
  for (const message of warnings) console.log(`- ${message}`);
}

if (failures.length > 0) {
  console.error('Machine inventory validation failed:');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log(`Machine inventory validation passed for ${sourcePath}.`);
console.log(`Records: ${records.length}`);
console.log(`Unique machine IDs: ${ids.size}`);
console.log(`Average parts per record: ${(totalParts / records.length).toFixed(1)}`);
console.log(`Records with assembly steps: ${recordsWithAssembly}`);
console.log(`Records with pricing: ${recordsWithPricing}`);
console.log(`Records with modeling vendors: ${recordsWithVendors}`);
console.log(`Records with database 3D render evidence: ${recordsWithDatabase3DRender}`);
console.log(`Records with CAD model links or formats: ${recordsWithCadModelLink}`);
