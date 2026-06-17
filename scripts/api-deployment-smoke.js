const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const apiPort = Number(process.env.API_DEPLOYMENT_SMOKE_PORT || 3021);
const allowedOrigin = process.env.API_DEPLOYMENT_SMOKE_ALLOWED_ORIGIN || 'https://reversr-rebuild.local';
const bodyLimit = process.env.API_DEPLOYMENT_SMOKE_BODY_LIMIT || '25mb';
const evidenceFile = process.env.API_DEPLOYMENT_SMOKE_EVIDENCE_FILE || 'docs/api-deployment-smoke-evidence.json';
const apiBase = `http://127.0.0.1:${apiPort}`;
const adminToken = 'local-production-smoke-admin-token-32';

let apiProcess;
const apiLogs = [];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const captureLog = (chunk) => {
  const text = String(chunk).trim();
  if (!text) return;
  apiLogs.push(text);
  if (apiLogs.length > 30) apiLogs.shift();
};

const readJson = async (response) => {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
};

const postJson = async (url, body, options = {}) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
    body: JSON.stringify(body),
  });
  return { response, body: await readJson(response) };
};

const startApiServer = () => {
  apiProcess = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      API_PORT: String(apiPort),
      API_CORS_ORIGINS: allowedOrigin,
      API_REQUEST_BODY_LIMIT: bodyLimit,
      ADMIN_API_TOKEN: adminToken,
      INVENTORY_CONNECTOR_SECRETS_JSON: '',
      INVENTORY_CONNECTOR_SECRETS_FILE: '',
      INVENTORY_PRIVATE_NETWORK_ENABLED: 'false',
      AI_INTEGRATIONS_GEMINI_API_KEY: '',
      GEMINI_API_KEYS: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  apiProcess.stdout.on('data', captureLog);
  apiProcess.stderr.on('data', captureLog);
};

const waitForHealth = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (apiProcess?.exitCode != null) {
      throw new Error(`API server exited early with code ${apiProcess.exitCode}. Logs:\n${apiLogs.join('\n')}`);
    }

    try {
      const response = await fetch(`${apiBase}/api/health`);
      if (response.ok) return readJson(response);
    } catch {
      // Keep polling until the child process accepts connections.
    }

    await sleep(250);
  }

  throw new Error(`Timed out waiting for API server on ${apiBase}. Logs:\n${apiLogs.join('\n')}`);
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

const writeEvidence = (evidence) => {
  const target = path.resolve(evidenceFile);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(evidence, null, 2)}\n`);
  return target;
};

process.once('SIGINT', async () => {
  await cleanup();
  process.exit(130);
});

process.once('SIGTERM', async () => {
  await cleanup();
  process.exit(143);
});

const run = async () => {
  startApiServer();

  const health = await waitForHealth();
  assert(health.status === 'ok', 'API health did not return ok.');
  assert(health.service === 'reversr-rebuild-api', 'Unexpected API service name.');
  assert(health.runtimeConfig?.corsMode === 'restricted', 'API should report restricted CORS mode.');
  assert(health.runtimeConfig?.allowedCorsOriginCount === 1, 'API should report exactly one allowed CORS origin.');
  assert(health.runtimeConfig?.requestBodyLimit === bodyLimit, `API should report body limit ${bodyLimit}.`);
  assert(health.runtimeConfig?.adminRoutesEnabled === true, 'Admin routes should be enabled for this smoke.');
  assert(health.runtimeConfig?.privateNetworkConnectorsEnabled === false, 'Private-network connectors should stay disabled.');

  const allowedHealth = await fetch(`${apiBase}/api/health`, {
    headers: { Origin: allowedOrigin },
  });
  assert(allowedHealth.ok, 'Allowed CORS origin should be accepted.');
  assert(
    allowedHealth.headers.get('access-control-allow-origin') === allowedOrigin,
    'Allowed CORS origin should be reflected in Access-Control-Allow-Origin.'
  );

  const accessPasswordPreflight = await fetch(`${apiBase}/api/me`, {
    method: 'OPTIONS',
    headers: {
      Origin: allowedOrigin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': [
        'x-reversr-client-id',
        'x-reversr-profile-name',
        'x-reversr-shop-name',
        'x-reversr-access-password',
      ].join(','),
    },
  });
  const allowedHeaders = accessPasswordPreflight.headers.get('access-control-allow-headers') || '';
  assert(accessPasswordPreflight.status === 204, 'Commercial account preflight should return 204.');
  assert(
    allowedHeaders.toLowerCase().includes('x-reversr-access-password'),
    'Commercial account CORS preflight should allow X-ReversR-Access-Password.'
  );

  const deniedHealth = await fetch(`${apiBase}/api/health`, {
    headers: { Origin: 'https://unapproved.example.com' },
  });
  assert(deniedHealth.status >= 400, 'Unapproved CORS origin should be rejected.');

  const retiredSit = await fetch(`${apiBase}/api/apply-pattern`, { method: 'POST' });
  assert(retiredSit.status === 404, 'Legacy /api/apply-pattern route should remain retired.');

  const validation = await postJson(`${apiBase}/api/inventory/validate`, {
    connector: {
      sourceName: 'FarmBot Genesis Public Inventory',
      sourceUrl: 'demo://sample-machines',
      connectorType: 'demo',
      authMode: 'none',
    },
  });
  assert(validation.response.ok, `FarmBot inventory validation failed with ${validation.response.status}.`);
  assert(validation.body.status === 'ok', 'FarmBot inventory validation should return ok.');
  assert(validation.body.recordCount >= 1, 'FarmBot inventory validation should return at least one record.');

  const adminRegistry = await fetch(`${apiBase}/api/admin/inventory/credentials`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(adminRegistry.ok, 'Admin credential registry endpoint should respond when ADMIN_API_TOKEN is set.');
  const adminPayload = await readJson(adminRegistry);
  assert(adminPayload.registryEnabled === false, 'Registry writes should be disabled without INVENTORY_CONNECTOR_SECRETS_FILE.');

  const evidencePath = writeEvidence({
    schemaVersion: 1,
    status: 'pass',
    generatedAt: new Date().toISOString(),
    apiBase,
    allowedOrigin,
    health,
    checks: {
      healthOk: true,
      restrictedCors: true,
      allowedOriginAccepted: true,
      accessPasswordHeaderAllowed: true,
      deniedOriginRejected: true,
      requestBodyLimit: bodyLimit,
      retiredSitRouteStatus: retiredSit.status,
      bundledFarmBotInventoryValidation: {
        status: validation.body.status,
        recordCount: validation.body.recordCount,
      },
      adminRegistry: {
        reachable: true,
        registryEnabled: adminPayload.registryEnabled,
        credentialCount: adminPayload.credentials?.length || 0,
      },
    },
  });

  console.log('API deployment smoke passed.');
  console.log(`API base: ${apiBase}`);
  console.log(`Evidence: ${evidencePath}`);
  console.log(`Runtime: CORS restricted to ${allowedOrigin} | body limit ${bodyLimit}`);
};

run()
  .catch(error => {
    console.error('API deployment smoke failed:');
    console.error(error.message || error);
    if (apiLogs.length > 0) {
      console.error('API logs:');
      console.error(apiLogs.join('\n'));
    }
    process.exitCode = 1;
  })
  .finally(cleanup);
