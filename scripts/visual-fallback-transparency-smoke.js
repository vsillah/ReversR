const { spawn } = require('child_process');

const apiPort = Number(process.env.VISUAL_FALLBACK_SMOKE_API_PORT || 3015);
const apiBase = `http://127.0.0.1:${apiPort}`;
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
  apiProcess = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      API_PORT: String(apiPort),
      ADMIN_API_TOKEN: 'visual-fallback-smoke-token',
      INVENTORY_CONNECTOR_SECRETS_FILE: '',
      INVENTORY_CONNECTOR_SECRETS_JSON: '{}',
      AI_INTEGRATIONS_GEMINI_API_KEY: '',
      GEMINI_API_KEYS: '',
    },
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

const tracepartsInnovation = {
  conceptName: 'TraceParts Linear Actuator Rebuild Module Reconstruction Package',
  conceptDescription: 'Matched TraceParts linear actuator module with ball screw actuator, guide rail, motor coupling, limit switch, mounting bracket, and fastener kit.',
  machineId: 'TRACEPARTS-LINEAR-ACTUATOR-MODULE',
  machineName: 'TraceParts Linear Actuator Rebuild Module',
  inventorySource: 'TraceParts Industrial Components Pilot',
  sourceProvider: 'TraceParts',
  sourceRecordId: 'traceparts-pilot-linear-actuator',
  renderProvider: 'TraceParts',
  viewerUrl: 'https://www.traceparts.com/',
  cadModelUrl: 'https://www.traceparts.com/',
  cadFormats: ['STEP', 'IGES', 'STL'],
  hasDatabase3DRender: true,
  visualEvidenceSource: 'database_3d_render',
  referenceImages: [{
    id: 'traceparts-provider-page',
    label: 'TraceParts provider page, not a direct image',
    url: 'https://www.traceparts.com/',
    kind: 'provider-catalog-reference',
  }],
  assemblySteps: [{
    stepNumber: 1,
    title: 'Fit actuator rail',
    instructions: 'Mount guide rail, actuator body, coupling, and endstop.',
    parts: ['Ball screw actuator', 'Linear guide rail', 'Motor coupling', 'Endstop switch'],
    estimatedTime: '45 min',
    qualityCheck: 'Rail centerline and bracket hole pattern match CAD review.',
  }],
};

const sourceBacked2DInnovation = {
  conceptName: 'Direct reference image machine',
  machineId: 'DIRECT-IMAGE-001',
  referenceImages: [{
    id: 'inline-reference',
    label: 'Inline source-backed image',
    url: 'data:image/png;base64,iVBORw0KGgo=',
    kind: 'public-source-reference',
    contentType: 'image/png',
  }],
};

const run = async () => {
  startApiServer();
  await waitForApi();

  const placeholder = await postJson('/api/gemini/generate-2d-single-angle', {
    innovation: tracepartsInnovation,
    angleId: 'front',
  });
  assert(placeholder.response.ok, `single-angle fallback failed: ${placeholder.body.error || placeholder.response.status}`);
  assert(placeholder.body.imageSource?.sourceType === 'built_in_placeholder', 'Provider page should not be treated as source-backed 2D.');
  assert(placeholder.body.imageSource?.sourceBacked3DAvailable === true, 'Fallback should disclose source-backed 3D availability.');
  assert(/source_3d_metadata/.test(placeholder.body.imageSource?.fallbackReason || ''), 'Fallback reason should mention source 3D metadata without source 2D.');
  assert(placeholder.body.imageSource?.factoryUseStatus === 'not_factory_ready', 'Placeholder should not be marked factory-ready.');

  const multi = await postJson('/api/gemini/generate-2d-angles', {
    innovation: tracepartsInnovation,
    angles: ['front', 'side', 'iso'],
  });
  assert(multi.response.ok, `multi-angle fallback failed: ${multi.body.error || multi.response.status}`);
  assert(multi.body.images?.length === 3, 'Multi-angle fallback should return all requested angles.');
  assert(multi.body.images.every(image => image.imageSource?.sourceType === 'built_in_placeholder'), 'All no-key multi-angle images should disclose placeholder fallback.');

  const sourceBacked = await postJson('/api/gemini/generate-2d-single-angle', {
    innovation: sourceBacked2DInnovation,
    angleId: 'front',
  });
  assert(sourceBacked.response.ok, `source-backed 2D failed: ${sourceBacked.body.error || sourceBacked.response.status}`);
  assert(
    ['inventory_reference', 'public_source_reference'].includes(sourceBacked.body.imageSource?.sourceType),
    'Explicit data image should be treated as source-backed 2D.'
  );
  assert(sourceBacked.body.imageSource?.sourceBacked2DAvailable === true, 'Source-backed 2D should disclose direct 2D availability.');

  console.log('Visual fallback transparency smoke passed.');
};

run()
  .catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(cleanup);
