const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const Stripe = require('stripe');

const COMMERCIAL_STORE_FILE = process.env.COMMERCIAL_STORE_FILE || path.join(os.tmpdir(), 'reversr-commercial-store.json');
const BILLING_RETURN_URL = process.env.BILLING_RETURN_URL || process.env.PUBLIC_APP_URL || 'https://reversr.vercel.app/account';
const BILLING_CANCEL_URL = process.env.BILLING_CANCEL_URL || `${BILLING_RETURN_URL}?checkout=cancelled`;
const STRIPE_API_VERSION = '2026-02-25.clover';

const PLAN_CATALOG = {
  free: {
    id: 'free',
    label: 'Free',
    monthlyCredits: 3,
    seats: 1,
    priceMonthly: 0,
    features: ['Local reconstruction history', 'Demo/public inventory', 'Basic preview exports'],
  },
  pro_shop: {
    id: 'pro_shop',
    label: 'Pro Shop',
    monthlyCredits: 100,
    seats: 1,
    priceMonthly: 49,
    stripePriceEnv: 'STRIPE_PRICE_PRO_SHOP',
    features: ['Full BOM/spec export', 'Quote packet export', 'Cloud-ready shop history', 'Reviewer approval records'],
  },
  team: {
    id: 'team',
    label: 'Team',
    monthlyCredits: 500,
    seats: 3,
    priceMonthly: 149,
    stripePriceEnv: 'STRIPE_PRICE_TEAM',
    features: ['Shared shop history', 'Inventory connectors', 'Admin controls', 'Team seat management'],
  },
  tester: {
    id: 'tester',
    label: 'Tester',
    monthlyCredits: null,
    unlimitedCredits: true,
    seats: 1,
    priceMonthly: 0,
    internal: true,
    features: ['Unlimited reconstruction QA credits', 'Hosted billing and guest-flow testing'],
  },
};

const BILLABLE_PLAN_IDS = new Set(['free', 'pro_shop', 'team']);

const CREDIT_COSTS = {
  analyze: 1,
  'match-machine': 0,
  'technical-spec': 1,
  'generate-3d': 2,
  'generate-2d': 2,
  'generate-2d-single-angle': 2,
  'generate-2d-angles': 2,
  'generate-bom': 1,
  'export-packet': 0,
};

const DEFAULT_STORE = {
  users: {},
  shops: {},
  usageEvents: {},
  subscriptions: {},
};

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION })
  : null;

const hashId = (value = '') => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24);

const monthKey = (date = new Date()) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

const normalizePlanId = (value) => (PLAN_CATALOG[value] ? value : 'free');
const normalizeStoredPlanId = (value) => (BILLABLE_PLAN_IDS.has(value) ? value : 'free');
const publicPlans = () => Object.values(PLAN_CATALOG).filter(plan => !plan.internal);

const listFromEnv = (...names) => names
  .flatMap(name => String(process.env[name] || '').split(','))
  .map(value => value.trim().toLowerCase())
  .filter(Boolean);

const isAllowedValue = (value, allowed) => Boolean(value && allowed.includes(String(value).trim().toLowerCase()));

const getCommercialAccessGrant = (profile) => {
  const testerEmails = listFromEnv('COMMERCIAL_TESTER_EMAILS', 'REVERSR_TESTER_EMAILS');
  const testerClientIds = listFromEnv('COMMERCIAL_TESTER_CLIENT_IDS', 'REVERSR_TESTER_CLIENT_IDS');
  const testerProfileNames = listFromEnv('COMMERCIAL_TESTER_PROFILE_NAMES', 'REVERSR_TESTER_PROFILE_NAMES');

  if (
    isAllowedValue(profile.email, testerEmails) ||
    isAllowedValue(profile.clientId, testerClientIds) ||
    isAllowedValue(profile.name, testerProfileNames) ||
    isAllowedValue(profile.shopName, testerProfileNames)
  ) {
    return {
      type: 'tester',
      planId: 'tester',
      role: 'tester',
      subscriptionStatus: 'tester_grant',
    };
  }

  return null;
};

const effectivePlanIdFor = (shop, accessGrant) => accessGrant?.planId || normalizeStoredPlanId(shop.planId);

const buildBillingLinks = () => {
  const separator = BILLING_RETURN_URL.includes('?') ? '&' : '?';
  return {
    accountUrl: BILLING_RETURN_URL,
    upgradeUrl: `${BILLING_RETURN_URL}${separator}upgrade=credits`,
    canManageOnWeb: true,
    plans: publicPlans().filter(plan => plan.id !== 'free').map(plan => ({
      id: plan.id,
      label: plan.label,
      priceMonthly: plan.priceMonthly,
      monthlyCredits: plan.monthlyCredits,
      seats: plan.seats,
    })),
  };
};

const getPlanFromPriceId = (priceId = '') => {
  if (!priceId) return 'free';
  const match = Object.values(PLAN_CATALOG).find(plan => plan.stripePriceEnv && process.env[plan.stripePriceEnv] === priceId);
  return match?.id || 'free';
};

const readJson = async (filePath, fallback) => {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return { ...fallback, ...JSON.parse(raw) };
  } catch (error) {
    if (error.code === 'ENOENT') return { ...fallback };
    throw error;
  }
};

const writeJson = async (filePath, value) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
};

const loadStore = async () => readJson(COMMERCIAL_STORE_FILE, DEFAULT_STORE);
const saveStore = async (store) => writeJson(COMMERCIAL_STORE_FILE, store);

const requestProfile = (req) => {
  const headerClientId = String(req.get('x-reversr-client-id') || '').trim();
  const email = String(req.get('x-reversr-profile-email') || req.body?.profile?.email || '').trim().toLowerCase();
  const name = String(req.get('x-reversr-profile-name') || req.body?.profile?.name || '').trim();
  const shopName = String(req.get('x-reversr-shop-name') || req.body?.profile?.shopName || '').trim();
  const clientId = headerClientId || (email ? `email_${hashId(email)}` : 'anonymous');

  return {
    clientId,
    email,
    name: name || (email ? email.split('@')[0] : 'Repair shop user'),
    shopName: shopName || 'ReversR Repair Shop',
  };
};

const buildEntitlements = (planId) => {
  const plan = PLAN_CATALOG[normalizePlanId(planId)];
  const isInternalTester = plan.id === 'tester';
  return {
    planId: plan.id,
    planLabel: plan.label,
    monthlyCredits: plan.monthlyCredits,
    unlimitedCredits: Boolean(plan.unlimitedCredits),
    seats: plan.seats,
    canExportQuotePacket: plan.id !== 'free',
    canUseInventoryConnectors: plan.id === 'team' || isInternalTester,
    canUseCloudHistory: plan.id !== 'free',
    canManageTeam: plan.id === 'team' || isInternalTester,
    canUseCadReviewQueue: plan.id !== 'free',
  };
};

const ensureAccount = async (req) => {
  const store = await loadStore();
  const profile = requestProfile(req);
  const now = new Date().toISOString();
  const userId = profile.clientId;
  const existingUser = store.users[userId] || {};
  const shopId = existingUser.shopId || `shop_${hashId(profile.email || profile.clientId)}`;
  const existingShop = store.shops[shopId] || {};
  const existingPlanId = normalizeStoredPlanId(existingShop.planId || existingUser.planId || 'free');
  const accessGrant = getCommercialAccessGrant(profile);

  const user = {
    id: userId,
    name: profile.name || existingUser.name || 'Repair shop user',
    email: profile.email || existingUser.email || '',
    role: accessGrant?.role || existingUser.role || 'owner',
    activeShopId: shopId,
    shopId,
    createdAt: existingUser.createdAt || now,
    updatedAt: now,
  };

  const shop = {
    id: shopId,
    name: profile.shopName || existingShop.name || 'ReversR Repair Shop',
    billingOwnerUserId: existingShop.billingOwnerUserId || userId,
    planId: existingPlanId,
    stripeCustomerId: existingShop.stripeCustomerId || '',
    stripeSubscriptionId: existingShop.stripeSubscriptionId || '',
    subscriptionStatus: existingShop.subscriptionStatus || 'none',
    currentPeriodEnd: existingShop.currentPeriodEnd || '',
    createdAt: existingShop.createdAt || now,
    updatedAt: now,
  };

  store.users[userId] = user;
  store.shops[shopId] = shop;
  await saveStore(store);

  return { store, user, shop, accessGrant };
};

const buildUsage = (store, shop, key = monthKey(), accessGrant = null) => {
  const entitlements = buildEntitlements(effectivePlanIdFor(shop, accessGrant));
  const includeTesterUsage = accessGrant?.type === 'tester';
  const events = Object.values(store.usageEvents || {}).filter(event => (
    event.shopId === shop.id &&
    event.month === key &&
    (includeTesterUsage ? event.accessGrantType === 'tester' : event.accessGrantType !== 'tester')
  ));
  const usedCredits = events.reduce((sum, event) => sum + Number(event.credits || 0), 0);
  const unlimitedCredits = Boolean(entitlements.unlimitedCredits);
  return {
    month: key,
    usedCredits,
    remainingCredits: unlimitedCredits ? null : Math.max(entitlements.monthlyCredits - usedCredits, 0),
    monthlyCredits: entitlements.monthlyCredits,
    unlimitedCredits,
    events: events.slice(-25).reverse(),
  };
};

const buildAccountResponse = (store, user, shop, accessGrant = null) => {
  const effectivePlanId = effectivePlanIdFor(shop, accessGrant);
  const effectivePlan = PLAN_CATALOG[effectivePlanId];
  return {
  status: 'ok',
  profile: {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  },
  shop: {
    id: shop.id,
    name: shop.name,
    billingOwnerUserId: shop.billingOwnerUserId,
  },
  billing: {
    planId: effectivePlanId,
    basePlanId: normalizeStoredPlanId(shop.planId),
    planLabel: effectivePlan.label,
    subscriptionStatus: accessGrant?.subscriptionStatus || shop.subscriptionStatus,
    currentPeriodEnd: shop.currentPeriodEnd,
    hasStripeCustomer: Boolean(shop.stripeCustomerId),
    billingLinks: buildBillingLinks(),
  },
  entitlements: buildEntitlements(effectivePlanId),
  usage: buildUsage(store, shop, monthKey(), accessGrant),
  plans: publicPlans(),
  creditCosts: CREDIT_COSTS,
  };
};

const requireConfiguredStripe = () => {
  if (!stripe) {
    const error = new Error('Stripe billing is not configured. Set STRIPE_SECRET_KEY and Stripe price IDs on the API server.');
    error.statusCode = 503;
    throw error;
  }
  return stripe;
};

const ensureStripeCustomer = async (store, user, shop) => {
  if (shop.stripeCustomerId) return shop.stripeCustomerId;
  const stripeClient = requireConfiguredStripe();
  const customer = await stripeClient.customers.create({
    email: user.email || undefined,
    name: user.name || undefined,
    metadata: {
      reversrUserId: user.id,
      reversrShopId: shop.id,
      shopName: shop.name,
    },
  });
  shop.stripeCustomerId = customer.id;
  shop.updatedAt = new Date().toISOString();
  store.shops[shop.id] = shop;
  await saveStore(store);
  return customer.id;
};

const updateShopFromSubscription = async (subscription) => {
  const store = await loadStore();
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
  const shop = Object.values(store.shops).find(item => item.stripeCustomerId === customerId);
  if (!shop) return null;

  const priceId = subscription.items?.data?.[0]?.price?.id || '';
  const planId = getPlanFromPriceId(priceId);
  shop.planId = subscription.status === 'active' || subscription.status === 'trialing' ? planId : 'free';
  shop.stripeSubscriptionId = subscription.id;
  shop.subscriptionStatus = subscription.status;
  shop.currentPeriodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : '';
  shop.updatedAt = new Date().toISOString();
  store.shops[shop.id] = shop;
  store.subscriptions[subscription.id] = {
    id: subscription.id,
    customerId,
    shopId: shop.id,
    planId: shop.planId,
    status: subscription.status,
    priceId,
    updatedAt: shop.updatedAt,
  };
  await saveStore(store);
  return shop;
};

const registerCommercialRoutes = (app) => {
  app.get('/api/me', async (req, res) => {
    try {
      const { store, user, shop, accessGrant } = await ensureAccount(req);
      res.json(buildAccountResponse(store, user, shop, accessGrant));
    } catch (error) {
      res.status(500).json({ status: 'error', error: error.message || 'Failed to load account.' });
    }
  });

  app.get('/api/usage', async (req, res) => {
    try {
      const { store, shop, accessGrant } = await ensureAccount(req);
      res.json({ status: 'ok', usage: buildUsage(store, shop, monthKey(), accessGrant), creditCosts: CREDIT_COSTS });
    } catch (error) {
      res.status(500).json({ status: 'error', error: error.message || 'Failed to load usage.' });
    }
  });

  app.get('/api/entitlements', async (req, res) => {
    try {
      const { shop, accessGrant } = await ensureAccount(req);
      res.json({
        status: 'ok',
        entitlements: buildEntitlements(effectivePlanIdFor(shop, accessGrant)),
        plans: publicPlans(),
      });
    } catch (error) {
      res.status(500).json({ status: 'error', error: error.message || 'Failed to load entitlements.' });
    }
  });

  app.post('/api/commercial/profile', async (req, res) => {
    try {
      const { store, user, shop, accessGrant } = await ensureAccount(req);
      res.json(buildAccountResponse(store, user, shop, accessGrant));
    } catch (error) {
      res.status(500).json({ status: 'error', error: error.message || 'Failed to save commercial profile.' });
    }
  });

  app.post('/api/billing/checkout-session', async (req, res) => {
    try {
      const planId = normalizeStoredPlanId(req.body?.planId);
      const plan = PLAN_CATALOG[planId];
      if (plan.id === 'free') {
        return res.status(400).json({ status: 'error', error: 'Free plan does not require checkout.', canRetry: false });
      }

      const priceId = process.env[plan.stripePriceEnv];
      if (!priceId) {
        return res.status(503).json({
          status: 'error',
          error: `Stripe price ID missing. Set ${plan.stripePriceEnv} on the API server.`,
          canRetry: false,
        });
      }

      const { store, user, shop } = await ensureAccount(req);
      const customerId = await ensureStripeCustomer(store, user, shop);
      const stripeClient = requireConfiguredStripe();
      const successUrl = req.body?.successUrl || `${BILLING_RETURN_URL}?checkout=success`;
      const cancelUrl = req.body?.cancelUrl || BILLING_CANCEL_URL;
      const session = await stripeClient.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
        metadata: {
          reversrUserId: user.id,
          reversrShopId: shop.id,
          planId: plan.id,
        },
        subscription_data: {
          metadata: {
            reversrUserId: user.id,
            reversrShopId: shop.id,
            planId: plan.id,
          },
        },
      });

      res.json({ status: 'ok', url: session.url, sessionId: session.id });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        status: 'error',
        error: error.message || 'Failed to start Stripe Checkout.',
        canRetry: false,
      });
    }
  });

  app.post('/api/billing/portal-session', async (req, res) => {
    try {
      const { store, user, shop } = await ensureAccount(req);
      const customerId = await ensureStripeCustomer(store, user, shop);
      const stripeClient = requireConfiguredStripe();
      const session = await stripeClient.billingPortal.sessions.create({
        customer: customerId,
        return_url: req.body?.returnUrl || BILLING_RETURN_URL,
      });
      res.json({ status: 'ok', url: session.url });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        status: 'error',
        error: error.message || 'Failed to open Stripe Customer Portal.',
        canRetry: false,
      });
    }
  });
};

const handleStripeWebhook = async (req, res) => {
  try {
    const stripeClient = requireConfiguredStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return res.status(503).json({ status: 'error', error: 'STRIPE_WEBHOOK_SECRET is not configured.' });
    }

    const signature = req.headers['stripe-signature'];
    const event = stripeClient.webhooks.constructEvent(req.body, signature, webhookSecret);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      if (session.subscription) {
        const subscription = await stripeClient.subscriptions.retrieve(session.subscription);
        await updateShopFromSubscription(subscription);
      }
    }

    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
      await updateShopFromSubscription(event.data.object);
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const store = await loadStore();
      const shop = Object.values(store.shops).find(item => item.stripeSubscriptionId === subscription.id);
      if (shop) {
        shop.planId = 'free';
        shop.subscriptionStatus = subscription.status || 'deleted';
        shop.updatedAt = new Date().toISOString();
        store.shops[shop.id] = shop;
        await saveStore(store);
      }
    }

    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object;
      const store = await loadStore();
      const shop = Object.values(store.shops).find(item => item.stripeCustomerId === invoice.customer);
      if (shop) {
        shop.subscriptionStatus = 'past_due';
        shop.updatedAt = new Date().toISOString();
        store.shops[shop.id] = shop;
        await saveStore(store);
      }
    }

    res.json({ received: true });
  } catch (error) {
    res.status(400).json({ status: 'error', error: error.message || 'Invalid Stripe webhook.' });
  }
};

const chargeCommercialCredits = async (req, res, feature) => {
  const credits = CREDIT_COSTS[feature] ?? 0;
  if (credits <= 0) return { ok: true, credits: 0 };

  const { store, user, shop, accessGrant } = await ensureAccount(req);
  const effectivePlanId = effectivePlanIdFor(shop, accessGrant);
  const entitlements = buildEntitlements(effectivePlanId);
  const usage = buildUsage(store, shop, monthKey(), accessGrant);
  const idempotencyKey = String(req.get('x-reversr-idempotency-key') || '').trim();
  const eventKey = idempotencyKey || `${shop.id}:${feature}:${hashId(JSON.stringify(req.body || {}))}:${monthKey()}`;
  const existingEvent = store.usageEvents[eventKey];
  if (existingEvent) return { ok: true, credits: existingEvent.credits, usage, event: existingEvent };

  if (!usage.unlimitedCredits && usage.remainingCredits < credits) {
    res.status(402).json({
      error: `${entitlements.planLabel} credits reached. Upgrade or wait for the monthly reset to continue this reconstruction step.`,
      code: 'COMMERCIAL_CREDITS_EXHAUSTED',
      canRetry: false,
      upgradeRequired: true,
      feature,
      creditsRequired: credits,
      usage,
      entitlements,
      billing: buildBillingLinks(),
    });
    return { ok: false };
  }

  const event = {
    id: eventKey,
    userId: user.id,
    shopId: shop.id,
    feature,
    credits,
    month: monthKey(),
    accessGrantType: accessGrant?.type || 'standard',
    createdAt: new Date().toISOString(),
  };
  store.usageEvents[eventKey] = event;
  await saveStore(store);
  return { ok: true, credits, usage: buildUsage(store, shop, monthKey(), accessGrant), event };
};

module.exports = {
  PLAN_CATALOG,
  CREDIT_COSTS,
  chargeCommercialCredits,
  handleStripeWebhook,
  registerCommercialRoutes,
};
