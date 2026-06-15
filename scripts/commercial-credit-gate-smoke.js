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
  process.env.COMMERCIAL_SUPER_ADMIN_EMAILS = 'super-admin-smoke@example.com';
  process.env.COMMERCIAL_SUPER_ADMIN_PASSWORD = 'super-admin-smoke-password';
  const adminToken = 'credit-gate-smoke-admin-token';

  const { chargeCommercialCredits, registerCommercialRoutes } = require('../server/commercialization');

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  registerCommercialRoutes(app, {
    requireAdmin: (req, res) => {
      const header = req.get('authorization') || '';
      const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
      if (token !== adminToken) {
        res.status(401).json({ status: 'error', error: 'Admin token is required.' });
        return false;
      }
      return true;
    },
  });
  app.post('/test/charge/:feature', async (req, res) => {
    const charge = await chargeCommercialCredits(req, res, req.params.feature);
    if (!charge.ok) return;
    res.json({ status: 'ok', credits: charge.credits, usage: charge.usage });
  });

  const server = await new Promise(resolve => {
    const listener = app.listen(0, () => resolve(listener));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const headersFor = (clientId, name = 'Repair shop user', email = '') => ({
    'Content-Type': 'application/json',
    'X-ReversR-Client-Id': clientId,
    'X-ReversR-Profile-Name': name,
    'X-ReversR-Profile-Email': email,
    'X-ReversR-Shop-Name': 'Smoke Test Shop',
  });

  const grantHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminToken}`,
  };
  const superAdminHeaders = {
    ...headersFor('super-admin-smoke-client', 'Super Admin Smoke', 'super-admin-smoke@example.com'),
    'X-ReversR-Access-Password': process.env.COMMERCIAL_SUPER_ADMIN_PASSWORD,
  };

  const charge = async (clientId, feature, key, name = 'Repair shop user') => {
    const response = await fetch(`${baseUrl}/test/charge/${feature}`, {
      method: 'POST',
      headers: {
        ...headersFor(clientId, name),
        'X-ReversR-Idempotency-Key': `${feature}:${key}`,
      },
      body: JSON.stringify({ input: `machine-${key}` }),
    });
    const body = await response.json();
    return { response, body };
  };

  try {
    const initial = await fetch(`${baseUrl}/api/me`, { headers: headersFor('guest-smoke') }).then(res => res.json());
    assert.equal(initial.billing.planId, 'free');
    assert.equal(initial.usage.remainingCredits, 5);
    assert.equal(initial.usage.period, 'week');
    assert.match(initial.usage.resetAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(typeof initial.usage.resetInSeconds, 'number');

    let first = await charge('guest-smoke', 'analyze', 'guest-analyze-1');
    assert.equal(first.response.status, 200);
    assert.equal(first.body.usage.usedCredits, 1);
    assert.equal(first.body.usage.remainingCredits, 4);

    const duplicate = await charge('guest-smoke', 'analyze', 'guest-analyze-1');
    assert.equal(duplicate.response.status, 200);
    assert.equal(duplicate.body.usage.usedCredits, 1);
    assert.equal(duplicate.body.usage.remainingCredits, 4);

    const spec = await charge('guest-smoke', 'technical-spec', 'guest-spec-1');
    assert.equal(spec.response.status, 200);
    assert.equal(spec.body.credits, 0);

    const sketch = await charge('guest-smoke', 'generate-2d', 'guest-sketch-1');
    assert.equal(sketch.response.status, 200);
    assert.equal(sketch.body.credits, 0);

    const bom = await charge('guest-smoke', 'generate-bom', 'guest-bom-1');
    assert.equal(bom.response.status, 200);
    assert.equal(bom.body.credits, 0);

    for (let index = 2; index <= 5; index += 1) {
      const includedCredit = await charge('guest-smoke', 'analyze', `guest-analyze-${index}`);
      assert.equal(includedCredit.response.status, 200);
      assert.equal(includedCredit.body.usage.usedCredits, index);
      assert.equal(includedCredit.body.usage.remainingCredits, 5 - index);
    }

    const exhausted = await charge('guest-smoke', 'analyze', 'guest-analyze-6');
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
      const testerCharge = await charge('tester-smoke', 'analyze', `tester-analyze-${index}`, 'test3r');
      assert.equal(testerCharge.response.status, 200);
      assert.equal(testerCharge.body.usage.unlimitedCredits, true);
    }

    const guestViewAfterTester = await fetch(`${baseUrl}/api/me`, { headers: headersFor('tester-smoke', 'Repair shop user') }).then(res => res.json());
    assert.equal(guestViewAfterTester.billing.planId, 'free');
    assert.equal(guestViewAfterTester.usage.usedCredits, 0);
    assert.equal(guestViewAfterTester.usage.remainingCredits, 5);

    const grantResponse = await fetch(`${baseUrl}/api/admin/commercial/access-grants`, {
      method: 'POST',
      headers: grantHeaders,
      body: JSON.stringify({
        clientId: 'password-smoke',
        profileName: 'Password Smoke',
        startingPassword: 'StartPass123',
      }),
    });
    const grantBody = await grantResponse.json();
    assert.equal(grantResponse.status, 200);
    assert.equal(grantBody.grant.clientId, 'password-smoke');
    assert.equal(grantBody.grant.mustResetPassword, true);
    assert.equal(grantBody.grant.passwordHash, undefined);

    const activateResponse = await fetch(`${baseUrl}/api/commercial/access/activate`, {
      method: 'POST',
      headers: headersFor('password-smoke', 'Password Smoke'),
      body: JSON.stringify({ accessPassword: 'StartPass123' }),
    });
    const activateBody = await activateResponse.json();
    assert.equal(activateResponse.status, 200);
    assert.equal(activateBody.account.billing.planId, 'tester');
    assert.equal(activateBody.account.access.requiresPasswordReset, true);

    const resetResponse = await fetch(`${baseUrl}/api/commercial/access/reset-password`, {
      method: 'POST',
      headers: headersFor('password-smoke', 'Password Smoke'),
      body: JSON.stringify({
        currentPassword: 'StartPass123',
        newPassword: 'ResetPass123',
      }),
    });
    const resetBody = await resetResponse.json();
    assert.equal(resetResponse.status, 200);
    assert.equal(resetBody.account.billing.planId, 'tester');
    assert.equal(resetBody.account.access.requiresPasswordReset, false);

    const oldPasswordResponse = await fetch(`${baseUrl}/api/commercial/access/activate`, {
      method: 'POST',
      headers: headersFor('password-smoke', 'Password Smoke'),
      body: JSON.stringify({ accessPassword: 'StartPass123' }),
    });
    assert.equal(oldPasswordResponse.status, 401);

    const resetPasswordHeaders = {
      ...headersFor('password-smoke', 'Password Smoke'),
      'X-ReversR-Access-Password': 'ResetPass123',
    };
    const passwordTester = await fetch(`${baseUrl}/api/me`, { headers: resetPasswordHeaders }).then(res => res.json());
    assert.equal(passwordTester.billing.planId, 'tester');
    assert.equal(passwordTester.usage.unlimitedCredits, true);

    const passwordGuest = await fetch(`${baseUrl}/api/me`, { headers: headersFor('password-smoke', 'Password Smoke') }).then(res => res.json());
    assert.equal(passwordGuest.billing.planId, 'free');
    assert.equal(passwordGuest.usage.remainingCredits, 5);

    const inviteResponse = await fetch(`${baseUrl}/api/admin/commercial/tester-invites`, {
      method: 'POST',
      headers: grantHeaders,
      body: JSON.stringify({
        email: 'invite-smoke@example.com',
        platform: 'both',
      }),
    });
    const inviteBody = await inviteResponse.json();
    assert.equal(inviteResponse.status, 200);
    assert.equal(inviteBody.invite.email, 'invite-smoke@example.com');
    assert.equal(inviteBody.invite.status, 'pending');
    assert.equal(inviteBody.invite.tokenHash, undefined);
    assert.equal(typeof inviteBody.invite.activationCode, 'string');
    assert.ok(inviteBody.invite.activationCode.length > 12);

    const superAdminInviteResponse = await fetch(`${baseUrl}/api/admin/commercial/tester-invites`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        email: 'super-admin-created-invite@example.com',
        platform: 'ios',
      }),
    });
    const superAdminInviteBody = await superAdminInviteResponse.json();
    assert.equal(superAdminInviteResponse.status, 200);
    assert.equal(superAdminInviteBody.invite.email, 'super-admin-created-invite@example.com');
    assert.equal(superAdminInviteBody.invite.status, 'pending');

    const lookupWithoutSavedEmailResponse = await fetch(`${baseUrl}/api/commercial/tester-invites/lookup`, {
      method: 'POST',
      headers: headersFor('invite-smoke-client', 'Invite Smoke'),
      body: JSON.stringify({ email: 'invite-smoke@example.com' }),
    });
    assert.equal(lookupWithoutSavedEmailResponse.status, 403);

    const lookupWrongEmailResponse = await fetch(`${baseUrl}/api/commercial/tester-invites/lookup`, {
      method: 'POST',
      headers: headersFor('invite-smoke-client', 'Invite Smoke', 'someone-else@example.com'),
      body: JSON.stringify({ email: 'invite-smoke@example.com' }),
    });
    assert.equal(lookupWrongEmailResponse.status, 403);

    const lookupResponse = await fetch(`${baseUrl}/api/commercial/tester-invites/lookup`, {
      method: 'POST',
      headers: headersFor('invite-smoke-client', 'Invite Smoke', 'invite-smoke@example.com'),
      body: JSON.stringify({ email: 'invite-smoke@example.com' }),
    });
    const lookupBody = await lookupResponse.json();
    assert.equal(lookupResponse.status, 200);
    assert.equal(lookupBody.invite.email, 'invite-smoke@example.com');
    assert.equal(lookupBody.invite.activationCode, inviteBody.invite.activationCode);
    assert.equal(lookupBody.invite.tokenHash, undefined);

    const redeemResponse = await fetch(`${baseUrl}/api/commercial/tester-invites/redeem`, {
      method: 'POST',
      headers: headersFor('invite-smoke-client', 'Invite Smoke', 'invite-smoke@example.com'),
      body: JSON.stringify({ token: inviteBody.invite.activationCode }),
    });
    const redeemBody = await redeemResponse.json();
    assert.equal(redeemResponse.status, 200);
    assert.equal(redeemBody.account.billing.planId, 'tester');
    assert.equal(redeemBody.account.usage.unlimitedCredits, true);
    assert.equal(redeemBody.invite.status, 'redeemed');
    assert.equal(redeemBody.invite.tokenHash, undefined);

    const inviteTester = await fetch(`${baseUrl}/api/me`, {
      headers: headersFor('invite-smoke-client', 'Invite Smoke'),
    }).then(res => res.json());
    assert.equal(inviteTester.billing.planId, 'tester');
    assert.equal(inviteTester.access.requiresPasswordReset, false);

    const inviteSameEmailDifferentClient = await fetch(`${baseUrl}/api/me`, {
      headers: headersFor('invite-other-client', 'Invite Smoke', 'invite-smoke@example.com'),
    }).then(res => res.json());
    assert.equal(inviteSameEmailDifferentClient.billing.planId, 'free');

    const inviteReuseResponse = await fetch(`${baseUrl}/api/commercial/tester-invites/redeem`, {
      method: 'POST',
      headers: headersFor('invite-other-client', 'Invite Smoke', 'invite-smoke@example.com'),
      body: JSON.stringify({ token: inviteBody.invite.activationCode }),
    });
    assert.equal(inviteReuseResponse.status, 409);

    const inviteList = await fetch(`${baseUrl}/api/admin/commercial/tester-invites`, {
      headers: grantHeaders,
    }).then(res => res.json());
    assert.equal(inviteList.invites.length, 2);
    const redeemedInvite = inviteList.invites.find(invite => invite.email === 'invite-smoke@example.com');
    assert.equal(redeemedInvite.status, 'redeemed');
    assert.equal(redeemedInvite.tokenHash, undefined);

    process.env.TESTER_INVITE_EMAIL_FILE = path.join(tempDir, 'tester-invite-email-outbox.json');
    const emailedInviteResponse = await fetch(`${baseUrl}/api/admin/commercial/tester-invites`, {
      method: 'POST',
      headers: grantHeaders,
      body: JSON.stringify({
        email: 'emailed-invite-smoke@example.com',
        platform: 'android',
      }),
    });
    const emailedInviteBody = await emailedInviteResponse.json();
    assert.equal(emailedInviteResponse.status, 200);
    assert.equal(emailedInviteBody.invite.emailDelivery.status, 'sent');
    assert.equal(emailedInviteBody.invite.emailDelivery.provider, 'file');
    assert.equal(emailedInviteBody.invite.activationCode, '');

    const outbox = JSON.parse(await fs.readFile(process.env.TESTER_INVITE_EMAIL_FILE, 'utf8'));
    assert.equal(outbox.emails.length, 1);
    assert.equal(outbox.emails[0].to, 'emailed-invite-smoke@example.com');
    assert.ok(outbox.emails[0].activationCode.length > 12);

    const emailedLookupResponse = await fetch(`${baseUrl}/api/commercial/tester-invites/lookup`, {
      method: 'POST',
      headers: headersFor('emailed-invite-smoke-client', 'Emailed Invite Smoke', 'emailed-invite-smoke@example.com'),
      body: JSON.stringify({ email: 'emailed-invite-smoke@example.com' }),
    });
    const emailedLookupBody = await emailedLookupResponse.json();
    assert.equal(emailedLookupResponse.status, 200);
    assert.equal(emailedLookupBody.invite.emailDelivery.status, 'sent');
    assert.equal(emailedLookupBody.invite.activationCode, '');

    const emailedRedeemResponse = await fetch(`${baseUrl}/api/commercial/tester-invites/redeem`, {
      method: 'POST',
      headers: headersFor('emailed-invite-smoke-client', 'Emailed Invite Smoke', 'emailed-invite-smoke@example.com'),
      body: JSON.stringify({ token: outbox.emails[0].activationCode }),
    });
    const emailedRedeemBody = await emailedRedeemResponse.json();
    assert.equal(emailedRedeemResponse.status, 200);
    assert.equal(emailedRedeemBody.account.billing.planId, 'tester');
    assert.equal(emailedRedeemBody.invite.status, 'redeemed');

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
