const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const Stripe = require('stripe');

const COMMERCIAL_STORE_FILE = process.env.COMMERCIAL_STORE_FILE || path.join(os.tmpdir(), 'reversr-commercial-store.json');
const BILLING_RETURN_URL = process.env.BILLING_RETURN_URL || process.env.PUBLIC_APP_URL || 'https://reversr.vercel.app/account';
const BILLING_CANCEL_URL = process.env.BILLING_CANCEL_URL || `${BILLING_RETURN_URL}?checkout=cancelled`;
const STRIPE_API_VERSION = '2026-02-25.clover';
const CREDIT_PERIODS = new Set(['day', 'week', 'month']);

const normalizeCreditPeriod = (value = 'month') => {
  const period = String(value || '').trim().toLowerCase();
  return CREDIT_PERIODS.has(period) ? period : 'month';
};

const normalizeCreditCount = (value, fallback) => {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
};

const PLAN_CATALOG = {
  free: {
    id: 'free',
    label: 'Free',
    monthlyCredits: 5,
    creditPeriod: 'week',
    seats: 1,
    priceMonthly: 0,
    features: ['Five reconstruction journeys/week', 'Demo/public inventory', 'Basic preview exports'],
  },
  pro_shop: {
    id: 'pro_shop',
    label: 'Pro Shop',
    monthlyCredits: 100,
    creditPeriod: 'month',
    seats: 1,
    priceMonthly: 49,
    stripePriceEnv: 'STRIPE_PRICE_PRO_SHOP',
    features: ['Full BOM/spec export', 'Quote packet export', 'Cloud-ready shop history', 'Reviewer approval records'],
  },
  team: {
    id: 'team',
    label: 'Team',
    monthlyCredits: 500,
    creditPeriod: 'month',
    seats: 3,
    priceMonthly: 149,
    stripePriceEnv: 'STRIPE_PRICE_TEAM',
    features: ['Shared shop history', 'Inventory connectors', 'Admin controls', 'Team seat management'],
  },
  tester: {
    id: 'tester',
    label: 'Tester',
    monthlyCredits: null,
    creditPeriod: 'month',
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
  commercialConfig: {},
  supportIssues: {},
  supportNotifications: {},
};

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION })
  : null;

const GOOGLE_PLAY_PACKAGE_NAME = process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.vsillah.reversrrebuild';
const GOOGLE_PLAY_PLAN_PRODUCTS = {
  pro_shop: process.env.GOOGLE_PLAY_PRODUCT_PRO_SHOP || 'reversr_pro_shop_monthly',
  team: process.env.GOOGLE_PLAY_PRODUCT_TEAM || 'reversr_team_monthly',
};
let googlePlayAccessTokenCache = null;

const testerInviteEmailFrom = () => String(process.env.TESTER_INVITE_EMAIL_FROM || '').trim();
const testerInviteEmailReplyTo = () => String(process.env.TESTER_INVITE_EMAIL_REPLY_TO || '').trim();
const testerInviteEmailSubjectPrefix = () => String(process.env.TESTER_INVITE_EMAIL_SUBJECT_PREFIX || 'ReversR').trim();
const testerInviteEmailFile = () => String(process.env.TESTER_INVITE_EMAIL_FILE || '').trim();
const resendApiKey = () => String(process.env.RESEND_API_KEY || '').trim();

const hashId = (value = '') => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24);

const dateKey = (date = new Date()) => date.toISOString().slice(0, 10);
const monthKey = (date = new Date()) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
const weekStart = (date = new Date()) => {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + mondayOffset);
  return utc;
};
const periodKey = (period = 'month', date = new Date()) => {
  const normalizedPeriod = normalizeCreditPeriod(period);
  if (normalizedPeriod === 'day') return dateKey(date);
  if (normalizedPeriod === 'week') return `week_${dateKey(weekStart(date))}`;
  return monthKey(date);
};
const nextPeriodReset = (period = 'month', date = new Date()) => {
  const normalizedPeriod = normalizeCreditPeriod(period);
  if (normalizedPeriod === 'day') {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, 0, 0, 0));
  }
  if (normalizedPeriod === 'week') {
    const reset = weekStart(date);
    reset.setUTCDate(reset.getUTCDate() + 7);
    return reset;
  }
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0));
};

const normalizePlanId = (value) => (PLAN_CATALOG[value] ? value : 'free');
const normalizeStoredPlanId = (value) => (BILLABLE_PLAN_IDS.has(value) ? value : 'free');
const planCreditRulesFromEnv = () => ({
  free: {
    credits: normalizeCreditCount(process.env.FREE_JOURNEY_CREDITS, PLAN_CATALOG.free.monthlyCredits),
    period: normalizeCreditPeriod(process.env.FREE_JOURNEY_CREDIT_PERIOD || PLAN_CATALOG.free.creditPeriod),
  },
  pro_shop: {
    credits: normalizeCreditCount(process.env.PRO_SHOP_JOURNEY_CREDITS, PLAN_CATALOG.pro_shop.monthlyCredits),
    period: normalizeCreditPeriod(process.env.PRO_SHOP_JOURNEY_CREDIT_PERIOD || PLAN_CATALOG.pro_shop.creditPeriod),
  },
  team: {
    credits: normalizeCreditCount(process.env.TEAM_JOURNEY_CREDITS, PLAN_CATALOG.team.monthlyCredits),
    period: normalizeCreditPeriod(process.env.TEAM_JOURNEY_CREDIT_PERIOD || PLAN_CATALOG.team.creditPeriod),
  },
});
const getCommercialConfig = (store = DEFAULT_STORE) => ({
  planCreditRules: {
    ...planCreditRulesFromEnv(),
    ...(store.commercialConfig?.planCreditRules || {}),
  },
});
const resolvePlan = (planId, store = DEFAULT_STORE) => {
  const plan = PLAN_CATALOG[normalizePlanId(planId)];
  const rule = getCommercialConfig(store).planCreditRules[plan.id];
  if (!rule || plan.unlimitedCredits) return plan;
  const credits = normalizeCreditCount(rule.credits, plan.monthlyCredits);
  const period = normalizeCreditPeriod(rule.period || plan.creditPeriod);
  return {
    ...plan,
    monthlyCredits: credits,
    creditPeriod: period,
  };
};
const publicPlans = (store = DEFAULT_STORE) => Object.values(PLAN_CATALOG)
  .filter(plan => !plan.internal)
  .map(plan => resolvePlan(plan.id, store));

const listFromEnv = (...names) => names
  .flatMap(name => String(process.env[name] || '').split(','))
  .map(value => value.trim().toLowerCase())
  .filter(Boolean);

const isAllowedValue = (value, allowed) => Boolean(value && allowed.includes(String(value).trim().toLowerCase()));

const timingSafeStringEqual = (left = '', right = '') => {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

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
const normalizeAccessRole = (value = 'tester') => (
  normalizeAccessValue(value) === 'super_admin' ? 'super_admin' : 'tester'
);
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

const buildTesterInviteEmail = (invite = {}) => {
  const subject = `${testerInviteEmailSubjectPrefix()} tester invite`;
  const expiresAt = invite.expiresAt ? new Date(invite.expiresAt).toLocaleString('en-US', { timeZone: 'UTC' }) : 'the listed expiration time';
  const inviteUrlText = invite.inviteUrl ? `\n\nOpen this link on your device if available:\n${invite.inviteUrl}` : '';
  const text = [
    'You have been invited to test ReversR Rebuild.',
    '',
    `Use this one-time admin code in the app: ${invite.activationCode}`,
    `This invite is for: ${invite.email}`,
    `It expires at: ${expiresAt} UTC`,
    '',
    'In the mobile app, open Settings, enter the same work email, then redeem this admin code.',
    inviteUrlText,
  ].filter(Boolean).join('\n');
  const html = `
    <p>You have been invited to test ReversR Rebuild.</p>
    <p><strong>Admin code:</strong> <code>${invite.activationCode}</code></p>
    <p><strong>Email:</strong> ${invite.email}</p>
    <p><strong>Expires:</strong> ${expiresAt} UTC</p>
    <p>In the mobile app, open Settings, enter the same work email, then redeem this admin code.</p>
    ${invite.inviteUrl ? `<p><a href="${invite.inviteUrl}">Open invite link</a></p>` : ''}
  `;
  return { subject, text, html };
};

const appendTesterInviteEmailFile = async (filePath, payload) => {
  const existing = await readJson(filePath, { emails: [] });
  const emails = Array.isArray(existing.emails) ? existing.emails : [];
  await writeJson(filePath, { emails: [...emails, payload] });
};

const sendTesterInviteEmail = async (invite = {}) => {
  const now = new Date().toISOString();
  const message = buildTesterInviteEmail(invite);
  const filePath = testerInviteEmailFile();
  if (filePath) {
    await appendTesterInviteEmailFile(filePath, {
      to: invite.email,
      subject: message.subject,
      text: message.text,
      html: message.html,
      activationCode: invite.activationCode,
      inviteUrl: invite.inviteUrl,
      sentAt: now,
    });
    return { status: 'sent', provider: 'file', sentAt: now };
  }

  const apiKey = resendApiKey();
  const from = testerInviteEmailFrom();
  if (!apiKey || !from) {
    return {
      status: 'not_configured',
      provider: 'manual',
      message: 'Set RESEND_API_KEY and TESTER_INVITE_EMAIL_FROM to send tester invite emails.',
      updatedAt: now,
    };
  }

  const body = {
    from,
    to: [invite.email],
    subject: message.subject,
    text: message.text,
    html: message.html,
    ...(testerInviteEmailReplyTo() ? { reply_to: testerInviteEmailReplyTo() } : {}),
  };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      status: 'failed',
      provider: 'resend',
      message: responseBody.message || responseBody.error || `Resend request failed (${response.status}).`,
      updatedAt: now,
    };
  }

  return {
    status: 'sent',
    provider: 'resend',
    sentAt: now,
    messageId: responseBody.id || '',
  };
};

const requestAccessPassword = (req) => String(
  req.get('x-reversr-access-password') ||
  req.body?.accessPassword ||
  req.body?.currentPassword ||
  ''
);

const superAdminPassword = () => String(process.env.COMMERCIAL_SUPER_ADMIN_PASSWORD || '');

const redactAccessGrant = (grant = {}) => ({
  grantId: grant.grantId,
  clientId: grant.clientId || '',
  email: grant.email || '',
  profileName: grant.profileName || '',
  shopName: grant.shopName || '',
  planId: grant.planId || 'tester',
  role: normalizeAccessRole(grant.role || 'tester'),
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
  emailDelivery: invite.emailDelivery || { status: 'not_configured', provider: 'manual' },
  activationCode: invite.active !== false && invite.status === 'pending' && invite.emailDelivery?.status !== 'sent'
    ? invite.activationCode || ''
    : '',
  inviteUrl: invite.active !== false && invite.status === 'pending' && invite.emailDelivery?.status !== 'sent'
    ? invite.inviteUrl || ''
    : '',
});

const SUPPORT_SEVERITIES = new Set(['low', 'normal', 'high', 'critical']);
const SUPPORT_STATUSES = new Set(['open', 'triaging', 'ai_remediated', 'resolved']);

const truncateText = (value = '', maxLength = 4000) => {
  const text = String(value || '').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
};

const sanitizeSessionLog = (sessionLog = {}) => {
  if (!sessionLog || typeof sessionLog !== 'object' || Array.isArray(sessionLog)) return {};
  const allowedKeys = [
    'platform',
    'appVersion',
    'nativeBuildVersion',
    'runtimeVersion',
    'deviceClientId',
    'profileEmail',
    'profileName',
    'shopName',
    'accountRole',
    'planId',
    'currentScreen',
    'workflowPhase',
    'lastAction',
    'recentErrors',
    'notes',
  ];
  return allowedKeys.reduce((result, key) => {
    const value = sessionLog[key];
    if (value == null) return result;
    if (Array.isArray(value)) {
      result[key] = value.slice(-12).map(item => truncateText(item, 600));
      return result;
    }
    if (typeof value === 'object') {
      result[key] = truncateText(JSON.stringify(value), 1000);
      return result;
    }
    result[key] = truncateText(value, 1000);
    return result;
  }, {});
};

const normalizeSupportSeverity = (value = 'normal') => {
  const severity = String(value || '').trim().toLowerCase();
  return SUPPORT_SEVERITIES.has(severity) ? severity : 'normal';
};

const normalizeSupportStatus = (value = 'open') => {
  const status = String(value || '').trim().toLowerCase();
  return SUPPORT_STATUSES.has(status) ? status : 'open';
};

const buildSupportIssueId = ({ clientId = '', title = '', createdAt = '' }) => (
  `issue_${hashId([clientId, title, createdAt, crypto.randomBytes(6).toString('hex')].join('|'))}`
);

const buildSupportNotificationId = ({ clientId = '', issueId = '', createdAt = '' }) => (
  `notification_${hashId([clientId, issueId, createdAt, crypto.randomBytes(6).toString('hex')].join('|'))}`
);

const redactSupportIssue = (issue = {}, { includeSessionLog = false } = {}) => ({
  issueId: issue.issueId || '',
  status: normalizeSupportStatus(issue.status),
  severity: normalizeSupportSeverity(issue.severity),
  title: issue.title || '',
  description: issue.description || '',
  clientId: issue.clientId || '',
  profileName: issue.profileName || '',
  profileEmail: issue.profileEmail || '',
  shopName: issue.shopName || '',
  source: issue.source || 'in_app',
  createdAt: issue.createdAt || '',
  updatedAt: issue.updatedAt || '',
  resolvedAt: issue.resolvedAt || '',
  resolutionSummary: issue.resolutionSummary || '',
  userMessage: issue.userMessage || '',
  aiRemediation: issue.aiRemediation || null,
  events: issue.events || [],
  sessionLog: includeSessionLog ? sanitizeSessionLog(issue.sessionLog || {}) : undefined,
  sessionLogKeys: Object.keys(issue.sessionLog || {}),
});

const redactSupportNotification = (notification = {}) => ({
  notificationId: notification.notificationId || '',
  issueId: notification.issueId || '',
  clientId: notification.clientId || '',
  title: notification.title || '',
  message: notification.message || '',
  status: notification.status || 'unread',
  createdAt: notification.createdAt || '',
  readAt: notification.readAt || '',
});

const listSupportIssues = (store, { includeSessionLog = false } = {}) => Object.values(store.supportIssues || {})
  .map(issue => redactSupportIssue(issue, { includeSessionLog }))
  .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));

const listSupportNotificationsForClient = (store, clientId = '') => Object.values(store.supportNotifications || {})
  .filter(notification => notification.clientId === clientId)
  .map(redactSupportNotification)
  .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));

const findMatchingStoredGrant = (store, profile) => {
  const grants = Object.values(store.commercialAccessGrants || {})
    .filter(grant => grant.active !== false);
  return (
    grants.find(grant => grant.clientId && normalizeAccessValue(grant.clientId) === normalizeAccessValue(profile.clientId)) ||
    grants.find(grant => grant.email && normalizeAccessValue(grant.email) === normalizeAccessValue(profile.email)) ||
    grants.find(grant => grant.profileName && normalizeAccessValue(grant.profileName) === normalizeAccessValue(profile.name)) ||
    grants.find(grant => grant.shopName && normalizeAccessValue(grant.shopName) === normalizeAccessValue(profile.shopName)) ||
    null
  );
};

const isClientBoundInviteGrant = (grant = {}, profile = {}) => (
  grant.active !== false &&
  grant.createdByInviteId &&
  grant.mustResetPassword === false &&
  grant.clientId &&
  normalizeAccessValue(grant.clientId) === normalizeAccessValue(profile.clientId)
);

const getCommercialAccessGrant = (profile, store = DEFAULT_STORE, accessPassword = '') => {
  const superAdminEmails = listFromEnv('COMMERCIAL_SUPER_ADMIN_EMAILS', 'REVERSR_SUPER_ADMIN_EMAILS');
  const testerEmails = listFromEnv('COMMERCIAL_TESTER_EMAILS', 'REVERSR_TESTER_EMAILS');
  const testerClientIds = listFromEnv('COMMERCIAL_TESTER_CLIENT_IDS', 'REVERSR_TESTER_CLIENT_IDS');
  const testerProfileNames = listFromEnv('COMMERCIAL_TESTER_PROFILE_NAMES', 'REVERSR_TESTER_PROFILE_NAMES');

  if (
    isAllowedValue(profile.email, superAdminEmails) &&
    superAdminPassword() &&
    timingSafeStringEqual(accessPassword, superAdminPassword())
  ) {
    return {
      type: 'super_admin',
      planId: 'tester',
      role: 'super_admin',
      subscriptionStatus: 'super_admin_grant',
      requiresPasswordReset: false,
    };
  }

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
    const role = normalizeAccessRole(storedGrant.role || 'tester');
    return {
      type: role,
      planId: storedGrant.planId || 'tester',
      role,
      grantId: storedGrant.grantId,
      subscriptionStatus: role === 'super_admin' ? 'super_admin_grant' : 'tester_grant',
      requiresPasswordReset: false,
    };
  }

  if (storedGrant && verifyPassword(accessPassword, storedGrant)) {
    const role = normalizeAccessRole(storedGrant.role || 'tester');
    return {
      type: role,
      planId: storedGrant.planId || 'tester',
      role,
      grantId: storedGrant.grantId,
      subscriptionStatus: storedGrant.mustResetPassword === false
        ? (role === 'super_admin' ? 'super_admin_grant' : 'tester_grant')
        : 'starter_password_reset_required',
      requiresPasswordReset: storedGrant.mustResetPassword !== false,
    };
  }

  return null;
};

const effectivePlanIdFor = (shop, accessGrant) => accessGrant?.planId || normalizeStoredPlanId(shop.planId);

const buildBillingLinks = (store = DEFAULT_STORE) => {
  const separator = BILLING_RETURN_URL.includes('?') ? '&' : '?';
  return {
    accountUrl: BILLING_RETURN_URL,
    upgradeUrl: `${BILLING_RETURN_URL}${separator}upgrade=credits`,
    canManageOnWeb: true,
    plans: publicPlans(store).filter(plan => plan.id !== 'free').map(plan => ({
      id: plan.id,
      label: plan.label,
      priceMonthly: plan.priceMonthly,
      monthlyCredits: plan.monthlyCredits,
      creditPeriod: plan.creditPeriod,
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

const buildEntitlements = (planId, store = DEFAULT_STORE) => {
  const plan = resolvePlan(planId, store);
  const isInternalTester = plan.id === 'tester';
  return {
    planId: plan.id,
    planLabel: plan.label,
    monthlyCredits: plan.monthlyCredits,
    creditPeriod: plan.creditPeriod,
    unlimitedCredits: Boolean(plan.unlimitedCredits),
    seats: plan.seats,
    canExportQuotePacket: plan.id !== 'free',
    canUseInventoryConnectors: plan.id === 'team' || isInternalTester,
    canUseCloudHistory: plan.id !== 'free',
    canManageTeam: plan.id === 'team' || isInternalTester,
    canUseCadReviewQueue: plan.id !== 'free',
    canUseAdminConsole: false,
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

const buildUsage = (store, shop, date = new Date(), accessGrant = null) => {
  const entitlements = buildEntitlements(effectivePlanIdFor(shop, accessGrant), store);
  const period = normalizeCreditPeriod(entitlements.creditPeriod || 'month');
  const key = periodKey(period, date);
  const resetAt = nextPeriodReset(period, date);
  const includeInternalAccessUsage = accessGrant?.type === 'tester' || accessGrant?.type === 'super_admin';
  const events = Object.values(store.usageEvents || {}).filter(event => (
    event.shopId === shop.id &&
    (event.periodKey || event.month) === key &&
    (includeInternalAccessUsage
      ? (event.accessGrantType === 'tester' || event.accessGrantType === 'super_admin')
      : (event.accessGrantType !== 'tester' && event.accessGrantType !== 'super_admin'))
  ));
  const usedCredits = events.reduce((sum, event) => sum + Number(event.credits || 0), 0);
  const unlimitedCredits = Boolean(entitlements.unlimitedCredits);
  return {
    month: key,
    period,
    periodKey: key,
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
  const effectivePlan = resolvePlan(effectivePlanId, store);
  const entitlements = buildEntitlements(effectivePlanId, store);
  const isSuperAdmin = accessGrant?.role === 'super_admin';
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
    billingLinks: buildBillingLinks(store),
  },
  entitlements: {
    ...entitlements,
    canUseAdminConsole: Boolean(entitlements.canUseAdminConsole || isSuperAdmin),
  },
  usage: buildUsage(store, shop, new Date(), accessGrant),
  plans: publicPlans(store),
  creditCosts: CREDIT_COSTS,
  access: accessGrant ? {
    type: accessGrant.type,
    grantId: accessGrant.grantId || '',
    role: accessGrant.role || '',
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

const googlePlayPlanFromProductId = (productId = '') => (
  Object.entries(GOOGLE_PLAY_PLAN_PRODUCTS).find(([, configuredProductId]) => configuredProductId === productId)?.[0] || null
);

const requireGooglePlayServiceAccount = () => {
  const rawJson = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  const credentials = rawJson
    ? JSON.parse(rawJson)
    : {
      client_email: process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY,
    };

  if (!credentials.client_email || !credentials.private_key) {
    const error = new Error('Google Play billing verification is not configured. Set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON, or GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL and GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY.');
    error.statusCode = 503;
    throw error;
  }

  return {
    clientEmail: credentials.client_email,
    privateKey: String(credentials.private_key).replace(/\\n/g, '\n'),
  };
};

const base64UrlJson = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

const getGooglePlayAccessToken = async () => {
  if (googlePlayAccessTokenCache && googlePlayAccessTokenCache.expiresAt > Date.now() + 60000) {
    return googlePlayAccessTokenCache.accessToken;
  }

  const credentials = requireGooglePlayServiceAccount();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const assertionHeader = base64UrlJson({ alg: 'RS256', typ: 'JWT' });
  const assertionBody = base64UrlJson({
    iss: credentials.clientEmail,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    exp: nowSeconds + 3600,
    iat: nowSeconds,
  });
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${assertionHeader}.${assertionBody}`);
  signer.end();
  const signature = signer.sign(credentials.privateKey, 'base64url');
  const assertion = `${assertionHeader}.${assertionBody}.${signature}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    const error = new Error(body.error_description || body.error || 'Unable to authenticate Google Play service account.');
    error.statusCode = 503;
    throw error;
  }

  googlePlayAccessTokenCache = {
    accessToken: body.access_token,
    expiresAt: Date.now() + Math.max(60, Number(body.expires_in || 3600)) * 1000,
  };
  return googlePlayAccessTokenCache.accessToken;
};

const getGooglePlaySubscriptionPurchase = async (purchaseToken) => {
  const accessToken = await getGooglePlayAccessToken();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(GOOGLE_PLAY_PACKAGE_NAME)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error?.message || body.error || 'Google Play subscription verification failed.');
    error.statusCode = response.status === 404 ? 400 : 503;
    throw error;
  }
  return body;
};

const googlePlayPurchaseHasEntitlement = (purchase = {}) => {
  const entitledStates = new Set([
    'SUBSCRIPTION_STATE_ACTIVE',
    'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
    'SUBSCRIPTION_STATE_CANCELED',
  ]);
  if (!entitledStates.has(purchase.subscriptionState)) return false;
  const now = Date.now();
  return (purchase.lineItems || []).some(item => {
    const expiryTime = item.expiryTime ? Date.parse(item.expiryTime) : 0;
    return !Number.isFinite(expiryTime) || expiryTime > now;
  });
};

const googlePlayPurchaseExpiry = (purchase = {}) => (
  (purchase.lineItems || [])
    .map(item => Date.parse(item.expiryTime || ''))
    .filter(value => Number.isFinite(value))
    .sort((left, right) => right - left)[0] || 0
);

const googlePlayPurchaseProductIds = (purchase = {}) => (
  (purchase.lineItems || []).map(item => item.productId).filter(Boolean)
);

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

const registerCommercialRoutes = (app, { requireAdmin, generateSupportIssueRemediation } = {}) => {
  const requireCommercialAdmin = async (req, res) => {
    try {
      const store = await loadStore();
      const profile = requestProfile(req);
      const accessGrant = getCommercialAccessGrant(profile, store, requestAccessPassword(req));
      if (accessGrant?.role === 'super_admin' && !accessGrant.requiresPasswordReset) {
        return true;
      }
    } catch (_error) {
      // Fall through to the deployment-level admin token check below.
    }

    if (!requireAdmin || !requireAdmin(req, res)) return false;
    return true;
  };

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
      res.json({ status: 'ok', usage: buildUsage(store, shop, new Date(), accessGrant), creditCosts: CREDIT_COSTS });
    } catch (error) {
      res.status(500).json({ status: 'error', error: error.message || 'Failed to load usage.' });
    }
  });

  app.get('/api/entitlements', async (req, res) => {
    try {
      const { store, shop, accessGrant } = await ensureAccount(req);
      res.json({
        status: 'ok',
        entitlements: buildEntitlements(effectivePlanIdFor(shop, accessGrant), store),
        plans: publicPlans(store),
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

  app.post('/api/support/issues', async (req, res) => {
    try {
      const profile = requestProfile(req);
      const title = truncateText(req.body?.title, 140);
      const description = truncateText(req.body?.description, 5000);
      if (!title || !description) {
        return res.status(400).json({
          status: 'error',
          error: 'Issue title and description are required.',
          canRetry: false,
        });
      }

      const store = await loadStore();
      const now = new Date().toISOString();
      const issue = {
        issueId: buildSupportIssueId({ clientId: profile.clientId, title, createdAt: now }),
        status: 'open',
        severity: normalizeSupportSeverity(req.body?.severity),
        title,
        description,
        clientId: profile.clientId,
        profileName: profile.name,
        profileEmail: profile.email,
        shopName: profile.shopName,
        source: 'in_app',
        sessionLog: sanitizeSessionLog(req.body?.sessionLog || {}),
        events: [{ type: 'submitted', at: now, actor: 'user' }],
        createdAt: now,
        updatedAt: now,
      };

      store.supportIssues = {
        ...(store.supportIssues || {}),
        [issue.issueId]: issue,
      };
      await saveStore(store);
      res.json({ status: 'ok', issue: redactSupportIssue(issue, { includeSessionLog: true }) });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message || 'Failed to submit support issue.',
        canRetry: true,
      });
    }
  });

  app.get('/api/support/notifications', async (req, res) => {
    try {
      const store = await loadStore();
      const profile = requestProfile(req);
      res.json({
        status: 'ok',
        notifications: listSupportNotificationsForClient(store, profile.clientId),
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message || 'Failed to load support notifications.',
        canRetry: true,
      });
    }
  });

  app.post('/api/support/notifications/:notificationId/read', async (req, res) => {
    try {
      const store = await loadStore();
      const profile = requestProfile(req);
      const notificationId = String(req.params.notificationId || '').trim();
      const notification = store.supportNotifications?.[notificationId];
      if (!notification || notification.clientId !== profile.clientId) {
        return res.status(404).json({
          status: 'error',
          error: 'Notification not found.',
          canRetry: false,
        });
      }
      notification.status = 'read';
      notification.readAt = notification.readAt || new Date().toISOString();
      store.supportNotifications[notification.notificationId] = notification;
      await saveStore(store);
      res.json({ status: 'ok', notification: redactSupportNotification(notification) });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message || 'Failed to mark support notification read.',
        canRetry: true,
      });
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

  app.get('/api/admin/commercial/credit-config', async (req, res) => {
    if (!(await requireCommercialAdmin(req, res))) return;
    try {
      const store = await loadStore();
      res.json({
        status: 'ok',
        config: getCommercialConfig(store),
        plans: publicPlans(store),
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message || 'Failed to load journey credit configuration.',
        canRetry: true,
      });
    }
  });

  app.post('/api/admin/commercial/credit-config', async (req, res) => {
    if (!(await requireCommercialAdmin(req, res))) return;
    try {
      const planId = normalizeStoredPlanId(req.body?.planId || 'free');
      const credits = normalizeCreditCount(req.body?.credits, PLAN_CATALOG[planId].monthlyCredits);
      const period = normalizeCreditPeriod(req.body?.period || PLAN_CATALOG[planId].creditPeriod);
      const store = await loadStore();
      const currentConfig = getCommercialConfig(store);

      store.commercialConfig = {
        ...(store.commercialConfig || {}),
        planCreditRules: {
          ...(currentConfig.planCreditRules || {}),
          [planId]: { credits, period },
        },
        updatedAt: new Date().toISOString(),
      };

      await saveStore(store);
      res.json({
        status: 'ok',
        config: getCommercialConfig(store),
        plans: publicPlans(store),
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message || 'Failed to save journey credit configuration.',
        canRetry: true,
      });
    }
  });

  app.get('/api/admin/support/issues', async (req, res) => {
    if (!(await requireCommercialAdmin(req, res))) return;
    try {
      const store = await loadStore();
      res.json({
        status: 'ok',
        issues: listSupportIssues(store, { includeSessionLog: false }),
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message || 'Failed to list support issues.',
        canRetry: true,
      });
    }
  });

  app.get('/api/admin/support/issues/:issueId', async (req, res) => {
    if (!(await requireCommercialAdmin(req, res))) return;
    try {
      const store = await loadStore();
      const issue = store.supportIssues?.[String(req.params.issueId || '')];
      if (!issue) {
        return res.status(404).json({
          status: 'error',
          error: 'Support issue not found.',
          canRetry: false,
        });
      }
      res.json({ status: 'ok', issue: redactSupportIssue(issue, { includeSessionLog: true }) });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message || 'Failed to load support issue.',
        canRetry: true,
      });
    }
  });

  app.post('/api/admin/support/issues/:issueId/remediate', async (req, res) => {
    if (!(await requireCommercialAdmin(req, res))) return;
    try {
      const store = await loadStore();
      const issue = store.supportIssues?.[String(req.params.issueId || '')];
      if (!issue) {
        return res.status(404).json({
          status: 'error',
          error: 'Support issue not found.',
          canRetry: false,
        });
      }

      const remediation = generateSupportIssueRemediation
        ? await generateSupportIssueRemediation(redactSupportIssue(issue, { includeSessionLog: true }))
        : {
          summary: 'AI remediation is not configured on this API server.',
          rootCause: 'No remediation provider is registered.',
          resolutionSteps: ['Review the session log manually.', 'Resolve the issue from the admin queue.'],
          userMessage: 'A ReversR admin reviewed your report and will follow up after the fix is verified.',
          followUpChecks: ['Confirm the reported workflow no longer fails.'],
          automationActions: [],
          confidence: 'low',
        };
      const now = new Date().toISOString();
      issue.status = 'ai_remediated';
      issue.aiRemediation = {
        ...remediation,
        generatedAt: now,
        generatedBy: 'ai',
      };
      issue.events = [
        ...(issue.events || []),
        { type: 'ai_remediation_generated', at: now, actor: 'super_admin' },
      ];
      issue.updatedAt = now;
      store.supportIssues[issue.issueId] = issue;
      await saveStore(store);
      res.json({ status: 'ok', issue: redactSupportIssue(issue, { includeSessionLog: true }) });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message || 'Failed to generate AI remediation.',
        canRetry: true,
      });
    }
  });

  app.post('/api/admin/support/issues/:issueId/resolve', async (req, res) => {
    if (!(await requireCommercialAdmin(req, res))) return;
    try {
      const store = await loadStore();
      const issue = store.supportIssues?.[String(req.params.issueId || '')];
      if (!issue) {
        return res.status(404).json({
          status: 'error',
          error: 'Support issue not found.',
          canRetry: false,
        });
      }

      const now = new Date().toISOString();
      const resolutionSummary = truncateText(
        req.body?.resolutionSummary || issue.aiRemediation?.summary || 'Issue resolved by ReversR admin.',
        2000
      );
      const userMessage = truncateText(
        req.body?.userMessage || issue.aiRemediation?.userMessage || 'Your ReversR issue has been resolved. Please retry the workflow.',
        2000
      );
      issue.status = 'resolved';
      issue.resolutionSummary = resolutionSummary;
      issue.userMessage = userMessage;
      issue.resolvedAt = now;
      issue.updatedAt = now;
      issue.events = [
        ...(issue.events || []),
        { type: 'resolved', at: now, actor: 'super_admin' },
      ];
      store.supportIssues[issue.issueId] = issue;

      const notification = {
        notificationId: buildSupportNotificationId({ clientId: issue.clientId, issueId: issue.issueId, createdAt: now }),
        issueId: issue.issueId,
        clientId: issue.clientId,
        title: `Resolved: ${issue.title}`,
        message: userMessage,
        status: 'unread',
        createdAt: now,
      };
      store.supportNotifications = {
        ...(store.supportNotifications || {}),
        [notification.notificationId]: notification,
      };
      await saveStore(store);

      res.json({
        status: 'ok',
        issue: redactSupportIssue(issue, { includeSessionLog: true }),
        notification: redactSupportNotification(notification),
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message || 'Failed to resolve support issue.',
        canRetry: true,
      });
    }
  });

  app.get('/api/admin/commercial/access-grants', async (req, res) => {
    if (!(await requireCommercialAdmin(req, res))) return;
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
    if (!(await requireCommercialAdmin(req, res))) return;
    try {
      const clientId = String(req.body?.clientId || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const profileName = String(req.body?.profileName || '').trim();
      const shopName = String(req.body?.shopName || '').trim();
      const startingPassword = String(req.body?.startingPassword || '');
      const role = normalizeAccessRole(req.body?.role || 'tester');
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
        role,
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
    if (!(await requireCommercialAdmin(req, res))) return;
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
    if (!(await requireCommercialAdmin(req, res))) return;
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
    if (!(await requireCommercialAdmin(req, res))) return;
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
          activationCode: token,
          inviteUrl: buildTesterInviteUrl(token),
          expiresAt: buildTesterInviteExpiry(requestedInvite?.expiresInDays || req.body?.expiresInDays),
          createdAt: now,
          updatedAt: now,
        };

        store.testerInvites[invite.inviteId] = invite;
        invites.push(invite);
      }

      await saveStore(store);
      for (const invite of invites) {
        invite.emailDelivery = await sendTesterInviteEmail(invite);
        invite.updatedAt = new Date().toISOString();
        store.testerInvites[invite.inviteId] = invite;
      }

      await saveStore(store);
      const redactedInvites = invites.map(redactTesterInvite);
      res.json({ status: 'ok', invite: redactedInvites[0], invites: redactedInvites });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message || 'Failed to create tester invite.',
        canRetry: true,
      });
    }
  });

  app.delete('/api/admin/commercial/tester-invites/:inviteId', async (req, res) => {
    if (!(await requireCommercialAdmin(req, res))) return;
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

  app.post('/api/admin/commercial/tester-invites/:inviteId/send', async (req, res) => {
    if (!(await requireCommercialAdmin(req, res))) return;
    try {
      const inviteId = String(req.params.inviteId || '').trim();
      const store = await loadStore();
      const invite = store.testerInvites?.[inviteId];
      if (!invite) {
        return res.status(404).json({
          status: 'error',
          error: 'Tester invite not found.',
          canRetry: false,
        });
      }
      if (invite.active === false || invite.status !== 'pending') {
        return res.status(409).json({
          status: 'error',
          error: 'Only pending active tester invites can be emailed.',
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
          error: 'Tester invite has expired. Create a new invite before sending email.',
          canRetry: false,
        });
      }

      invite.emailDelivery = await sendTesterInviteEmail(invite);
      invite.updatedAt = new Date().toISOString();
      store.testerInvites[invite.inviteId] = invite;
      await saveStore(store);
      res.json({ status: 'ok', invite: redactTesterInvite(invite) });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message || 'Failed to send tester invite email.',
        canRetry: true,
      });
    }
  });

  app.post('/api/commercial/tester-invites/lookup', async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const validationError = validateInviteEmail(email);
      if (validationError) {
        return res.status(400).json({ status: 'error', error: validationError, canRetry: false });
      }

      const profile = requestProfile(req);
      if (normalizeAccessValue(profile.email) !== normalizeAccessValue(email)) {
        return res.status(403).json({
          status: 'error',
          error: 'Save this work email on the device before finding its tester admin code.',
          canRetry: true,
        });
      }

      const store = await loadStore();
      const now = Date.now();
      const invites = Object.values(store.testerInvites || {})
        .filter(invite => String(invite.email || '').trim().toLowerCase() === email)
        .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
      const activeInvite = invites.find(invite => invite.active !== false && invite.status === 'pending');

      if (!activeInvite) {
        return res.status(404).json({
          status: 'error',
          error: 'No active tester invite exists for this email. Ask a ReversR admin to create one first.',
          canRetry: false,
        });
      }

      if (activeInvite.expiresAt && new Date(activeInvite.expiresAt).getTime() < now) {
        activeInvite.active = false;
        activeInvite.status = 'expired';
        activeInvite.updatedAt = new Date().toISOString();
        store.testerInvites[activeInvite.inviteId] = activeInvite;
        await saveStore(store);
        return res.status(409).json({
          status: 'error',
          error: 'The tester invite for this email has expired. Ask a ReversR admin to create a new one.',
          canRetry: false,
        });
      }

      if (!activeInvite.activationCode) {
        return res.status(409).json({
          status: 'error',
          error: 'A tester invite exists for this email, but its code was created before in-app retrieval was available. Ask a ReversR admin to recreate the invite.',
          canRetry: false,
        });
      }

      res.json({
        status: 'ok',
        invite: redactTesterInvite(activeInvite),
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message || 'Failed to look up tester invite.',
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

      if (normalizeAccessValue(profile.email) !== normalizeAccessValue(invite.email)) {
        return res.status(403).json({
          status: 'error',
          error: 'This admin code belongs to a different tester email. Save the invited work email before redeeming it.',
          canRetry: true,
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
        role: 'tester',
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

  app.post('/api/billing/google-play/subscription', async (req, res) => {
    try {
      const requestedPlanId = normalizeStoredPlanId(req.body?.planId);
      const productId = String(req.body?.productId || '').trim();
      const purchaseToken = String(req.body?.purchaseToken || '').trim();
      if (!purchaseToken || !productId) {
        return res.status(400).json({
          status: 'error',
          error: 'Google Play product ID and purchase token are required.',
          canRetry: false,
        });
      }
      if (requestedPlanId === 'free') {
        return res.status(400).json({
          status: 'error',
          error: 'Free plan does not require Google Play checkout.',
          canRetry: false,
        });
      }

      const expectedProductId = GOOGLE_PLAY_PLAN_PRODUCTS[requestedPlanId];
      const productPlanId = googlePlayPlanFromProductId(productId);
      if (!expectedProductId || expectedProductId !== productId || productPlanId !== requestedPlanId) {
        return res.status(400).json({
          status: 'error',
          error: 'Google Play product does not match the requested ReversR plan.',
          canRetry: false,
        });
      }

      const purchase = await getGooglePlaySubscriptionPurchase(purchaseToken);
      const verifiedProductIds = googlePlayPurchaseProductIds(purchase);
      if (!verifiedProductIds.includes(productId)) {
        return res.status(400).json({
          status: 'error',
          error: 'Google Play purchase token does not include the selected ReversR plan.',
          canRetry: false,
        });
      }
      if (!googlePlayPurchaseHasEntitlement(purchase)) {
        return res.status(402).json({
          status: 'error',
          error: `Google Play subscription is not active (${purchase.subscriptionState || 'unknown'}).`,
          canRetry: true,
        });
      }

      const { store, user, shop, accessGrant } = await ensureAccount(req);
      const now = new Date().toISOString();
      const subscriptionId = `google_play_${hashId(purchaseToken)}`;
      const expiryTime = googlePlayPurchaseExpiry(purchase);
      shop.planId = requestedPlanId;
      shop.subscriptionStatus = 'google_play_active';
      shop.currentPeriodEnd = expiryTime ? new Date(expiryTime).toISOString() : '';
      shop.googlePlaySubscriptionId = subscriptionId;
      shop.googlePlayPurchaseTokenHash = hashId(purchaseToken);
      shop.updatedAt = now;
      store.shops[shop.id] = shop;
      store.subscriptions[subscriptionId] = {
        id: subscriptionId,
        provider: 'google_play',
        shopId: shop.id,
        userId: user.id,
        planId: requestedPlanId,
        productId,
        packageName: GOOGLE_PLAY_PACKAGE_NAME,
        status: purchase.subscriptionState,
        purchaseTokenHash: hashId(purchaseToken),
        transactionId: String(req.body?.transactionId || ''),
        currentPeriodEnd: shop.currentPeriodEnd,
        updatedAt: now,
      };
      await saveStore(store);

      res.json({
        status: 'ok',
        provider: 'google_play',
        account: buildAccountResponse(store, user, shop, accessGrant),
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({
        status: 'error',
        error: error.message || 'Failed to verify Google Play subscription.',
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
  const entitlements = buildEntitlements(effectivePlanId, store);
  const usage = buildUsage(store, shop, new Date(), accessGrant);
  const idempotencyKey = String(req.get('x-reversr-idempotency-key') || '').trim();
  const activePeriodKey = usage.periodKey || usage.month;
  const eventKey = idempotencyKey || `${shop.id}:${feature}:${hashId(JSON.stringify(req.body || {}))}:${activePeriodKey}`;
  const existingEvent = store.usageEvents[eventKey];
  if (existingEvent) return { ok: true, credits: existingEvent.credits, usage, event: existingEvent };

  if (!usage.unlimitedCredits && usage.remainingCredits < credits) {
    res.status(402).json({
      error: `${entitlements.planLabel} journey credits reached. Upgrade or wait for the next credit reset to start another reconstruction.`,
      code: 'COMMERCIAL_CREDITS_EXHAUSTED',
      canRetry: false,
      upgradeRequired: true,
      feature,
      creditsRequired: credits,
      usage,
      entitlements,
      billing: buildBillingLinks(store),
    });
    return { ok: false };
  }

  const event = {
    id: eventKey,
    userId: user.id,
    shopId: shop.id,
    feature,
    credits,
    month: activePeriodKey,
    period: usage.period,
    periodKey: activePeriodKey,
    accessGrantType: accessGrant?.type || 'standard',
    createdAt: new Date().toISOString(),
  };
  store.usageEvents[eventKey] = event;
  await saveStore(store);
  return { ok: true, credits, usage: buildUsage(store, shop, new Date(), accessGrant), event };
};

module.exports = {
  PLAN_CATALOG,
  CREDIT_COSTS,
  chargeCommercialCredits,
  handleStripeWebhook,
  registerCommercialRoutes,
};
