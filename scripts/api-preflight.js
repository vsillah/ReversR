const fs = require('fs');
const path = require('path');

const args = new Set(process.argv.slice(2));
const allowOpenCors = args.has('--allow-open-cors');
const allowMissingGemini = args.has('--allow-missing-gemini');
const apiBase = (process.env.EXPO_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || '').replace(/\/$/, '');
const isLocalApi = /:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/.test(apiBase);
const vercelBypassSecret = (
  process.env.API_PREFLIGHT_VERCEL_BYPASS_SECRET ||
  process.env.PREVIEW_SMOKE_VERCEL_BYPASS_SECRET ||
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET ||
  ''
).trim();
const vercelBypassCookieMode = process.env.API_PREFLIGHT_VERCEL_SET_BYPASS_COOKIE || 'true';
const automationHeaders = vercelBypassSecret
  ? {
      'x-vercel-protection-bypass': vercelBypassSecret,
      'x-vercel-set-bypass-cookie': vercelBypassCookieMode,
    }
  : {};
const outputFile = process.env.API_PREFLIGHT_EVIDENCE_FILE || (
  isLocalApi ? 'docs/api-local-preflight-evidence.json' : 'docs/api-hosted-preflight-evidence.json'
);

const writeJson = (filePath, value) => {
  const target = path.resolve(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
  return target;
};

if (!apiBase || apiBase.includes('example.com')) {
  console.error('Set EXPO_PUBLIC_API_BASE_URL or API_BASE_URL to the hosted API URL before running API preflight.');
  process.exit(1);
}

const postJson = async (url, body) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...automationHeaders },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return { response, parsed };
};

const run = async () => {
  const startedAt = new Date().toISOString();
  const healthResponse = await fetch(`${apiBase}/api/health`, { headers: automationHeaders });
  if (!healthResponse.ok) {
    throw new Error(`/api/health failed with ${healthResponse.status}`);
  }
  const health = await healthResponse.json();
  if (health.status !== 'ok') {
    throw new Error(`/api/health returned non-ok status: ${JSON.stringify(health)}`);
  }
  if (!health.runtimeConfig) {
    throw new Error('/api/health is missing runtimeConfig; deploy the hardened API server before store builds.');
  }
  if (health.runtimeConfig.corsMode === 'open' && !isLocalApi && !allowOpenCors) {
    throw new Error('Hosted API reports open CORS. Set API_CORS_ORIGINS to the hosted app origins or pass --allow-open-cors only for controlled prototype checks.');
  }
  if (!health.runtimeConfig.requestBodyLimit) {
    throw new Error('/api/health runtimeConfig is missing requestBodyLimit.');
  }
  const geminiKeyCount = Number(health.apiKeys?.total || 0);
  const availableGeminiKeyCount = Number(health.apiKeys?.available || 0);
  if (!isLocalApi && !allowMissingGemini && geminiKeyCount < 1) {
    throw new Error('Hosted API reports zero configured Gemini keys. Set AI_INTEGRATIONS_GEMINI_API_KEY or GEMINI_API_KEYS before TestFlight, Play Internal, or production review builds.');
  }

  const { response, parsed } = await postJson(`${apiBase}/api/inventory/validate`, {
    connector: {
      sourceName: 'Demo Machine Inventory',
      sourceUrl: 'demo://sample-machines',
      connectorType: 'demo',
      authMode: 'none',
    },
  });

  if (!response.ok) {
    throw new Error(`/api/inventory/validate failed with ${response.status}: ${JSON.stringify(parsed)}`);
  }
  if (parsed.status !== 'ok' || parsed.recordCount < 1) {
    throw new Error(`Demo inventory validation returned an unexpected payload: ${JSON.stringify(parsed)}`);
  }

  const evidence = {
    schemaVersion: 1,
    status: 'pass',
    generatedAt: new Date().toISOString(),
    startedAt,
    apiBaseUrl: apiBase,
    localApi: isLocalApi,
    allowOpenCors,
    automationBypass: {
      vercelBypassConfigured: Boolean(vercelBypassSecret),
      setBypassCookie: Boolean(vercelBypassSecret) ? vercelBypassCookieMode : '',
    },
    checks: {
      health: {
        status: 'pass',
        httpStatus: healthResponse.status,
        service: health.service || '',
        runtimeConfig: health.runtimeConfig,
        geminiKeyCount,
        availableGeminiKeyCount,
        authenticatedConnectorsEnabled: Boolean(health.authenticatedConnectorsEnabled),
        credentialRegistryEnabled: Boolean(health.credentialRegistryEnabled),
      },
      demoInventoryValidation: {
        status: 'pass',
        httpStatus: response.status,
        recordCount: parsed.recordCount,
      },
      adminCredentialRegistry: {
        status: process.env.ADMIN_API_TOKEN ? 'checked' : 'skipped',
      },
    },
  };

  console.log(`API preflight passed for ${apiBase}`);
  console.log(`Service: ${health.service || 'unknown'} | authenticated connectors: ${health.authenticatedConnectorsEnabled ? 'configured' : 'not configured'}`);
  console.log(`Runtime: CORS ${health.runtimeConfig.corsMode} | body limit ${health.runtimeConfig.requestBodyLimit} | admin routes ${health.runtimeConfig.adminRoutesEnabled ? 'enabled' : 'disabled'} | Gemini keys ${availableGeminiKeyCount}/${geminiKeyCount} available`);

  const adminToken = process.env.ADMIN_API_TOKEN;
  if (adminToken) {
    const adminResponse = await fetch(`${apiBase}/api/admin/inventory/credentials`, {
      headers: { authorization: `Bearer ${adminToken}`, ...automationHeaders },
    });
    if (!adminResponse.ok) {
      throw new Error(`/api/admin/inventory/credentials failed with ${adminResponse.status}`);
    }
    const adminPayload = await adminResponse.json();
    evidence.checks.adminCredentialRegistry = {
      status: 'pass',
      httpStatus: adminResponse.status,
      registryEnabled: Boolean(adminPayload.registryEnabled),
      credentialCount: adminPayload.credentials?.length || 0,
    };
    console.log(`Admin credential registry: ${adminPayload.registryEnabled ? 'enabled' : 'disabled'} | refs: ${adminPayload.credentials?.length || 0}`);
  }

  const target = writeJson(outputFile, evidence);
  console.log(`API preflight evidence written: ${target}`);
};

run().catch(error => {
  if (apiBase && !apiBase.includes('example.com')) {
    writeJson(outputFile, {
      schemaVersion: 1,
      status: 'fail',
      generatedAt: new Date().toISOString(),
      apiBaseUrl: apiBase,
      localApi: isLocalApi,
      allowOpenCors,
      automationBypass: {
        vercelBypassConfigured: Boolean(vercelBypassSecret),
        setBypassCookie: Boolean(vercelBypassSecret) ? vercelBypassCookieMode : '',
      },
      error: error.message,
    });
  }
  console.error(`API preflight failed: ${error.message}`);
  process.exit(1);
});
