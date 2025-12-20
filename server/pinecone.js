const { Pinecone } = require('@pinecone-database/pinecone');

// ============================================
// PINECONE CLIENT INITIALIZATION
// ============================================

let pineconeClient = null;
let pineconeIndex = null;

/**
 * Initialize Pinecone client
 * Set these environment variables:
 * - PINECONE_API_KEY: Your Pinecone API key
 * - PINECONE_INDEX_NAME: Your index name (default: 'reversr-innovations')
 * - PINECONE_ENVIRONMENT: Your Pinecone environment (optional, auto-detected)
 */
const initializePinecone = async () => {
  if (pineconeClient) {
    return { client: pineconeClient, index: pineconeIndex };
  }

  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX_NAME || 'reversr-innovations';

  if (!apiKey) {
    console.warn('⚠️  PINECONE_API_KEY not set. Pinecone features disabled.');
    return { client: null, index: null };
  }

  try {
    console.log('🔌 Initializing Pinecone...');
    
    pineconeClient = new Pinecone({
      apiKey: apiKey,
    });

    // Get or create index
    const indexList = await pineconeClient.listIndexes();
    const indexExists = indexList.indexes?.some(idx => idx.name === indexName);

    if (!indexExists) {
      console.log(`📊 Creating Pinecone index: ${indexName}`);
      await pineconeClient.createIndex({
        name: indexName,
        dimension: 768, // Gemini text-embedding-004 dimension
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1'
          }
        }
      });
      
      // Wait for index to be ready
      console.log('⏳ Waiting for index to be ready...');
      await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 60s for serverless index
    }

    pineconeIndex = pineconeClient.index(indexName);
    console.log(`✅ Pinecone connected to index: ${indexName}`);
    
    return { client: pineconeClient, index: pineconeIndex };
  } catch (error) {
    console.error('❌ Pinecone initialization error:', error.message);
    return { client: null, index: null };
  }
};

// ============================================
// EMBEDDING GENERATION WITH GEMINI
// ============================================

/**
 * Generate embedding using Gemini API
 * @param {string} text - Text to embed
 * @param {object} geminiClient - Initialized Gemini client
 * @returns {Promise<number[]>} Embedding vector
 */
const generateEmbedding = async (text, geminiClient) => {
  try {
    const response = await geminiClient.models.embedContent({
      model: 'text-embedding-004',
      content: text,
    });

    return response.embedding?.values || [];
  } catch (error) {
    console.error('Embedding generation error:', error.message);
    throw error;
  }
};

// ============================================
// VECTOR OPERATIONS
// ============================================

/**
 * Store an innovation in Pinecone
 * @param {object} innovation - Innovation data
 * @param {object} geminiClient - Gemini client for embedding generation
 * @returns {Promise<boolean>} Success status
 */
const storeInnovation = async (innovation, geminiClient) => {
  try {
    const { index } = await initializePinecone();
    if (!index) {
      console.warn('Pinecone not available, skipping storage');
      return false;
    }

    // Create text representation for embedding
    const textForEmbedding = `
      Product: ${innovation.conceptName}
      Description: ${innovation.conceptDescription}
      Pattern: ${innovation.patternUsed}
      Market Gap: ${innovation.marketGap}
      Market Benefit: ${innovation.marketBenefit}
    `.trim();

    // Generate embedding
    const embedding = await generateEmbedding(textForEmbedding, geminiClient);

    if (embedding.length === 0) {
      throw new Error('Failed to generate embedding');
    }

    // Store in Pinecone
    await index.upsert([
      {
        id: innovation.id || `innovation-${Date.now()}`,
        values: embedding,
        metadata: {
          conceptName: innovation.conceptName,
          conceptDescription: innovation.conceptDescription.substring(0, 500), // Limit metadata size
          patternUsed: innovation.patternUsed,
          marketGap: innovation.marketGap?.substring(0, 300) || '',
          marketBenefit: innovation.marketBenefit?.substring(0, 300) || '',
          noveltyScore: innovation.noveltyScore || 0,
          viabilityScore: innovation.viabilityScore || 0,
          createdAt: new Date().toISOString(),
        },
      },
    ]);

    console.log(`✅ Stored innovation in Pinecone: ${innovation.conceptName}`);
    return true;
  } catch (error) {
    console.error('Error storing innovation in Pinecone:', error.message);
    return false;
  }
};

/**
 * Search for similar innovations
 * @param {string} query - Search query
 * @param {object} geminiClient - Gemini client for embedding generation
 * @param {number} topK - Number of results to return
 * @returns {Promise<Array>} Similar innovations
 */
const searchSimilarInnovations = async (query, geminiClient, topK = 5) => {
  try {
    const { index } = await initializePinecone();
    if (!index) {
      console.warn('Pinecone not available, returning empty results');
      return [];
    }

    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query, geminiClient);

    if (queryEmbedding.length === 0) {
      throw new Error('Failed to generate query embedding');
    }

    // Search Pinecone
    const results = await index.query({
      vector: queryEmbedding,
      topK: topK,
      includeMetadata: true,
    });

    return results.matches?.map(match => ({
      id: match.id,
      score: match.score,
      ...match.metadata,
    })) || [];
  } catch (error) {
    console.error('Error searching Pinecone:', error.message);
    return [];
  }
};

/**
 * Get innovation context for RAG (Retrieval-Augmented Generation)
 * @param {string} query - User query or product description
 * @param {object} geminiClient - Gemini client
 * @param {number} topK - Number of similar innovations to retrieve
 * @returns {Promise<string>} Context string to add to prompts
 */
const getInnovationContext = async (query, geminiClient, topK = 3) => {
  try {
    const similarInnovations = await searchSimilarInnovations(query, geminiClient, topK);
    
    if (similarInnovations.length === 0) {
      return '';
    }

    const contextParts = similarInnovations.map((item, idx) => 
      `[Similar Innovation ${idx + 1}] ${item.conceptName}: ${item.conceptDescription} (Pattern: ${item.patternUsed}, Relevance: ${(item.score * 100).toFixed(1)}%)`
    );

    return `\n\nRELEVANT PAST INNOVATIONS:\n${contextParts.join('\n')}\n`;
  } catch (error) {
    console.error('Error getting innovation context:', error.message);
    return '';
  }
};

/**
 * Delete an innovation from Pinecone
 * @param {string} innovationId - Innovation ID to delete
 * @returns {Promise<boolean>} Success status
 */
const deleteInnovation = async (innovationId) => {
  try {
    const { index } = await initializePinecone();
    if (!index) {
      return false;
    }

    await index.deleteOne(innovationId);
    console.log(`🗑️  Deleted innovation from Pinecone: ${innovationId}`);
    return true;
  } catch (error) {
    console.error('Error deleting from Pinecone:', error.message);
    return false;
  }
};

/**
 * Get index statistics
 * @returns {Promise<object>} Index stats
 */
const getIndexStats = async () => {
  try {
    const { index } = await initializePinecone();
    if (!index) {
      return null;
    }

    const stats = await index.describeIndexStats();
    return stats;
  } catch (error) {
    console.error('Error getting index stats:', error.message);
    return null;
  }
};

module.exports = {
  initializePinecone,
  generateEmbedding,
  storeInnovation,
  searchSimilarInnovations,
  getInnovationContext,
  deleteInnovation,
  getIndexStats,
};
