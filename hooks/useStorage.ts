import AsyncStorage from '@react-native-async-storage/async-storage';
import { AnalysisResult, InnovationResult, TechnicalSpec, ThreeDSceneDescriptor, BillOfMaterials, SITPattern } from './useGemini';

const STORAGE_KEY = 'reversr_innovations';
const MAX_HISTORY = 50;

export interface SavedInnovation {
  id: string;
  createdAt: string;
  updatedAt: string;
  phase: number;
  input: string;
  analysis: AnalysisResult | null;
  selectedPattern: SITPattern | null;
  innovation: InnovationResult | null;
  spec: TechnicalSpec | null;
  threeDScene: ThreeDSceneDescriptor | null;
  imageUrl: string | null;
  bom: BillOfMaterials | null;
}

export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const getAllInnovations = async (): Promise<SavedInnovation[]> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const innovations = JSON.parse(data) as SavedInnovation[];
    return innovations.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch (error) {
    console.error('Failed to load innovations:', error);
    return [];
  }
};

export const getInnovation = async (id: string): Promise<SavedInnovation | null> => {
  try {
    const innovations = await getAllInnovations();
    return innovations.find(i => i.id === id) || null;
  } catch (error) {
    console.error('Failed to get innovation:', error);
    return null;
  }
};

export const saveInnovation = async (innovation: SavedInnovation): Promise<void> => {
  try {
    const innovations = await getAllInnovations();
    const existingIndex = innovations.findIndex(i => i.id === innovation.id);
    
    const updatedInnovation = {
      ...innovation,
      updatedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      innovations[existingIndex] = updatedInnovation;
    } else {
      innovations.unshift(updatedInnovation);
    }

    const trimmed = innovations.slice(0, MAX_HISTORY);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error('Failed to save innovation:', error);
  }
};

export const deleteInnovation = async (id: string): Promise<void> => {
  try {
    const innovations = await getAllInnovations();
    const filtered = innovations.filter(i => i.id !== id);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to delete innovation:', error);
  }
};

export const clearAllInnovations = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear innovations:', error);
  }
};

export const createNewInnovation = (input: string = ''): SavedInnovation => {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    phase: 1,
    input,
    analysis: null,
    selectedPattern: null,
    innovation: null,
    spec: null,
    threeDScene: null,
    imageUrl: null,
    bom: null,
  };
};
