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

export interface AngleImage {
  id: string;
  label: string;
  imageData: string | null;
  error?: string;
}

export const useGemini = () => {
  const generate2DVisualization = async (conceptName: string, conceptDescription: string): Promise<string | null> => {
    try {
      const response = await fetchWithRetry<{ imageData: string }>(`${API_BASE}/api/gemini/generate-2d`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          innovation: {
            conceptName,
            conceptDescription,
          }
        })
      });
      return response.imageData ? `data:image/png;base64,${response.imageData}` : null;
    } catch (error) {
      console.error('Background 2D generation error:', error);
      return null;
    }
  };

  const generate2DMultiAngle = async (innovation: InnovationResult, angles: string[] = ['front', 'side', 'iso']): Promise<AngleImage[]> => {
    try {
      const response = await fetchWithRetry<{ images: AngleImage[] }>(`${API_BASE}/api/gemini/generate-2d-angles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ innovation, angles })
      });
      return response.images || [];
    } catch (error) {
      console.error('Multi-angle 2D generation error:', error);
      return [];
    }
  };

  return {
    generate2DVisualization,
    generate2DMultiAngle,
  };
};

export const generate2DMultiAngleImages = async (innovation: InnovationResult, angles: string[] = ['front', 'side', 'iso']): Promise<AngleImage[]> => {
  try {
    const response = await fetchWithRetry<{ images: AngleImage[] }>(`${API_BASE}/api/gemini/generate-2d-angles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ innovation, angles })
    });
    return response.images || [];
  } catch (error) {
    console.error('Multi-angle 2D generation error:', error);
    return [];
  }
};

export const generate2DSingleAngle = async (innovation: InnovationResult, angleId: string): Promise<AngleImage | null> => {
  try {
    console.log(`[DEBUG] generate2DSingleAngle: Starting for ${angleId}`);
    const response = await fetchWithRetry<AngleImage>(`${API_BASE}/api/gemini/generate-2d-single-angle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ innovation, angleId })
    });
    console.log(`[DEBUG] generate2DSingleAngle: Response for ${angleId}:`, {
      id: response?.id,
      label: response?.label,
      hasImageData: !!response?.imageData,
      imageDataLength: response?.imageData?.length || 0,
      imageDataPrefix: response?.imageData?.substring(0, 50) || 'null'
    });
    return response;
  } catch (error) {
    console.error(`Single angle generation error (${angleId}):`, error);
    return null;
  }
};

export type AngleProgressCallback = (angle: AngleImage) => void;

export const generate2DAnglesProgressive = async (
  innovation: InnovationResult,
  angles: string[] = ['front', 'side', 'iso'],
  onAngleComplete: AngleProgressCallback
): Promise<void> => {
  console.log('[DEBUG] generate2DAnglesProgressive: Starting for angles:', angles);
  const promises = angles.map(async (angleId) => {
    try {
      const result = await generate2DSingleAngle(innovation, angleId);
      console.log(`[DEBUG] generate2DAnglesProgressive: Got result for ${angleId}:`, {
        hasResult: !!result,
        hasImageData: !!result?.imageData,
      });
      if (result && result.imageData) {
        const transformedData = `data:image/png;base64,${result.imageData}`;
        console.log(`[DEBUG] generate2DAnglesProgressive: Calling onAngleComplete for ${angleId}, imageData length:`, transformedData.length);
        onAngleComplete({
          ...result,
          imageData: transformedData,
        });
      } else {
        console.log(`[DEBUG] generate2DAnglesProgressive: No imageData for ${angleId}, skipping callback`);
      }
    } catch (error) {
      console.error(`Progressive generation failed for ${angleId}:`, error);
    }
  });
  
  await Promise.all(promises);
  console.log('[DEBUG] generate2DAnglesProgressive: All promises completed');
};
