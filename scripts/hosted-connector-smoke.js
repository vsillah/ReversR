const fs = require('fs');
const path = require('path');

const args = new Set(process.argv.slice(2));
const allowOpenCors = args.has('--allow-open-cors');
const allowInsecureConnector = args.has('--allow-insecure-connector');
const allowDemoConnector = args.has('--allow-demo-connector');

const apiBase = (process.env.EXPO_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || '').replace(/\/$/, '');
const evidenceFile = process.env.CONNECTOR_SMOKE_EVIDENCE_FILE || 'docs/hosted-connector-smoke-evidence.json';
const isLocalApi = /:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/.test(apiBase);
const isPlaceholder = (value = '') => /example\.(com|net|org)|your-domain\.example/i.test(String(value));
const isLocalUrl = (value = '') => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(String(value));

const parseJsonEnv = (name, fallback) => {
  const raw = process.env[name];
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${name} must be valid JSON: ${error.message}`);
  }
};

const inferConnectorType = (sourceUrl = '') => {
  const lower = sourceUrl.toLowerCase();
  if (lower.startsWith('demo://')) return 'demo';
  if (lower.includes('.csv')) return 'csv';
  return 'json';
};

const defaultAnalysis = {
  productName: process.env.CONNECTOR_SMOKE_PRODUCT_NAME || 'FarmBot Genesis v1.8',
  rawAnalysis: process.env.CONNECTOR_SMOKE_RAW_ANALYSIS || 'The scan shows a FarmBot Genesis v1.8 CNC farming machine with track extrusions, gantry main beam, gantry columns, cross-slide plate, z-axis extrusion, Farmduino, Raspberry Pi, motors, encoders, UTM PCB, solenoid valve, vacuum pump, watering tools, seeder, camera, belts, pulleys, and v-wheels.',
  components: parseJsonEnv('CONNECTOR_SMOKE_COMPONENTS_JSON', [
    { name: 'Track Extrusion', description: 'FarmBot track rail extrusion.', isEssential: true },
    { name: 'Gantry Main Beam', description: 'Primary gantry structure.', isEssential: true },
    { name: 'Farmduino', description: 'FarmBot control electronics.', isEssential: true },
    { name: 'Raspberry Pi', description: 'FarmBot controller computer.', isEssential: true },
    { name: 'UTM PCB', description: 'Universal tool mount electronics.', isEssential: true },
    { name: 'Solenoid Valve', description: 'Watering control valve.', isEssential: true },
    { name: 'Vacuum Pump', description: 'Seeder vacuum system.', isEssential: true },
    { name: 'Power Supply', description: 'Power conversion module.', isEssential: true },
  ]),
};

const buildConnector = () => {
  const connectorJson = parseJsonEnv('CONNECTOR_SMOKE_CONNECTOR_JSON', null);
  const connector = connectorJson || {
    sourceName: process.env.CONNECTOR_SMOKE_SOURCE_NAME || 'Production Machine Inventory',
    sourceUrl: process.env.CONNECTOR_SMOKE_SOURCE_URL || '',
    connectorType: process.env.CONNECTOR_SMOKE_CONNECTOR_TYPE || inferConnectorType(process.env.CONNECTOR_SMOKE_SOURCE_URL || ''),
    authMode: process.env.CONNECTOR_SMOKE_AUTH_MODE || 'none',
    credentialRef: process.env.CONNECTOR_SMOKE_CREDENTIAL_REF || '',
    notes: 'Hosted connector smoke metadata. Raw secrets remain on the API host.',
  };

  const forbiddenKeys = ['value', 'apiKey', 'token', 'accessToken', 'headers'];
  const connectorText = JSON.stringify(connector);
  for (const key of forbiddenKeys) {
    if (Object.prototype.hasOwnProperty.call(connector, key) || connectorText.includes(`"${key}"`)) {
      throw new Error(`CONNECTOR_SMOKE_CONNECTOR_JSON must not include raw secret field "${key}". Configure secrets on the API host and send only credentialRef.`);
    }
  }

  return {
    ...connector,
    authMode: connector.authMode || 'none',
    connectorType: connector.connectorType || inferConnectorType(connector.sourceUrl || ''),
  };
};

const postJson = async (url, body) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  return { response, parsed };
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const writeJson = (filePath, value) => {
  const target = path.resolve(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
  return target;
};

const run = async () => {
  if (!apiBase || isPlaceholder(apiBase)) {
    throw new Error('Set EXPO_PUBLIC_API_BASE_URL or API_BASE_URL to the hosted API URL before running connector smoke.');
  }

  const connector = buildConnector();
  if (!connector.sourceUrl || isPlaceholder(connector.sourceUrl)) {
    throw new Error('Set CONNECTOR_SMOKE_SOURCE_URL or CONNECTOR_SMOKE_CONNECTOR_JSON to the real inventory source before running connector smoke.');
  }

  if (connector.sourceUrl.startsWith('demo://') && !isLocalApi && !allowDemoConnector) {
    throw new Error('Hosted connector smoke should use a real inventory source. Pass --allow-demo-connector only for controlled prototype checks.');
  }

  if (!/^https:\/\//i.test(connector.sourceUrl) && !isLocalUrl(connector.sourceUrl) && connector.sourceUrl !== 'demo://sample-machines' && !allowInsecureConnector) {
    throw new Error('Production connector smoke requires an HTTPS inventory source. Pass --allow-insecure-connector only for controlled local testing.');
  }

  if (connector.authMode !== 'none' && !connector.credentialRef) {
    throw new Error('Authenticated connector smoke requires CONNECTOR_SMOKE_CREDENTIAL_REF. Raw secrets must stay on the API host.');
  }

  const healthResponse = await fetch(`${apiBase}/api/health`);
  assert(healthResponse.ok, `/api/health failed with ${healthResponse.status}`);
  const health = await healthResponse.json();
  assert(health.status === 'ok', `/api/health returned non-ok status: ${JSON.stringify(health)}`);
  assert(health.runtimeConfig, '/api/health is missing runtimeConfig; deploy the hardened API server before connector smoke.');
  if (health.runtimeConfig.corsMode === 'open' && !isLocalApi && !allowOpenCors) {
    throw new Error('Hosted API reports open CORS. Set API_CORS_ORIGINS to the hosted app origins or pass --allow-open-cors only for controlled prototype checks.');
  }

  const validation = await postJson(`${apiBase}/api/inventory/validate`, { connector });
  assert(validation.response.ok, `/api/inventory/validate failed with ${validation.response.status}: ${JSON.stringify(validation.parsed)}`);
  assert(validation.parsed.status === 'ok', `Inventory validation returned non-ok status: ${JSON.stringify(validation.parsed)}`);
  assert(Number(validation.parsed.recordCount) >= 1, 'Inventory validation should read at least one machine record.');
  if (connector.authMode !== 'none') {
    assert(validation.parsed.credentialStatus === 'configured', `Expected credentialStatus configured, found ${validation.parsed.credentialStatus || '(missing)'}.`);
  }

  const analysis = parseJsonEnv('CONNECTOR_SMOKE_ANALYSIS_JSON', defaultAnalysis);
  const match = await postJson(`${apiBase}/api/gemini/match-machine`, {
    analysis,
    connector,
  });
  assert(match.response.ok, `/api/gemini/match-machine failed with ${match.response.status}: ${JSON.stringify(match.parsed)}`);
  assert(match.parsed.patternUsed === 'inventory_match', 'Machine match should return patternUsed inventory_match.');
  assert(match.parsed.machineId, 'Machine match should return machineId.');
  assert(Array.isArray(match.parsed.assemblySteps) && match.parsed.assemblySteps.length >= 1, 'Machine match should include assembly steps.');
  assert(match.parsed.pricing?.totalEstimate, 'Machine match should include pricing.totalEstimate.');
  assert(Array.isArray(match.parsed.fulfillmentOptions), 'Machine match should include fulfillmentOptions.');

  if (process.env.CONNECTOR_SMOKE_EXPECT_DATABASE_3D_RENDER === 'true') {
    assert(match.parsed.hasDatabase3DRender === true, 'Expected machine match to include source-backed database 3D render metadata.');
    assert(match.parsed.usedAiVisualFallback === false, 'Expected source-backed database 3D render to prevent AI visual fallback.');
  }

  const expectedMachineId = process.env.CONNECTOR_SMOKE_EXPECTED_MACHINE_ID;
  if (expectedMachineId) {
    assert(match.parsed.machineId === expectedMachineId, `Expected machineId ${expectedMachineId}, found ${match.parsed.machineId}.`);
  }

  const minimumConfidence = Number(process.env.CONNECTOR_SMOKE_MIN_CONFIDENCE || 0.2);
  assert(Number(match.parsed.confidenceScore || 0) >= minimumConfidence, `Match confidence ${match.parsed.confidenceScore || 0} is below ${minimumConfidence}.`);

  const bom = await postJson(`${apiBase}/api/gemini/generate-bom`, {
    innovation: match.parsed,
    analysis,
  });
  assert(bom.response.ok, `/api/gemini/generate-bom failed with ${bom.response.status}: ${JSON.stringify(bom.parsed)}`);
  assert(Array.isArray(bom.parsed.items) && bom.parsed.items.length >= 1, 'BOM should include at least one item.');
  assert(bom.parsed.totalEstimatedCost, 'BOM should include totalEstimatedCost.');
  assert(!/NaN/i.test(String(bom.parsed.totalEstimatedCost)), `BOM totalEstimatedCost must be numeric, found ${bom.parsed.totalEstimatedCost}.`);

  let scene = null;
  if (match.parsed.hasDatabase3DRender || process.env.CONNECTOR_SMOKE_EXPECT_DATABASE_3D_RENDER === 'true') {
    scene = await postJson(`${apiBase}/api/gemini/generate-3d`, {
      innovation: match.parsed,
    });
    assert(scene.response.ok, `/api/gemini/generate-3d failed with ${scene.response.status}: ${JSON.stringify(scene.parsed)}`);
    assert(scene.parsed.hasDatabase3DRender === true, '3D endpoint should return database 3D render proof when source metadata exists.');
    assert(scene.parsed.usedAiVisualFallback === false, '3D endpoint should not use AI visual fallback when source metadata exists.');
    assert(scene.parsed.sourceRender?.viewerUrl || scene.parsed.sourceRender?.renderUrl || scene.parsed.sourceRender?.cadModelUrl, '3D endpoint should include provider render/viewer/CAD metadata.');
  }

  const evidence = {
    schemaVersion: 1,
    status: 'pass',
    generatedAt: new Date().toISOString(),
    apiBaseUrl: apiBase,
    localApi: isLocalApi,
    connector: {
      sourceName: connector.sourceName || '',
      sourceUrl: connector.sourceUrl || '',
      connectorType: connector.connectorType || '',
      authMode: connector.authMode || 'none',
      credentialRefConfigured: Boolean(connector.credentialRef),
      notes: connector.notes || '',
    },
    validation: {
      status: validation.parsed.status,
      recordCount: Number(validation.parsed.recordCount || 0),
      credentialStatus: validation.parsed.credentialStatus || (connector.authMode === 'none' ? 'not-required' : ''),
    },
    match: {
      patternUsed: match.parsed.patternUsed,
      machineId: match.parsed.machineId,
      machineName: match.parsed.machineName || '',
      confidenceScore: Number(match.parsed.confidenceScore || 0),
      evidence: match.parsed.evidence || '',
      assemblyStepCount: Array.isArray(match.parsed.assemblySteps) ? match.parsed.assemblySteps.length : 0,
      fulfillmentOptionCount: Array.isArray(match.parsed.fulfillmentOptions) ? match.parsed.fulfillmentOptions.length : 0,
      totalEstimate: match.parsed.pricing?.totalEstimate || '',
      hasDatabase3DRender: Boolean(match.parsed.hasDatabase3DRender),
      usedAiVisualFallback: Boolean(match.parsed.usedAiVisualFallback),
      visualEvidenceSource: match.parsed.visualEvidenceSource || '',
    },
    bom: {
      itemCount: bom.parsed.items.length,
      totalEstimatedCost: bom.parsed.totalEstimatedCost,
    },
    sourceBacked3D: scene ? {
      status: 'verified',
      renderProvider: scene.parsed.sourceRender?.renderProvider || '',
      visualEvidenceSource: scene.parsed.visualEvidenceSource || '',
      hasViewerOrCadLink: Boolean(scene.parsed.sourceRender?.viewerUrl || scene.parsed.sourceRender?.renderUrl || scene.parsed.sourceRender?.cadModelUrl),
    } : {
      status: 'not_applicable',
      reason: 'Matched source did not report database 3D render metadata.',
    },
    safety: {
      rawSecretsIncluded: false,
      secretHandling: 'Connector smoke sends credentialRef metadata only. Raw connector secrets must remain server-side.',
    },
  };
  const evidencePath = writeJson(evidenceFile, evidence);

  console.log(`Hosted connector smoke passed for ${apiBase}`);
  console.log(`Inventory source: ${connector.sourceName || 'Inventory'} | records: ${validation.parsed.recordCount}`);
  console.log(`Matched machine: ${match.parsed.machineId} (${match.parsed.machineName || 'unnamed'}) | confidence: ${match.parsed.confidenceScore}`);
  console.log(`BOM items: ${bom.parsed.items.length} | estimated cost: ${bom.parsed.totalEstimatedCost}`);
  console.log(`Evidence written: ${evidencePath}`);
};

run().catch(error => {
  console.error(`Hosted connector smoke failed: ${error.message}`);
  process.exit(1);
});
