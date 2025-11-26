const express = require('express');
const cors = require('cors');
const { GoogleGenAI, Type, Modality } = require('@google/genai');

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));

const getClient = () => {
  return new GoogleGenAI({
    apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
    httpOptions: {
      apiVersion: "",
      baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
    },
  });
};

const SIT_SYSTEM_INSTRUCTION = `You are an expert in Systematic Inventive Thinking (SIT), a structured methodology for innovation. You strictly adhere to the "Closed World" principle: all solutions must derive from components already within or immediately adjacent to the product's defined system boundary. You are precise, analytical, and creative within constraints.`;

app.post('/api/analyze', async (req, res) => {
  try {
    const { input, imageBase64 } = req.body;
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
    res.json(JSON.parse(text));
  } catch (error) {
    console.error('Analyze error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/apply-pattern', async (req, res) => {
  try {
    const { analysis, pattern } = req.body;
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

    const schema = {
      type: Type.OBJECT,
      properties: {
        patternUsed: { type: Type.STRING },
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
        responseSchema: schema
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    res.json(JSON.parse(text));
  } catch (error) {
    console.error('Apply pattern error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-spec', async (req, res) => {
  try {
    const { innovation } = req.body;
    const ai = getClient();
    
    const prompt = `
      PHASE 3: THE ARCHITECT - Generate technical specifications.
      
      Innovation: ${innovation.conceptName}
      Description: ${innovation.conceptDescription}
      Pattern: ${innovation.patternUsed}
      
      Create: promptLogic (reasoning chain), componentStructure (how parts interact), implementationNotes (key considerations).
    `;

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
    res.json(JSON.parse(text));
  } catch (error) {
    console.error('Generate spec error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-3d', async (req, res) => {
  try {
    const { innovation } = req.body;
    const ai = getClient();
    
    const prompt = `
      Generate a 3D schematic for: ${innovation.conceptName}
      Description: ${innovation.conceptDescription}
      
      Create simple 3D objects using only: box, sphere, cylinder, plane.
      Each object needs: id, type, position [x,y,z], rotation [rx,ry,rz], scale [sx,sy,sz], color (hex), material (standard/wireframe).
      Keep it minimal and abstract.
    `;

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
    res.json(JSON.parse(text));
  } catch (error) {
    console.error('Generate 3D error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-2d', async (req, res) => {
  try {
    const { innovation } = req.body;
    const ai = getClient();
    
    const prompt = `Create a detailed technical sketch/blueprint illustration of: ${innovation.conceptName}
    
Description: ${innovation.conceptDescription}
Innovation Pattern: ${innovation.patternUsed}
Market Benefit: ${innovation.marketBenefit}

Generate a clean, professional product concept sketch with:
- Clear line drawings showing the product from multiple angles
- Labels pointing to key innovative features
- Technical/blueprint aesthetic with a modern feel
- Annotations explaining how the innovation works`;

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

    res.json({ imageBase64: imagePart.inlineData.data });
  } catch (error) {
    console.error('Generate 2D error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API server running on port ${PORT}`);
});
