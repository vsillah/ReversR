import { GoogleGenAI, Type } from "@google/genai";
import type { Schema } from "@google/genai";
import { SITPattern, AnalysisResult, InnovationResult, TechnicalSpec, ThreeDSceneDescriptor } from '../types';

declare global {
  interface Window {
    THREE: unknown;
  }
}

const getClient = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const baseURL = import.meta.env.VITE_GEMINI_BASE_URL;
  
  if (!apiKey) {
    throw new Error("Gemini API key not configured");
  }
  
  const config: { apiKey: string; httpOptions?: { baseUrl: string } } = { apiKey };
  if (baseURL) {
    config.httpOptions = { baseUrl: baseURL };
  }
  
  return new GoogleGenAI(config);
};

const SIT_SYSTEM_INSTRUCTION = `
You are 'ReversR,' an expert Product Innovation Engine using Systematic Inventive Thinking (SIT).
Your sole function is to combine Senior Full-Stack Engineering analysis with the Systematic Inventive Thinking (SIT) methodology to generate viable, novel product concepts.

## CORE CONSTRAINT: The Closed World
Do not brainstorm. You operate strictly within the **Closed World** of the user's input.
You are forbidden from adding new external components unless they are defined as a 'Neighborhood Resource' (immediately available in the environment).
`;

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

export const analyzeProduct = async (input: string, image?: string): Promise<AnalysisResult> => {
  return runWithRetry(async () => {
    const ai = getClient();
    
    const textPrompt = `
      PHASE 1: THE CLOSED WORLD SCAN
      ${image ? "Analyze the product shown in the image and the following description:" : "Analyze the following input:"} 
      "${input}"
      
      1. **Deconstruct** the product into its physical parts.
      2. **Filter** for Essential Components (parts without which the product loses its primary function).
      3. **Identify Neighborhood Resources**: List elements immediately available in the product's environment (e.g., for a boat: water, wind, solar light; for a watch: wrist, pulse, gravity).
      4. List relevant **Attributes** for the components (e.g., flexibility, transparency, heat conductivity).
      5. Define the **Closed World Boundary** strictly.
      
      Return the result in valid JSON.
    `;
    
    type ContentPart = { text: string } | { inlineData: { mimeType: string; data: string } };
    let contents: string | ContentPart[];
    
    if (image) {
        const base64Data = image.split(',')[1] || image;
        contents = [
            {
                inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64Data
                }
            },
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
              isEssential: { type: Type.BOOLEAN, description: "True if the product cannot function at all without this." }
            },
            required: ["name", "description", "isEssential"]
          }
        },
        neighborhoodResources: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "List of resources in the immediate environment (e.g. gravity, wrist, air)."
        },
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
        closedWorldBoundary: { type: Type.STRING, description: "A clear definition of what is inside vs outside the system." },
        rawAnalysis: { type: Type.STRING, description: "A brief summary paragraph of the analysis in a professional tone." }
      },
      required: ["productName", "components", "neighborhoodResources", "attributes", "closedWorldBoundary", "rawAnalysis"]
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        systemInstruction: SIT_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: schema,
        thinkingConfig: {
          thinkingBudget: 2048
        }
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
    
    const contextStr = JSON.stringify(analysis);
    const prompt = `
      PHASE 2: THE PATTERN APPLICATION
      Context: ${contextStr}
      
      Task: Apply the SIT Pattern: **${pattern}** strictly to the defined Closed World.
      
      ## The Five SIT Patterns (Rigorous Application Required):
      
      1. **Subtraction**: Identify an ESSENTIAL component (one marked isEssential: true) and remove it completely. Analyze how the resulting system is forced to adapt or generate new utility without that core part. Do NOT just remove a non-essential accessory.
      2. **Task Unification**: Identify a 'lazy' or underutilized component and assign it a new, secondary task. Utilizing a **Neighborhood Resource** (identified in Phase 1) to perform a task usually done by an internal component is highly encouraged.
      3. **Multiplication**: Copy an existing component, but deliberately change only one specific, measurable qualitative or quantitative attribute of the copy (e.g., "A second wheel, but it is smaller").
      4. **Division**: Physically or functionally split the product into non-standard parts, rearranging them in space or time.
      5. **Attribute Dependency**: Create a new correlation between two variables (attributes) that were previously independent, ensuring the change in one dictates the change in the other (e.g., "The color of the bottle changes based on the temperature of the liquid").
      
      Generate a detailed **Virtual Product Concept** that describes the new functionality, the market gap it fills, and the specific constraint that led to it.
      Calculate a simulated **Novelty Score** (0-10) and **Market Viability Score** (0-10).
      State the primary **Market Benefit** derived from the constraint.
    `;

    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        patternUsed: { type: Type.STRING }, 
        conceptName: { type: Type.STRING },
        conceptDescription: { type: Type.STRING },
        marketGap: { type: Type.STRING },
        constraint: { type: Type.STRING },
        noveltyScore: { type: Type.INTEGER },
        viabilityScore: { type: Type.INTEGER },
        marketBenefit: { type: Type.STRING }
      },
      required: ["conceptName", "conceptDescription", "marketGap", "constraint", "noveltyScore", "viabilityScore", "marketBenefit"]
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: SIT_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: schema,
        thinkingConfig: {
          thinkingBudget: 4096 
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    const result = JSON.parse(text);
    return { ...result, patternUsed: pattern };
  });
};

export const generateTechnicalSpec = async (innovation: InnovationResult): Promise<TechnicalSpec> => {
  return runWithRetry(async () => {
    const ai = getClient();
    const contextStr = JSON.stringify(innovation);
    const prompt = `
      PHASE 3: THE ARCHITECT
      Context: ${contextStr}
      
      Task: Generate a technical specification for the provided Virtual Product Concept.
      
      1. **Prompt Logic**: Define the core prompt logic needed to generate a prototype of this concept (e.g. for an LLM).
      2. **Component Structure**: Define the React/Python component structure.
      3. **Implementation Notes**: Provide specific implementation details.
      
      Return valid JSON.
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
        thinkingConfig: {
          thinkingBudget: 1024
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    return JSON.parse(text) as TechnicalSpec;
  });
};

export const generate2DImage = async (innovation: InnovationResult): Promise<string> => {
  return runWithRetry(async () => {
    const ai = getClient();
    const prompt = `
      Create a high-quality, modern product design sketch for the following concept:
      
      **Product Name:** ${innovation.conceptName}
      **Concept:** ${innovation.conceptDescription}
      **Constraint/Feature:** ${innovation.constraint}
      
      **Style:** Industrial design sketch, blueprint aesthetic, dark background, neon accents (cyberpunk/futuristic style), schematic details. High resolution, clear lines.
      
      Do not include text labels.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-05-20',
      contents: prompt,
    });

    const candidates = response.candidates;
    if (candidates && candidates[0] && candidates[0].content && candidates[0].content.parts) {
        for (const part of candidates[0].content.parts) {
            if (part.inlineData && part.inlineData.data) {
                return part.inlineData.data;
            }
        }
    }
    
    throw new Error("No image data generated.");
  });
};

export const generate3DScene = async (innovation: InnovationResult): Promise<ThreeDSceneDescriptor> => {
  return runWithRetry(async () => {
    const ai = getClient();
    const prompt = `
      You are a 3D schematic generator. Your task is to visualize a product concept using simple 3D primitives.
      Based on the following product innovation, generate a JSON object with a single property 'objects' that contains an array of 3D objects.
      Visualize the *key components and their novel interactions* described in the concept.
      Use only the following mesh types: 'box', 'sphere', 'cylinder', 'plane'.
      Each object in the array should conform to this structure:
      {
        "id": "unique_string_id",
        "type": "mesh_type_enum",
        "position": [x, y, z],
        "rotation": [x_radians, y_radians, z_radians],
        "scale": [sx, sy, sz],
        "color": "hex_string",
        "material": "material_type_enum",
        "args": [arg1, arg2, ...]
      }

      Innovation Concept:
      Name: ${innovation.conceptName}
      Description: ${innovation.conceptDescription}
      Pattern Used: ${innovation.patternUsed}
      Constraint: ${innovation.constraint}
      Market Benefit: ${innovation.marketBenefit}

      Keep the scene minimalist, abstract, and schematic. Avoid unnecessary details.
      Focus on representing the *essence* of the innovation.

      Return only a valid JSON object of type ThreeDSceneDescriptor, containing an 'objects' array.
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
        objects: {
          type: Type.ARRAY,
          items: sceneObjectSchema
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
        responseSchema: schema,
        thinkingConfig: {
          thinkingBudget: 0
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No 3D scene response from Gemini");
    return JSON.parse(text) as ThreeDSceneDescriptor;
  });
};
