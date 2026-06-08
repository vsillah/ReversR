const fs = require('fs');

const args = new Set(process.argv.slice(2));
const allowPlaceholder = args.has('--allow-placeholder');
const envPath = process.env.API_ENV_FILE || 'docs/production-api-env.example';

const failures = [];
const warnings = [];

const fail = (message) => failures.push(message);
const warn = (message) => warnings.push(message);
const exists = (path) => fs.existsSync(path);

const parseEnv = (text) => {
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    result[key] = value;
  }
  return result;
};

const isPlaceholder = (value = '') => (
  !value ||
  /replace-with|your-domain\.example|example\.(com|net|org)|localhost|127\.0\.0\.1/i.test(String(value))
);
const isHttpsUrl = (value = '') => /^https:\/\/[^/]+\.[^/]+/i.test(String(value));
const requireOrWarn = (condition, message) => {
  if (condition) return;
  if (allowPlaceholder) warn(message);
  else fail(message);
};

if (!exists(envPath)) {
  fail(`API environment file is missing: ${envPath}`);
} else {
  const env = parseEnv(fs.readFileSync(envPath, 'utf8'));

  if (!/^[1-9]\d*$/.test(env.API_PORT || '')) {
    fail('API_PORT must be a positive integer.');
  }

  const origins = String(env.API_CORS_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
  requireOrWarn(origins.length > 0, 'API_CORS_ORIGINS must include at least one hosted HTTPS origin.');
  if (origins.includes('*')) {
    requireOrWarn(false, 'API_CORS_ORIGINS must not be "*" for production.');
  }
  for (const origin of origins) {
    requireOrWarn(isHttpsUrl(origin) && !isPlaceholder(origin), `API_CORS_ORIGINS contains non-production origin: ${origin}`);
  }

  if (!/^\d+(kb|mb)$/i.test(env.API_REQUEST_BODY_LIMIT || '')) {
    fail('API_REQUEST_BODY_LIMIT must be set with kb or mb units, for example 50mb.');
  }

  const hasGeminiKey = Boolean(env.AI_INTEGRATIONS_GEMINI_API_KEY && !isPlaceholder(env.AI_INTEGRATIONS_GEMINI_API_KEY));
  const hasGeminiPool = Boolean(env.GEMINI_API_KEYS && env.GEMINI_API_KEYS.split(',').some(key => key.trim() && !isPlaceholder(key.trim())));
  requireOrWarn(
    hasGeminiKey || hasGeminiPool,
    'At least one Gemini API key must be configured for production photo analysis and reconstruction.'
  );

  if (env.OLLAMA_HOST) {
    requireOrWarn(!/localhost|127\.0\.0\.1|\[::1\]/i.test(env.OLLAMA_HOST), 'OLLAMA_HOST points to localhost; do not use local Ollama for store builds.');
  }

  requireOrWarn(
    Boolean(env.ADMIN_API_TOKEN && !isPlaceholder(env.ADMIN_API_TOKEN) && env.ADMIN_API_TOKEN.length >= 32),
    'ADMIN_API_TOKEN must be a non-placeholder value at least 32 characters long when admin credential routes are enabled.'
  );

  if (env.INVENTORY_CONNECTOR_SECRETS_JSON) {
    try {
      JSON.parse(env.INVENTORY_CONNECTOR_SECRETS_JSON);
    } catch (error) {
      fail(`INVENTORY_CONNECTOR_SECRETS_JSON must be valid JSON: ${error.message}`);
    }
  }

  if (env.INVENTORY_CONNECTOR_SECRETS_FILE) {
    requireOrWarn(
      !/\.env|secret|credential/i.test(env.INVENTORY_CONNECTOR_SECRETS_FILE),
      'INVENTORY_CONNECTOR_SECRETS_FILE should be a mounted registry path, not a committed env/secret filename.'
    );
  }

  if (!['true', 'false', ''].includes(String(env.INVENTORY_PRIVATE_NETWORK_ENABLED || '').toLowerCase())) {
    fail('INVENTORY_PRIVATE_NETWORK_ENABLED must be true or false.');
  }
  requireOrWarn(
    String(env.INVENTORY_PRIVATE_NETWORK_ENABLED || 'false').toLowerCase() !== 'true',
    'INVENTORY_PRIVATE_NETWORK_ENABLED should stay false unless the API host has approved private-network controls.'
  );
}

if (warnings.length > 0) {
  console.log('Warnings:');
  for (const message of warnings) console.log(`- ${message}`);
}

if (failures.length > 0) {
  console.error('API environment preflight failed:');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log(`API environment preflight passed for ${envPath}.`);
