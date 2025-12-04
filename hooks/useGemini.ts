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

async function fetchWithRetry<T>(url: string, options: RequestInit, retries = 3): Promise<T> {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || `HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    if (retries > 0) {
      console.warn(`Request failed, retrying... (${retries} left)`);
      await wait(2000);
      return fetchWithRetry(url, options, retries - 1);
    }
    throw error;
  }
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
