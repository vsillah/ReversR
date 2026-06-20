const http = require('http');
const { spawn } = require('child_process');

const fixturePort = Number(process.env.INVENTORY_PREFLIGHT_FIXTURE_PORT || 3917);
const apiPort = Number(process.env.INVENTORY_PREFLIGHT_API_PORT || 3013);
const credentialRef = 'preflight-api-key';
const fixtureSecret = 'preflight-secret';
const fixturePath = '/machines.json';
const fixtureUrl = `http://127.0.0.1:${fixturePort}${fixturePath}`;

const fixtureInventory = {
  machines: [
    {
      machineId: 'INV-FDM-100',
      machineName: 'Desktop FDM 3D Printer',
      revision: 'PRE-A',
      aliases: ['3d printer', 'fdm printer', 'desktop printer', 'filament printer'],
      parts: [
        'Frame',
        'Heated Bed',
        'Extruder',
        'Stepper Motors',
        'Control Board',
        'Power Supply',
        'Belts',
        'Rails',
        'Nozzle',
        'Display',
      ],
      materials: ['aluminum extrusion', 'borosilicate glass', 'NEMA stepper motors'],
      sourceProvider: 'TraceParts',
      sourceRecordId: 'preflight-traceparts-fdm-motion',
      manufacturer: 'Preflight catalog manufacturer',
      manufacturerPartNumber: 'PRE-FDM-MOTION-001',
      renderProvider: 'TraceParts',
      renderUrl: 'https://www.traceparts.com/',
      viewerUrl: 'https://www.traceparts.com/',
      cadModelUrl: 'https://www.traceparts.com/',
      cadFormats: ['STEP', 'STL', '3D PDF'],
      renderKind: 'provider-hosted-cad-viewer',
      renderProvenance: 'Preflight source-backed CAD/viewer metadata.',
      licenseNote: 'Preflight uses provider links only; do not cache or redistribute catalog CAD assets.',
      assemblySteps: [
        {
          stepNumber: 1,
          title: 'Verify inventory record',
          instructions: 'Confirm machine ID, revision, bed size, firmware family, and required subassemblies.',
          parts: ['Frame', 'Heated Bed', 'Extruder'],
          estimatedTime: '20 min',
          qualityCheck: 'Machine ID and revision match the inventory record.',
        },
        {
          stepNumber: 2,
          title: 'Build frame and motion system',
          instructions: 'Square the frame, install rails, belts, steppers, and bed motion hardware.',
          parts: ['Frame', 'Rails', 'Belts', 'Stepper Motors', 'Heated Bed'],
          estimatedTime: '1-2 hr',
          qualityCheck: 'Axes move freely and frame is square.',
        },
        {
          stepNumber: 3,
          title: 'Install toolhead and electronics',
          instructions: 'Mount extruder, nozzle, power supply, control board, display, and wiring harness.',
          parts: ['Extruder', 'Nozzle', 'Power Supply', 'Control Board', 'Display'],
          estimatedTime: '1 hr',
          qualityCheck: 'Continuity, polarity, and thermal protections pass before power-on.',
        },
      ],
      pricing: {
        partsSubtotal: '$420-$780',
        modelingEstimate: '$300-$900',
        fabricationEstimate: '$500-$1,600',
        assemblyLaborEstimate: '$240-$640',
        totalEstimate: '$1,460-$3,920',
        confidence: 'medium',
      },
      fulfillmentOptions: [
        {
          vendorName: 'Xometry',
          serviceType: '3D modeling and fabrication quote',
          url: 'https://www.xometry.com',
          packageRequired: ['BOM CSV', 'STL/OBJ files', 'assembly notes'],
        },
      ],
    },
    {
      machineId: 'INV-CNC-200',
      machineName: 'Desktop CNC Router',
      revision: 'PRE-B',
      aliases: ['cnc router', 'desktop mill', 'gantry router'],
      parts: ['Frame', 'Spindle', 'Gantry', 'Stepper Motors', 'Control Board', 'Power Supply', 'Linear Rails'],
      materials: ['aluminum extrusion', 'steel rails', 'MDF wasteboard'],
    },
  ],
};

let apiProcess;
let fixtureServer;
let fixtureRequestCount = 0;
let authorizedFixtureRequestCount = 0;
const apiLogs = [];

const fail = (message) => {
  throw new Error(message);
};

const assert = (condition, message) => {
  if (!condition) fail(message);
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const readJson = async (response) => {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`Expected JSON response, received: ${text.slice(0, 300)}`);
  }
};

const postJson = async (url, body) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return {
    response,
    body: await readJson(response),
  };
};

const startFixtureServer = () => new Promise((resolve, reject) => {
  fixtureServer = http.createServer((req, res) => {
    fixtureRequestCount += 1;

    if (req.url !== fixturePath) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }

    if (req.headers['x-api-key'] !== fixtureSecret) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'missing fixture API key' }));
      return;
    }

    authorizedFixtureRequestCount += 1;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(fixtureInventory));
  });

  fixtureServer.once('error', reject);
  fixtureServer.listen(fixturePort, '127.0.0.1', () => resolve());
});

const startApiServer = () => {
  const env = {
    ...process.env,
    API_PORT: String(apiPort),
    API_CORS_ORIGINS: 'https://reversr-rebuild.local',
    API_REQUEST_BODY_LIMIT: '25mb',
    ADMIN_API_TOKEN: 'preflight-admin-token',
    INVENTORY_CONNECTOR_SECRETS_FILE: '',
    INVENTORY_CONNECTOR_SECRETS_JSON: JSON.stringify({
      [credentialRef]: {
        headerName: 'X-API-Key',
        value: fixtureSecret,
      },
    }),
    INVENTORY_PRIVATE_NETWORK_ENABLED: 'false',
    AI_INTEGRATIONS_GEMINI_API_KEY: '',
    GEMINI_API_KEYS: '',
  };

  apiProcess = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const captureLog = (chunk) => {
    const text = String(chunk).trim();
    if (!text) return;
    apiLogs.push(text);
    if (apiLogs.length > 20) apiLogs.shift();
  };

  apiProcess.stdout.on('data', captureLog);
  apiProcess.stderr.on('data', captureLog);
};

const waitForApi = async () => {
  const healthUrl = `http://127.0.0.1:${apiPort}/api/health`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (apiProcess?.exitCode != null) {
      fail(`API server exited early with code ${apiProcess.exitCode}. Logs:\n${apiLogs.join('\n')}`);
    }

    try {
      const response = await fetch(healthUrl);
      if (response.ok) return readJson(response);
    } catch {
      // Keep waiting until the child process is listening.
    }

    await sleep(250);
  }

  fail(`Timed out waiting for API server on port ${apiPort}. Logs:\n${apiLogs.join('\n')}`);
};

const cleanup = async () => {
  const tasks = [];
  if (apiProcess && apiProcess.exitCode == null) {
    tasks.push(new Promise(resolve => {
      apiProcess.once('exit', resolve);
      apiProcess.kill('SIGTERM');
      setTimeout(() => {
        if (apiProcess.exitCode == null) apiProcess.kill('SIGKILL');
      }, 2000).unref();
    }));
  }
  if (fixtureServer) {
    tasks.push(new Promise(resolve => fixtureServer.close(resolve)));
  }
  await Promise.allSettled(tasks);
};

process.once('SIGINT', async () => {
  await cleanup();
  process.exit(130);
});

process.once('SIGTERM', async () => {
  await cleanup();
  process.exit(143);
});

const connector = {
  sourceName: 'Protected Preflight Inventory',
  sourceUrl: fixtureUrl,
  connectorType: 'json',
  authMode: 'api_key',
  credentialRef,
  notes: 'Local protected fixture used by inventory connector preflight.',
};

const analysis = {
  productName: 'Desktop FDM 3D Printer',
  rawAnalysis: 'The photo shows a desktop FDM 3D printer with an aluminum frame, heated bed, extruder, display, rails, belts, stepper motors, control board, and power supply.',
  components: [
    { name: 'Frame', description: 'Aluminum extrusion frame.', isEssential: true },
    { name: 'Heated Bed', description: 'Heated print bed.', isEssential: true },
    { name: 'Extruder', description: 'Filament extrusion toolhead.', isEssential: true },
    { name: 'Stepper Motors', description: 'Motion motors.', isEssential: true },
    { name: 'Control Board', description: 'Motion control electronics.', isEssential: true },
    { name: 'Power Supply', description: 'Machine power module.', isEssential: true },
  ],
};

const run = async () => {
  await startFixtureServer();
  startApiServer();

  const health = await waitForApi();
  assert(health.status === 'ok', 'API health did not return ok.');
  assert(health.runtimeConfig?.corsMode === 'restricted', 'API preflight server should run with restricted CORS.');
  assert(health.runtimeConfig?.requestBodyLimit === '25mb', 'API preflight server should report the configured body limit.');
  assert(health.credentialCount >= 1, 'API health should see the configured connector credential.');

  const missingCredential = await postJson(`http://127.0.0.1:${apiPort}/api/inventory/validate`, {
    connector: { ...connector, credentialRef: 'missing-ref' },
  });
  assert(!missingCredential.response.ok, 'Validation should reject a missing credentialRef.');
  assert(
    /No backend credential/.test(missingCredential.body.error || ''),
    'Missing credential validation did not report the expected backend credential error.'
  );

  const validation = await postJson(`http://127.0.0.1:${apiPort}/api/inventory/validate`, { connector });
  assert(validation.response.ok, `Inventory validation failed: ${validation.body.error || validation.response.status}`);
  assert(validation.body.status === 'ok', 'Inventory validation status should be ok.');
  assert(validation.body.credentialStatus === 'configured', 'Credential status should be configured.');
  assert(validation.body.recordCount === fixtureInventory.machines.length, 'Inventory validation should read all fixture machines.');
  assert(
    validation.body.sampleMachines?.some(machine => machine.machineId === 'INV-FDM-100'),
    'Inventory validation sample should include the FDM printer.'
  );
  assert(validation.body.sourceHealth?.hasDatabase3DRender === true, 'Inventory validation should report source-backed 3D render coverage.');
  assert(validation.body.sourceHealth?.hasCadModelLink === true, 'Inventory validation should report CAD link coverage.');
  assert(validation.body.sourceHealth?.usedAiVisualFallback === false, 'Inventory validation should prefer source visuals before AI fallback.');
  assert(!JSON.stringify(validation.body).includes(fixtureSecret), 'Inventory validation response leaked the raw fixture secret.');

  const match = await postJson(`http://127.0.0.1:${apiPort}/api/gemini/match-machine`, {
    analysis,
    connector,
  });
  assert(match.response.ok, `Inventory match failed: ${match.body.error || match.response.status}`);
  assert(match.body.patternUsed === 'inventory_match', 'Machine match should use the inventory_match pattern.');
  assert(match.body.machineId === 'INV-FDM-100', `Expected INV-FDM-100, found ${match.body.machineId || '(none)'}.`);
  assert(Number(match.body.confidenceScore) > 0.5, 'Machine match confidence should be above 0.5 for the fixture.');
  assert(Array.isArray(match.body.assemblySteps) && match.body.assemblySteps.length >= 2, 'Machine match should include assembly steps.');
  assert(match.body.pricing?.totalEstimate, 'Machine match should include pricing totalEstimate.');
  assert(Array.isArray(match.body.fulfillmentOptions) && match.body.fulfillmentOptions.length >= 1, 'Machine match should include fulfillment options.');
  assert(match.body.hasDatabase3DRender === true, 'Machine match should carry source-backed 3D render metadata.');
  assert(match.body.visualEvidenceSource === 'database_3d_render', 'Machine match should prefer database 3D render evidence.');
  assert(match.body.usedAiVisualFallback === false, 'Machine match should not mark AI visual fallback when provider render metadata exists.');

  const scene = await postJson(`http://127.0.0.1:${apiPort}/api/gemini/generate-3d`, {
    innovation: match.body,
  });
  assert(scene.response.ok, `3D source render failed: ${scene.body.error || scene.response.status}`);
  assert(scene.body.hasDatabase3DRender === true, '3D endpoint should return source-backed database render proof.');
  assert(scene.body.usedAiVisualFallback === false, '3D endpoint should not use AI fallback for source-backed records.');
  assert(scene.body.visualEvidenceSource === 'database_3d_render', '3D endpoint should report database_3d_render visual evidence.');
  assert(scene.body.sourceRender?.viewerUrl, '3D endpoint should return provider viewer metadata.');

  const bom = await postJson(`http://127.0.0.1:${apiPort}/api/gemini/generate-bom`, {
    innovation: match.body,
    analysis,
  });
  assert(bom.response.ok, `BOM generation failed: ${bom.body.error || bom.response.status}`);
  assert(Array.isArray(bom.body.items) && bom.body.items.length >= 4, 'BOM should include multiple reconstruction parts.');
  assert(bom.body.items.some(item => item.partName === 'Frame'), 'BOM should include the frame.');
  assert(bom.body.totalEstimatedCost, 'BOM should include totalEstimatedCost.');

  assert(fixtureRequestCount >= 2, 'Fixture inventory should have been requested during validation and matching.');
  assert(authorizedFixtureRequestCount >= 2, 'Protected fixture should have received authorized requests.');

  console.log('Inventory connector preflight passed.');
  console.log(`- protected inventory fixture: ${fixtureUrl}`);
  console.log(`- credentialRef verified: ${credentialRef}`);
  console.log(`- matched machine: ${match.body.machineId} (${match.body.machineName})`);
  console.log(`- source-backed 3D: ${scene.body.sourceRender.renderProvider} (${scene.body.visualEvidenceSource})`);
  console.log(`- BOM items: ${bom.body.items.length}`);
};

run()
  .catch(error => {
    console.error('Inventory connector preflight failed:');
    console.error(error.message || error);
    if (apiLogs.length > 0) {
      console.error('API logs:');
      console.error(apiLogs.join('\n'));
    }
    process.exitCode = 1;
  })
  .finally(cleanup);
