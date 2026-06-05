const apiBase = (process.env.EXPO_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || '').replace(/\/$/, '');

if (!apiBase || apiBase.includes('example.com')) {
  console.error('Set EXPO_PUBLIC_API_BASE_URL or API_BASE_URL to the hosted API URL before running API preflight.');
  process.exit(1);
}

const postJson = async (url, body) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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
  const healthResponse = await fetch(`${apiBase}/api/health`);
  if (!healthResponse.ok) {
    throw new Error(`/api/health failed with ${healthResponse.status}`);
  }
  const health = await healthResponse.json();
  if (health.status !== 'ok') {
    throw new Error(`/api/health returned non-ok status: ${JSON.stringify(health)}`);
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

  console.log(`API preflight passed for ${apiBase}`);
  console.log(`Service: ${health.service || 'unknown'} | authenticated connectors: ${health.authenticatedConnectorsEnabled ? 'configured' : 'not configured'}`);
};

run().catch(error => {
  console.error(`API preflight failed: ${error.message}`);
  process.exit(1);
});
