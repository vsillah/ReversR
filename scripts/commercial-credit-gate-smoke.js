const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
const express = require('express');

const run = async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reversr-credit-gate-'));
  process.env.COMMERCIAL_STORE_FILE = path.join(tempDir, 'commercial-store.json');
  process.env.BILLING_RETURN_URL = 'https://reversr-rebuild.example.com/account';
  process.env.COMMERCIAL_TESTER_PROFILE_NAMES = 'test3r';

  const { chargeCommercialCredits, registerCommercialRoutes } = require('../server/commercialization');

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  registerCommercialRoutes(app);
  app.post('/test/charge/:feature', async (req, res) => {
    const charge = await chargeCommercialCredits(req, res, req.params.feature);
    if (!charge.ok) return;
    res.json({ status: 'ok', credits: charge.credits, usage: charge.usage });
  });

  const server = await new Promise(resolve => {
    const listener = app.listen(0, () => resolve(listener));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const headersFor = (clientId, name = 'Repair shop user') => ({
    'Content-Type': 'application/json',
    'X-ReversR-Client-Id': clientId,
    'X-ReversR-Profile-Name': name,
    'X-ReversR-Shop-Name': 'Smoke Test Shop',
  });

  const charge = async (clientId, key, name = 'Repair shop user') => {
    const response = await fetch(`${baseUrl}/test/charge/analyze`, {
      method: 'POST',
      headers: {
        ...headersFor(clientId, name),
        'X-ReversR-Idempotency-Key': key,
      },
      body: JSON.stringify({ input: `machine-${key}` }),
    });
    const body = await response.json();
    return { response, body };
  };

  try {
    const initial = await fetch(`${baseUrl}/api/me`, { headers: headersFor('guest-smoke') }).then(res => res.json());
    assert.equal(initial.billing.planId, 'free');
    assert.equal(initial.usage.remainingCredits, 3);

    let first = await charge('guest-smoke', 'guest-analyze-1');
    assert.equal(first.response.status, 200);
    assert.equal(first.body.usage.usedCredits, 1);

    const duplicate = await charge('guest-smoke', 'guest-analyze-1');
    assert.equal(duplicate.response.status, 200);
    assert.equal(duplicate.body.usage.usedCredits, 1);

    await charge('guest-smoke', 'guest-analyze-2');
    await charge('guest-smoke', 'guest-analyze-3');
    const exhausted = await charge('guest-smoke', 'guest-analyze-4');
    assert.equal(exhausted.response.status, 402);
    assert.equal(exhausted.body.code, 'COMMERCIAL_CREDITS_EXHAUSTED');
    assert.equal(exhausted.body.upgradeRequired, true);
    assert.equal(exhausted.body.billing.upgradeUrl, 'https://reversr-rebuild.example.com/account?upgrade=credits');
    assert.equal(exhausted.body.usage.remainingCredits, 0);

    const tester = await fetch(`${baseUrl}/api/me`, { headers: headersFor('tester-smoke', 'test3r') }).then(res => res.json());
    assert.equal(tester.billing.planId, 'tester');
    assert.equal(tester.usage.unlimitedCredits, true);
    assert.equal(tester.usage.remainingCredits, null);

    for (let index = 0; index < 5; index += 1) {
      const testerCharge = await charge('tester-smoke', `tester-analyze-${index}`, 'test3r');
      assert.equal(testerCharge.response.status, 200);
      assert.equal(testerCharge.body.usage.unlimitedCredits, true);
    }

    const guestViewAfterTester = await fetch(`${baseUrl}/api/me`, { headers: headersFor('tester-smoke', 'Repair shop user') }).then(res => res.json());
    assert.equal(guestViewAfterTester.billing.planId, 'free');
    assert.equal(guestViewAfterTester.usage.usedCredits, 0);
    assert.equal(guestViewAfterTester.usage.remainingCredits, 3);

    console.log('Commercial credit gate smoke passed.');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};

run().catch(error => {
  console.error(error);
  process.exit(1);
});
