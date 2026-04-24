export enum SITPattern {
  SUBTRACTION = 'Subtraction',
  TASK_UNIFICATION = 'Task Unification',
  MULTIPLICATION = 'Multiplication',
  DIVISION = 'Division',
  ATTRIBUTE_DEPENDENCY = 'Attribute Dependency'
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

export interface InnovationResult {
  patternUsed: SITPattern;
  conceptName: string;
  conceptDescription: string;
  marketGap: string;
  constraint: string;
  noveltyScore: number; // 0-10
  viabilityScore: number; // 0-10
  marketBenefit: string;
}

export interface TechnicalSpec {
  promptLogic: string;
  componentStructure: string;
  implementationNotes: string;
}

// --- 3D Scene Types ---
export type MeshType = 'box' | 'sphere' | 'cylinder' | 'plane';
export type MaterialType = 'standard' | 'wireframe';

export interface SceneObject {
  id: string;
  type: MeshType;
  position: [number, number, number]; // [x, y, z]
  rotation: [number, number, number]; // [x_rad, y_rad, z_rad]
  scale: [number, number, number]; // [sx, sy, sz]
  color: string; // Hex color string, e.g., "#00ff9d"
  material: MaterialType;
  args?: number[]; // For specific mesh geometries: [width, height, depth] for box, [radius] for sphere, [radiusTop, radiusBottom, height] for cylinder, [width, height] for plane
  name?: string; // Optional name for the object
}

export interface ThreeDSceneDescriptor {
  objects: SceneObject[];
}

export interface MutationContext {
  phase: 1 | 2 | 3;
  input: string;
  analysis: AnalysisResult | null;
  selectedPattern: SITPattern | null;
  innovation: InnovationResult | null;
  spec: TechnicalSpec | null;
  threeDScene: ThreeDSceneDescriptor | null;
  imageUrl: string | null; // Added for 2D sketch
  logs: string[]; // For Context.md simulation
}