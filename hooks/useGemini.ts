const API_BASE = 'https://2551a9e3-8c5f-401c-a96a-6b1ada09713c-00-2aorbt41g8007.janeway.replit.dev';

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

export enum SITPattern {
  SUBTRACTION = 'Subtraction',
  TASK_UNIFICATION = 'Task Unification',
  MULTIPLICATION = 'Multiplication',
  DIVISION = 'Division',
  ATTRIBUTE_DEPENDENCY = 'Attribute Dependency',
}

export interface InnovationResult {
  patternUsed: SITPattern;
  conceptName: string;
  conceptDescription: string;
  constraint: string;
  marketBenefit: string;
}

export interface TechnicalSpec {
  promptLogic: string;
  componentStructure: string;
  implementationNotes: string;
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
  return fetchWithRetry(`${API_BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, imageBase64 })
  });
};

export const applySITPattern = async (analysis: AnalysisResult, pattern: SITPattern): Promise<InnovationResult> => {
  return fetchWithRetry(`${API_BASE}/api/apply-pattern`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ analysis, pattern })
  });
};

export const generateTechnicalSpec = async (innovation: InnovationResult): Promise<TechnicalSpec> => {
  return fetchWithRetry(`${API_BASE}/api/generate-spec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ innovation })
  });
};

export const generate3DScene = async (innovation: InnovationResult): Promise<ThreeDSceneDescriptor> => {
  return fetchWithRetry(`${API_BASE}/api/generate-3d`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ innovation })
  });
};

export const generate2DImage = async (innovation: InnovationResult): Promise<string> => {
  const response = await fetchWithRetry<{ imageBase64: string }>(`${API_BASE}/api/generate-2d`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ innovation })
  });
  return response.imageBase64;
};
