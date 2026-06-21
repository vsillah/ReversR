const { spawn } = require('child_process');
const path = require('path');
const { MIN_MATCH_CANDIDATE_SCORE } = require('../server/inventoryMatcher');

const apiPort = Number(process.env.PROFESSIONAL_MATCH_SMOKE_API_PORT || 3014);
const apiBase = `http://127.0.0.1:${apiPort}`;
const repoRoot = process.cwd();
const apiLogs = [];

let apiProcess;

const fail = (message) => {
  throw new Error(message);
};

const assert = (condition, message) => {
  if (!condition) fail(message);
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const postJson = async (pathname, body) => {
  const response = await fetch(`${apiBase}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    fail(`Expected JSON from ${pathname}, received: ${text.slice(0, 300)}`);
  }
  return { response, body: parsed };
};

const startApiServer = () => {
  const env = {
    ...process.env,
    API_PORT: String(apiPort),
    API_CORS_ORIGINS: 'https://reversr-rebuild.local',
    API_REQUEST_BODY_LIMIT: '25mb',
    ADMIN_API_TOKEN: 'professional-match-smoke-token',
    INVENTORY_CONNECTOR_SECRETS_FILE: '',
    INVENTORY_CONNECTOR_SECRETS_JSON: '{}',
    AI_INTEGRATIONS_GEMINI_API_KEY: '',
    GEMINI_API_KEYS: '',
  };

  apiProcess = spawn(process.execPath, ['server/index.js'], {
    cwd: repoRoot,
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
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (apiProcess?.exitCode != null) {
      fail(`API server exited early with code ${apiProcess.exitCode}. Logs:\n${apiLogs.join('\n')}`);
    }

    try {
      const response = await fetch(`${apiBase}/api/health`);
      if (response.ok) return;
    } catch {
      // Keep waiting until the child process is listening.
    }

    await sleep(250);
  }

  fail(`Timed out waiting for API server on port ${apiPort}. Logs:\n${apiLogs.join('\n')}`);
};

const cleanup = async () => {
  if (!apiProcess || apiProcess.exitCode != null) return;
  await new Promise(resolve => {
    apiProcess.once('exit', resolve);
    apiProcess.kill('SIGTERM');
    setTimeout(() => {
      if (apiProcess.exitCode == null) apiProcess.kill('SIGKILL');
    }, 2000).unref();
  });
};

const weakAnalysis = {
  productName: 'Professional source sample',
  rawAnalysis: 'The scan step prepared a source-backed professional catalog sample for inventory matching.',
  components: [
    { name: 'Drive assembly', description: 'Generic motion assembly.', isEssential: true },
    { name: 'Control module', description: 'Generic control assembly.', isEssential: true },
    { name: 'Fasteners', description: 'Generic mounting hardware.', isEssential: true },
  ],
  neighborhoodResources: ['inventory connector', 'catalog source'],
  attributes: [
    { name: 'Sample source', value: 'professional inventory source', type: 'Qualitative' },
  ],
  closedWorldBoundary: 'Professional inventory sample should match the selected source fixture.',
};

const cases = [
  {
    label: 'TraceParts linear actuator sample',
    expectedMachineId: 'TRACEPARTS-LINEAR-ACTUATOR-MODULE',
    connector: {
      sourceName: 'TraceParts Industrial Components Pilot',
      sourceUrl: `file://${path.join(repoRoot, 'public/inventory/traceparts-industrial-components.json')}`,
      connectorType: 'api',
      authMode: 'none',
    },
    scanInput: 'A linear actuator motion module with ball screw actuator, linear guide rail, stepper motor, limit switch, flexible coupling, mounting bracket, fastener kit, and provider CAD/viewer references.',
  },
  {
    label: 'TraceParts actuator rebuild sample',
    expectedMachineId: 'TRACEPARTS-LINEAR-ACTUATOR-MODULE',
    connector: {
      sourceName: 'TraceParts Industrial Components Pilot',
      sourceUrl: `file://${path.join(repoRoot, 'public/inventory/traceparts-industrial-components.json')}`,
      connectorType: 'api',
      authMode: 'none',
    },
    scanInput: 'A source-backed actuator rebuild assembly from a professional parts catalog with guide rail, motor coupling, endstop switch, aluminum bracket, hardened steel screw, and STEP/STL CAD format availability.',
  },
  {
    label: 'CADENAS gantry swap sample',
    expectedMachineId: 'CADENAS-GANTRY-SWAP-KIT',
    connector: {
      sourceName: 'CADENAS 3Dfindit Industrial Components Pilot',
      sourceUrl: `file://${path.join(repoRoot, 'public/inventory/cadenas-industrial-components.json')}`,
      connectorType: 'api',
      authMode: 'none',
    },
    scanInput: 'A gantry motion swap kit with profile rail guide, bearing carriage, timing belt, pulley set, stepper motor, gantry plate, cable carrier, and configurable provider 3D/CAD evidence.',
  },
  {
    label: 'CADENAS desktop CNC sample',
    expectedMachineId: 'CADENAS-GANTRY-SWAP-KIT',
    connector: {
      sourceName: 'CADENAS 3Dfindit Industrial Components Pilot',
      sourceUrl: `file://${path.join(repoRoot, 'public/inventory/cadenas-industrial-components.json')}`,
      connectorType: 'api',
      authMode: 'none',
    },
    scanInput: 'A desktop CNC gantry assembly with linear rails, bearing blocks, belt drive, pulleys, aluminum plate, cable carrier, and CADENAS provider-hosted CAD configurator metadata.',
  },
];

const run = async () => {
  startApiServer();
  await waitForApi();

  for (const item of cases) {
    const validation = await postJson('/api/inventory/validate', {
      connector: item.connector,
      analysis: weakAnalysis,
      scanInput: item.scanInput,
    });
    assert(validation.response.ok, `${item.label} validation failed: ${validation.body.error || validation.response.status}`);
    const candidate = validation.body.matchCandidates?.[0];
    assert(candidate?.machineId === item.expectedMachineId, `${item.label} expected ${item.expectedMachineId}, found ${candidate?.machineId || '(none)'}.`);
    assert(
      Number(candidate.confidenceScore || 0) >= MIN_MATCH_CANDIDATE_SCORE,
      `${item.label} candidate confidence was below semantic threshold.`
    );
    assert(candidate.hasDatabase3DRender === true, `${item.label} candidate should retain source-backed 3D evidence.`);

    const match = await postJson('/api/gemini/match-machine', {
      connector: item.connector,
      analysis: weakAnalysis,
      selectedMachineId: item.expectedMachineId,
      scanInput: item.scanInput,
    });
    assert(match.response.ok, `${item.label} match failed: ${match.body.error || match.response.status}`);
    assert(match.body.machineId === item.expectedMachineId, `${item.label} match returned ${match.body.machineId || '(none)'}.`);
    assert(
      Number(match.body.confidenceScore || 0) >= MIN_MATCH_CANDIDATE_SCORE,
      `${item.label} match confidence was below semantic threshold.`
    );
  }

  console.log('Professional inventory source sample match smoke passed.');
};

run()
  .catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(cleanup);
