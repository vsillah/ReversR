const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const crypto = require('crypto');
const { GoogleGenAI, Type, Modality } = require('@google/genai');
const { Ollama } = require('ollama');
const farmBotInventory = require('../public/inventory/farmbot-genesis-v1.8.json');

const ollama = new Ollama({ host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434' });
const app = express();
const parseListEnv = (value = '') => String(value)
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);
const configuredCorsOrigins = parseListEnv(process.env.API_CORS_ORIGINS);
const corsAllowsAllOrigins = configuredCorsOrigins.length === 0 || configuredCorsOrigins.includes('*');
const apiRequestBodyLimit = process.env.API_REQUEST_BODY_LIMIT || '50mb';

app.use(cors({
  origin: (origin, callback) => {
    if (corsAllowsAllOrigins || !origin || configuredCorsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin ${origin} is not allowed by API_CORS_ORIGINS.`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Token'],
}));
app.use(express.json({ limit: apiRequestBodyLimit }));

// API KEY POOL & RATE LIMIT HANDLING
// ============================================

// Parse API keys from environment (comma-separated for multiple keys)
const parseApiKeys = () => {
  const primaryKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const additionalKeys = process.env.GEMINI_API_KEYS || '';
  
  const keys = [primaryKey].filter(Boolean);
  if (additionalKeys) {
    keys.push(...additionalKeys.split(',').map(k => k.trim()).filter(Boolean));
  }
  
  return keys.map(apiKey => ({
    apiKey,
    cooldownUntil: 0,
    consecutiveFailures: 0,
  }));
};

let apiKeyPool = parseApiKeys();
let currentKeyIndex = 0;

const hasConfiguredGeminiKey = () => apiKeyPool.some(keyInfo => !!keyInfo.apiKey);

// Get the next available API key (skip keys in cooldown)
const getAvailableKey = () => {
  const now = Date.now();
  const startIndex = currentKeyIndex;
  
  for (let i = 0; i < apiKeyPool.length; i++) {
    const idx = (startIndex + i) % apiKeyPool.length;
    const keyInfo = apiKeyPool[idx];
    
    if (keyInfo.cooldownUntil <= now) {
      currentKeyIndex = (idx + 1) % apiKeyPool.length;
      return keyInfo;
    }
  }
  
  // All keys in cooldown - return the one with shortest remaining cooldown
  const sortedByAvailability = [...apiKeyPool].sort((a, b) => a.cooldownUntil - b.cooldownUntil);
  return sortedByAvailability[0];
};

// Mark a key as rate limited (put in cooldown)
const markKeyRateLimited = (keyInfo, retryAfterSeconds = 60) => {
  keyInfo.cooldownUntil = Date.now() + (retryAfterSeconds * 1000);
  keyInfo.consecutiveFailures++;
  console.log(`API key rate limited, cooling down for ${retryAfterSeconds}s. Total keys: ${apiKeyPool.length}, Keys available: ${apiKeyPool.filter(k => k.cooldownUntil <= Date.now()).length}`);
};

// Mark a key as successful
const markKeySuccess = (keyInfo) => {
  keyInfo.consecutiveFailures = 0;
};

// Create client with specific key
const createClient = (keyInfo) => {
  return new GoogleGenAI({
    apiKey: keyInfo.apiKey,
    httpOptions: {
      apiVersion: "",
      baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
    },
  });
};

// ============================================
// EXPONENTIAL BACKOFF WITH JITTER
// ============================================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const getBackoffDelay = (attempt, baseDelay = 1000, maxDelay = 30000) => {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 1000;
  return Math.min(exponentialDelay + jitter, maxDelay);
};

// ============================================
// SIMPLE LRU CACHE
// ============================================

class LRUCache {
  constructor(maxSize = 50, ttlMs = 300000) { // 5 min default TTL
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  _hash(obj) {
    return JSON.stringify(obj);
  }

  get(key) {
    const hash = this._hash(key);
    const entry = this.cache.get(hash);
    if (!entry) return null;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(hash);
      return null;
    }
    
    // Move to end (most recently used)
    this.cache.delete(hash);
    this.cache.set(hash, entry);
    return entry.value;
  }

  set(key, value) {
    const hash = this._hash(key);
    
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    
    this.cache.set(hash, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  clear() {
    this.cache.clear();
  }
}

const responseCache = new LRUCache(50, 300000); // 50 items, 5 min TTL

// ============================================
// RESILIENT GEMINI API WRAPPER
// ============================================

const callGeminiWithRetry = async (generateFn, cacheKey = null, maxRetries = 3) => {
  // Check cache first
  if (cacheKey) {
    const cached = responseCache.get(cacheKey);
    if (cached) {
      console.log('Cache hit for request');
      return cached;
    }
  }

  let lastError = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const keyInfo = getAvailableKey();
    const ai = createClient(keyInfo);
    
    // If key is still in cooldown, wait
    const now = Date.now();
    if (keyInfo.cooldownUntil > now) {
      const waitTime = keyInfo.cooldownUntil - now;
      console.log(`All keys in cooldown, waiting ${waitTime}ms...`);
      await sleep(waitTime);
    }

    try {
      const result = await generateFn(ai);
      markKeySuccess(keyInfo);
      
      // Cache successful result
      if (cacheKey && result) {
        responseCache.set(cacheKey, result);
      }
      
      return result;
    } catch (error) {
      lastError = error;
      const errorMessage = error.message || '';
      const statusCode = error.status || error.code || 0;
      
      // Check if rate limited (429) or quota exceeded
      const isRateLimited = 
        statusCode === 429 || 
        errorMessage.includes('429') || 
        errorMessage.includes('quota') || 
        errorMessage.includes('RESOURCE_EXHAUSTED') ||
        errorMessage.includes('rate limit');
      
      if (isRateLimited) {
        // Parse retry-after header if available
        const retryAfter = parseInt(error.headers?.['retry-after'] || '60', 10);
        markKeyRateLimited(keyInfo, retryAfter);
        
        if (attempt < maxRetries - 1) {
          const backoffDelay = getBackoffDelay(attempt);
          console.log(`Rate limited, attempt ${attempt + 1}/${maxRetries}, backing off ${backoffDelay}ms`);
          await sleep(backoffDelay);
          continue;
        }
      }
      
      // For other errors, use shorter backoff
      if (attempt < maxRetries - 1) {
        const backoffDelay = getBackoffDelay(attempt, 500, 5000);
        console.log(`Error on attempt ${attempt + 1}/${maxRetries}: ${errorMessage}, retrying in ${backoffDelay}ms`);
        await sleep(backoffDelay);
      }
    }
  }
  
  throw lastError;
};

// ============================================
// OLLAMA API WRAPPER
// ============================================

const geminiSchemaToJSONSchema = (schema) => {
  const replacer = (key, value) => {
    if (value === Type.STRING) return 'string';
    if (value === Type.NUMBER) return 'number';
    if (value === Type.INTEGER) return 'integer';
    if (value === Type.BOOLEAN) return 'boolean';
    if (value === Type.ARRAY) return 'array';
    if (value === Type.OBJECT) return 'object';
    return value;
  };
  return JSON.parse(JSON.stringify(schema, replacer));
};

const callOllamaWithRetry = async (model, prompt, schema, systemInstruction, imageBase64, maxRetries = 3) => {
  let lastError = null;
  const jsonSchema = geminiSchemaToJSONSchema(schema);
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const options = {
        model: model,
        prompt: prompt + '\n\nIMPORTANT: You must respond ONLY with valid JSON. Ensure your response matches this schema exactly:\n' + JSON.stringify(jsonSchema, null, 2),
        system: systemInstruction,
        format: 'json',
        stream: false,
      };
      
      if (imageBase64) {
        const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
        options.images = [base64Data];
      }
      
      const response = await ollama.generate(options);
      
      try {
        return JSON.parse(response.response);
      } catch (parseError) {
        console.error("Failed to parse Ollama output as JSON:", response.response);
        throw new Error("Invalid JSON response from Ollama");
      }
    } catch (error) {
      lastError = error;
      console.log(`Ollama error on attempt ${attempt + 1}/${maxRetries}: ${error.message}`);
      await sleep(getBackoffDelay(attempt, 1000, 5000));
    }
  }
  
  throw lastError;
};

// ============================================
// ERROR RESPONSE HELPERS
// ============================================

const createErrorResponse = (error, fallbackMessage = 'An error occurred') => {
  const errorMessage = error.message || '';
  
  const isRateLimited = 
    errorMessage.includes('429') || 
    errorMessage.includes('quota') || 
    errorMessage.includes('RESOURCE_EXHAUSTED') ||
    errorMessage.includes('rate limit');
  
  if (isRateLimited) {
    return {
      statusCode: 429,
      body: {
        error: 'System is experiencing high demand. Please try again in a moment.',
        code: 'RATE_LIMITED',
        retryAfter: 30,
        canRetry: true,
      }
    };
  }
  
  return {
    statusCode: 500,
    body: {
      error: fallbackMessage,
      code: 'SERVER_ERROR',
      details: errorMessage,
      canRetry: true,
    }
  };
};

const shouldUseDeterministicAiFallback = (error) => {
  const errorMessage = error?.message || '';
  const statusCode = error?.status || error?.code || 0;

  return (
    statusCode === 404 ||
    errorMessage.includes('default credentials') ||
    errorMessage.includes('"code":404') ||
    errorMessage.includes('"status":"Not Found"') ||
    errorMessage.includes('model is not found')
  );
};

// ============================================
// SYSTEM INSTRUCTION
// ============================================

const RECONSTRUCTION_SYSTEM_INSTRUCTION = `You are a manufacturing reconstruction analyst. Identify machines from approved inventory, preserve evidence, avoid inventing unsupported parts, and produce practical bills of materials, assembly steps, pricing estimates, and 3D modeling handoff notes.`;

const normalizeName = (value = '') => value.trim().replace(/\s+/g, ' ');
const normalizeToken = (value = '') => normalizeName(String(value)).toLowerCase();

const splitList = (value) => {
  if (Array.isArray(value)) return value.map(item => normalizeName(String(item))).filter(Boolean);
  if (!value) return [];
  return String(value)
    .split(/[|;,]/)
    .map(item => normalizeName(item))
    .filter(Boolean);
};

const safeJsonParse = (value, fallback) => {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const parseCsvLine = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
};

const parseCsvRecords = (text) => {
  const lines = String(text)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map(header => header.trim());
  return lines.slice(1).map(line => {
    const cells = parseCsvLine(line);
    return headers.reduce((record, header, index) => {
      record[header] = cells[index] || '';
      return record;
    }, {});
  });
};

const normalizeAssemblySteps = (value, fallbackParts) => {
  const parsed = safeJsonParse(value, null);
  if (Array.isArray(parsed)) {
    return parsed.map((step, index) => ({
      stepNumber: Number(step.stepNumber || index + 1),
      title: normalizeName(step.title || `Assembly step ${index + 1}`),
      instructions: normalizeName(step.instructions || step.description || 'Assemble and verify this stage.'),
      parts: splitList(step.parts || fallbackParts),
      estimatedTime: normalizeName(step.estimatedTime || step.time || 'TBD'),
      qualityCheck: normalizeName(step.qualityCheck || step.qc || 'Admin verifies fit and function.'),
    }));
  }

  return [
    {
      stepNumber: 1,
      title: 'Verify inventory record',
      instructions: 'Confirm machine ID, revision, and required subassemblies against the approved inventory record.',
      parts: fallbackParts.slice(0, 3),
      estimatedTime: '20 min',
      qualityCheck: 'Machine ID and revision are confirmed by an admin.',
    },
    {
      stepNumber: 2,
      title: 'Stage core assemblies',
      instructions: 'Lay out core assemblies, fasteners, and tooling before rebuild work begins.',
      parts: fallbackParts.slice(0, 6),
      estimatedTime: '45 min',
      qualityCheck: 'All required parts are present and revision-compatible.',
    },
    {
      stepNumber: 3,
      title: 'Assemble and calibrate',
      instructions: 'Follow the machine-specific sequence, torque guidance, wiring notes, and calibration routine.',
      parts: fallbackParts,
      estimatedTime: '2-4 hr',
      qualityCheck: 'Functional test and calibration report are complete.',
    },
  ];
};

const normalizePricing = (value) => {
  const parsed = safeJsonParse(value, null);
  if (parsed && typeof parsed === 'object') {
    return {
      partsSubtotal: parsed.partsSubtotal || parsed.parts || '$TBD',
      modelingEstimate: parsed.modelingEstimate || parsed.modeling || '$TBD',
      fabricationEstimate: parsed.fabricationEstimate || parsed.fabrication || '$TBD',
      assemblyLaborEstimate: parsed.assemblyLaborEstimate || parsed.assemblyLabor || '$TBD',
      totalEstimate: parsed.totalEstimate || parsed.total || '$TBD',
      confidence: parsed.confidence || 'medium',
    };
  }

  return {
    partsSubtotal: '$420-$780',
    modelingEstimate: '$300-$900',
    fabricationEstimate: '$500-$1,600',
    assemblyLaborEstimate: '$240-$640',
    totalEstimate: '$1,460-$3,920',
    confidence: 'medium',
  };
};

const normalizeFulfillmentOptions = (value) => {
  const parsed = safeJsonParse(value, null);
  if (Array.isArray(parsed)) {
    return parsed.map(option => ({
      vendorName: normalizeName(option.vendorName || option.name || 'Vendor'),
      serviceType: normalizeName(option.serviceType || option.service || '3D modeling and fabrication quote'),
      url: normalizeName(option.url || ''),
      packageRequired: splitList(option.packageRequired || option.package || ['BOM CSV', 'STL/OBJ files', 'assembly notes']),
    }));
  }

  return [
    {
      vendorName: 'Xometry',
      serviceType: '3D modeling and fabrication quote',
      url: 'https://www.xometry.com',
      packageRequired: ['BOM CSV', 'STL/OBJ files', 'assembly notes'],
    },
    {
      vendorName: 'Protolabs',
      serviceType: 'rapid prototyping quote',
      url: 'https://www.protolabs.com',
      packageRequired: ['part drawings', 'materials', 'quantities'],
    },
  ];
};

const normalizeSourceLinks = (value) => {
  const parsed = safeJsonParse(value, null);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

  return Object.entries(parsed).reduce((links, [key, url]) => {
    const normalizedUrl = normalizeName(url);
    if (normalizedUrl) links[key] = normalizedUrl;
    return links;
  }, {});
};

const normalizeReferenceImages = (value) => {
  const parsed = safeJsonParse(value, null);
  const imageRecords = Array.isArray(parsed) ? parsed : [parsed].filter(Boolean);

  return imageRecords
    .map((image, index) => {
      if (typeof image === 'string') {
        return {
          id: `reference-image-${index + 1}`,
          label: `Reference image ${index + 1}`,
          url: normalizeName(image),
          kind: 'source-reference',
        };
      }

      if (!image || typeof image !== 'object') return null;

      return {
        id: normalizeName(image.id || `reference-image-${index + 1}`),
        label: normalizeName(image.label || image.title || `Reference image ${index + 1}`),
        url: normalizeName(image.url || image.imageUrl || image.src || ''),
        sourceUrl: normalizeName(image.sourceUrl || image.pageUrl || ''),
        licenseNote: normalizeName(image.licenseNote || image.license || ''),
        kind: normalizeName(image.kind || 'source-reference'),
      };
    })
    .filter(image => image?.url);
};

const normalizeMachineRecord = (record = {}, index = 0) => {
  const machineId = normalizeName(record.machineId || record.id || record.sku || record.assetId || `INV-${String(index + 1).padStart(4, '0')}`);
  const machineName = normalizeName(record.machineName || record.name || record.title || record.model || 'Unnamed Machine');
  const parts = splitList(record.parts || record.components || record.bomParts || record.requiredParts);
  const aliases = splitList(record.aliases || record.keywords || record.tags);
  const materials = splitList(record.materials || record.material);
  const vendors = normalizeFulfillmentOptions(record.fulfillmentOptions || record.modelingVendors || record.vendors);
  const assemblySteps = normalizeAssemblySteps(record.assemblySteps || record.steps, parts);
  const pricing = normalizePricing(record.pricing || record.pricingSnapshot);
  const sourceLinks = normalizeSourceLinks(record.sourceLinks || record.links || record.sources);
  const referenceImages = normalizeReferenceImages(record.referenceImages || record.referenceImage || record.imageUrl || record.images);

  return {
    machineId,
    machineName,
    revision: normalizeName(record.revision || record.version || ''),
    aliases,
    parts,
    materials,
    assemblySteps,
    pricing,
    fulfillmentOptions: vendors,
    sourceLinks,
    referenceImages,
    notes: normalizeName(record.notes || record.description || ''),
    sourceRow: index + 1,
  };
};

const recordsFromPayload = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.machines)) return payload.machines;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const PUBLIC_FARMBOT_SOURCE_NAME = farmBotInventory.sourceName || 'FarmBot Genesis public hardware documentation';
const DEMO_MACHINE_RECORDS = recordsFromPayload(farmBotInventory)
  .map(normalizeMachineRecord)
  .filter(record => record.machineName && record.machineId);

if (DEMO_MACHINE_RECORDS.length === 0) {
  throw new Error('Bundled FarmBot inventory did not contain any machine records.');
}

const resolveInventorySourceName = (connector = {}) => {
  if (!connector.sourceUrl || connector.sourceUrl.startsWith('demo://')) {
    return PUBLIC_FARMBOT_SOURCE_NAME;
  }
  return connector.sourceName || 'Inventory';
};

const normalizeCredentialRef = (value = '') => String(value).trim();
const getCredentialRegistryPath = () => process.env.INVENTORY_CONNECTOR_SECRETS_FILE || '';

const timingSafeEqual = (left = '', right = '') => {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const requireAdmin = (req, res) => {
  const configuredToken = process.env.ADMIN_API_TOKEN;
  if (!configuredToken) {
    res.status(503).json({
      error: 'Admin credential registry is disabled. Set ADMIN_API_TOKEN on the API server to enable it.',
      code: 'ADMIN_DISABLED',
      canRetry: false,
    });
    return false;
  }

  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : req.get('x-admin-token');
  if (!token || !timingSafeEqual(token, configuredToken)) {
    res.status(401).json({
      error: 'Admin token is required to manage inventory connector credentials.',
      code: 'ADMIN_UNAUTHORIZED',
      canRetry: false,
    });
    return false;
  }

  return true;
};

const parseConnectorSecrets = () => {
  const raw = process.env.INVENTORY_CONNECTOR_SECRETS_JSON;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch (error) {
    console.warn('INVENTORY_CONNECTOR_SECRETS_JSON is not valid JSON.');
    return {};
  }
};

const readConnectorSecretsFile = async () => {
  const registryPath = getCredentialRegistryPath();
  if (!registryPath) return {};
  try {
    const raw = await fs.readFile(registryPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
};

const writeConnectorSecretsFile = async (secrets) => {
  const registryPath = getCredentialRegistryPath();
  if (!registryPath) {
    throw new Error('Set INVENTORY_CONNECTOR_SECRETS_FILE to enable runtime credential registry writes.');
  }
  await fs.writeFile(registryPath, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 });
};

const loadConnectorSecrets = async () => ({
  ...parseConnectorSecrets(),
  ...(await readConnectorSecretsFile()),
});

const redactCredentialSummary = (ref, credential = {}) => ({
  credentialRef: ref,
  authModes: [
    credential.value || credential.apiKey || credential.headerName ? 'api_key' : null,
    credential.accessToken || credential.token || credential.scheme ? 'oauth' : null,
    credential.headers ? 'custom_headers' : null,
  ].filter(Boolean),
  headerNames: [
    credential.headerName,
    ...Object.keys(credential.headers || {}),
    credential.accessToken || credential.token ? 'Authorization' : null,
  ].filter(Boolean),
  hasSecret: Boolean(credential.value || credential.apiKey || credential.token || credential.accessToken || Object.keys(credential.headers || {}).length),
  updatedAt: credential.updatedAt,
  createdAt: credential.createdAt,
});

const getConnectorCredentialStatus = (connector = {}) => {
  const authMode = connector.authMode || 'none';
  if (authMode === 'none') return 'not_required';
  if (authMode === 'private_network' && process.env.INVENTORY_PRIVATE_NETWORK_ENABLED !== 'true') {
    return 'disabled';
  }
  const credentialRef = normalizeCredentialRef(connector.credentialRef);
  if (!credentialRef) return 'missing';
  const envCredential = parseConnectorSecrets()[credentialRef];
  if (envCredential) return 'configured';
  return 'missing';
};

const getConnectorCredentialStatusAsync = async (connector = {}) => {
  const authMode = connector.authMode || 'none';
  if (authMode === 'none') return 'not_required';
  if (authMode === 'private_network' && process.env.INVENTORY_PRIVATE_NETWORK_ENABLED !== 'true') {
    return 'disabled';
  }
  const credentialRef = normalizeCredentialRef(connector.credentialRef);
  if (!credentialRef) return 'missing';
  const credential = (await loadConnectorSecrets())[credentialRef];
  return credential ? 'configured' : 'missing';
};

const buildCredentialHeaders = async (connector = {}) => {
  const authMode = connector.authMode || 'none';
  if (authMode === 'none') return {};

  const credentialRef = normalizeCredentialRef(connector.credentialRef);
  if (!credentialRef) {
    throw new Error('Authenticated inventory connector requires a backend credential reference. Do not enter raw secrets in the mobile app.');
  }

  if (authMode === 'private_network' && process.env.INVENTORY_PRIVATE_NETWORK_ENABLED !== 'true') {
    throw new Error('Private-network inventory connectors are disabled on this API server. Set INVENTORY_PRIVATE_NETWORK_ENABLED=true after network controls are configured.');
  }

  const credential = (await loadConnectorSecrets())[credentialRef];
  if (!credential) {
    throw new Error(`No backend credential is configured for inventory credential reference "${credentialRef}".`);
  }

  const headers = {};
  if (credential.headers && typeof credential.headers === 'object' && !Array.isArray(credential.headers)) {
    for (const [key, value] of Object.entries(credential.headers)) {
      if (value != null) headers[key] = String(value);
    }
  }

  if (authMode === 'api_key') {
    const headerName = credential.headerName || 'X-API-Key';
    const value = credential.value || credential.apiKey || credential.token;
    if (!value) throw new Error(`Credential "${credentialRef}" is missing an API key value.`);
    headers[headerName] = String(value);
  }

  if (authMode === 'oauth') {
    const token = credential.accessToken || credential.token || credential.value;
    if (!token) throw new Error(`Credential "${credentialRef}" is missing an OAuth bearer token.`);
    headers.Authorization = `${credential.scheme || 'Bearer'} ${token}`;
  }

  return headers;
};

const sanitizeConnectorForModel = (connector = {}, credentialStatus = getConnectorCredentialStatus(connector)) => ({
  sourceName: connector.sourceName,
  sourceUrl: connector.sourceUrl,
  connectorType: connector.connectorType,
  authMode: connector.authMode || 'none',
  credentialStatus,
  notes: connector.notes,
});

const readConnectorText = async (connector = {}) => {
  const sourceUrl = connector.sourceUrl || '';
  if (!sourceUrl || sourceUrl.startsWith('demo://')) {
    return { text: '', sourceKind: 'demo' };
  }

  if (sourceUrl.startsWith('file://')) {
    if (connector.authMode && connector.authMode !== 'none') {
      throw new Error('Authenticated inventory connectors must use http(s) sources. Use authMode "none" for file fixtures.');
    }
    const filePath = decodeURIComponent(sourceUrl.replace('file://', ''));
    const text = await fs.readFile(filePath, 'utf8');
    return { text, sourceKind: filePath.endsWith('.csv') ? 'csv' : 'json' };
  }

  if (/^https?:\/\//i.test(sourceUrl)) {
    const credentialHeaders = await buildCredentialHeaders(connector);
    const response = await fetch(sourceUrl, {
      headers: {
        Accept: connector.connectorType === 'csv' ? 'text/csv,text/plain,*/*' : 'application/json,text/csv,text/plain,*/*',
        ...credentialHeaders,
      },
    });
    if (!response.ok) {
      throw new Error(`Inventory connector fetch failed (${response.status})`);
    }
    const text = await response.text();
    return {
      text,
      sourceKind: connector.connectorType === 'csv' || sourceUrl.toLowerCase().includes('.csv') ? 'csv' : 'json',
    };
  }

  throw new Error('Unsupported inventory connector URL. Use demo://, file://, http://, or https://.');
};

const loadInventoryRecords = async (connector = {}) => {
  if (!connector.sourceUrl || connector.sourceUrl.startsWith('demo://')) {
    return DEMO_MACHINE_RECORDS;
  }

  const { text, sourceKind } = await readConnectorText(connector);
  const rawRecords = sourceKind === 'csv'
    ? parseCsvRecords(text)
    : recordsFromPayload(JSON.parse(text));

  return rawRecords.map(normalizeMachineRecord).filter(record => record.machineName && record.machineId);
};

const listCredentialSummaries = async () => {
  const envSecrets = parseConnectorSecrets();
  const fileSecrets = await readConnectorSecretsFile();
  const refs = Array.from(new Set([...Object.keys(envSecrets), ...Object.keys(fileSecrets)])).sort();
  return refs.map(ref => ({
    ...redactCredentialSummary(ref, fileSecrets[ref] || envSecrets[ref]),
    source: fileSecrets[ref] ? 'registry_file' : 'environment',
  }));
};

const scoreInventoryRecord = (analysis, record) => {
  const analysisText = normalizeToken([
    analysis?.productName,
    analysis?.rawAnalysis,
    ...(analysis?.components || []).map(component => component.name),
  ].join(' '));
  const componentTokens = new Set((analysis?.components || []).map(component => normalizeToken(component.name)));
  const recordParts = record.parts.map(normalizeToken);
  const recordAliases = [record.machineName, ...record.aliases].map(normalizeToken);

  const partHits = recordParts.filter(part => componentTokens.has(part) || analysisText.includes(part));
  const aliasHits = recordAliases.filter(alias => alias && analysisText.includes(alias));
  const materialHits = record.materials.map(normalizeToken).filter(material => material && analysisText.includes(material));
  const analysisComponentCount = Math.max(componentTokens.size, 1);
  const partScore = Math.min(partHits.length / analysisComponentCount, 1) * 0.3;
  const aliasScore = aliasHits.length > 0 ? 0.6 : 0;
  const materialScore = Math.min(materialHits.length, 2) * 0.05;
  const hasExactMachineName = normalizeToken(record.machineName) && analysisText.includes(normalizeToken(record.machineName));
  const hasRevision = record.revision && analysisText.includes(normalizeToken(record.revision));
  const exactBonus = hasExactMachineName ? (hasRevision || partHits.length > 0 ? 0.1 : 0.05) : 0;
  const score = Math.min(1, partScore + aliasScore + materialScore + exactBonus);

  return {
    score: Number(score.toFixed(2)),
    partHits,
    aliasHits,
    materialHits,
  };
};

const findBestInventoryMatch = (analysis, records) => {
  const scored = records.map(record => ({
    record,
    ...scoreInventoryRecord(analysis, record),
  })).sort((a, b) => b.score - a.score);

  return scored[0] || null;
};

const buildMatchEvidence = (match = {}) => {
  const evidence = [
    match.aliasHits?.length ? `name/alias: ${match.aliasHits.join(', ')}` : '',
    match.partHits?.length ? `parts: ${match.partHits.join(', ')}` : '',
    match.materialHits?.length ? `materials: ${match.materialHits.join(', ')}` : '',
  ].filter(Boolean);
  return evidence.join('; ') || 'No strong inventory signals matched the scan.';
};

const findInventoryMatchCandidates = (analysis, records) => {
  if (!analysis || !records?.length) return [];
  const scored = records.map(record => ({
    record,
    ...scoreInventoryRecord(analysis, record),
  })).sort((a, b) => b.score - a.score);

  const top = scored[0];
  const candidates = top?.score === 1
    ? [top]
    : scored.filter(match => match.score >= 0.8);

  return candidates.map(match => ({
    machineId: match.record.machineId,
    machineName: match.record.machineName,
    revision: match.record.revision,
    partCount: match.record.parts.length,
    confidenceScore: match.score,
    matchPercent: Math.round(match.score * 100),
    evidence: buildMatchEvidence(match),
  }));
};

const inferComponents = (input = '') => {
  const lower = input.toLowerCase();
  const knownParts = [
    'frame', 'heated bed', 'extruder', 'stepper motors', 'control board', 'power supply',
    'track extrusion', 'gantry main beam', 'gantry column', 'cross-slide plate',
    'z-axis extrusion', 'farmduino', 'raspberry pi', 'encoder', 'utm pcb',
    'solenoid valve', 'vacuum pump', 'watering nozzle top', 'watering nozzle bottom',
    'seeder', 'camera', 'belt clip', 'pulley', 'v-wheel',
    'belts', 'rails', 'nozzle', 'display', 'motor', 'pump', 'gearbox', 'sensor',
    'battery', 'housing', 'valve', 'fan', 'bearing', 'shaft', 'controller'
  ];
  const matched = knownParts.filter(part => lower.includes(part));
  const parts = matched.length > 0 ? matched : ['frame', 'drive assembly', 'control module', 'power module', 'fasteners'];
  return parts.map(part => ({
    name: normalizeName(part).replace(/\b\w/g, char => char.toUpperCase()),
    description: `Visible or expected ${part} required for machine reconstruction.`,
    isEssential: !['display', 'housing', 'fan'].includes(part),
  }));
};

const buildFallbackAnalysis = (input = '', imageBase64 = null) => {
  const productName = input.toLowerCase().includes('3d printer')
    ? 'Desktop FDM 3D Printer'
    : input.split(/[,.]/)[0]?.slice(0, 80) || 'Scanned Machine';
  const components = inferComponents(input);
  return {
    productName,
    components,
    neighborhoodResources: ['inventory connector', 'maintenance records', 'part photos', 'operator notes'],
    attributes: [
      { name: 'Input type', value: imageBase64 ? 'photo plus description' : 'description', type: 'Qualitative' },
      { name: 'Match confidence source', value: 'demo fallback', type: 'Qualitative' },
      { name: 'Detected component count', value: `${components.length}`, type: 'Quantitative' },
    ],
    closedWorldBoundary: 'Machine reconstruction scope: matched inventory record, visible assemblies, replaceable parts, assembly order, pricing, and vendor handoff.',
    rawAnalysis: `Prepared ${productName} for inventory matching using ${components.length} visible or expected components.`,
  };
};

const buildFallbackReconstruction = (analysis, connector = {}) => {
  const machineName = analysis?.productName || 'Matched Machine';
  const sourceName = resolveInventorySourceName(connector);
  const components = analysis?.components?.length ? analysis.components : inferComponents(machineName);
  const coreParts = components.slice(0, 8).map(component => component.name);
  return {
    patternUsed: 'inventory_match',
    conceptName: `${machineName} Reconstruction Package`,
    conceptDescription: `Matched ${machineName} against ${sourceName}. The package prepares the parts list, assembly sequence, pricing envelope, and 3D modeling handoff needed to rebuild the machine.`,
    marketGap: 'Operators need a faster way to move from machine photo to verified rebuild package.',
    constraint: `Inventory source: ${connector.sourceUrl || 'demo://sample-machines'}. Human review is required before procurement or fabrication.`,
    noveltyScore: 7,
    viabilityScore: 8,
    marketBenefit: 'Cuts manual identification work and creates a reviewable reconstruction package for parts, modeling, and fabrication vendors.',
    machineId: `DEMO-${machineName.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'MACHINE'}`,
    machineName,
    inventorySource: sourceName,
    confidenceScore: connector.connectorType === 'demo' ? 0.72 : 0.64,
    evidence: `Matched on component overlap: ${coreParts.join(', ')}.`,
    assemblySteps: [
      {
        stepNumber: 1,
        title: 'Verify inventory record',
        instructions: 'Confirm the machine ID, revision, and required subassemblies against the approved inventory source before ordering parts.',
        parts: coreParts.slice(0, 3),
        estimatedTime: '20 min',
        qualityCheck: 'Machine ID and revision are confirmed by an admin.',
      },
      {
        stepNumber: 2,
        title: 'Prepare frame and motion assemblies',
        instructions: 'Lay out the frame, rails, belts or shafts, and drive components. Check alignment points before fastening.',
        parts: coreParts.slice(0, 5),
        estimatedTime: '1-2 hr',
        qualityCheck: 'Frame is square and moving assemblies travel without binding.',
      },
      {
        stepNumber: 3,
        title: 'Install control and power systems',
        instructions: 'Mount controller, power supply, wiring, sensors, and interface components using the inventory wiring notes.',
        parts: coreParts.slice(2, 7),
        estimatedTime: '1 hr',
        qualityCheck: 'Continuity and polarity checks pass before power-on.',
      },
      {
        stepNumber: 4,
        title: 'Calibrate and document rebuild',
        instructions: 'Run the machine-specific calibration routine, capture photos, and export the final BOM plus modeling handoff package.',
        parts: coreParts,
        estimatedTime: '45 min',
        qualityCheck: 'Calibration report and rebuild package are attached.',
      },
    ],
    pricing: {
      partsSubtotal: '$420-$780',
      modelingEstimate: '$300-$900',
      fabricationEstimate: '$500-$1,600',
      assemblyLaborEstimate: '$240-$640',
      totalEstimate: '$1,460-$3,920',
      confidence: 'medium',
    },
    fulfillmentOptions: [
      {
        vendorName: 'Xometry',
        serviceType: '3D modeling and fabrication quote',
        url: 'https://www.xometry.com',
        packageRequired: ['BOM CSV', 'STL/OBJ files', 'assembly notes'],
      },
      {
        vendorName: 'Protolabs',
        serviceType: 'rapid prototyping quote',
        url: 'https://www.protolabs.com',
        packageRequired: ['part drawings', 'materials', 'quantities'],
      },
    ],
  };
};

const buildInventoryReconstruction = (analysis, connector = {}, match) => {
  if (!match?.record) return buildFallbackReconstruction(analysis, connector);

  const { record, score, partHits, aliasHits, materialHits } = match;
  const sourceName = resolveInventorySourceName(connector);
  const evidenceParts = [
    partHits.length ? `parts: ${partHits.join(', ')}` : '',
    aliasHits.length ? `aliases: ${aliasHits.join(', ')}` : '',
    materialHits.length ? `materials: ${materialHits.join(', ')}` : '',
  ].filter(Boolean);

  return {
    patternUsed: 'inventory_match',
    conceptName: `${record.machineName} Reconstruction Package`,
    conceptDescription: `Matched ${record.machineName}${record.revision ? ` revision ${record.revision}` : ''} against ${sourceName}. The package prepares verified parts, assembly sequence, pricing, and 3D modeling handoff for reconstruction.`,
    marketGap: 'Operators need a faster way to move from machine photo to a verified rebuild package tied to inventory truth.',
    constraint: `Inventory source: ${connector.sourceUrl || 'demo://sample-machines'}. Human review is required before procurement or fabrication.`,
    noveltyScore: 7,
    viabilityScore: score >= 0.7 ? 8 : 6,
    marketBenefit: 'Creates a reviewable reconstruction package grounded in an approved machine inventory record.',
    machineId: record.machineId,
    machineName: record.machineName,
    inventorySource: sourceName,
    confidenceScore: score,
    evidence: evidenceParts.length ? `Matched on ${evidenceParts.join('; ')}.` : 'No strong overlap found; admin review required.',
    assemblySteps: record.assemblySteps,
    pricing: record.pricing,
    fulfillmentOptions: record.fulfillmentOptions,
    sourceLinks: record.sourceLinks,
    referenceImages: record.referenceImages,
  };
};

const applyDeterministicInventoryMatch = (result = {}, analysis, connector = {}, match) => {
  if (!match?.record) return result;

  const deterministic = buildInventoryReconstruction(analysis, connector, match);
  const modelConfidence = Number(result.confidenceScore || 0);

  return {
    ...result,
    machineId: deterministic.machineId,
    machineName: deterministic.machineName,
    inventorySource: deterministic.inventorySource,
    confidenceScore: Math.max(modelConfidence, deterministic.confidenceScore),
    evidence: deterministic.evidence,
    assemblySteps: deterministic.assemblySteps,
    pricing: deterministic.pricing,
    fulfillmentOptions: deterministic.fulfillmentOptions,
    sourceLinks: deterministic.sourceLinks,
    referenceImages: deterministic.referenceImages,
    constraint: deterministic.constraint,
    marketBenefit: result.marketBenefit || deterministic.marketBenefit,
    conceptName: result.conceptName || deterministic.conceptName,
    conceptDescription: result.conceptDescription || deterministic.conceptDescription,
    patternUsed: 'inventory_match',
  };
};

const buildFallbackSpec = (innovation) => ({
  promptLogic: `Use the matched inventory record (${innovation.machineId || 'pending ID'}) as the source of truth, then verify visible assemblies against the scan evidence before procurement.`,
  componentStructure: `${innovation.machineName || innovation.conceptName} rebuild structure includes frame, motion/power/control subassemblies, fasteners, calibration references, and vendor-ready model files.`,
  implementationNotes: 'Treat this as a review package. Admin approval is required before purchasing parts, transmitting files to a vendor, or ordering fabrication.',
});

const buildFallbackScene = () => ({
  objects: [
    { id: 'base-frame', type: 'box', position: [0, 0, 0], rotation: [0, 0, 0], scale: [3, 0.2, 2], color: '#3b82f6', material: 'wireframe', name: 'Base Frame' },
    { id: 'vertical-frame', type: 'box', position: [0, 1.2, -0.8], rotation: [0, 0, 0], scale: [3, 2.4, 0.18], color: '#00ff9d', material: 'wireframe', name: 'Vertical Frame' },
    { id: 'toolhead', type: 'box', position: [0, 1.2, 0], rotation: [0, 0, 0], scale: [0.45, 0.35, 0.35], color: '#fdba74', material: 'standard', name: 'Toolhead' },
    { id: 'bed', type: 'box', position: [0, 0.35, 0.2], rotation: [0, 0, 0], scale: [2, 0.12, 1.4], color: '#a855f7', material: 'standard', name: 'Build Platform' },
  ],
});

const FALLBACK_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAArwAAAH0CAYAAADfWf7fAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAACvKADAAQAAAABAAAB9AAAAAAmvjmIAABAAElEQVR4Ae3dT6gkx5kg8OeVblr6MCD6MgzPrA8Cwa6hYdhhEVpECwyNtbAHg9iL8dXIYAR7sS4G+2gMbjwwl0U3Qd9G8mO8uBEILT4MCHwx6NDGj0UXYdBBrG/by3Z2K0v5qvJPRGZEVGbkTyDqVVRmfPH9vqyor+vVe+8b7//+0W8u/EeAAAECBAgQIECgUoHnm7zu3rm8lzO/68+/vLq8fUuMAOSHn1xfqUcA1JNDSlxX6hFWi+Yo9ViXlXqoR7hA+JElrqtaYvybcFZHEiBAgAABAgQIENiegIZ3XTVTj3XVw2oIECBAgAABAgQSC2h4E4OajgABAgQIECBAYF0CGt511cNqCBAgQIAAAQIEEgtoeBODmo4AAQIECBAgQGBdAhreddXDaggQIECAAAECBBILaHgTg5qOAAECBAgQIEBgXQIa3nXVw2oIECBAgAABAgQSC2h4E4OajgABAgQIECBAYF0CGt511cNqCBAgQIAAAQIEEgtoeBODmo4AAQIECBAgQGBdAhreddXDaggQIECAAAECBBILaHgTg5qOAAECBAgQIEBgXQIa3nXVw2oIECBAgAABAgQSC2h4E4OajgABAgQIECBAYF0CGt511cNqCBAgQIAAAQIEEgtoeBODmo4AAQIECBAgQGBdAhreddXDaggQIECAAAECBBILaHgTg5qOAAECBAgQIEBgXQIa3nXVw2oIECBAgAABAgQSC2h4E4OajgABAgQIECBAgAABAgQIECBAgEDVAt94//ePfnP3zuW9XFn+jwcPc01tXgIECBAgQIAAgUoEfvC9u9kyeb6Z+frzL6+yRbi4yNZMZ1yzqQkQIECAAAECBAoK5OxHnza8l7dvaUoLFlQoAgQIECBAgACBmwI5+9GnDe/NcPnu5XyruvlXQU6oRqVEjIefXF/l/IhJqTxKWJWIoR7h+4F6rMtKPdZTj1If7fNTz+E1dyQBAgQIECBAgMAGBTS8GyyaJRPYqYD9aqeFlzYBAgQIECBAYC8CGt69VFqeBAgQIECAAIGdCmh4d1p4aRMgQIAAAQIE9iKg4d1LpeVJgAABAgQIENipgIZ3p4WXNgECBAgQIEBgLwIa3r1UWp4ECBAgQIAAgZ0KaHh3WnhpEyBAgAABAgT2IqDh3Uul5UmAAAECBAgQ2KmAhnenhZc2AQIECBAgQGAvAhrevVRangQIECBAgACBnQpoeHdaeGkTIECAAAECBPYioOHdS6XlSYAAAQIECBDYqYCGd6eFlzYBAgQIECBAYC8CGt69VFqeBAgQIECAAIGdCmh4d1p4aRMgQIAAAQIE9iKg4d1LpeVJgAABAgQIENipgIZ3p4WXNgECBAgQIEBgLwIa3r1UWp4ECBAgQIAAgZ0KaHh3WnhpEyBAgAABAgT2IqDh3Uul5UmAAAECBAgQIECAAAECBAiEC3zj/d8/+s23/vZvws+IPPLDj/71XnvKa6/+/VX7tdt+gUeffXGRsx79UY0OCajHkMxZxr/R1OM7//Fb9774D2eJv6Kg/3DxDytajaUQuCnwT1cv/p//9uqfbw4e7v3Tf//g3779j28e7vviLALv/cu//Ndbf/effvzof/3zl0+21Ytme/XfsEDTzrZtbHPbbW+Hz4p/5Pknp/zfy9u37l1//mX2njlnnGb9//nf/+0/5syjRIwnT4yru3cuN59HCasSMdQjfFNp6tE8x8PPiD+yqUfuGCXyqCWGeoRfwyVqrh7qES4QfmSJa7ddTc793Uf3WmW3BAgQIECAAAECVQpoeKssq6QIxAnYCOK8HE2AAAECBAgQILAxAQ3vxgpmuQQIECBAgAABAnECGt44L0cTIECAAAECBAhsTEDDu7GCWS4BAgQIECBAgECcgIY3zsvRBAgQIECAAAECGxPQ8G6sYJZLgAABAgQIECAQJ6DhjfNyNAECBAgQIECAwMYENLwbK5jlEiBAgAABAgQIxAloeOO8HE2AAAECBAgQILAxAQ3vxgpmuQQIECBAgAABAnECGt44L0cTIECAAAECBAhsTEDDu7GCWS4BAgQIECBAgECcgIY3zsvRBAgQIECAAAECBAgQIECAAAECqxHw1tZqSmEh5xPwNDifvcgECBAgQIAAAQIFBDS8BZCFIECAAAECBAgQOJ+Ahvd89iITIECAAAECBAgUENDwFkAWggABAgQIECBA4HwCGt7z2YtMgAABAgQIECBQQEDDWwBZCAIECBAgQIAAAQIECBAgQIAAgRwC33j/949+862//Zsccz+d88OP/vVeO/lrr/79Vfu1236BR599cZGzHv1RjQ4JqMeQzHnG1eM87kNR1WNI5jzj6nEe96Go6jEkc3O8VJ/4fBP28vatQ1N6cxlp7+WMc/35l1c5528kSsR48gSpIo8SViViqEf4HqAe67JSD/UIFwg/ssR1VUsMrx/h11V7ZM4+zocXW2W3BAgQIECAAAECVQpoeKssq6TiBDwN4rwcTYAAAQIECBAgsDEBDe/GCma5BAgQIECAAAECcQIa3jgvRxMgQIAAAQIECGxMQMO7sYJZLgECBAgQIECAQJyAhjfOy9EECBAgQIAAAQIbE9DwbqxglkuAAAECBAgQIBAnoOGN83I0AQIECBAgQIDAxgQ0vBsrmOUSIECAAAECBAjECWh447wcTYAAAQIECBAgsDEBDe/GCma5BAgQIECAAAECcQIa3jgvRxMgQIAAAQIECGxMQMO7sYJZLgECBAgQIECAQJyAhjfOy9EECBAgQIAAAQIbE9DwbqxglkuAAAECBAgQIBAnoOGN83I0AQIECBAgQIDAxgQ0vBsrmOUSIECAAAECBAjECWh447wcTYAAAQIEtiXglX5b9bLaLAKeBllYTUpgQwJvvfXXydXev//C5DEOIECAAAECBAgQILAqgWeN7nP3QhbVNsUa3xAtxxBYl4C3ttZVD6shQIAAgUICbQMbG27uebFxHE+AQDoBDW86SzMRIECAwEYExprW5h3c9v+hdMbOHzrHOAEC5xPQ8J7PXmQCBAgQOIPAULPa1+T2jbVLHpqnfdwtAQLrEfjG+79/9Jucy/nff3p0+GzU3/27b13ljGVuAgQIECAwJfDP7754eF1qj/0v3//L5OvT3PPaGG4JEDgVKNUnPt+Evnvn8uTJf7qkeSP/40+PDifmjHP9+ZdXl7dvZcujSaJEjIefXF/ldCqVRwmrEjHU4/D0nfxCPSaJDgeUsCoRY4vPj753Zd9+5/GT14/p18G7dy4ujs9vmuDmXeCp/9RjSujrx0tYlYixxefH11X4+qvcVqX6RB9p+LqmviJAgACBnQmENKtdktjju+f6mgCB8wloeM9nLzIBAgQIECBAgEABAQ1vAWQh1i7gabD2ClkfgRwCQ+/WNh9baP/vizt0Xt+xxggQWIeAV/p11GGzq3jp268OrX3w89Sf/uGjoXOMEyBA4KwCx5/RPetiKg/u9aPyAq8svac/tLayNVnOygVGNqmglXfP1/wGkTmIAIECAprd/Mjd/X9OtO75Xj/mCO73HA3vfmsfnXl3o4k+eeCEdk4b1wCQYQIEsgk0DW778YS+Zrd97HgBfcceH+P+TYF2r785uuxeO6fXj2WOezlbw7uXSi/Is91UFkwxeWobw8Y1SeUAAgQSC/ziZ8+dfARrqNlNHLr66dq9PWeibQyvHzmVtz+3z/Buv4ZZM2g3kqxBOpOXjtcJ7UsCBHYo0Pdu7Viz23f8DtmCUi69n5eOF4TgoNUIaHhXU4r1LWTu5tH8K/u3//ODq7n/2p4bd32CVkSAwNoExprZZq1jj/c1u2PHry33kuuZu497/ShZpX3F8pGGfdU7ONvYzWqoue2Ox8zZHNs9N3jhDiRAgMBMgbHmta/ZnRmm+tNi9voGY2iv747HzOn1o/pLbFaCGt5ZbHWfFLOxdDekKZX22ND5bVpToh4nQCClQNvUdhvfdqwvTve4vsf3OBa6vzc27WtCiFN7bOj8Xj9CVPd1jIZ3X/VOlm27+cyZsD03dOOaE8M5BAgQ6BMYa2Db40OO0ey2WvG37WtA/JlfN8leP+bo7fscn+Hdd/1Psg/ZRJZsVt2AIfOErKc7p68JECAwJBDSyA6d2x3X7HY1vv46ZL8O2fe/nnH4q5B5QtYzHMEjtQloeGuraOZ8QjaZmCWkni8mtmMJENiPQF+z2zSuzf9vv/P4KkSiPT7kWMecCqTe71PPd7piIzUJaHhrqubCXKb+NZxrc5mad2pdC9N+cvo3lk9hBgIEVivQNLvH78o297tN8PHjfcl0j+97fM9jzT49tpc3j+XYy6fmnVrXnmu2t9ybhvf/7S1p+cYLTG0q8TPePCP3/DejuUeAwF4E+prUkOZ2Lz4l8mz295z/5Z4/59rNXU7AO7zlrEUiQIAAgYICmt2C2EIRWLmAhnflBSq1vLFvNZX61/NYnLH1lTIShwCB7QhodsvVamx/HtvXU65wLM7Y+lKuwVzrFtDwrrs+VkeAAAECkQKa3UgwhxPYgYCGdwdFXpLi2L+al8w7dG7peEPrME6AwDYFNLvrqVvp/bx0vPVIW0mIgIY3RMkxBAgQILB6Ac3u6ktkgQTOJqDhPRu9wAQIECCQSkCzm0rSPATqFNDw1lnXJFmd69tD54qbBM0kBAgUF9DsFiefDHiuffxccSdBHHB2geebFVx//mXQX5mZudp77XmZ4+TO42kauXNogpwpxqFOqeq1MI+g9SyM0aY6eivGKM+NB1nd4Bi9w2qU58aDY1a/+NlzJ3tF85fTnpxzY46pO2Mxps4NfbziGCc1WJrrwvOD1rMwRlDZxQhiOtQrp9fThvfy9q1DsKClzTwoZ5wGKef8TcolYjz67IvV5LHEM4fV8XpyxDi+tNdUj+O1xdwvYVUihnqEV30P9Rh5ZzfqNa2EVYkYa3p+HO/X4Vduntfa4/XsrR4x/sfHlrBqYx7XqR1PcesjDSkUK53jXL+78FxxKy2jtAhUKTDS7FaZ79aSOtc+fq64W6vPHtf79B3ePSa+hZxffv37uZYZ/O7HgjUExwhNsmctyWP0rEWMHpSBIVYDMD3DrHpQBoZOrF576dcnh3746Q8vXn79ZDh04CRG6IkRx+0uRs+eHcqV3KpnLcljtMn98Xfvtl+6XZGAhndFxbAUAgQIEBgXGGp2x8/yKIH9CvzoJ79cmvzgPw5+9fMfL5272Pk+0lCMepuBHv/lz0UXXjpe0eQEI0BgkYBmdxFf8ZNL7+el4xUHFXCRgIZ3EZ+TCRAgQKCEgGa3hLIYBOoV8JGGemsbldlzL37zYuhfx81483ju/4biN3FLxM+dn/kJEJgnoNmd51bqLK8fpaTnxQn92EH3ow/dc0r+loZ5GYadpeENc1rNUSk+DD908Y79dGts3KEYY5Cx8efEGIvf99jDT66v7t65HPz8Ut85sWMl8qglhnqEX10lal6iHsO/jeHdcIyJI0tYlYhRoh5DecTu32MlGYoxdk5s/Dkx+uL3/DBc32HGViDgIw0rKMIWljC2maRYf+75U6zRHAQIlBUYbnbLrkO0ZQK59/fc8y/L3tlrEdDwrqUSK1jH1J9kzLWpTM07ta4V0FkCAQKJBTS7iUEzTze1T0/t83OXNzXv1LrmxnXe9gQ0vNur2VlXPLW5xC4u9Xyx8R1PgMD6BDS766tJihWl3u9Tz5ciR3OsV0DDu97anGVlIf8aTrXJhMwTsp6zQAlKgEAWAc1uFtYik4bs1yH7fshiQ+YJWU9ILMfUIeCH1uqoY/Es2s1mzobSnlt80QISILBqgb5m9+13Hl89WXTWHxxdNUqFi2tfA7x+VFjcFafkHd4VF+dcS4vZhJqNq928ptYbc2wzV8w6pmJ7nACBdQv0Nbv377+w7kVb3YlAzL4d85oQc2yzqJh1nCRhoEoB7/BWWdblSTWbRWgj20TrHtvdaLrjMavqzhFznmMJENiegGZ3ezUbW7HXjzEdj51LQMN7LvkNxI3dtNqUvmpyZ38LUrPbSrolUL+AZrfOGnv9qLOuW87KRxq2XL0Cay/dfJaOV4BQCAIEBgQ0uwMwlQyX3s9Lx6ukTLtJwzu8uyn1/ETbTWTuxxNCIrcxQo51DAEC2xfQ7G6/hiEZtHu7148QLcfkFNDw5tStbO4cG1c7Z2VU0iFAYERAszuCU+lD7V6fsvFt56yUTFqJBTS8iUH3MF13k5mzeXXP34OXHAkQ+FpAs/u1xR6/6u7/Xj/2eAWcL2cN7/nsq4jc3by6CV1//uXV5e1bs39wrTuXrwkQqENAs1tHHVNl4fUjlaR5QgT80FqIkmMIECBAYJGAZncRn5MJEFgooOFdCOh0AgQIEBgX0OyO+3iUAIH8Ahre/MYiECBAYLcCmt3dll7iBFYl8PQzvM3nLTOu6vA5zsxxLnLP3xgVjnGwa+uTKn6qedp19d2K0afSP8aq36VvlFWfSv/Yua1+8bPnTvawt995fPVkXf0LHhg9dx4Dy4oelkc42YasTq7x7tq7X4dnH3dkwhiHXI7nPL4ft8LJowfjTp4ZccDThrfUDxfljNMUI+f8jWmJGI8++2I0jxQ5lsijlhhT9Yh4rg0eWotViTzUY/AyOnng3PUYeWf38OJ2suiegRJ51BLD86PnAhoYylnz9nV6y/Voc2j4clodl6cb9/ixpfd9pGGpoPMJECBA4IbASLN74zh3CBAgUErAryUrJS0OAQInApcP3jgZmxi4d/GniSOWPxz1DuTMcPXEOKrHdz9+74Tkg1fevPjgwbPh6++9f/K4AQIECOQW8A5vbmHzEyBAYCcCQ83uTtKXJgECKxbQ8K64OJZGgACBLQs07+z6jwABAmsQ0PCuoQrWQIAAgcoENLuVFVQ6BDYu4DO8Gy+g5RMgQGAtAprctVTCOggQOBbQ8B6LuE+AwFkFxn6o6eEn11d371xm/YGvEr+Cp5YYU/WY8UOJZ732BCdAoF4BH2mot7YyI0CAAAECBAgQeCKg4XUZEPA0cA0QIECAAAECBAjULeDffXXXV3YECBAgQIAAgd0LaHh3fwkAIECAAAECBAjULaDhrbu+siNAgAABAgQI7F5Aw7v7SwAAAQIECBAgQKBuAQ1v3fWVHQECBAgQIEBg9wIa3t1fAgAIECBAgAABAnULaHjrrq/sCBAgQIAAAQK7F9Dw7v4SAECAAAECVQt4pa+6vPmTe+U7bw4FyfrnX78KWiTGT4cyTDdeJI90yx2cKT6PH5zONXJNNQffU49Ts4GR+HoMTDQyPF6P+Pr2hSqSR1/gxGNF8qj9+fHxb99LXBbT7UVAw7uXSsuTAAECBAgQILBTAQ3vTgsv7a6Ap0FXw9cECBAgQKA2Aa/0tVX0jPl0v9V0/fmXV5e3b2X9Fl6JGA8/ub66e+dy83mUsJoT4/LBGydXbPc6On5QPY5Fhu/PqcfwbP2PTNUjtr59UUrkUUuMqXr0+caOncNq4mNOsSk4fqcCGt6dFl7aBAgQIECAAIG9CGh491JpeY4IeBqM4HiIAAECBAhsXuDpK33zLYqMmRy+HZw5zkXu+RujwjEOdm19UsVPNc+TdR3WeDzn8f02h5S3YoRrrtTqcP20mUytc+rxdp4lt2KE601YRde3L/JEjL5TosfECCc7g9XhOkoZO9Fch7W1gt15u1+3j6e+TRjjkMvxnMf3E+cwGDdlnOebyXJ/1rJdcM44TTFyzt/kUCLGo8++WE0eSzxzWB2vJ0eM9lptb9dUj3ZNc25LWJWIoR7h1d9DPd56668nIPfvv9CMHV5ATw7oGShhVSLGmp4fx/t1D/vgUA6r4/XkiHGc0Jrqcby2mPslrNr1HNepHU9x63u5KRQrneOlb796lszOFfcsyQpKgMAsgZFmd9Z8TkorcK59/Fxx0+qZLYfA03d4c0xszuUCL7/+/eWT9M8Q/O7HgjUEx+hf4uloz1qSxziNGvdOUc/5IUPyCFF6dgwrVhevvfTrE4UPP/3hxcuvnwyHDriuQqUi3j3v2bNDoySvR89aksdok/vj795tv3S7IgEN74qKYSkECBAgMC4w1OyOn+VRAvsV+NFPfrk0+cF/HPzq5z9eOnex832koRj1NgM9/sufiy68dLyiyQlGgMAiAc3uIr7iJ5fez0vHKw4q4CIBDe8iPicTIECAQAkBzW4JZTEI1CvgIw311jYqs+de/ObF0L+Om/Hm8dz/DcVv4paInzs/8xMgME9AszvPrdRZXj9KSc+LE/qxg+5HH7rnlPwtDfMyDDtLwxvmtJqjUnwYfujiHfvp1ti4QzHGIGPjz4kxFr/vsVr/VGdfrkvH1CNcsIRViRglnh/Dv43h3XDwiSNLWJWIUaIeQ3nE7t9jJRmKMXZObPw5Mfri9/wwXN9hxlYg4CMNKyjCFpYwtpmkWH/u+VOs0RwECJQVGG52y65DtGUCuff33PMvy97ZaxHQ8K6lEitYx6d/+Gh0Fbk2lal5p9Y1umgPEiCwSQHN7rbKNrVPT+3zc7OdmndqXXPjOm97Ahre7dXsrCue2lxiF5d6vtj4jidAYH0Cmt311STFilLv96nnS5GjOdYroOFdb23OsrKQfw2n2mRC5glZz1mgBCVAIIuAZjcLa5FJQ/brkH0/ZLEh84SsJySWY+oQ8ENrddSxeBbtZjNnQ2nPLb5oAQkQWLVAX7P79juPr54sevAX3686IYvrFWhfA7x+9PIYzCTgHd5MsFueNmYTajaudvOayjnm2GaumHVMxfY4AQLrFuhrdu/ff2Hdi7a6E4GYfTvmNSHm2GZRMes4ScJAlQLe4a2yrMuTajaL0Ea2G+2rc2a/G2OT6mr6mkDdAprcOuvr9aPOum45K+/ubrl6BdZeuvksHa8AoRAECAwIaHYHYCoZLr2fl45XSZl2k4Z3d3dT6vmJtpvInHd7Q6O2MUKPdxwBAtsW0Oxuu36hq2/3dq8foWKOyyWg4c0lW+G8OTauds4KuaREgMCAgGZ3AKbi4XavT9n4tnNWzCa1hAIa3oSYe5mqu8nM2by65+/FTJ4ECDwT0Ozu+0ro7v9eP/Z9LZTOXsNbWryyeN3Nq5taqr9R3p3T1wQIbFtAs7vt+qVevdeP1KLmGxPwQ2tjOh4jQIAAgSQCmt0kjCYhQGCmgIZ3JpzTCBAgQCBMQLMb5uQoAgTyCWh489mamQABArsX0Ozu/hIAQGAVAk8/w9t83jLjag5/gCBznIvc8zdGhWMc7Nr6pIqfap52XX23YvSp9I+x6nfpG2XVp9I/dm6rX/zsuZM9rPkzwU/W1b/ggdFz5zGwrOhheYSTbcjq5Brvrr37dXj2cUcmjHHI5XjO4/txK5w8ejDu5JkRBzxteC9v3zoEizg3+tCccZpi5Jy/SbZEjEeffTGaR4ocS+RRS4ypekQ/CXpOqMWqRB7q0XMBDQydux4j7+xGvd6UyKOWGJ4fA0+GnuGcNW9fp7dcjzaHhi6n1XFpunGPH1t630calgo6nwABAgRuCIw0uzeOc4cAAQKlBPxaslLS4hAgcCJw+eCNk7GJgXsXf5o4YvnDUe9AzgxXT4yjenz34/dOSD545c2LDx48G77+3vsnjxsgQIBAbgHv8OYWNj8BAgR2IjDU7O4kfWkSILBiAQ3viotjaQQIENiyQPPOrv8IECCwBgEN7xqqYA0ECBCoTECzW1lBpUNg4wI+w7vxAlo+AQIE1iKgyV1LJayDAIFjAQ3vsYj7BAicVWDsh5oefnJ9dffOZdYf+CrxK3hqiTFVjxk/lHjWa09wAgTqFfCRhnprKzMCBAgQIECAAIEnAhpelwGBpwKeCi4EAgQIECBAgACBqgU0vFWXV3IECBAgQIAAAQIaXtcAAQIECBAgQIBA1QIa3qrLKzkCBAgQIECAAAENr2uAAAECBAgQIECgagENb9XllRwBAgQIECBAgICG1zVAgAABAgQIECBQtYCGt+rySo4AAQIECBAgQEDD6xogQIAAAQK1CniVr7WyhfJ65TtvDkXK+udfvwpaJMZPhzJMN14kj3TLHZwpPo8fnM41ck01B99Tj1OzgZH4egxMNDI8Xo/4+vaFKpJHX+DEY0XyqP358fFv30tcFtPtRUDDu5dKy5MAAQIECBAgsFMBDe9OCy/tYwFPhWMR9wkQIECAQC0CXuVrqeQK8uh+q+n68y+vLm/fyvotvBIxHn5yfXX3zuXm8yhhNSfG5YM3Tq7c7nV0/KB6HIsM359Tj+HZ+h+ZqkdsffuilMijlhhT9ejzjR07h9XEx5xiU3D8TgU0vDstvLQJECBAgAABAnsR0PDupdLynBDwVJgA8jABAgQIENiswNNX+eZbFBkzOHw7OHOci9zzN0aFYxzs2vqkip9qnifrOqzxeM7j+20OKW/FCNdcqdXh+mkzmVrn1OPtPEtuxQjXm7CKrm9f5IkYfadEj4kRTnYGq8N1lDJ2orkOa2sFu/N2v24fT32bMMYhl+M5j+8nzmEwbso4zzeT5f6sZbvgnHGaYuScv8mhRIxHn32xmjyWeOawOl5Pjhjttdrerqke7Zrm3JawKhFDPcKrv4d6vPXWX09A7t9/oRk7vICeHNAzUMKqRIw1PT+O9+se9sGhHFbH68kR4zihNdXjeG0x90tYtes5rlM7nuLW93FTKFY6x0vffvUsmZ0r7lmSFZQAgVkCI83urPmclFbgXPv4ueKm1TNbDoGn7/DmmNicywVefv37yyfpnyH43Y8FawiO0b/E09GetSSPcRo17p2invNDhuQRovTsGFasLl576dcnCh9++sOLl18/GQ4dcF2FSkW8e96zZ4dGSV6PnrUkj9Em98ffvdt+6XZFAhreFRXDUggQIEBgXGCo2R0/y6ME9ivwo5/8cmnyg/84+NXPf7x07mLn+0hDMeptBnr8lz8XXXjpeEWTE4wAgUUCmt1FfMVPLr2fl45XHFTARQIa3kV8TiZAgACBEgKa3RLKYhCoV8BHGuqtbVRmz734zYuhfx03483juf8bit/ELRE/d37mJ0BgnoBmd55bqbO8fpSSnhcn9GMH3Y8+dM8p+Vsa5mUYdpaGN8xpNUel+DD80MU79tOtsXGHYoxBxsafE2Msft9jtf6pzr5cl46pR7hgCasSMUo8P4Z/G8O74eATR5awKhGjRD2G8ojdv8dKMhRj7JzY+HNi9MXv+WG4vsOMrUDARxpWUIQtLGFsM0mx/tzzp1ijOQgQKCsw3OyWXYdoywRy7++551+WvbPXIqDhXUslVrCOT//w0egqcm0qU/NOrWt00R4kQGCTAprdbZVtap+e2ufnZjs179S65sZ13vYENLzbq9lZVzy1ucQuLvV8sfEdT4DA+gQ0u+urSYoVpd7vU8+XIkdzrFdAw7ve2pxlZSH/Gk61yYTME7Kes0AJSoBAFgHNbhbWIpOG7Nch+37IYkPmCVlPSCzH1CHgh9bqqGPxLNrNZs6G0p5bfNECEiCwaoG+Zvftdx5fPVn04C++X3VCFtcr0L4GeP3o5TGYScA7vJlgtzxtzCbUbFzt5jWVc8yxzVwx65iK7XECBNYt0Nfs3r//wroXbXUnAjH7dsxrQsyxzaJi1nGShIEqBbzDW2VZlyfVbBahjWw32lfnzH43xibV1fQ1gboFNLl11tfrR5113XJW3t3dcvUKrL1081k6XgFCIQgQGBDQ7A7AVDJcej8vHa+SMu0mDe/u7qbU8xNtN5E57/aGRm1jhB7vOAIEti2g2d12/UJX3+7tXj9CxRyXS0DDm0u2wnlzbFztnBVySYkAgQEBze4ATMXD7V6fsvFt56yYTWoJBTS8CTH3MlV3k5mzeXXP34uZPAkQeCag2d33ldDd/71+7PtaKJ29hre0eGXxuptXN7VUf6O8O6evCRDYtoBmd9v1S716rx+pRc03JuCH1sZ0PEaAAAECSQQ0u0kYTUKAwEwBDe9MOKcRIECAQJiAZjfMyVEECOQT0PDmszUzAQIEdi+g2d39JQCAwCoEnn6Gt/m8ZcbVHP4AQeY4F7nnb4wKxzjYtfVJFT/VPO26+m7F6FPpH2PV79I3yqpPpX/s3Fa/+NlzJ3tY82eCn6yrf8EDo+fOY2BZ0cPyCCfbkNXJNd5de/fr8OzjjkwY45DL8ZzH9+NWOHn0YNzJMyMOeNrwXt6+dQgWcW70oTnjNMXIOX+TbIkYjz77YjSPFDmWyKOWGFP1iH4S9JxQi1WJPNSj5wIaGDp3PUbe2Y16vSmRRy0xPD8Gngw9wzlr3r5Ob7kebQ4NXU6r49J04x4/tvS+jzQsFXQ+AQIECNwQGGl2bxznDgECBEoJ+LVkpaTFIUDgRODywRsnYxMD9y7+NHHE8oej3oGcGa6eGEf1+O7H752QfPDKmxcfPHg2fP29908eN0CAAIHcAt7hzS1sfgIECOxEYKjZ3Un60iRAYMUCGt4VF8fSCBAgsGWB5p1d/xEgQGANAhreNVTBGggQIFCZgGa3soJKh8DGBXyGd+MFtHwCBAisRUCTu5ZKWAcBAscCGt5jEfcJEDirwNgPNT385Prq7p3LrD/wVeJX8NQSY6oeM34o8azXnuAECNQr4CMN9dZWZgQIECBAgAABAk8ENLwuAwIHAU+HA4UvCBAgQIAAAQIEahTQ8NZYVTkRIECAAAECBAgcBDS8BwpfECBAgAABAgQI1Cig4a2xqnIiQIAAAQIECBA4CGh4DxS+IECAAAECBAgQqFFAw1tjVeVEgAABAgQIECBwENDwHih8QYAAAQIECBAgUKOAhrfGqsqJAAECBAgQIEDgIKDhPVD4ggABAgQIVCTgFb6iYp4jlVe+8+ZQ2Kx//vWroEVi/HQow3TjRfJIt9zBmeLz+MHpXCPXVHPwPfU4NRsYia/HwEQjw+P1iK9vX6giefQFTjxWJI/anx8f//a9xGUx3V4ENLx7qbQ8CRAgQIAAAQI7FdDw7rTw0u4T8HToUzFGgAABAgS2LuAVfusVXNH6u99quv78y6vL27eyfguvRIyHn1xf3b1zufk8SljNiXH54I2TK7h7HR0/qB7HIsP359RjeLb+R6bqEVvfvigl8qglxlQ9+nxjx85hNfExp9gUHL9TAQ3vTgsvbQIECBAgQIDAXgQ0vHuptDwDBDwdApAcQoAAAQIENifw9BW++RZFxpUfvh2cOc5F7vkbo8IxDnZtfVLFTzXPk3Ud1ng85/H9NoeUt2KEa67U6nD9tJlMrXPq8XaeJbdihOtNWEXXty/yRIy+U6LHxAgnO4PV4TpKGTvRXIe1tYLdebtft4+nvk0Y45DL8ZzH9xPnMBg3ZZznm8lyf9ayXXDOOE0xcs7f5FAixqPPvlhNHks8c1gdrydHjPZabW/XVI92TXNuS1iViKEe4dXfQz3eeuuvJyD377/QjB1eQE8O6BkoYVUixpqeH8f7dQ/74FAOq+P15IhxnNCa6nG8tpj7Jaza9RzXqR1Pcet7uCkUK53jpW+/epbMzhX3LMkKSoDALIGRZnfWfE5KK3CuffxccdPqmS2HwNN3eHNMbM7lAi+//v3lk/TPEPzux4I1BMfoX+LpaM9aksc4jRr3TlHP+SFD8ghRenYMK1YXr7306xOFDz/94cXLr58Mhw64rkKlIt4979mzQ6Mkr0fPWpLHaJP74+/ebb90uyIBDe+KimEpBAgQIDAuMNTsjp/lUQL7FfjRT365NPnBfxz86uc/Xjp3sfN9pKEY9TYDPf7Ln4suvHS8oskJRoDAIgHN7iK+4ieX3s9LxysOKuAiAQ3vIj4nEyBAgEAJAc1uCWUxCNQr4CMN9dY2KrPnXvzmxdC/jpvx5vHc/w3Fb+KWiJ87P/MTIDBPQLM7z63UWV4/SknPixP6sYPuRx+655T8LQ3zMgw7S8Mb5rSao1J8GH7o4h376dbYuEMxxiBj48+JMRa/77Fa/1RnX65Lx9QjXLCEVYkYJZ4fw7+N4d1w8IkjS1iViFGiHkN5xO7fYyUZijF2Tmz8OTH64vf8MFzfYcZWIOAjDSsowhaWMLaZpFh/7vlTrNEcBAiUFRhudsuuQ7RlArn399zzL8ve2WsR0PCupRIrWMenf/hodBW5NpWpeafWNbpoDxIgsEkBze62yja1T0/t83OznZp3al1z4zpvewIa3u3V7KwrntpcYheXer7Y+I4nQGB9Aprd9dUkxYpS7/ep50uRoznWK6DhXW9tzrKykH8Np9pkQuYJWc9ZoAQlQCCLgGY3C2uRSUP265B9P2SxIfOErCcklmPqEPBDa3XUsXgW7WYzZ0Npzy2+aAEJEFi1QF+z+/Y7j6+eLHrwF9+vOiGL6xVoXwO8fvTyGMwk4B3eTLBbnjZmE2o2rnbzmso55thmrph1TMX2OAEC6xboa3bv339h3Yu2uhOBmH075jUh5thmUTHrOEnCQJUC3uGtsqzLk2o2i9BGthvtq3Nmvxtjk+pq+ppA3QKa3Drr6/WjzrpuOSvv7m65egXWXrr5LB2vAKEQBAgMCGh2B2AqGS69n5eOV0mZdpOGd3d3U+r5ibabyJx3e0OjtjFCj3ccAQLbFtDsbrt+oatv93avH6FijssloOHNJVvhvDk2rnbOCrmkRIDAgIBmdwCm4uF2r0/Z+LZzVswmtYQCGt6EmHuZqrvJzNm8uufvxUyeBAg8E9Ds7vtK6O7/Xj/2fS2Uzl7DW1q8snjdzaubWqq/Ud6d09cECGxbQLO77fqlXr3Xj9Si5hsT8ENrYzoeI0CAAIEkAprdJIwmIUBgpoCGdyac0wgQIEAgTECzG+bkKAIE8gloePPZmpkAAQK7F9Ds7v4SAEBgFQJPP8PbfN4y42oOf4Agc5yL3PM3RoVjHOza+qSKn2qedl19t2L0qfSPsep36Rtl1afSP3Zuq1/87LmTPaz5M8FP1tW/4IHRc+cxsKzoYXmEk23I6uQa7669+3V49nFHJoxxyOV4zuP7cSucPHow7uSZEQc8bXgvb986BIs4N/rQnHGaYuScv0m2RIxHn30xmkeKHEvkUUuMqXpEPwl6TqjFqkQe6tFzAQ0MnbseI+/sRr3elMijlhieHwNPhp7hnDVvX6e3XI82h4Yup9Vxabpxjx9bet9HGpYKOp8AAQIEbgiMNLs3jnOHAAECpQT8WrJS0uIQIHAicPngjZOxiYF7F3+aOGL5w1HvQM4MV0+Mo3p89+P3Tkg+eOXNiw8ePBu+/t77J48bIECAQG4B7/DmFjY/AQIEdiIw1OzuJH1pEiCwYgEN74qLY2kECBDYskDzzq7/CBAgsAYBDe8aqmANBAgQqExAs1tZQaVDYOMCPsO78QJaPgECBNYioMldSyWsgwCBYwEN77GI+wQInFVg7IeaHn5yfXX3zmXWH/gq8St4aokxVY8ZP5R41mtPcAIE6hXwkYZ6ayszAgQIECBAgACBJwIaXpcBgRsCnhI3ONwhQIAAAQIECBCoTUDDW1tF5UOAAAECBAgQIHBDQMN7g8MdAgQIECBAgACB2gQ0vLVVVD4ECBAgQIAAAQI3BDS8NzjcIUCAAAECBAgQqE1Aw1tbReVDgAABAgQIECBwQ0DDe4PDHQIECBAgQIAAgdoENLy1VVQ+BAgQIECAAAECNwQ0vDc43CFAgAABAhUIeHWvoIjnTOGV77w5FD7rn3/9KmiRGD8dyjDdeJE80i13cKb4PH5wOtfINdUcfE89Ts0GRuLrMTDRyPB4PeLr2xeqSB59gROPFcmj9ufHx799L3FZTLcXAQ3vXiotTwIECBAgQIDATgU0vDstvLSHBDwlhmSMEyBAgACBrQp4dd9q5Va47u63mq4///Lq8vatrN/CKxHj4SfXV3fvXG4+jxJWc2JcPnjj5EruXkfHD6rHscjw/Tn1GJ6t/5GpesTWty9KiTxqiTFVjz7f2LFzWE18zCk2BcfvVEDDu9PCS5sAAQIECBAgsBcBDe9eKi3PQAFPiUAohxEgQIAAgc0IPH11b75FkXHFh28HZ45zkXv+xqhwjINdW59U8VPN82RdhzUez3l8v80h5a0Y4ZortTpcP20mU+ucerydZ8mtGOF6E1bR9e2LPBGj75ToMTHCyc5gdbiOUsZONNdhba1gd97u1+3jqW8Txjjkcjzn8f3EOQzGTRnn+Way3J+1bBecM05TjJzzNzmUiPHosy9Wk8cSzxxWx+vJEaO9VtvbNdWjXdOc2xJWJWKoR3j191CPt9766wnI/fsvNGOHF9CTA3oGSliViLGm58fxft3DPjiUw+p4PTliHCe0pnocry3mfgmrdj3HdWrHU9z6/m0KxUrneOnbr54ls3PFPUuyghIgMEtgpNmdNZ+T0gqcax8/V9y0embLIfD0Hd4cE5tzucDLr39/+ST9MwS/+7FgDcEx+pd4OtqzluQxTqPGvVPUc37IkDxClJ4dw4rVxWsv/fpE4cNPf3jx8usnw6EDrqtQqYh3z3v27NAoyevRs5bkMdrk/vi7d9sv3a5IQMO7omJYCgECBAiMCww1u+NneZTAfgV+9JNfLk1+8B8Hv/r5j5fOXex8H2koRr3NQI//8ueiCy8dr2hyghEgsEhAs7uIr/jJpffz0vGKgwq4SEDDu4jPyQQIECBQQkCzW0JZDAL1CvhIQ721jcrsuRe/eTH0r+NmvHk8939D8Zu4JeLnzs/8BAjME9DsznMrdZbXj1LS8+KEfuyg+9GH7jklf0vDvAzDztLwhjmt5qgUH4YfunjHfro1Nu5QjDHI2PhzYozF73us1j/V2Zfr0jH1CBcsYVUiRonnx/BvY3g3HHziyBJWJWKUqMdQHrH791hJhmKMnRMbf06Mvvg9PwzXd5ixFQj4SMMKirCFJYxtJinWn3v+FGs0BwECZQWGm92y6xBtmUDu/T33/Muyd/ZaBDS8a6nECtbx6R8+Gl1Frk1lat6pdY0u2oMECGxSQLO7rbJN7dNT+/zcbKfmnVrX3LjO256Ahnd7NTvriqc2l9jFpZ4vNr7jCRBYn4Bmd301SbGi1Pt96vlS5GiO9QpoeNdbm7OsLORfw6k2mZB5QtZzFihBCRDIIqDZzcJaZNKQ/Tpk3w9ZbMg8IesJieWYOgT80FoddSyeRbvZzNlQ2nOLL1pAAgRWLdDX7L79zuOrJ4se/MX3q07I4noF2tcArx+9PAYzCXiHNxPslqeN2YSajavdvKZyjjm2mStmHVOxPU6AwLoF+prd+/dfWPeire5EIGbfjnlNiDm2WVTMOk6SMFClgHd4qyzr8qSazSK0ke1G++qc2e/G2KS6mr4mULeAJrfO+nr9qLOuW87Ku7tbrl6BtZduPkvHK0AoBAECAwKa3QGYSoZL7+el41VSpt2k4d3d3ZR6fqLtJjLn3d7QqG2M0OMdR4DAtgU0u9uuX+jq273d60eomONyCWh4c8lWOG+Ojauds0IuKREgMCCg2R2AqXi43etTNr7tnBWzSS2hgIY3IeZepupuMnM2r+75ezGTJwECzwQ0u/u+Err7v9ePfV8LpbPX8JYWryxed/Pqppbqb5R35/Q1AQLbFtDsbrt+qVfv9SO1qPnGBPzQ2piOxwgQIEAgiYBmNwmjSQgQmCmg4Z0J5zQCBAgQCBPQ7IY5OYoAgXwCGt58tmYmQIDA7gU0u7u/BAAQWIXA08/wNp+3zLiawx8gyBznIvf8jVHhGAe7tj6p4qeap11X360YfSr9Y6z6XfpGWfWp9I+d2+oXP3vuZA9r/kzwk3X1L3hg9Nx5DCwrelge4WQbsjq5xrtr734dnn3ckQljHHI5nvP4ftwKJ48ejDt5ZsQBTxvey9u3DsEizo0+NGecphg552+SLRHj0WdfjOaRIscSedQSY6oe0U+CnhNqsSqRh3r0XEADQ+eux8g7u1GvNyXyqCWG58fAk6FnOGfN29fpLdejzaGhy2l1XJpu3OPHlt73kYalgs4nQIAAgRsCI83ujePcIUCAQCkBv5aslLQ4BAicCFw+eONkbGLg3sWfJo5Y/nDUO5Azw9UT46ge3/34vROSD1558+KDB8+Gr7/3/snjBggQIJBbwDu8uYXNT4AAgZ0IDDW7O0lfmgQIrFhAw7vi4lgaAQIEtizQvLPrPwIECKxBQMO7hipYAwECBCoT0OxWVlDpENi4gM/wbryAlk+AAIG1CGhy11IJ6yBA4FhAw3ss4j4BAmcVGPuhpoefXF/dvXOZ9Qe+SvwKnlpiTNVjxg8lnvXaE5wAgXoFfKSh3trKjAABAgQIECBA4ImAhtdlQOBEwNPihMQAAQIECBAgQIBATQIa3pqqKRcCBAgQIECAAIETAQ3vCYkBAgQIECBAgACBmgQ0vDVVUy4ECBAgQIAAAQInAhreExIDBAgQIECAAAECNQloeGuqplwIECBAgAABAgROBDS8JyQGCBAgQIAAAQIEahLQ8NZUTbkQIECAAAECBAicCGh4T0gMECBAgACBDQt4Zd9w8daw9Fe+8+bQMrL++devghaJ8dOhDNONF8kj3XIHZ4rP4wenc41cU83B99Tj1GxgJL4eAxONDI/XI76+faGK5NEXOPFYkTxqf358/Nv3EpfFdHsR0PDupdLyJECAAAECBAjsVEDDu9PCS3tMwNNiTMdjBAgQIEBgawJe2bdWsRWvt/utpuvPv7y6vH0r67fwSsR4+Mn11d07l5vPo4TVnBiXD944uaK719Hxg+pxLDJ8f049hmfrf2SqHrH17YtSIo9aYkzVo883duwcVhMfc4pNwfE7FdDw7rTw0iZAgAABAgQI7EVAw7uXSsszQsDTIgLLoQQIECBAYPUCT1/Zm29RZFzp4dvBmeNc5J6/MSoc42DX1idV/FTzPFnXYY3Hcx7fb3NIeStGuOZKrQ7XT5vJ1DqnHm/nWXIrRrjehFV0ffsiT8ToOyV6TIxwsjNYHa6jlLETzXVYWyvYnbf7dft46tuEMQ65HM95fD9xDoNxU8Z5vpks92ct2wXnjNMUI+f8TQ4lYjz67IvV5LHEM4fV8XpyxGiv1fZ2TfVo1zTntoRViRjqEV79PdTjrbf+egJy//4LzdjhBfTkgJ6BElYlYqzp+XG8X/ewDw7lsDpeT44YxwmtqR7Ha4u5X8KqXc9xndrxFLe+d5tCsdI5Xvr2q2fJ7Fxxz5KsoAQIzBIYaXZnzeektALn2sfPFTetntlyCDx9hzfHxOZcLvDy699fPkn/DMHvfixYQ3CM/iWejvasJXmM06hx7xT1nB8yJI8QpWfHsGJ18dpLvz5R+PDTH168/PrJcOiA6ypUKuLd8549OzRK8nr0rCV5jDa5P/7u3fZLtysS0PCuqBiWQoAAAQLjAkPN7vhZHiWwX4Ef/eSXS5Mf/MfBr37+46VzFzvfRxqKUW8z0OO//LnowkvHK5qcYAQILBLQ7C7iK35y6f28dLzioAIuEtDwLuJzMgECBAiUENDsllAWg0C9Aj7SUG9tozJ77sVvXgz967gZbx7P/d9Q/CZuifi58zM/AQLzBDS789xKneX1o5T0vDihHzvofvShe07J39IwL8OwszS8YU6rOSrFh+GHLt6xn26NjTsUYwwyNv6cGGPx+x6r9U919uW6dEw9wgVLWJWIUeL5MfzbGN4NB584soRViRgl6jGUR+z+PVaSoRhj58TGnxOjL37PD8P1HWZsBQI+0rCCImxhCWObSYr1554/xRrNQYBAWYHhZrfsOkRbJpB7f889/7Lsnb0WAQ3vWiqxgnV8+oePRleRa1OZmndqXaOL9iABApsU0Oxuq2xT+/TUPj8326l5p9Y1N67ztieg4d1ezc664qnNJXZxqeeLje94AgTWJ6DZXV9NUqwo9X6fer4UOZpjvQIa3vXW5iwrC/nXcKpNJmSekPWcBUpQAgSyCGh2s7AWmTRkvw7Z90MWGzJPyHpCYjmmDgE/tFZHHYtn0W42czaU9tziixaQAIFVC/Q1u2+/8/jqyaIHf/H9qhOyuF6B9jXA60cvj8FMAt7hzQS75WljNqFm42o3r6mcY45t5opZx1RsjxMgsG6Bvmb3/v0X1r1oqzsRiNm3Y14TYo5tFhWzjpMkDFQp4B3eKsu6PKlmswhtZLvRvjpn9rsxNqmupq8J1C2gya2zvl4/6qzrlrPy7u6Wq1dg7aWbz9LxChAKQYDAgIBmdwCmkuHS+3npeJWUaTdpeHd3N6Wen2i7icx5tzc0ahsj9HjHESCwbQHN7rbrF7r6dm/3+hEq5rhcAhreXLIVzptj42rnrJBLSgQIDAhodgdgKh5u9/qUjW87Z8VsUksooOFNiLmXqbqbzJzNq3v+XszkSYDAMwHN7r6vhO7+7/Vj39dC6ew1vKXFK4vX3by6qaX6G+XdOX1NgMC2BTS7265f6tV7/Ugtar4xAT+0NqbjMQIECBBIIqDZTcJoEgIEZgpoeGfCOY0AAQIEwgQ0u2FOjiJAIJ+AhjefrZkJECCwewHN7u4vAQAEViHw9DO8zectM67m8AcIMse5yD1/Y1Q4xsGurU+q+KnmadfVd1tLjL7cjBEgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAj42ZiQAAAQ5JREFUAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAga0J/H+FNNhVOddMcQAAAABJRU5ErkJggg==';

const buildFallbackBom = (innovation, analysis) => {
  const assemblyPartNames = Array.from(new Set((innovation?.assemblySteps || []).flatMap(step => step.parts || [])));
  const components = analysis?.components?.length
    ? analysis.components
    : assemblyPartNames.length > 0
      ? assemblyPartNames.map(part => ({
          name: part,
          description: `Inventory-matched ${part} required for machine reconstruction.`,
          isEssential: true,
        }))
      : inferComponents(innovation?.machineName || innovation?.conceptName || '');
  const items = components.slice(0, 10).map((component, index) => ({
    partNumber: `${innovation?.machineId || 'DEMO'}-${String(index + 1).padStart(3, '0')}`,
    partName: component.name,
    description: component.description,
    quantity: component.isEssential ? 1 : 2,
    material: component.name.toLowerCase().includes('frame') ? 'aluminum extrusion' : 'OEM or equivalent replacement',
    estimatedCost: component.isEssential ? '$45-$180' : '$15-$80',
    supplier: 'Inventory-approved supplier',
    leadTime: '3-14 days',
    notes: 'Confirm revision and tolerances before purchasing.',
  }));
  return {
    projectName: innovation?.conceptName || 'Machine Reconstruction Package',
    version: '0.1-review',
    dateGenerated: new Date().toISOString().slice(0, 10),
    items,
    totalEstimatedCost: innovation?.pricing?.partsSubtotal || '$420-$780',
    manufacturingNotes: 'Generated from the inventory-matching fallback. Requires admin validation before fabrication.',
  };
};

// ============================================
// API ROUTES - WITH /api/gemini PREFIX FOR MOBILE APP
// ============================================

// Analyze product
app.post('/api/gemini/analyze', async (req, res) => {
  try {
    const { input, image, provider, ollamaModel } = req.body;
    const imageBase64 = image;
    
    const textPrompt = `
      PHASE 1: MACHINE SCAN
      ${imageBase64 ? "Analyze the machine shown in the image and the following description:" : "Analyze the following input:"} 
      "${input}"
      
      1. Deconstruct the machine into visible and likely physical parts.
      2. Filter for essential assemblies required for reconstruction.
      3. Identify useful inventory matching signals: model marks, assemblies, geometry, and operating context.
      4. List relevant **Attributes** for the components.
      5. Define the reconstruction scope.
      
      Return the result in valid JSON.
    `;
    
    const cacheKey = { type: 'analyze', input, hasImage: !!imageBase64, provider, ollamaModel };
    
    const schema = {
      type: Type.OBJECT,
      properties: {
        productName: { type: Type.STRING },
        components: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              description: { type: Type.STRING },
              isEssential: { type: Type.BOOLEAN }
            },
            required: ["name", "description", "isEssential"]
          }
        },
        neighborhoodResources: { type: Type.ARRAY, items: { type: Type.STRING } },
        attributes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              value: { type: Type.STRING },
              type: { type: Type.STRING, enum: ["Quantitative", "Qualitative"] }
            },
            required: ["name", "value", "type"]
          }
        },
        closedWorldBoundary: { type: Type.STRING },
        rawAnalysis: { type: Type.STRING }
      },
      required: ["productName", "components", "neighborhoodResources", "attributes", "closedWorldBoundary", "rawAnalysis"]
    };

    let result;
    if (provider !== 'ollama' && !hasConfiguredGeminiKey()) {
      result = buildFallbackAnalysis(input, imageBase64);
    } else if (provider === 'ollama') {
      const model = imageBase64 ? (ollamaModel === 'qwen3.5:0.8b' ? 'llava' : ollamaModel) : (ollamaModel || 'qwen3.5:0.8b');
      result = await callOllamaWithRetry(model, textPrompt, schema, RECONSTRUCTION_SYSTEM_INSTRUCTION, imageBase64);
    } else {
      result = await callGeminiWithRetry(async (ai) => {
        let contents;
        if (imageBase64) {
          const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
          contents = [
            { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
            { text: textPrompt }
          ];
        } else {
          contents = textPrompt;
        }

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents,
          config: {
            systemInstruction: RECONSTRUCTION_SYSTEM_INSTRUCTION,
            responseMimeType: "application/json",
            responseSchema: schema
          }
        });

        const text = response.text;
        if (!text) throw new Error("No response from Gemini");
        return JSON.parse(text);
      }, imageBase64 ? null : cacheKey); // Don't cache image requests (too variable)
    }

    res.json(result);
  } catch (error) {
    console.error('Analyze error:', error);
    if (shouldUseDeterministicAiFallback(error)) {
      return res.json(buildFallbackAnalysis(req.body?.input || '', req.body?.image || null));
    }
    const { statusCode, body } = createErrorResponse(error, 'Failed to analyze product');
    res.status(statusCode).json(body);
  }
});

app.post('/api/inventory/validate', async (req, res) => {
  try {
    const { connector, analysis } = req.body;
    const records = await loadInventoryRecords(connector || {});
    const credentialStatus = await getConnectorCredentialStatusAsync(connector || {});
    const sourceName = resolveInventorySourceName(connector || {});
    const matchCandidates = findInventoryMatchCandidates(analysis, records);
    res.json({
      status: 'ok',
      sourceName,
      sourceUrl: connector?.sourceUrl || 'demo://sample-machines',
      authMode: connector?.authMode || 'none',
      credentialStatus,
      recordCount: records.length,
      requiredFields: ['machineId', 'machineName/name', 'parts/components'],
      sampleMachines: records.slice(0, 5).map(record => ({
        machineId: record.machineId,
        machineName: record.machineName,
        revision: record.revision,
        partCount: record.parts.length,
      })),
      matchCandidates,
    });
  } catch (error) {
    console.error('Inventory validation error:', error);
    res.status(400).json({
      status: 'error',
      error: error.message || 'Failed to validate inventory connector',
      canRetry: true,
    });
  }
});

app.get('/api/admin/inventory/credentials', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    res.json({
      status: 'ok',
      registryEnabled: Boolean(getCredentialRegistryPath()),
      credentials: await listCredentialSummaries(),
    });
  } catch (error) {
    console.error('Credential list error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message || 'Failed to list connector credentials',
      canRetry: true,
    });
  }
});

app.post('/api/admin/inventory/credentials', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const {
      credentialRef,
      headerName,
      value,
      apiKey,
      token,
      accessToken,
      scheme,
      headers,
    } = req.body || {};

    const ref = normalizeCredentialRef(credentialRef);
    if (!ref || !/^[a-zA-Z0-9._:-]{3,96}$/.test(ref)) {
      return res.status(400).json({
        status: 'error',
        error: 'credentialRef must be 3-96 characters and use only letters, numbers, dot, underscore, colon, or hyphen.',
        canRetry: false,
      });
    }

    if (!value && !apiKey && !token && !accessToken && !headers) {
      return res.status(400).json({
        status: 'error',
        error: 'Provide an API key value, OAuth token, accessToken, or fixed headers for this credential reference.',
        canRetry: false,
      });
    }

    const fileSecrets = await readConnectorSecretsFile();
    const now = new Date().toISOString();
    const existing = fileSecrets[ref] || {};
    const credential = {
      ...existing,
      ...(headerName ? { headerName } : {}),
      ...(value ? { value } : {}),
      ...(apiKey ? { apiKey } : {}),
      ...(token ? { token } : {}),
      ...(accessToken ? { accessToken } : {}),
      ...(scheme ? { scheme } : {}),
      ...(headers && typeof headers === 'object' && !Array.isArray(headers) ? { headers } : {}),
      createdAt: existing.createdAt || now,
      updatedAt: now,
    };

    fileSecrets[ref] = credential;
    await writeConnectorSecretsFile(fileSecrets);

    res.json({
      status: 'ok',
      credential: {
        ...redactCredentialSummary(ref, credential),
        source: 'registry_file',
      },
    });
  } catch (error) {
    console.error('Credential upsert error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message || 'Failed to save connector credential',
      canRetry: true,
    });
  }
});

app.delete('/api/admin/inventory/credentials/:credentialRef', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const ref = normalizeCredentialRef(req.params.credentialRef);
    const fileSecrets = await readConnectorSecretsFile();
    const existed = Boolean(fileSecrets[ref]);
    delete fileSecrets[ref];
    await writeConnectorSecretsFile(fileSecrets);
    res.json({ status: 'ok', credentialRef: ref, deleted: existed });
  } catch (error) {
    console.error('Credential delete error:', error);
    res.status(500).json({
      status: 'error',
      error: error.message || 'Failed to delete connector credential',
      canRetry: true,
    });
  }
});

// Match machine against inventory connector
app.post('/api/gemini/match-machine', async (req, res) => {
  let deterministicMatch;
  try {
    const { analysis, connector, image, provider, ollamaModel, selectedMachineId } = req.body;
    const inventoryRecords = await loadInventoryRecords(connector || {});
    const selectedRecord = selectedMachineId
      ? inventoryRecords.find(record => record.machineId === selectedMachineId)
      : null;
    deterministicMatch = selectedRecord
      ? { record: selectedRecord, ...scoreInventoryRecord(analysis, selectedRecord) }
      : findBestInventoryMatch(analysis, inventoryRecords);
    const credentialStatus = await getConnectorCredentialStatusAsync(connector || {});

    const prompt = `
      PHASE 2: INVENTORY MATCH

      Use the approved inventory connector to identify the scanned machine and produce a reconstruction plan.

      Inventory connector: ${JSON.stringify(sanitizeConnectorForModel(connector, credentialStatus))}
      Inventory records: ${JSON.stringify(inventoryRecords.slice(0, 20))}
      Scan analysis: ${JSON.stringify(analysis)}
      Image provided: ${!!image}

      Return one JSON object with machineId, machineName, confidenceScore, evidence, conceptName,
      conceptDescription, marketGap, constraint, noveltyScore, viabilityScore, marketBenefit,
      assemblySteps, pricing, and fulfillmentOptions.
    `;

    const schema = {
      type: Type.OBJECT,
      properties: {
        patternUsed: { type: Type.STRING },
        conceptName: { type: Type.STRING },
        conceptDescription: { type: Type.STRING },
        marketGap: { type: Type.STRING },
        constraint: { type: Type.STRING },
        noveltyScore: { type: Type.NUMBER },
        viabilityScore: { type: Type.NUMBER },
        marketBenefit: { type: Type.STRING },
        machineId: { type: Type.STRING },
        machineName: { type: Type.STRING },
        inventorySource: { type: Type.STRING },
        confidenceScore: { type: Type.NUMBER },
        evidence: { type: Type.STRING },
        assemblySteps: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              stepNumber: { type: Type.NUMBER },
              title: { type: Type.STRING },
              instructions: { type: Type.STRING },
              parts: { type: Type.ARRAY, items: { type: Type.STRING } },
              estimatedTime: { type: Type.STRING },
              qualityCheck: { type: Type.STRING },
            },
            required: ['stepNumber', 'title', 'instructions', 'parts', 'estimatedTime', 'qualityCheck'],
          },
        },
        pricing: {
          type: Type.OBJECT,
          properties: {
            partsSubtotal: { type: Type.STRING },
            modelingEstimate: { type: Type.STRING },
            fabricationEstimate: { type: Type.STRING },
            assemblyLaborEstimate: { type: Type.STRING },
            totalEstimate: { type: Type.STRING },
            confidence: { type: Type.STRING },
          },
          required: ['partsSubtotal', 'modelingEstimate', 'fabricationEstimate', 'assemblyLaborEstimate', 'totalEstimate', 'confidence'],
        },
        fulfillmentOptions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              vendorName: { type: Type.STRING },
              serviceType: { type: Type.STRING },
              url: { type: Type.STRING },
              packageRequired: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['vendorName', 'serviceType', 'url', 'packageRequired'],
          },
        },
      },
      required: ['conceptName', 'conceptDescription', 'machineId', 'machineName', 'confidenceScore', 'assemblySteps', 'pricing', 'fulfillmentOptions'],
    };

    let result;
    const connectorType = connector?.connectorType || 'demo';
    if (connectorType === 'demo' || (provider !== 'ollama' && !hasConfiguredGeminiKey())) {
      result = buildInventoryReconstruction(analysis, connector, deterministicMatch);
    } else if (provider === 'ollama') {
      const model = ollamaModel || 'qwen3.5:0.8b';
      result = await callOllamaWithRetry(model, prompt, schema, RECONSTRUCTION_SYSTEM_INSTRUCTION, null);
    } else {
      result = await callGeminiWithRetry(async (ai) => {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            systemInstruction: RECONSTRUCTION_SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: schema,
          },
        });

        const text = response.text;
        if (!text) throw new Error('No inventory match response from Gemini');
        return JSON.parse(text);
      }, { type: 'match-machine', analysis, connector });
    }

    result = applyDeterministicInventoryMatch(result, analysis, connector, deterministicMatch);

    res.json({
      ...result,
      patternUsed: 'inventory_match',
      inventorySource: result.inventorySource || resolveInventorySourceName(connector),
    });
  } catch (error) {
    console.error('Inventory match error:', error);
    if (shouldUseDeterministicAiFallback(error)) {
      const fallback = buildFallbackReconstruction(req.body?.analysis, req.body?.connector);
      return res.json(applyDeterministicInventoryMatch(fallback, req.body?.analysis, req.body?.connector, deterministicMatch));
    }
    const { statusCode, body } = createErrorResponse(error, 'Failed to match machine from inventory');
    res.status(statusCode).json(body);
  }
});

// Generate technical spec
app.post('/api/gemini/technical-spec', async (req, res) => {
  try {
    const { innovation, provider, ollamaModel } = req.body;
    
    const prompt = `
      PHASE 3: RECONSTRUCTION DESIGN - Generate technical specifications.
      
      Reconstruction package: ${innovation.conceptName}
      Description: ${innovation.conceptDescription}
      Machine ID: ${innovation.machineId || 'pending'}
      Assembly steps: ${JSON.stringify(innovation.assemblySteps || [])}
      
      Create: promptLogic (evidence and matching logic), componentStructure (how parts interact), implementationNotes (assembly, review, and vendor handoff considerations).
    `;

    const cacheKey = { type: 'technical-spec', conceptName: innovation.conceptName, provider, ollamaModel };

    const schema = {
      type: Type.OBJECT,
      properties: {
        promptLogic: { type: Type.STRING },
        componentStructure: { type: Type.STRING },
        implementationNotes: { type: Type.STRING }
      },
      required: ["promptLogic", "componentStructure", "implementationNotes"]
    };

    let result;
    if (provider !== 'ollama' && !hasConfiguredGeminiKey()) {
      result = buildFallbackSpec(innovation);
    } else if (provider === 'ollama') {
      const model = ollamaModel || 'qwen3.5:0.8b';
      result = await callOllamaWithRetry(model, prompt, schema, RECONSTRUCTION_SYSTEM_INSTRUCTION, null);
    } else {
      result = await callGeminiWithRetry(async (ai) => {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            systemInstruction: RECONSTRUCTION_SYSTEM_INSTRUCTION,
            responseMimeType: "application/json",
            responseSchema: schema
          }
        });

        const text = response.text;
        if (!text) throw new Error("No response from Gemini");
        return JSON.parse(text);
      }, cacheKey);
    }

    res.json(result);
  } catch (error) {
    console.error('Generate spec error:', error);
    if (shouldUseDeterministicAiFallback(error)) {
      return res.json(buildFallbackSpec(req.body?.innovation || {}));
    }
    const { statusCode, body } = createErrorResponse(error, 'Failed to generate specifications');
    res.status(statusCode).json(body);
  }
});

const extractPublicReferenceImageUrl = (html = '', pageUrl = '') => {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["'][^>]*>/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) continue;

    try {
      return new URL(match[1], pageUrl).toString();
    } catch {
      return '';
    }
  }

  return '';
};

const getSourceBackedImage = async (innovation = {}) => {
  const references = Array.isArray(innovation.referenceImages) ? innovation.referenceImages : [];

  for (const reference of references) {
    const url = normalizeName(reference?.url);
    if (!url) continue;

    if (url.startsWith('data:image/')) {
      const match = url.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
      if (!match) continue;
      return {
        imageData: match[2],
        imageSource: {
          ...reference,
          url,
          contentType: match[1],
          sourceType: reference.sourceType || (reference.kind === 'public-source-reference' ? 'public_source_reference' : 'inventory_reference'),
        },
      };
    }

    if (!/^https?:\/\//i.test(url)) continue;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'image/*,*/*;q=0.8',
          'User-Agent': 'ReversR-Rebuild/1.0 deterministic-reference-fetch',
        },
      });

      if (!response.ok) continue;

      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      if (!contentType.toLowerCase().startsWith('image/')) continue;

      const arrayBuffer = await response.arrayBuffer();
      return {
        imageData: Buffer.from(arrayBuffer).toString('base64'),
        imageSource: {
          ...reference,
          url,
          contentType,
          sourceType: reference.sourceType || (reference.kind === 'public-source-reference' ? 'public_source_reference' : 'inventory_reference'),
        },
      };
    } catch (error) {
      console.warn(`Reference image fetch failed for ${url}:`, error.message);
    } finally {
      clearTimeout(timeout);
    }
  }

  const sourceLinks = innovation.sourceLinks && typeof innovation.sourceLinks === 'object'
    ? Object.values(innovation.sourceLinks).filter(url => /^https?:\/\//i.test(String(url)))
    : [];

  for (const pageUrl of sourceLinks.slice(0, 4)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(pageUrl, {
        signal: controller.signal,
        headers: {
          Accept: 'text/html,*/*;q=0.8',
          'User-Agent': 'ReversR-Rebuild/1.0 deterministic-public-reference-discovery',
        },
      });

      if (!response.ok) continue;

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('text/html')) continue;

      const imageUrl = extractPublicReferenceImageUrl(await response.text(), pageUrl);
      if (!imageUrl) continue;

      const publicImage = await getSourceBackedImage({
        referenceImages: [{
          id: 'public-source-reference',
          label: 'Public source reference image',
          url: imageUrl,
          sourceUrl: pageUrl,
          kind: 'public-source-reference',
        }],
      });

      if (publicImage) return publicImage;
    } catch (error) {
      console.warn(`Public reference discovery failed for ${pageUrl}:`, error.message);
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
};

// Generate 3D scene
app.post('/api/gemini/generate-3d', async (req, res) => {
  try {
    const { innovation, provider, ollamaModel } = req.body;
    
    const prompt = `
      Generate a 3D reconstruction schematic for: ${innovation.conceptName}
      Description: ${innovation.conceptDescription}
      Machine ID: ${innovation.machineId || 'pending'}
      
      Create simple 3D objects using only: box, sphere, cylinder, plane.
      Each object needs: id, type, position [x,y,z], rotation [rx,ry,rz], scale [sx,sy,sz], color (hex), material (standard/wireframe).
      Keep it minimal and abstract.
    `;

    const cacheKey = { type: 'generate-3d', conceptName: innovation.conceptName, provider, ollamaModel };

    const schema = {
      type: Type.OBJECT,
      properties: {
        objects: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING, enum: ['box', 'sphere', 'cylinder', 'plane'] },
              position: { type: Type.ARRAY, items: { type: Type.NUMBER } },
              rotation: { type: Type.ARRAY, items: { type: Type.NUMBER } },
              scale: { type: Type.ARRAY, items: { type: Type.NUMBER } },
              color: { type: Type.STRING },
              material: { type: Type.STRING, enum: ['standard', 'wireframe'] },
              name: { type: Type.STRING }
            },
            required: ["id", "type", "position", "rotation", "scale", "color", "material"]
          }
        }
      },
      required: ["objects"]
    };

    let result;
    if (provider !== 'ollama' && !hasConfiguredGeminiKey()) {
      result = buildFallbackScene();
    } else if (provider === 'ollama') {
      const model = ollamaModel || 'qwen3.5:0.8b';
      result = await callOllamaWithRetry(model, prompt, schema, RECONSTRUCTION_SYSTEM_INSTRUCTION, null);
    } else {
      result = await callGeminiWithRetry(async (ai) => {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            systemInstruction: RECONSTRUCTION_SYSTEM_INSTRUCTION,
            responseMimeType: "application/json",
            responseSchema: schema
          }
        });

        const text = response.text;
        if (!text) throw new Error("No 3D scene response from Gemini");
        return JSON.parse(text);
      }, cacheKey);
    }

    res.json(result);
  } catch (error) {
    console.error('Generate 3D error:', error);
    if (shouldUseDeterministicAiFallback(error)) {
      return res.json(buildFallbackScene());
    }
    const { statusCode, body } = createErrorResponse(error, 'Failed to generate 3D scene');
    res.status(statusCode).json(body);
  }
});

// Generate 2D image - WITH FALLBACK
app.post('/api/gemini/generate-2d', async (req, res) => {
  try {
    const { innovation } = req.body;

    const sourceBackedImage = await getSourceBackedImage(innovation);
    if (sourceBackedImage) {
      return res.json(sourceBackedImage);
    }

    if (!hasConfiguredGeminiKey()) {
      return res.json({
        imageData: FALLBACK_IMAGE_BASE64,
        imageSource: {
          sourceType: 'built_in_placeholder',
          label: 'Built-in placeholder reconstruction sketch',
        },
      });
    }
    
    const prompt = `Create a detailed technical sketch/blueprint illustration of: ${innovation.conceptName}
    
Description: ${innovation.conceptDescription}
Machine ID: ${innovation.machineId || 'pending'}
Rebuild Outcome: ${innovation.marketBenefit}

Generate a clean, professional machine reconstruction sketch with:
- Clear line drawings showing the matched machine from multiple angles
- Technical/blueprint aesthetic with a modern feel
- DO NOT include any text, labels, annotations, or written words in the image
- Use visual indicators like arrows or lines instead of text labels
- Pure visual illustration only, no typography`;

    // Note: Don't cache images as they can be large and vary
    const result = await callGeminiWithRetry(async (ai) => {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseModalities: [Modality.TEXT, Modality.IMAGE],
        },
      });

      const candidate = response.candidates?.[0];
      const imagePart = candidate?.content?.parts?.find((part) => part.inlineData);
      
      if (!imagePart?.inlineData?.data) {
        throw new Error("No image generated");
      }

      return { imageData: imagePart.inlineData.data };
    }, null, 4); // More retries for image generation

    res.json(result);
  } catch (error) {
    console.error('Generate 2D error:', error);

    if (shouldUseDeterministicAiFallback(error)) {
      return res.json({
        imageData: FALLBACK_IMAGE_BASE64,
        imageSource: {
          sourceType: 'built_in_placeholder',
          label: 'Built-in placeholder reconstruction sketch',
        },
      });
    }
    
    // For image generation, provide a fallback option
    const { statusCode, body } = createErrorResponse(error, 'Image generation temporarily unavailable');
    body.fallback = {
      message: 'Unable to generate image at this time. Your specifications and 3D scene are still available.',
      suggestion: 'Try again in a few moments or proceed with text specifications.',
    };
    res.status(statusCode).json(body);
  }
});

// Generate Multi-Angle 2D Views
const ANGLES = [
  { id: 'front', label: 'Front View', prompt: 'front-facing orthographic view, straight-on perspective' },
  { id: 'side', label: 'Side View', prompt: 'side profile view, 90-degree angle from front' },
  { id: 'top', label: 'Top View', prompt: 'top-down birds eye view, looking straight down' },
  { id: 'iso', label: 'Isometric', prompt: 'isometric 3D perspective view, 45-degree angle showing depth' },
];

// Generate single angle - for progressive loading
app.post('/api/gemini/generate-2d-single-angle', async (req, res) => {
  try {
    const { innovation, angleId } = req.body;
    
    const angle = ANGLES.find(a => a.id === angleId);
    if (!angle) {
      return res.status(400).json({ error: 'Invalid angle ID' });
    }

    const sourceBackedImage = await getSourceBackedImage(innovation);
    if (sourceBackedImage) {
      return res.json({
        id: angle.id,
        label: `${angle.label} Reference`,
        ...sourceBackedImage,
      });
    }

    if (!hasConfiguredGeminiKey()) {
      return res.json({
        id: angle.id,
        label: angle.label,
        imageData: FALLBACK_IMAGE_BASE64,
      });
    }
    
    const prompt = `Create a detailed technical sketch/blueprint illustration of: ${innovation.conceptName}

Description: ${innovation.conceptDescription}
Machine ID: ${innovation.machineId || 'pending'}
Rebuild Outcome: ${innovation.marketBenefit || 'Reconstruction package'}

VIEW ANGLE: ${angle.prompt}

Generate a clean, professional machine reconstruction sketch with:
- ${angle.label} showing the matched machine clearly
- Clean technical line drawings
- Technical/blueprint aesthetic with a modern feel
- White or light background for clarity
- DO NOT include any text, labels, annotations, or written words in the image
- Use visual indicators like arrows or lines instead of text labels
- Pure visual illustration only, no typography`;

    const imageResult = await callGeminiWithRetry(async (ai) => {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseModalities: [Modality.TEXT, Modality.IMAGE],
        },
      });

      const candidate = response.candidates?.[0];
      const imagePart = candidate?.content?.parts?.find((part) => part.inlineData);
      
      if (!imagePart?.inlineData?.data) {
        throw new Error("No image generated");
      }

      return imagePart.inlineData.data;
    }, null, 3);

    res.json({
      id: angle.id,
      label: angle.label,
      imageData: imageResult,
    });
  } catch (error) {
    console.error(`Generate single angle error:`, error.message);
    if (shouldUseDeterministicAiFallback(error)) {
      return res.json({
        id: req.body?.angleId || 'front',
        label: ANGLES.find(angle => angle.id === req.body?.angleId)?.label || 'Front View',
        imageData: FALLBACK_IMAGE_BASE64,
      });
    }
    const { statusCode, body } = createErrorResponse(error, 'Failed to generate angle view');
    res.status(statusCode).json(body);
  }
});

app.post('/api/gemini/generate-2d-angles', async (req, res) => {
  try {
    const { innovation, angles = ['front', 'side', 'iso'] } = req.body;
    
    const selectedAngles = ANGLES.filter(a => angles.includes(a.id));
    const sourceBackedImage = await getSourceBackedImage(innovation);
    if (sourceBackedImage) {
      return res.json({
        images: selectedAngles.map(angle => ({
          id: angle.id,
          label: `${angle.label} Reference`,
          ...sourceBackedImage,
        })),
      });
    }

    if (!hasConfiguredGeminiKey()) {
      return res.json({
        images: selectedAngles.map(angle => ({
          id: angle.id,
          label: angle.label,
          imageData: FALLBACK_IMAGE_BASE64,
        })),
      });
    }

    const results = [];
    
    for (const angle of selectedAngles) {
      const prompt = `Create a detailed technical sketch/blueprint illustration of: ${innovation.conceptName}

Description: ${innovation.conceptDescription}
Machine ID: ${innovation.machineId || 'pending'}
Rebuild Outcome: ${innovation.marketBenefit || 'Reconstruction package'}

VIEW ANGLE: ${angle.prompt}

Generate a clean, professional machine reconstruction sketch with:
- ${angle.label} showing the matched machine clearly
- Clean technical line drawings
- Technical/blueprint aesthetic with a modern feel
- White or light background for clarity
- DO NOT include any text, labels, annotations, or written words in the image
- Use visual indicators like arrows or lines instead of text labels
- Pure visual illustration only, no typography`;

      try {
        const imageResult = await callGeminiWithRetry(async (ai) => {
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
              responseModalities: [Modality.TEXT, Modality.IMAGE],
            },
          });

          const candidate = response.candidates?.[0];
          const imagePart = candidate?.content?.parts?.find((part) => part.inlineData);
          
          if (!imagePart?.inlineData?.data) {
            throw new Error("No image generated");
          }

          return imagePart.inlineData.data;
        }, null, 3);

        results.push({
          id: angle.id,
          label: angle.label,
          imageData: imageResult,
        });
      } catch (angleError) {
        console.error(`Failed to generate ${angle.label}:`, angleError.message);
        results.push({
          id: angle.id,
          label: angle.label,
          imageData: shouldUseDeterministicAiFallback(angleError) ? FALLBACK_IMAGE_BASE64 : null,
          error: shouldUseDeterministicAiFallback(angleError) ? undefined : 'Failed to generate this view',
        });
      }
    }

    res.json({ images: results });
  } catch (error) {
    console.error('Generate multi-angle error:', error);
    const { statusCode, body } = createErrorResponse(error, 'Multi-angle image generation failed');
    res.status(statusCode).json(body);
  }
});

// Generate Bill of Materials
app.post('/api/gemini/generate-bom', async (req, res) => {
  try {
    const { innovation, analysis, provider, ollamaModel } = req.body;
    
    const prompt = `
      PHASE 4: BILL OF MATERIALS
      
      Generate a comprehensive Bill of Materials for reconstructing: ${innovation.conceptName}
      Description: ${innovation.conceptDescription}
      Machine ID: ${innovation.machineId || 'pending'}
      Assembly Steps: ${JSON.stringify(innovation.assemblySteps || [])}
      ${analysis ? `Original Components: ${JSON.stringify(analysis.components)}` : ''}
      
      Create a detailed BOM with realistic part numbers, materials, estimated costs, and suppliers.
      Include all components needed to reconstruct the matched machine.
    `;

    const cacheKey = { type: 'generate-bom', conceptName: innovation.conceptName, provider, ollamaModel };

    const schema = {
      type: Type.OBJECT,
      properties: {
        projectName: { type: Type.STRING },
        version: { type: Type.STRING },
        dateGenerated: { type: Type.STRING },
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              partNumber: { type: Type.STRING },
              partName: { type: Type.STRING },
              description: { type: Type.STRING },
              quantity: { type: Type.NUMBER },
              material: { type: Type.STRING },
              estimatedCost: { type: Type.STRING },
              supplier: { type: Type.STRING },
              leadTime: { type: Type.STRING },
              notes: { type: Type.STRING }
            },
            required: ["partNumber", "partName", "description", "quantity", "material", "estimatedCost", "supplier", "leadTime", "notes"]
          }
        },
        totalEstimatedCost: { type: Type.STRING },
        manufacturingNotes: { type: Type.STRING }
      },
      required: ["projectName", "version", "dateGenerated", "items", "totalEstimatedCost", "manufacturingNotes"]
    };

    let result;
    if (provider !== 'ollama' && !hasConfiguredGeminiKey()) {
      result = buildFallbackBom(innovation, analysis);
    } else if (provider === 'ollama') {
      const model = ollamaModel || 'qwen3.5:0.8b';
      result = await callOllamaWithRetry(model, prompt, schema, RECONSTRUCTION_SYSTEM_INSTRUCTION, null);
    } else {
      result = await callGeminiWithRetry(async (ai) => {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            systemInstruction: RECONSTRUCTION_SYSTEM_INSTRUCTION,
            responseMimeType: "application/json",
            responseSchema: schema
          }
        });

        const text = response.text;
        if (!text) throw new Error("No BOM response from Gemini");
        return JSON.parse(text);
      }, cacheKey);
    }

    res.json(result);
  } catch (error) {
    console.error('Generate BOM error:', error);
    if (shouldUseDeterministicAiFallback(error)) {
      return res.json(buildFallbackBom(req.body?.innovation || {}, req.body?.analysis));
    }
    const { statusCode, body } = createErrorResponse(error, 'Failed to generate Bill of Materials');
    res.status(statusCode).json(body);
  }
});

// ============================================
// LEGACY ROUTES (for backwards compatibility)
// ============================================

app.post('/api/analyze', (req, res) => {
  req.url = '/api/gemini/analyze';
  app.handle(req, res);
});

app.post('/api/generate-spec', (req, res) => {
  req.url = '/api/gemini/technical-spec';
  app.handle(req, res);
});

app.post('/api/generate-3d', (req, res) => {
  req.url = '/api/gemini/generate-3d';
  app.handle(req, res);
});

app.post('/api/generate-2d', (req, res) => {
  req.url = '/api/gemini/generate-2d';
  app.handle(req, res);
});

// ============================================
// HEALTH & STATUS
// ============================================

const getHealthPayload = async () => {
  const now = Date.now();
  const availableKeys = apiKeyPool.filter(k => k.cooldownUntil <= now).length;
  const credentialSummaries = await listCredentialSummaries();
  return {
    status: 'ok',
    service: 'reversr-rebuild-api',
    version: '0.1.0',
    apiKeys: {
      total: apiKeyPool.length,
      available: availableKeys,
      allInCooldown: availableKeys === 0,
    },
    cache: {
      size: responseCache.cache.size,
    },
    inventorySources: ['demo', 'file', 'http', 'https'],
    authenticatedConnectorsEnabled: credentialSummaries.length > 0 || process.env.INVENTORY_PRIVATE_NETWORK_ENABLED === 'true',
    credentialRegistryEnabled: Boolean(getCredentialRegistryPath()),
    credentialCount: credentialSummaries.length,
    privateNetworkConnectorsEnabled: process.env.INVENTORY_PRIVATE_NETWORK_ENABLED === 'true',
    runtimeConfig: {
      corsMode: corsAllowsAllOrigins ? 'open' : 'restricted',
      allowedCorsOriginCount: corsAllowsAllOrigins ? 0 : configuredCorsOrigins.length,
      requestBodyLimit: apiRequestBodyLimit,
      adminRoutesEnabled: Boolean(process.env.ADMIN_API_TOKEN),
      registryWritesEnabled: Boolean(getCredentialRegistryPath()),
      geminiConfigured: apiKeyPool.length > 0,
      privateNetworkConnectorsEnabled: process.env.INVENTORY_PRIVATE_NETWORK_ENABLED === 'true',
    },
  };
};

app.get('/health', async (req, res) => {
  res.json(await getHealthPayload());
});

app.get('/api/health', async (req, res) => {
  res.json(await getHealthPayload());
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.API_PORT || 5000;
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`API server running on port ${PORT}`);
    console.log(`API keys configured: ${apiKeyPool.length}`);
  });
}

module.exports = app;
