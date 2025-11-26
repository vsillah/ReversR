import { GoogleGenAI, Type, Schema } from '@google/genai';
import Constants from 'expo-constants';

const getClient = () => {
  const apiKey = Constants.expoConfig?.extra?.geminiApiKey || 
                 process.env.EXPO_PUBLIC_GEMINI_API_KEY ||
                 process.env.AI_INTEGRATIONS_GEMINI_API_KEY || '';
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || undefined;
  
  return new GoogleGenAI({ apiKey, httpOptions: baseUrl ? { baseUrl } : undefined });
};

const SIT_SYSTEM_INSTRUCTION = `You are an expert in Systematic Inventive Thinking (SIT), a structured methodology for innovation. You strictly adhere to the "Closed World" principle: all solutions must derive from components already within or immediately adjacent to the product's defined system boundary. You are precise, analytical, and creative within constraints.`;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runWithRetry<T>(fn: () => Promise<T>, retries = 5, delay = 4000): Promise<T> {
  try {
    return await fn();
  } catch (error: unknown) {
    const errString = JSON.stringify(error, Object.getOwnPropertyNames(error as object));
    const errorObj = error as { status?: number; code?: number };
    const isRateLimit = 
        errString.includes('429') || 
        errString.includes('RESOURCE_EXHAUSTED') || 
        errString.includes('quota') ||
        errorObj?.status === 429 ||
        errorObj?.code === 429;

    if (retries > 0 && isRateLimit) {
      console.warn(`Quota/Rate limit hit. Retrying in ${delay}ms... (${retries} retries left)`);
      await wait(delay);
      return runWithRetry(fn, retries - 1, delay * 1.5);
    }
    throw error;
  }
}

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

export const analyzeProduct = async (input: string, imageBase64?: string): Promise<AnalysisResult> => {
  return runWithRetry(async () => {
    const ai = getClient();
    
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
    
    type ContentPart = { text: string } | { inlineData: { mimeType: string; data: string } };
    let contents: string | ContentPart[];
    
    if (imageBase64) {
        const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
        contents = [
            { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
            { text: textPrompt }
        ];
    } else {
        contents = textPrompt;
    }

    const schema: Schema = {
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
        responseSchema: schema,
        thinkingConfig: { thinkingBudget: 0 }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    return JSON.parse(text) as AnalysisResult;
  });
};

export const applySITPattern = async (analysis: AnalysisResult, pattern: SITPattern): Promise<InnovationResult> => {
  return runWithRetry(async () => {
    const ai = getClient();
    const prompt = `
      PHASE 2: PATTERN APPLICATION (${pattern})
      Apply the "${pattern}" SIT pattern to generate an innovative product concept.
      
      Product: ${analysis.productName}
      Components: ${JSON.stringify(analysis.components)}
      Neighborhood Resources: ${JSON.stringify(analysis.neighborhoodResources)}
      Closed World: ${analysis.closedWorldBoundary}
      
      Generate ONE innovative concept. Return JSON with: patternUsed, conceptName, conceptDescription, constraint, marketBenefit.
    `;

    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        patternUsed: { type: Type.STRING, enum: Object.values(SITPattern) },
        conceptName: { type: Type.STRING },
        conceptDescription: { type: Type.STRING },
        constraint: { type: Type.STRING },
        marketBenefit: { type: Type.STRING }
      },
      required: ["patternUsed", "conceptName", "conceptDescription", "constraint", "marketBenefit"]
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: SIT_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: schema,
        thinkingConfig: { thinkingBudget: 0 }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    return JSON.parse(text) as InnovationResult;
  });
};

export const generateTechnicalSpec = async (innovation: InnovationResult): Promise<TechnicalSpec> => {
  return runWithRetry(async () => {
    const ai = getClient();
    const prompt = `
      PHASE 3: THE ARCHITECT - Generate technical specifications.
      
      Innovation: ${innovation.conceptName}
      Description: ${innovation.conceptDescription}
      Pattern: ${innovation.patternUsed}
      
      Create: promptLogic (reasoning chain), componentStructure (how parts interact), implementationNotes (key considerations).
    `;

    const schema: Schema = {
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
        responseSchema: schema,
        thinkingConfig: { thinkingBudget: 0 }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    return JSON.parse(text) as TechnicalSpec;
  });
};

export const generate3DScene = async (innovation: InnovationResult): Promise<ThreeDSceneDescriptor> => {
  return runWithRetry(async () => {
    const ai = getClient();
    const prompt = `
      Generate a 3D schematic for: ${innovation.conceptName}
      Description: ${innovation.conceptDescription}
      
      Create simple 3D objects using only: box, sphere, cylinder, plane.
      Each object needs: id, type, position [x,y,z], rotation [rx,ry,rz], scale [sx,sy,sz], color (hex), material (standard/wireframe).
      Keep it minimal and abstract.
    `;

    const sceneObjectSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        type: { type: Type.STRING, enum: ['box', 'sphere', 'cylinder', 'plane'] },
        position: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        rotation: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        scale: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        color: { type: Type.STRING },
        material: { type: Type.STRING, enum: ['standard', 'wireframe'] },
        args: { type: Type.ARRAY, items: { type: Type.NUMBER } },
        name: { type: Type.STRING }
      },
      required: ["id", "type", "position", "rotation", "scale", "color", "material"]
    };

    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        objects: { type: Type.ARRAY, items: sceneObjectSchema }
      },
      required: ["objects"]
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: SIT_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: schema,
        thinkingConfig: { thinkingBudget: 0 }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No 3D scene response from Gemini");
    return JSON.parse(text) as ThreeDSceneDescriptor;
  });
};

export const generate2DImage = async (innovation: InnovationResult): Promise<string> => {
  return runWithRetry(async () => {
    const ai = getClient();
    const prompt = `Generate a minimalist, technical concept sketch of: "${innovation.conceptName}". 
    Description: ${innovation.conceptDescription}. 
    Style: Clean, industrial design sketch with thin lines on white background. Show the key innovation clearly.`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-05-20',
      contents: prompt,
      config: {
        responseModalities: ['image', 'text'],
        thinkingConfig: { thinkingBudget: 0 }
      }
    });

    const parts = response.candidates?.[0]?.content?.parts;
    if (parts) {
      for (const part of parts) {
        const p = part as { inlineData?: { data: string } };
        if (p.inlineData?.data) {
          return p.inlineData.data;
        }
      }
    }
    throw new Error("No image generated");
  });
};
