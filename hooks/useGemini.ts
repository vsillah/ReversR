import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const configuredApiBase = process.env.EXPO_PUBLIC_API_BASE_URL || Constants.expoConfig?.extra?.apiBaseUrl;
const API_BASE = Platform.OS === 'web' && window.location.origin.includes('localhost')
  ? 'http://localhost:3001'
  : configuredApiBase || 'https://reversr-rebuild-api.example.com';

export const getApiBase = () => API_BASE;

export const getAiConfig = async () => {
  try {
    const provider = await AsyncStorage.getItem('ai_provider') || 'gemini';
    const ollamaModel = await AsyncStorage.getItem('ollama_model') || 'qwen3.5:0.8b';
    return { provider, ollamaModel };
  } catch (e) {
    return { provider: 'gemini', ollamaModel: 'qwen3.5:0.8b' };
  }
};

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

export type MachineWorkflowKey = 'inventory_match';

export const MACHINE_WORKFLOW_LABELS: Record<MachineWorkflowKey, string> = {
  'inventory_match': 'Inventory Match',
};

export const MACHINE_WORKFLOWS: MachineWorkflowKey[] = [
  'inventory_match',
];

export interface InventoryConnector {
  sourceName: string;
  sourceUrl: string;
  connectorType: 'demo' | 'csv' | 'api' | 'erp';
  authMode: 'none' | 'api_key' | 'oauth' | 'private_network';
  credentialRef?: string;
  notes?: string;
}

export interface InventoryValidationResult {
  status: 'ok' | 'error';
  sourceName: string;
  sourceUrl: string;
  authMode?: InventoryConnector['authMode'];
  credentialStatus?: 'not_required' | 'configured' | 'missing' | 'disabled';
  recordCount: number;
  requiredFields: string[];
  sampleMachines: Array<{
    machineId: string;
    machineName: string;
    revision?: string;
    partCount: number;
  }>;
  error?: string;
}

export interface AdminCredentialSummary {
  credentialRef: string;
  authModes: string[];
  headerNames: string[];
  hasSecret: boolean;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminCredentialListResponse {
  status: 'ok';
  registryEnabled: boolean;
  credentials: AdminCredentialSummary[];
}

export interface AssemblyStep {
  stepNumber: number;
  title: string;
  instructions: string;
  parts: string[];
  estimatedTime: string;
  qualityCheck: string;
}

export interface PricingSnapshot {
  partsSubtotal: string;
  modelingEstimate: string;
  fabricationEstimate: string;
  assemblyLaborEstimate: string;
  totalEstimate: string;
  confidence: 'low' | 'medium' | 'high';
}

export interface FulfillmentOption {
  vendorName: string;
  serviceType: string;
  url: string;
  packageRequired: string[];
}

export interface InnovationResult {
  patternUsed: MachineWorkflowKey;
  conceptName: string;
  conceptDescription: string;
  marketGap: string;
  constraint: string;
  noveltyScore: number;
  viabilityScore: number;
  marketBenefit: string;
  machineId?: string;
  machineName?: string;
  inventorySource?: string;
  confidenceScore?: number;
  evidence?: string;
  assemblySteps?: AssemblyStep[];
  pricing?: PricingSnapshot;
  fulfillmentOptions?: FulfillmentOption[];
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
  const config = await getAiConfig();
  return fetchWithRetry(`${API_BASE}/api/gemini/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, image: imageBase64, ...config })
  });
};

export const identifyMachineFromInventory = async (
  analysis: AnalysisResult, 
  connector: InventoryConnector,
  capturedImage?: string | null
): Promise<InnovationResult> => {
  const config = await getAiConfig();
  return fetchWithRetry(`${API_BASE}/api/gemini/match-machine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      analysis, 
      connector,
      image: capturedImage,
      ...config
    })
  });
};

export const validateInventoryConnector = async (
  connector: InventoryConnector
): Promise<InventoryValidationResult> => {
  return fetchWithRetry(`${API_BASE}/api/inventory/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connector })
  });
};

const adminHeaders = (adminToken: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${adminToken}`,
});

export const listInventoryCredentials = async (
  adminToken: string
): Promise<AdminCredentialListResponse> => {
  return fetchWithRetry(`${API_BASE}/api/admin/inventory/credentials`, {
    method: 'GET',
    headers: adminHeaders(adminToken),
  });
};

export const saveInventoryCredential = async (
  adminToken: string,
  payload: {
    credentialRef: string;
    headerName?: string;
    value?: string;
    accessToken?: string;
    scheme?: string;
  }
): Promise<{ status: 'ok'; credential: AdminCredentialSummary }> => {
  return fetchWithRetry(`${API_BASE}/api/admin/inventory/credentials`, {
    method: 'POST',
    headers: adminHeaders(adminToken),
    body: JSON.stringify(payload),
  });
};

export const deleteInventoryCredential = async (
  adminToken: string,
  credentialRef: string
): Promise<{ status: 'ok'; credentialRef: string; deleted: boolean }> => {
  return fetchWithRetry(`${API_BASE}/api/admin/inventory/credentials/${encodeURIComponent(credentialRef)}`, {
    method: 'DELETE',
    headers: adminHeaders(adminToken),
  });
};

export const generateTechnicalSpec = async (innovation: InnovationResult): Promise<TechnicalSpec> => {
  const config = await getAiConfig();
  return fetchWithRetry(`${API_BASE}/api/gemini/technical-spec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ innovation, ...config })
  });
};

export const generate3DScene = async (innovation: InnovationResult): Promise<ThreeDSceneDescriptor> => {
  const config = await getAiConfig();
  return fetchWithRetry(`${API_BASE}/api/gemini/generate-3d`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ innovation, ...config })
  });
};

export const generate2DImage = async (innovation: InnovationResult): Promise<string> => {
  const config = await getAiConfig();
  const response = await fetchWithRetry<{ imageData: string }>(`${API_BASE}/api/gemini/generate-2d`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ innovation, ...config })
  });
  return response.imageData;
};

export const generateBOM = async (innovation: InnovationResult, analysis?: AnalysisResult): Promise<BillOfMaterials> => {
  const config = await getAiConfig();
  return fetchWithRetry(`${API_BASE}/api/gemini/generate-bom`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ innovation, analysis, ...config })
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
      const config = await getAiConfig();
      const response = await fetchWithRetry<{ imageData: string }>(`${API_BASE}/api/gemini/generate-2d`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          innovation: {
            conceptName,
            conceptDescription,
          },
          ...config
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
      const config = await getAiConfig();
      const response = await fetchWithRetry<{ images: AngleImage[] }>(`${API_BASE}/api/gemini/generate-2d-angles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ innovation, angles, ...config })
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
    const config = await getAiConfig();
    const response = await fetchWithRetry<{ images: AngleImage[] }>(`${API_BASE}/api/gemini/generate-2d-angles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ innovation, angles, ...config })
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
    const config = await getAiConfig();
    const response = await fetchWithRetry<AngleImage>(`${API_BASE}/api/gemini/generate-2d-single-angle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ innovation, angleId, ...config })
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
        imageDataLength: result?.imageData?.length || 0,
      });
      
      if (result && result.imageData) {
        const dataUrl = `data:image/png;base64,${result.imageData}`;
        console.log(`[DEBUG] generate2DAnglesProgressive: Created data URL for ${angleId}, length:`, dataUrl.length);
        onAngleComplete({
          ...result,
          imageData: dataUrl,
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
