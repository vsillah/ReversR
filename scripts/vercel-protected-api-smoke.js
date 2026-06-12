const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const deploymentUrl = (process.env.VERCEL_PROTECTED_API_URL || process.argv[2] || '').replace(/\/$/, '');
const outputFile = process.env.VERCEL_PROTECTED_API_EVIDENCE_FILE || 'docs/vercel-protected-api-smoke-evidence.json';

const writeJson = (filePath, value) => {
  const target = path.resolve(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
  return target;
};

const fail = (message, details = {}) => {
  const target = writeJson(outputFile, {
    schemaVersion: 1,
    status: 'fail',
    generatedAt: new Date().toISOString(),
    deploymentUrl,
    accessMode: 'vercel-cli-authenticated-protected-deployment',
    finalPublicHostedApiStillRequired: true,
    error: message,
    ...details,
  });
  console.error(`Vercel protected API smoke failed: ${message}`);
  console.error(`Evidence written: ${target}`);
  process.exit(1);
};

if (!/^https:\/\/[^/]+\.vercel\.app$/i.test(deploymentUrl)) {
  fail('Set VERCEL_PROTECTED_API_URL or pass a Vercel deployment URL.');
}

const runVercelCurl = (route, curlArgs = []) => {
  const result = spawnSync(
    'npx',
    [
      'vercel@latest',
      'curl',
      route,
      '--deployment',
      deploymentUrl,
      '--',
      '--silent',
      '--show-error',
      ...curlArgs,
    ],
    { encoding: 'utf8' }
  );

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || '').trim() || `vercel curl ${route} failed`);
  }

  const text = result.stdout.trim();
  const jsonStart = text.indexOf('{');
  if (jsonStart === -1) {
    throw new Error(`vercel curl ${route} did not return JSON.`);
  }
  return JSON.parse(text.slice(jsonStart));
};

try {
  const health = runVercelCurl('/api/health');
  if (health.status !== 'ok') {
    throw new Error(`/api/health returned non-ok status: ${JSON.stringify(health)}`);
  }
  if (health.runtimeConfig?.corsMode !== 'restricted') {
    throw new Error('/api/health did not report restricted CORS.');
  }
  if (!health.runtimeConfig?.requestBodyLimit) {
    throw new Error('/api/health did not report request body limit.');
  }

  const validation = runVercelCurl('/api/inventory/validate', [
    '--request',
    'POST',
    '--header',
    'content-type: application/json',
    '--data',
    JSON.stringify({
      connector: {
        sourceName: 'FarmBot Genesis Public Inventory',
        sourceUrl: 'demo://sample-machines',
        connectorType: 'demo',
        authMode: 'none',
      },
    }),
  ]);
  if (validation.status !== 'ok' || Number(validation.recordCount || 0) < 1) {
    throw new Error(`/api/inventory/validate returned unexpected payload: ${JSON.stringify(validation)}`);
  }

  const target = writeJson(outputFile, {
    schemaVersion: 1,
    status: 'pass',
    generatedAt: new Date().toISOString(),
    deploymentUrl,
    accessMode: 'vercel-cli-authenticated-protected-deployment',
    finalPublicHostedApiStillRequired: true,
    checks: {
      health: {
        status: 'pass',
        service: health.service || '',
        runtimeConfig: health.runtimeConfig,
        authenticatedConnectorsEnabled: Boolean(health.authenticatedConnectorsEnabled),
        credentialRegistryEnabled: Boolean(health.credentialRegistryEnabled),
      },
      bundledFarmBotInventoryValidation: {
        status: 'pass',
        recordCount: validation.recordCount,
        sampleMachineIds: (validation.sampleMachines || []).map(machine => machine.machineId),
      },
    },
    notes: [
      'This proves the Vercel protected preview API function via authenticated Vercel CLI access.',
      'It does not replace the public hosted API gate required for native builds.',
    ],
  });

  console.log(`Vercel protected API smoke evidence written: ${target}`);
  console.log('Status: pass');
} catch (error) {
  fail(error.message);
}
