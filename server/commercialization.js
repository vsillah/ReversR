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
    monthlyCredits: 1,
    seats: 1,
    priceMonthly: 0,
    features: ['One reconstruction journey/month', 'Demo/public inventory', 'Basic preview exports'],
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
  'technical-spec': 0,
  'generate-3d': 0,
  'generate-2d': 0,
  'generate-2d-single-angle': 0,
  'generate-2d-angles': 0,
  'generate-bom': 0,
  'export-packet': 0,
};

const DEFAULT_STORE = {
  users: {},
  shops: {},
  usageEvents: {},
  subscriptions: {},
  commercialAccessGrants: {},
  testerInvites: {},
};

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION })
  : null;

const hashId = (value = '') => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24);

const monthKey = (date = new Date()) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
const nextMonthReset = (date = new Date()) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0));

const normalizePlanId = (value) => (PLAN_CATALOG[value] ? value : 'free');
const normalizeStoredPlanId = (value) => (BILLABLE_PLAN_IDS.has(value) ? value : 'free');
const publicPlans = () => Object.values(PLAN_CATALOG).filter(plan => !plan.internal);

const listFromEnv = (...names) => names
  .flatMap(name => String(process.env[name] || '').split(','))
  .map(value => value.trim().toLowerCase())
  .filter(Boolean);

const isAllowedValue = (value, allowed) => Boolean(value && allowed.includes(String(value).trim().toLowerCase()));

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => ({
  salt,
  hash: crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex'),
  algorithm: 'pbkdf2-sha256',
});

const verifyPassword = (password, credential = {}) => {
  if (!password || !credential.passwordHash || !credential.passwordSalt) return false;
  const candidate = hashPassword(password, credential.passwordSalt).hash;
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(credential.passwordHash, 'hex'));
};

const normalizeAccessValue = (value = '') => String(value).trim().toLowerCase();
const normalizeInvitePlatform = (value = 'both') => {
  const platform = normalizeAccessValue(value || 'both');
  return ['ios', 'android', 'both', 'web'].includes(platform) ? platform : 'both';
};

const testerInviteTtlDays = () => Math.max(1, Math.min(90, Number(process.env.TESTER_INVITE_TTL_DAYS || 14)));

const buildTesterInviteExpiry = (days = testerInviteTtlDays()) => (
  new Date(Date.now() + (Math.max(1, Math.min(90, Number(days) || testerInviteTtlDays())) * 24 * 60 * 60 * 1000)).toISOString()
);

const generateTesterInviteToken = () => crypto.randomBytes(18).toString('base64url');
const hashTesterInviteToken = (token = '') => crypto.createHash('sha256').update(String(token).trim()).digest('hex');
const buildTesterInviteId = ({ email = '', tokenHash = '', createdAt = '' }) => (
  `invite_${hashId([email, tokenHash, createdAt].map(normalizeAccessValue).join('|'))}`
);

const buildTesterInviteUrl = (token = '') => {
  const baseUrl = process.env.TESTER_INVITE_BASE_URL || process.env.PUBLIC_APP_URL || BILLING_RETURN_URL;
  if (!baseUrl) return '';
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}testerInvite=${encodeURIComponent(token)}`;
};

const requestAccessPassword = (req) => String(
  req.get('x-reversr-access-password') ||
  req.body?.accessPassword ||
  req.body?.currentPassword ||
  ''
);

const redactAccessGrant = (grant = {}) => ({
  grantId: grant.grantId,
  clientId: grant.clientId || '',
  email: grant.email || '',
  profileName: grant.profileName || '',
  shopName: grant.shopName || '',
  planId: grant.planId || 'tester',
  active: grant.active !== false,
  mustResetPassword: grant.mustResetPassword !== false,
  createdByInviteId: grant.createdByInviteId || '',
  inviteEmail: grant.inviteEmail || '',
  createdAt: grant.createdAt || '',
  updatedAt: grant.updatedAt || '',
  lastActivatedAt: grant.lastActivatedAt || '',
});

const redactTesterInvite = (invite = {}) => ({
  inviteId: invite.inviteId,
  email: invite.email || '',
  platform: invite.platform || 'both',
  status: invite.status || 'pending',
  active: invite.active !== false,
  expiresAt: invite.expiresAt || '',
  createdAt: invite.createdAt || '',
  updatedAt: invite.updatedAt || '',
  redeemedAt: invite.redeemedAt || '',
  redeemedClientId: invite.redeemedClientId || '',
  grantId: invite.grantId || '',
});

const findMatchingStoredGrant = (store, profile) => {
  const grants = Object.values(store.commercialAccessGrants || {});
  return grants.find(grant => {
    if (grant.active === false) return false;
    return (
      (grant.clientId && normalizeAccessValue(grant.clientId) === normalizeAccessValue(profile.clientId)) ||
      (grant.email && normalizeAccessValue(grant.email) === normalizeAccessValue(profile.email)) ||
      (grant.profileName && normalizeAccessValue(grant.profileName) === normalizeAccessValue(profile.name)) ||
      (grant.shopName && normalizeAccessValue(grant.shopName) === normalizeAccessValue(profile.shopName))
    );
  }) || null;
};

const isClientBoundInviteGrant = (grant = {}, profile = {}) => (
  grant.active !== false &&
  grant.createdByInviteId &&
  grant.mustResetPassword === false &&
  grant.clientId &&
  normalizeAccessValue(grant.clientId) === normalizeAccessValue(profile.clientId)
);

const getCommercialAccessGrant = (profile, store = DEFAULT_STORE, accessPassword = '') => {
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
      requiresPasswordReset: false,
    };
  }

  const storedGrant = findMatchingStoredGrant(store, profile);
  if (storedGrant && isClientBoundInviteGrant(storedGrant, profile)) {
    return {
      type: 'tester',
      planId: storedGrant.planId || 'tester',
      role: 'tester',
      grantId: storedGrant.grantId,
      subscriptionStatus: 'tester_grant',
      requiresPasswordReset: false,
    };
  }

  if (storedGrant && verifyPassword(accessPassword, storedGrant)) {
    return {
      type: 'tester',
      planId: storedGrant.planId || 'tester',
      role: 'tester',
      grantId: storedGrant.grantId,
      subscriptionStatus: storedGrant.mustResetPassword === false ? 'tester_grant' : 'starter_password_reset_required',
      requiresPasswordReset: storedGrant.mustResetPassword !== false,
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
  const accessGrant = getCommercialAccessGrant(profile, store, requestAccessPassword(req));

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
  const resetAt = nextMonthReset();
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
    resetAt: resetAt.toISOString(),
    resetInSeconds: Math.max(0, Math.ceil((resetAt.getTime() - Date.now()) / 1000)),
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
  access: accessGrant ? {
    type: accessGrant.type,
    grantId: accessGrant.grantId || '',
    requiresPasswordReset: Boolean(accessGrant.requiresPasswordReset),
  } : null,
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

const validateGrantTarget = ({ clientId = '', email = '', profileName = '', shopName = '' }) => {
  if (!clientId && !email && !profileName && !shopName) {
    return 'Provide at least one target: clientId, email, profileName, or shopName.';
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Email target must be a valid email address.';
  }
  return null;
};

const validateInviteEmail = (email = '') => {
  if (!email) return 'Tester email is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Tester email must be a valid email address.';
  return null;
};

const buildGrantId = ({ clientId = '', email = '', profileName = '', shopName = '' }) => (
  `grant_${hashId([clientId, email, profileName, shopName].map(normalizeAccessValue).join('|'))}`
);

const buildClientInviteGrantId = ({ clientId = '', email = '' }) => (
  `grant_${hashId(['invite', clientId, email].map(normalizeAccessValue).join('|'))}`
);

const resolveAuthenticatedGrant = async (req) => {
  const store = await loadStore();
  const profile = requestProfile(req);
  const grant = findMatchingStoredGrant(store, profile);
  const accessPassword = requestAccessPassword(req);

  if (!grant || !verifyPassword(accessPassword, grant)) {
    const error = new Error('Access password is invalid for this profile.');
    error.statusCode = 401;
    throw error;
  }

  return { store, profile, grant };
};

const registerCommercialRoutes = (app, { requireAdmin } = {}) => {
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

  app.post('/api/commercial/access/activate', async (req, res) => {
    try {
      const { store, profile, grant } = await resolveAuthenticatedGrant(req);
      const now = new Date().toISOString();
      grant.lastActivatedAt = now;
      grant.updatedAt = now;
      store.commercialAccessGrants[grant.grantId] = grant;
      await saveStore(store);

      const accessGrant = getCommercialAccessGrant(profile, store, requestAccessPassword(req));
      const accountReq = {
        ...req,
        get: (name) => {
          const lowerName = String(name).toLowerCase();
          if (lowerName === 'x-reversr-access-password') return requestAccessPassword(req);
          return req.get(name);
        },
      };
      const { store: accountStore, user, shop } = await ensureAccount(accountReq);
      res.json({
        status: 'ok',
        account: buildAccountResponse(accountStore, user, shop, accessGrant),
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        status: 'error',
        error: error.message || 'Failed to activate access grant.',
        canRetry: false,
      });
    }
  });

  app.post('/api/commercial/access/reset-password', async (req, res) => {
    try {
      const newPassword = String(req.body?.newPassword || '');
      if (newPassword.length < 8) {
        return res.status(400).json({
          status: 'error',
          error: 'New access password must be at least 8 characters.',
          canRetry: false,
        });
      }

      const { store, profile, grant } = await resolveAuthenticatedGrant(req);
      const { salt, hash, algorithm } = hashPassword(newPassword);
      const now = new Date().toISOString();
      grant.passwordSalt = salt;
      grant.passwordHash = hash;
      grant.passwordAlgorithm = algorithm;
      grant.mustResetPassword = false;
      grant.updatedAt = now;
      grant.lastActivatedAt = now;
      store.commercialAccessGrants[grant.grantId] = grant;
      await saveStore(store);

      const accessGrant = getCommercialAccessGrant(profile, store, newPassword);
      const accountReq = {
        ...req,
        get: (name) => {
          const lowerName = String(name).toLowerCase();
          if (lowerName === 'x-reversr-access-password') return newPassword;
          return req.get(name);
        },
      };
      const { store: accountStore, user, shop } = await ensureAccount(accountReq);
      res.json({
        status: 'ok',
        account: buildAccountResponse(accountStore, user, shop, accessGrant),
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        status: 'error',
        error: error.message || 'Failed to reset access password.',
        canRetry: false,
      });
    }
  });

  app.get('/api/admin/commercial/access-grants', async (req, res) => {
    if (!requireAdmin || !requireAdmin(req, res)) return;
    try {
      const store = await loadStore();
      res.json({
        status: 'ok',
        grants: Object.values(store.commercialAccessGrants || {})
          .map(redactAccessGrant)
          .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt))),
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message || 'Failed to list commercial access grants.',
        canRetry: true,
      });
    }
  });

  app.post('/api/admin/commercial/access-grants', async (req, res) => {
    if (!requireAdmin || !requireAdmin(req, res)) return;
    try {
      const clientId = String(req.body?.clientId || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const profileName = String(req.body?.profileName || '').trim();
      const shopName = String(req.body?.shopName || '').trim();
      const startingPassword = String(req.body?.startingPassword || '');
      const planId = 'tester';
      const validationError = validateGrantTarget({ clientId, email, profileName, shopName });
      if (validationError) {
        return res.status(400).json({ status: 'error', error: validationError, canRetry: false });
      }
      if (startingPassword.length < 8) {
        return res.status(400).json({
          status: 'error',
          error: 'Starting password must be at least 8 characters.',
          canRetry: false,
        });
      }

      const store = await loadStore();
      const grantId = buildGrantId({ clientId, email, profileName, shopName });
      const existing = store.commercialAccessGrants?.[grantId] || {};
      const { salt, hash, algorithm } = hashPassword(startingPassword);
      const now = new Date().toISOString();
      const grant = {
        ...existing,
        grantId,
        clientId,
        email,
        profileName,
        shopName,
        planId,
        active: true,
        mustResetPassword: true,
        passwordSalt: salt,
        passwordHash: hash,
        passwordAlgorithm: algorithm,
        createdAt: existing.createdAt || now,
        updatedAt: now,
      };

      store.commercialAccessGrants = {
        ...(store.commercialAccessGrants || {}),
        [grantId]: grant,
      };
      await saveStore(store);
      res.json({ status: 'ok', grant: redactAccessGrant(grant) });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message || 'Failed to save commercial access grant.',
        canRetry: true,
      });
    }
  });

  app.delete('/api/admin/commercial/access-grants/:grantId', async (req, res) => {
    if (!requireAdmin || !requireAdmin(req, res)) return;
    try {
      const grantId = String(req.params.grantId || '').trim();
      const store = await loadStore();
      const grant = store.commercialAccessGrants?.[grantId];
      if (!grant) {
        return res.json({ status: 'ok', grantId, revoked: false });
      }
      grant.active = false;
      grant.updatedAt = new Date().toISOString();
      store.commercialAccessGrants[grantId] = grant;
      await saveStore(store);
      res.json({ status: 'ok', grantId, revoked: true });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message || 'Failed to revoke commercial access grant.',
        canRetry: true,
      });
    }
  });

  app.get('/api/admin/commercial/tester-invites', async (req, res) => {
    if (!requireAdmin || !requireAdmin(req, res)) return;
    try {
      const store = await loadStore();
      res.json({
        status: 'ok',
        invites: Object.values(store.testerInvites || {})
          .map(redactTesterInvite)
          .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt))),
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message || 'Failed to list tester invites.',
        canRetry: true,
      });
    }
  });

  app.post('/api/admin/commercial/tester-invites', async (req, res) => {
    if (!requireAdmin || !requireAdmin(req, res)) return;
    try {
      const requestedInvites = Array.isArray(req.body?.testers) && req.body.testers.length > 0
        ? req.body.testers
        : [req.body || {}];
      if (requestedInvites.length > 50) {
        return res.status(400).json({
          status: 'error',
          error: 'Create 50 tester invites or fewer at a time.',
          canRetry: false,
        });
      }

      const store = await loadStore();
      store.testerInvites = store.testerInvites || {};
      const now = new Date().toISOString();
      const invites = [];

      for (const requestedInvite of requestedInvites) {
        const email = String(requestedInvite?.email || '').trim().toLowerCase();
        const validationError = validateInviteEmail(email);
        if (validationError) {
          return res.status(400).json({ status: 'error', error: validationError, canRetry: false });
        }

        const token = generateTesterInviteToken();
        const tokenHash = hashTesterInviteToken(token);
        const invite = {
          inviteId: buildTesterInviteId({ email, tokenHash, createdAt: now }),
          email,
          platform: normalizeInvitePlatform(requestedInvite?.platform || req.body?.platform || 'both'),
          status: 'pending',
          active: true,
          tokenHash,
          expiresAt: buildTesterInviteExpiry(requestedInvite?.expiresInDays || req.body?.expiresInDays),
          createdAt: now,
          updatedAt: now,
        };

        store.testerInvites[invite.inviteId] = invite;
        invites.push({
          ...redactTesterInvite(invite),
          activationCode: token,
          inviteUrl: buildTesterInviteUrl(token),
        });
      }

      await saveStore(store);
      res.json({ status: 'ok', invite: invites[0], invites });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message || 'Failed to create tester invite.',
        canRetry: true,
      });
    }
  });

  app.delete('/api/admin/commercial/tester-invites/:inviteId', async (req, res) => {
    if (!requireAdmin || !requireAdmin(req, res)) return;
    try {
      const inviteId = String(req.params.inviteId || '').trim();
      const store = await loadStore();
      const invite = store.testerInvites?.[inviteId];
      if (!invite) {
        return res.json({ status: 'ok', inviteId, revoked: false });
      }
      invite.active = false;
      invite.status = invite.status === 'redeemed' ? 'redeemed' : 'revoked';
      invite.updatedAt = new Date().toISOString();
      store.testerInvites[inviteId] = invite;
      await saveStore(store);
      res.json({ status: 'ok', inviteId, revoked: true, invite: redactTesterInvite(invite) });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message || 'Failed to revoke tester invite.',
        canRetry: true,
      });
    }
  });

  app.post('/api/commercial/tester-invites/redeem', async (req, res) => {
    try {
      const token = String(req.body?.token || req.body?.activationCode || '').trim();
      if (!token) {
        return res.status(400).json({
          status: 'error',
          error: 'Tester invite code is required.',
          canRetry: false,
        });
      }

      const store = await loadStore();
      const profile = requestProfile(req);
      const tokenHash = hashTesterInviteToken(token);
      const invite = Object.values(store.testerInvites || {}).find(item => item.tokenHash === tokenHash);
      if (!invite || invite.active === false || invite.status !== 'pending') {
        return res.status(409).json({
          status: 'error',
          error: 'Tester invite code is invalid, expired, or already used.',
          canRetry: false,
        });
      }
      if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
        invite.active = false;
        invite.status = 'expired';
        invite.updatedAt = new Date().toISOString();
        store.testerInvites[invite.inviteId] = invite;
        await saveStore(store);
        return res.status(409).json({
          status: 'error',
          error: 'Tester invite code has expired.',
          canRetry: false,
        });
      }

      const now = new Date().toISOString();
      const grantId = buildClientInviteGrantId({ clientId: profile.clientId, email: invite.email });
      const existingGrant = store.commercialAccessGrants?.[grantId] || {};
      const grant = {
        ...existingGrant,
        grantId,
        clientId: profile.clientId,
        email: invite.email,
        profileName: profile.name,
        shopName: profile.shopName,
        planId: 'tester',
        active: true,
        mustResetPassword: false,
        createdByInviteId: invite.inviteId,
        inviteEmail: invite.email,
        createdAt: existingGrant.createdAt || now,
        updatedAt: now,
        lastActivatedAt: now,
      };

      invite.status = 'redeemed';
      invite.active = false;
      invite.redeemedAt = now;
      invite.redeemedClientId = profile.clientId;
      invite.grantId = grantId;
      invite.updatedAt = now;

      store.commercialAccessGrants = {
        ...(store.commercialAccessGrants || {}),
        [grantId]: grant,
      };
      store.testerInvites = {
        ...(store.testerInvites || {}),
        [invite.inviteId]: invite,
      };
      await saveStore(store);

      const accountReq = {
        ...req,
        get: (name) => {
          const lowerName = String(name).toLowerCase();
          if (lowerName === 'x-reversr-client-id') return profile.clientId;
          if (lowerName === 'x-reversr-profile-email') return profile.email;
          if (lowerName === 'x-reversr-profile-name') return profile.name;
          if (lowerName === 'x-reversr-shop-name') return profile.shopName;
          return req.get(name);
        },
      };
      const { store: accountStore, user, shop, accessGrant } = await ensureAccount(accountReq);
      res.json({
        status: 'ok',
        invite: redactTesterInvite(invite),
        account: buildAccountResponse(accountStore, user, shop, accessGrant),
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        status: 'error',
        error: error.message || 'Failed to redeem tester invite.',
        canRetry: false,
      });
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
      error: `${entitlements.planLabel} journey credits reached. Upgrade or wait for the monthly reset to start another reconstruction.`,
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
