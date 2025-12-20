import { Platform } from 'react-native';
import { InnovationResult } from './useGemini';

const API_BASE = Platform.OS === 'web' 
  ? (window.location.origin.includes('localhost') ? 'http://localhost:3001' : 'https://reversr-vsillah.replit.app')
  : 'https://reversr-vsillah.replit.app';

export interface SimilarInnovation {
  id: string;
  score: number;
  conceptName: string;
  conceptDescription: string;
  patternUsed: string;
  marketGap: string;
  marketBenefit: string;
  noveltyScore: number;
  viabilityScore: number;
  createdAt: string;
}

export interface PineconeStats {
  totalRecordCount: number;
  dimension: number;
}

/**
 * Store an innovation in Pinecone vector database
 * @param innovation - The innovation to store
 * @returns Promise<boolean> - Success status
 */
export const saveInnovationToPinecone = async (
  innovation: InnovationResult & { id?: string }
): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE}/api/pinecone/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ innovation })
    });
    
    if (!response.ok) {
      console.error('Failed to save to Pinecone:', response.statusText);
      return false;
    }
    
    const result = await response.json();
    console.log('✅ Innovation saved to Pinecone:', innovation.conceptName);
    return result.success;
  } catch (error) {
    console.error('Error saving to Pinecone:', error);
    return false;
  }
};

/**
 * Search for similar innovations in Pinecone
 * @param query - Search query (product description or innovation concept)
 * @param topK - Number of results to return (default: 5)
 * @returns Promise<SimilarInnovation[]> - Array of similar innovations
 */
export const findSimilarInnovations = async (
  query: string,
  topK: number = 5
): Promise<SimilarInnovation[]> => {
  try {
    const response = await fetch(`${API_BASE}/api/pinecone/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, topK })
    });
    
    if (!response.ok) {
      console.error('Search failed:', response.statusText);
      return [];
    }
    
    const result = await response.json();
    return result.results || [];
  } catch (error) {
    console.error('Error searching Pinecone:', error);
    return [];
  }
};

/**
 * Delete an innovation from Pinecone
 * @param innovationId - ID of the innovation to delete
 * @returns Promise<boolean> - Success status
 */
export const deleteInnovationFromPinecone = async (
  innovationId: string
): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE}/api/pinecone/delete/${innovationId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      console.error('Delete failed:', response.statusText);
      return false;
    }
    
    const result = await response.json();
    return result.success;
  } catch (error) {
    console.error('Error deleting from Pinecone:', error);
    return false;
  }
};

/**
 * Get Pinecone index statistics
 * @returns Promise<PineconeStats | null> - Index statistics or null if unavailable
 */
export const getPineconeStats = async (): Promise<PineconeStats | null> => {
  try {
    const response = await fetch(`${API_BASE}/api/pinecone/stats`);
    
    if (!response.ok) {
      return null;
    }
    
    const result = await response.json();
    return result.stats;
  } catch (error) {
    console.error('Error getting Pinecone stats:', error);
    return null;
  }
};

/**
 * Check Pinecone connection status
 * @returns Promise<{ connected: boolean; stats?: PineconeStats }> - Connection status
 */
export const checkPineconeStatus = async (): Promise<{
  connected: boolean;
  stats?: PineconeStats;
}> => {
  try {
    const response = await fetch(`${API_BASE}/health`);
    
    if (!response.ok) {
      return { connected: false };
    }
    
    const result = await response.json();
    
    return {
      connected: result.pinecone?.status === 'connected',
      stats: result.pinecone?.stats,
    };
  } catch (error) {
    console.error('Error checking Pinecone status:', error);
    return { connected: false };
  }
};

/**
 * Custom hook for Pinecone operations
 */
export const usePinecone = () => {
  return {
    saveInnovation: saveInnovationToPinecone,
    findSimilar: findSimilarInnovations,
    deleteInnovation: deleteInnovationFromPinecone,
    getStats: getPineconeStats,
    checkStatus: checkPineconeStatus,
  };
};
