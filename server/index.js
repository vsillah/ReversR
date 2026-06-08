const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const crypto = require('crypto');
const { GoogleGenAI, Type, Modality } = require('@google/genai');
const { Ollama } = require('ollama');

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

const normalizeMachineRecord = (record = {}, index = 0) => {
  const machineId = normalizeName(record.machineId || record.id || record.sku || record.assetId || `INV-${String(index + 1).padStart(4, '0')}`);
  const machineName = normalizeName(record.machineName || record.name || record.title || record.model || 'Unnamed Machine');
  const parts = splitList(record.parts || record.components || record.bomParts || record.requiredParts);
  const aliases = splitList(record.aliases || record.keywords || record.tags);
  const materials = splitList(record.materials || record.material);
  const vendors = normalizeFulfillmentOptions(record.fulfillmentOptions || record.modelingVendors || record.vendors);
  const assemblySteps = normalizeAssemblySteps(record.assemblySteps || record.steps, parts);
  const pricing = normalizePricing(record.pricing || record.pricingSnapshot);

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
    notes: normalizeName(record.notes || record.description || ''),
    sourceRow: index + 1,
  };
};

const DEMO_MACHINE_RECORDS = [
  normalizeMachineRecord({
    machineId: 'DEMO-FDM-PRINTER-001',
    machineName: 'Desktop FDM 3D Printer',
    revision: 'A',
    aliases: '3d printer|fdm printer|desktop printer|filament printer',
    parts: 'Frame|Heated Bed|Extruder|Stepper Motors|Control Board|Power Supply|Belts|Rails|Nozzle|Display',
    materials: 'aluminum extrusion|borosilicate glass|NEMA steppers|GT2 belts|hardened steel nozzle',
    assemblySteps: JSON.stringify([
      {
        stepNumber: 1,
        title: 'Verify inventory record',
        instructions: 'Confirm printer revision, bed size, firmware family, and required subassemblies.',
        parts: ['Frame', 'Heated Bed', 'Extruder'],
        estimatedTime: '20 min',
        qualityCheck: 'Machine ID and revision match the inventory record.',
      },
      {
        stepNumber: 2,
        title: 'Build frame and motion system',
        instructions: 'Square the frame, install rails, belts, steppers, and bed motion hardware.',
        parts: ['Frame', 'Rails', 'Belts', 'Stepper Motors', 'Heated Bed'],
        estimatedTime: '1-2 hr',
        qualityCheck: 'Axes move freely and frame is square.',
      },
      {
        stepNumber: 3,
        title: 'Install toolhead and electronics',
        instructions: 'Mount extruder, nozzle, power supply, control board, display, and wiring harness.',
        parts: ['Extruder', 'Nozzle', 'Power Supply', 'Control Board', 'Display'],
        estimatedTime: '1 hr',
        qualityCheck: 'Continuity, polarity, and thermal protections pass before power-on.',
      },
      {
        stepNumber: 4,
        title: 'Calibrate rebuild',
        instructions: 'Run bed leveling, PID tuning, extrusion calibration, and a first-layer test.',
        parts: ['Heated Bed', 'Nozzle', 'Display'],
        estimatedTime: '45 min',
        qualityCheck: 'Calibration report and test print are attached.',
      },
    ]),
    pricing: JSON.stringify({
      partsSubtotal: '$420-$780',
      modelingEstimate: '$300-$900',
      fabricationEstimate: '$500-$1,600',
      assemblyLaborEstimate: '$240-$640',
      totalEstimate: '$1,460-$3,920',
      confidence: 'medium',
    }),
  }, 0),
  normalizeMachineRecord({
    machineId: 'DEMO-CNC-ROUTER-002',
    machineName: 'Desktop CNC Router',
    aliases: 'cnc router|desktop mill|gantry router',
    parts: 'Frame|Spindle|Gantry|Stepper Motors|Control Board|Power Supply|Linear Rails|Lead Screws|Wasteboard',
    materials: 'aluminum extrusion|steel rails|MDF wasteboard',
  }, 1),
];

const recordsFromPayload = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.machines)) return payload.machines;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
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
  const denominator = Math.max(recordParts.length, 1);
  const score = Math.min(0.98, (partHits.length / denominator) * 0.7 + Math.min(aliasHits.length, 2) * 0.18 + Math.min(materialHits.length, 2) * 0.07);

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

const inferComponents = (input = '') => {
  const lower = input.toLowerCase();
  const knownParts = [
    'frame', 'heated bed', 'extruder', 'stepper motors', 'control board', 'power supply',
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
  const sourceName = connector.sourceName || 'Demo Machine Inventory';
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
  const sourceName = connector.sourceName || 'Inventory';
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

const FALLBACK_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

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
    if ((error.message || '').includes('default credentials')) {
      return res.json(buildFallbackAnalysis(req.body?.input || '', req.body?.image || null));
    }
    const { statusCode, body } = createErrorResponse(error, 'Failed to analyze product');
    res.status(statusCode).json(body);
  }
});

app.post('/api/inventory/validate', async (req, res) => {
  try {
    const { connector } = req.body;
    const records = await loadInventoryRecords(connector || {});
    const credentialStatus = await getConnectorCredentialStatusAsync(connector || {});
    res.json({
      status: 'ok',
      sourceName: connector?.sourceName || 'Inventory',
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
  try {
    const { analysis, connector, image, provider, ollamaModel } = req.body;
    const inventoryRecords = await loadInventoryRecords(connector || {});
    const deterministicMatch = findBestInventoryMatch(analysis, inventoryRecords);
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

    res.json({
      ...result,
      patternUsed: 'inventory_match',
      inventorySource: result.inventorySource || connector?.sourceName || 'Inventory',
    });
  } catch (error) {
    console.error('Inventory match error:', error);
    if ((error.message || '').includes('default credentials')) {
      return res.json(buildFallbackReconstruction(req.body?.analysis, req.body?.connector));
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
    if ((error.message || '').includes('default credentials')) {
      return res.json(buildFallbackSpec(req.body?.innovation || {}));
    }
    const { statusCode, body } = createErrorResponse(error, 'Failed to generate specifications');
    res.status(statusCode).json(body);
  }
});

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
    if ((error.message || '').includes('default credentials')) {
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

    if (!hasConfiguredGeminiKey()) {
      return res.json({ imageData: FALLBACK_IMAGE_BASE64 });
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
    const { statusCode, body } = createErrorResponse(error, 'Failed to generate angle view');
    res.status(statusCode).json(body);
  }
});

app.post('/api/gemini/generate-2d-angles', async (req, res) => {
  try {
    const { innovation, angles = ['front', 'side', 'iso'] } = req.body;
    
    const selectedAngles = ANGLES.filter(a => angles.includes(a.id));
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
          imageData: null,
          error: 'Failed to generate this view',
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
    if ((error.message || '').includes('default credentials')) {
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
