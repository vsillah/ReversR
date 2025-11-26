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
  noveltyScore: number;
  viabilityScore: number;
  marketBenefit: string;
}

export interface TechnicalSpec {
  promptLogic: string;
  componentStructure: string;
  implementationNotes: string;
}

export type MeshType = 'box' | 'sphere' | 'cylinder' | 'plane';
export type MaterialType = 'standard' | 'wireframe';

export interface SceneObject {
  id: string;
  type: MeshType;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  material: MaterialType;
  args?: number[];
  name?: string;
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
  imageUrl: string | null;
  logs: string[];
}
