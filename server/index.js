const express = require('express');
const cors = require('cors');
const { GoogleGenAI, Type, Modality } = require('@google/genai');
const {
  initializePinecone,
  storeInnovation,
  searchSimilarInnovations,
  getInnovationContext,
  deleteInnovation,
  getIndexStats,
} = require('./pinecone');

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));

// ============================================
// SIT PATTERN NORMALIZATION
// ============================================

// Valid pattern keys
const VALID_PATTERN_KEYS = ['subtraction', 'task_unification', 'multiplication', 'division', 'attribute_dependency'];

// Map labels to keys for legacy data
const LABEL_TO_KEY = {
  'Subtraction': 'subtraction',
  'Task Unification': 'task_unification',
  'Multiplication': 'multiplication',
  'Division': 'division',
  'Attribute Dependency': 'attribute_dependency',
};

// Normalize pattern to key format, returns null if invalid
const normalizePattern = (pattern) => {
  if (!pattern) return null;
  
  // Already a valid key
  if (VALID_PATTERN_KEYS.includes(pattern)) {
    return pattern;
  }
  
  // Try label lookup
  if (LABEL_TO_KEY[pattern]) {
    return LABEL_TO_KEY[pattern];
  }
  
  // Try case-insensitive match
  const lower = pattern.toLowerCase().replace(/\s+/g, '_');
  if (VALID_PATTERN_KEYS.includes(lower)) {
    return lower;
  }
  
  console.warn(`Unknown pattern format: ${pattern}, defaulting to subtraction`);
  return 'subtraction';
};

// ============================================
// API KEY POOL & RATE LIMIT HANDLING
// ============================================

// Parse API keys from environment (comma-separated for multiple keys)
const parseApiKeys = () => {
  const primaryKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const additionalKeys = process.env.GEMINI_API_KEYS || '';
  
  const keys = [primaryKey];
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

const SIT_SYSTEM_INSTRUCTION = `You are an expert in Systematic Inventive Thinking (SIT), a structured methodology for innovation. You strictly adhere to the "Closed World" principle: all solutions must derive from components already within or immediately adjacent to the product's defined system boundary. You are precise, analytical, and creative within constraints.`;

// ============================================
// API ROUTES - WITH /api/gemini PREFIX FOR MOBILE APP
// ============================================

// Analyze product
app.post('/api/gemini/analyze', async (req, res) => {
  try {
    const { input, image } = req.body;
    const imageBase64 = image;
    
    const textPrompt = `
      PHASE 1: THE CLOSED WORLD SCAN
      ${imageBase64 ? "Analyze the product shown in the image and the following description:" : "Analyze the following input:"} 
      "${input}"
      
      1. **Deconstruct** the product into its physical parts.
      2. **Filter** for Essential Components (parts without which the product loses its primary function).
      3. **Identify Neighborhood Resources**: List elements immediately available in the product's environment.
      4. List relevant **Attributes** for the components.
      5. Define the **Closed World Boundary** strictly.
      
      Return the result in valid JSON.
    `;
    
    const cacheKey = { type: 'analyze', input, hasImage: !!imageBase64 };
    
    const result = await callGeminiWithRetry(async (ai) => {
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

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: {
          systemInstruction: SIT_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: schema
        }
      });

      const text = response.text;
      if (!text) throw new Error("No response from Gemini");
      return JSON.parse(text);
    }, imageBase64 ? null : cacheKey); // Don't cache image requests (too variable)

    res.json(result);
  } catch (error) {
    console.error('Analyze error:', error);
    const { statusCode, body } = createErrorResponse(error, 'Failed to analyze product');
    res.status(statusCode).json(body);
  }
});

// Apply SIT pattern
app.post('/api/gemini/apply-pattern', async (req, res) => {
  try {
    const { analysis, pattern, selectedComponents, selectedResources } = req.body;
    
    // Filter components and resources based on selection (if provided)
    const componentsToUse = selectedComponents && selectedComponents.length > 0
      ? selectedComponents.map(idx => analysis.components[idx]).filter(Boolean)
      : analysis.components;
    
    const resourcesToUse = selectedResources && selectedResources.length > 0
      ? selectedResources.map(idx => analysis.neighborhoodResources[idx]).filter(Boolean)
      : analysis.neighborhoodResources;
    
    const selectionNote = (selectedComponents && selectedComponents.length > 0) || (selectedResources && selectedResources.length > 0)
      ? `\n\nNote: The user has specifically selected the following items to focus on for this reversal. Prioritize these elements in your innovation.`
      : '';
    
    const prompt = `
      PHASE 2: PATTERN APPLICATION (${pattern})
      Apply the "${pattern}" SIT pattern to generate an innovative product concept.
      
      Product: ${analysis.productName}
      Components: ${JSON.stringify(componentsToUse)}
      Neighborhood Resources: ${JSON.stringify(resourcesToUse)}
      Closed World: ${analysis.closedWorldBoundary}${selectionNote}
      
      Generate ONE innovative concept. Include marketGap (unmet need), noveltyScore (1-10), and viabilityScore (1-10).
      Return JSON with: patternUsed, conceptName, conceptDescription, marketGap, constraint, noveltyScore, viabilityScore, marketBenefit.
    `;

    const cacheKey = { type: 'apply-pattern', productName: analysis.productName, pattern, selectedComponents, selectedResources };

    const result = await callGeminiWithRetry(async (ai) => {
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
          marketBenefit: { type: Type.STRING }
        },
        required: ["patternUsed", "conceptName", "conceptDescription", "marketGap", "constraint", "noveltyScore", "viabilityScore", "marketBenefit"]
      };

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          systemInstruction: SIT_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: schema
        }
      });

      const text = response.text;
      if (!text) throw new Error("No response from Gemini");
      return JSON.parse(text);
    }, cacheKey);

    // Override patternUsed with normalized pattern key
    // This ensures consistent format (e.g., 'subtraction' not 'Subtraction')
    result.patternUsed = normalizePattern(pattern);
    
    res.json(result);
  } catch (error) {
    console.error('Apply pattern error:', error);
    const { statusCode, body } = createErrorResponse(error, 'Failed to apply pattern');
    res.status(statusCode).json(body);
  }
});

// Generate technical spec
app.post('/api/gemini/technical-spec', async (req, res) => {
  try {
    const { innovation } = req.body;
    
    const prompt = `
      PHASE 3: THE ARCHITECT - Generate technical specifications.
      
      Innovation: ${innovation.conceptName}
      Description: ${innovation.conceptDescription}
      Pattern: ${innovation.patternUsed}
      
      Create: promptLogic (reasoning chain), componentStructure (how parts interact), implementationNotes (key considerations).
    `;

    const cacheKey = { type: 'technical-spec', conceptName: innovation.conceptName };

    const result = await callGeminiWithRetry(async (ai) => {
      const schema = {
        type: Type.OBJECT,
        properties: {
          promptLogic: { type: Type.STRING },
          componentStructure: { type: Type.STRING },
          implementationNotes: { type: Type.STRING }
        },
        required: ["promptLogic", "componentStructure", "implementationNotes"]
      };

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          systemInstruction: SIT_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: schema
        }
      });

      const text = response.text;
      if (!text) throw new Error("No response from Gemini");
      return JSON.parse(text);
    }, cacheKey);

    res.json(result);
  } catch (error) {
    console.error('Generate spec error:', error);
    const { statusCode, body } = createErrorResponse(error, 'Failed to generate specifications');
    res.status(statusCode).json(body);
  }
});

// Generate 3D scene
app.post('/api/gemini/generate-3d', async (req, res) => {
  try {
    const { innovation } = req.body;
    
    const prompt = `
      Generate a 3D schematic for: ${innovation.conceptName}
      Description: ${innovation.conceptDescription}
      
      Create simple 3D objects using only: box, sphere, cylinder, plane.
      Each object needs: id, type, position [x,y,z], rotation [rx,ry,rz], scale [sx,sy,sz], color (hex), material (standard/wireframe).
      Keep it minimal and abstract.
    `;

    const cacheKey = { type: 'generate-3d', conceptName: innovation.conceptName };

    const result = await callGeminiWithRetry(async (ai) => {
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

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          systemInstruction: SIT_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: schema
        }
      });

      const text = response.text;
      if (!text) throw new Error("No 3D scene response from Gemini");
      return JSON.parse(text);
    }, cacheKey);

    res.json(result);
  } catch (error) {
    console.error('Generate 3D error:', error);
    const { statusCode, body } = createErrorResponse(error, 'Failed to generate 3D scene');
    res.status(statusCode).json(body);
  }
});

// Generate 2D image - WITH FALLBACK
app.post('/api/gemini/generate-2d', async (req, res) => {
  try {
    const { innovation } = req.body;
    
    const prompt = `Create a detailed technical sketch/blueprint illustration of: ${innovation.conceptName}
    
Description: ${innovation.conceptDescription}
Innovation Pattern: ${innovation.patternUsed}
Market Benefit: ${innovation.marketBenefit}

Generate a clean, professional product concept sketch with:
- Clear line drawings showing the product from multiple angles
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
    
    const prompt = `Create a detailed technical sketch/blueprint illustration of: ${innovation.conceptName}

Description: ${innovation.conceptDescription}
Innovation Pattern: ${innovation.patternUsed || 'SIT Pattern'}
Market Benefit: ${innovation.marketBenefit || 'Enhanced functionality'}

VIEW ANGLE: ${angle.prompt}

Generate a clean, professional product concept sketch with:
- ${angle.label} showing the product clearly
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
    const results = [];
    
    for (const angle of selectedAngles) {
      const prompt = `Create a detailed technical sketch/blueprint illustration of: ${innovation.conceptName}

Description: ${innovation.conceptDescription}
Innovation Pattern: ${innovation.patternUsed || 'SIT Pattern'}
Market Benefit: ${innovation.marketBenefit || 'Enhanced functionality'}

VIEW ANGLE: ${angle.prompt}

Generate a clean, professional product concept sketch with:
- ${angle.label} showing the product clearly
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
    const { innovation, analysis } = req.body;
    
    const prompt = `
      PHASE 4: BILL OF MATERIALS
      
      Generate a comprehensive Bill of Materials for manufacturing: ${innovation.conceptName}
      Description: ${innovation.conceptDescription}
      Pattern Used: ${innovation.patternUsed}
      ${analysis ? `Original Components: ${JSON.stringify(analysis.components)}` : ''}
      
      Create a detailed BOM with realistic part numbers, materials, estimated costs, and suppliers.
      Include all components needed to manufacture this innovation.
    `;

    const cacheKey = { type: 'generate-bom', conceptName: innovation.conceptName };

    const result = await callGeminiWithRetry(async (ai) => {
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

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          systemInstruction: SIT_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: schema
        }
      });

      const text = response.text;
      if (!text) throw new Error("No BOM response from Gemini");
      return JSON.parse(text);
    }, cacheKey);

    res.json(result);
  } catch (error) {
    console.error('Generate BOM error:', error);
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

app.post('/api/apply-pattern', (req, res) => {
  req.url = '/api/gemini/apply-pattern';
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
// PINECONE INTEGRATION ENDPOINTS
// ============================================

// Store innovation in Pinecone
app.post('/api/pinecone/store', async (req, res) => {
  try {
    const { innovation } = req.body;
    
    if (!innovation || !innovation.conceptName) {
      return res.status(400).json({ error: 'Innovation data required' });
    }

    const keyInfo = getAvailableKey();
    const ai = createClient(keyInfo);
    
    const success = await storeInnovation(innovation, ai);
    
    if (success) {
      res.json({ success: true, message: 'Innovation stored in Pinecone' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to store innovation' });
    }
  } catch (error) {
    console.error('Store innovation error:', error);
    res.status(500).json({ error: 'Failed to store innovation', details: error.message });
  }
});

// Search similar innovations
app.post('/api/pinecone/search', async (req, res) => {
  try {
    const { query, topK = 5 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query required' });
    }

    const keyInfo = getAvailableKey();
    const ai = createClient(keyInfo);
    
    const results = await searchSimilarInnovations(query, ai, topK);
    
    res.json({ results });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed', details: error.message });
  }
});

// Delete innovation from Pinecone
app.delete('/api/pinecone/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const success = await deleteInnovation(id);
    
    if (success) {
      res.json({ success: true, message: 'Innovation deleted' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to delete innovation' });
    }
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Delete failed', details: error.message });
  }
});

// Get Pinecone index statistics
app.get('/api/pinecone/stats', async (req, res) => {
  try {
    const stats = await getIndexStats();
    
    if (stats) {
      res.json({ stats });
    } else {
      res.status(500).json({ error: 'Failed to get stats' });
    }
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats', details: error.message });
  }
});

// Enhanced analyze endpoint with RAG (Retrieval-Augmented Generation)
app.post('/api/gemini/analyze-with-context', async (req, res) => {
  try {
    const { input, image, useContext = true } = req.body;
    const imageBase64 = image;
    
    // Get relevant context from Pinecone
    let contextString = '';
    if (useContext) {
      const keyInfo = getAvailableKey();
      const ai = createClient(keyInfo);
      contextString = await getInnovationContext(input, ai, 3);
    }
    
    const textPrompt = `
      PHASE 1: THE CLOSED WORLD SCAN
      ${imageBase64 ? "Analyze the product shown in the image and the following description:" : "Analyze the following input:"} 
      "${input}"
      ${contextString}
      
      1. **Deconstruct** the product into its physical parts.
      2. **Filter** for Essential Components (parts without which the product loses its primary function).
      3. **Identify Neighborhood Resources**: List elements immediately available in the product's environment.
      4. List relevant **Attributes** for the components.
      5. Define the **Closed World Boundary** strictly.
      
      Return the result in valid JSON.
    `;
    
    const cacheKey = { type: 'analyze', input, hasImage: !!imageBase64, useContext };
    
    const result = await callGeminiWithRetry(async (ai) => {
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

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: {
          systemInstruction: SIT_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: schema
        }
      });

      const text = response.text;
      if (!text) throw new Error("No response from Gemini");
      return JSON.parse(text);
    }, imageBase64 ? null : cacheKey);

    res.json(result);
  } catch (error) {
    console.error('Analyze with context error:', error);
    const { statusCode, body } = createErrorResponse(error, 'Failed to analyze product');
    res.status(statusCode).json(body);
  }
});

// ============================================
// HEALTH & STATUS
// ============================================

app.get('/health', async (req, res) => {
  const now = Date.now();
  const availableKeys = apiKeyPool.filter(k => k.cooldownUntil <= now).length;
  
  let pineconeStatus = 'not_configured';
  let pineconeStats = null;
  
  try {
    const stats = await getIndexStats();
    if (stats) {
      pineconeStatus = 'connected';
      pineconeStats = {
        totalVectorCount: stats.totalRecordCount || 0,
        dimension: stats.dimension || 768,
      };
    }
  } catch (error) {
    pineconeStatus = 'error';
  }
  
  res.json({ 
    status: 'ok',
    apiKeys: {
      total: apiKeyPool.length,
      available: availableKeys,
      allInCooldown: availableKeys === 0,
    },
    cache: {
      size: responseCache.cache.size,
    },
    pinecone: {
      status: pineconeStatus,
      stats: pineconeStats,
    }
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.API_PORT || 5000;
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`API server running on port ${PORT}`);
  console.log(`API keys configured: ${apiKeyPool.length}`);
  
  // Initialize Pinecone on startup
  await initializePinecone();
});
