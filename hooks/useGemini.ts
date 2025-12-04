const API_BASE = 'https://reversr-vsillah.replit.app';

export interface Component {
  name: string;
  description: string;
  isEssential: boolean;
}

export interface Attribute {
  name: string;
  value: string;
  type: 'Quantitative' | 'Qualitative';
}

export interface AnalysisResult {
  productName: string;
  components: Component[];
  neighborhoodResources: string[];
  attributes: Attribute[];
  closedWorldBoundary: string;
  rawAnalysis: string;
}

export type SITPattern = 'subtraction' | 'task_unification' | 'multiplication' | 'division' | 'attribute_dependency';

export const SIT_PATTERN_LABELS: Record<SITPattern, string> = {
  'subtraction': 'Subtraction',
  'task_unification': 'Task Unification',
  'multiplication': 'Multiplication',
  'division': 'Division',
  'attribute_dependency': 'Attribute Dependency',
};

export const SIT_PATTERNS: SITPattern[] = [
  'subtraction',
  'task_unification',
  'multiplication',
  'division',
  'attribute_dependency',
];

export interface InnovationResult {
  patternUsed: SITPattern;
  conceptName: string;
  conceptDescription: string;
  marketGap: string;
  constraint: string;
  noveltyScore: number;
  viabilityScore: number;
  marketBenefit: string;
}

export interface TechnicalSpec {
  promptLogic: string;
  componentStructure: string;
  implementationNotes: string;
}

export interface BOMItem {
  partNumber: string;
  partName: string;
  description: string;
  quantity: number;
  material: string;
  estimatedCost: string;
  supplier: string;
  leadTime: string;
  notes: string;
}

export interface BillOfMaterials {
  projectName: string;
  version: string;
  dateGenerated: string;
  items: BOMItem[];
  totalEstimatedCost: string;
  manufacturingNotes: string;
}

export interface SceneObject {
  id: string;
  type: 'box' | 'sphere' | 'cylinder' | 'plane';
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  material: 'standard' | 'wireframe';
  args?: number[];
  name?: string;
}

export interface ThreeDSceneDescriptor {
  objects: SceneObject[];
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface APIErrorResponse {
  error: string;
  code?: string;
  retryAfter?: number;
  canRetry?: boolean;
  fallback?: {
    message: string;
    suggestion: string;
  };
}

class APIError extends Error {
  code: string;
  retryAfter: number;
  canRetry: boolean;
  fallback?: { message: string; suggestion: string };

  constructor(response: APIErrorResponse) {
    super(response.error);
    this.code = response.code || 'UNKNOWN_ERROR';
    this.retryAfter = response.retryAfter || 0;
    this.canRetry = response.canRetry ?? true;
    this.fallback = response.fallback;
  }
}

async function fetchWithRetry<T>(url: string, options: RequestInit, retries = 2): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        let errorData: APIErrorResponse;
        try {
          errorData = await response.json();
        } catch {
          errorData = { error: `Request failed (${response.status})`, canRetry: true };
        }
        
        // If it's a rate limit error and server says we can retry
        if (response.status === 429 || errorData.code === 'RATE_LIMITED') {
          if (attempt < retries && errorData.canRetry) {
            const waitTime = (errorData.retryAfter || 5) * 1000;
            console.warn(`Rate limited, waiting ${waitTime}ms before retry...`);
            await wait(waitTime);
            continue;
          }
          throw new APIError({
            error: 'System is busy. Please wait a moment and try again.',
            code: 'RATE_LIMITED',
            retryAfter: errorData.retryAfter || 30,
            canRetry: true,
          });
        }
        
        throw new APIError(errorData);
      }
      
      return await response.json();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry for non-retryable errors
      if (error instanceof APIError && !error.canRetry) {
        throw error;
      }
      
      // Network errors - retry with backoff
      if (attempt < retries && !(error instanceof APIError)) {
        const backoff = Math.min(2000 * Math.pow(2, attempt), 10000);
        console.warn(`Request failed, retrying in ${backoff}ms... (${retries - attempt} left)`);
        await wait(backoff);
        continue;
      }
    }
  }
  
  throw lastError || new Error('Request failed after retries');
}

export const analyzeProduct = async (input: string, imageBase64?: string): Promise<AnalysisResult> => {
  return fetchWithRetry(`${API_BASE}/api/gemini/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, image: imageBase64 })
  });
};

export const applySITPattern = async (analysis: AnalysisResult, pattern: SITPattern): Promise<InnovationResult> => {
  return fetchWithRetry(`${API_BASE}/api/gemini/apply-pattern`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ analysis, pattern })
  });
};

export const generateTechnicalSpec = async (innovation: InnovationResult): Promise<TechnicalSpec> => {
  return fetchWithRetry(`${API_BASE}/api/gemini/technical-spec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ innovation })
  });
};

export const generate3DScene = async (innovation: InnovationResult): Promise<ThreeDSceneDescriptor> => {
  return fetchWithRetry(`${API_BASE}/api/gemini/generate-3d`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ innovation })
  });
};

export const generate2DImage = async (innovation: InnovationResult): Promise<string> => {
  const response = await fetchWithRetry<{ imageData: string }>(`${API_BASE}/api/gemini/generate-2d`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ innovation })
  });
  return response.imageData;
};

export const generateBOM = async (innovation: InnovationResult, analysis?: AnalysisResult): Promise<BillOfMaterials> => {
  return fetchWithRetry(`${API_BASE}/api/gemini/generate-bom`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ innovation, analysis })
  });
};
