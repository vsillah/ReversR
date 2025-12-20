# Pinecone Integration Guide

This guide explains how to integrate Pinecone vector database with your REVERSR application for semantic search and retrieval-augmented generation (RAG).

## 🎯 What is Pinecone?

Pinecone is a vector database that enables:
- **Semantic Search**: Find similar innovations based on meaning, not just keywords
- **RAG (Retrieval-Augmented Generation)**: Enhance AI responses with relevant past data
- **Knowledge Base**: Build a searchable history of innovations
- **Similarity Matching**: Discover patterns across products and innovations

## 📋 Prerequisites

1. **Pinecone Account**: Sign up at [https://www.pinecone.io/](https://www.pinecone.io/)
2. **API Key**: Get your API key from the Pinecone dashboard
3. **Node.js**: Already installed in your project

## 🚀 Setup Instructions

### Step 1: Get Your Pinecone API Key

1. Go to [https://app.pinecone.io/](https://app.pinecone.io/)
2. Sign up or log in
3. Navigate to **API Keys** in the left sidebar
4. Copy your API key

### Step 2: Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Add your Pinecone credentials to `.env`:
   ```env
   PINECONE_API_KEY=your_actual_api_key_here
   PINECONE_INDEX_NAME=reversr-innovations
   ```

### Step 3: Start the Server

The Pinecone index will be automatically created on first startup:

```bash
npm run api
```

You should see:
```
🔌 Initializing Pinecone...
📊 Creating Pinecone index: reversr-innovations
✅ Pinecone connected to index: reversr-innovations
API server running on port 5000
```

## 🔌 API Endpoints

### 1. Store Innovation
**POST** `/api/pinecone/store`

Store an innovation in Pinecone for future semantic search.

```javascript
fetch('http://localhost:5000/api/pinecone/store', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    innovation: {
      id: 'innovation-123',
      conceptName: 'Self-Cleaning Water Bottle',
      conceptDescription: 'A water bottle that uses UV-C light...',
      patternUsed: 'task_unification',
      marketGap: 'Need for cleaner reusable bottles',
      marketBenefit: 'Reduces bacterial growth',
      noveltyScore: 8,
      viabilityScore: 7
    }
  })
})
```

**Response:**
```json
{
  "success": true,
  "message": "Innovation stored in Pinecone"
}
```

### 2. Search Similar Innovations
**POST** `/api/pinecone/search`

Find similar innovations based on semantic similarity.

```javascript
fetch('http://localhost:5000/api/pinecone/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'smart kitchen appliance with cleaning features',
    topK: 5  // Number of results
  })
})
```

**Response:**
```json
{
  "results": [
    {
      "id": "innovation-123",
      "score": 0.87,
      "conceptName": "Self-Cleaning Water Bottle",
      "conceptDescription": "A water bottle that uses...",
      "patternUsed": "task_unification",
      "noveltyScore": 8,
      "viabilityScore": 7
    }
  ]
}
```

### 3. Enhanced Analysis with Context (RAG)
**POST** `/api/gemini/analyze-with-context`

Analyze a product with context from similar past innovations.

```javascript
fetch('http://localhost:5000/api/gemini/analyze-with-context', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    input: 'A coffee mug that keeps drinks warm',
    useContext: true  // Enable RAG
  })
})
```

### 4. Delete Innovation
**DELETE** `/api/pinecone/delete/:id`

Remove an innovation from Pinecone.

```javascript
fetch('http://localhost:5000/api/pinecone/delete/innovation-123', {
  method: 'DELETE'
})
```

### 5. Get Index Statistics
**GET** `/api/pinecone/stats`

View Pinecone index statistics.

```javascript
fetch('http://localhost:5000/api/pinecone/stats')
```

**Response:**
```json
{
  "stats": {
    "totalRecordCount": 42,
    "dimension": 768
  }
}
```

### 6. Health Check
**GET** `/health`

Check if Pinecone is connected.

```javascript
fetch('http://localhost:5000/health')
```

**Response:**
```json
{
  "status": "ok",
  "pinecone": {
    "status": "connected",
    "stats": {
      "totalVectorCount": 42,
      "dimension": 768
    }
  }
}
```

## 💡 Usage Examples

### Example 1: Auto-Save Innovations to Pinecone

Add this to your React Native app after saving an innovation:

```typescript
// In hooks/useGemini.ts or a new hooks/usePinecone.ts
export const saveInnovationToPinecone = async (innovation: InnovationResult) => {
  try {
    const response = await fetch(`${API_BASE}/api/pinecone/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ innovation })
    });
    
    const result = await response.json();
    return result.success;
  } catch (error) {
    console.error('Failed to save to Pinecone:', error);
    return false;
  }
};
```

### Example 2: Find Similar Past Innovations

Create a "Similar Innovations" feature:

```typescript
export const findSimilarInnovations = async (query: string, topK = 5) => {
  try {
    const response = await fetch(`${API_BASE}/api/pinecone/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, topK })
    });
    
    const result = await response.json();
    return result.results;
  } catch (error) {
    console.error('Search failed:', error);
    return [];
  }
};
```

### Example 3: Enhanced Analysis with Context

Use RAG to provide better analysis:

```typescript
// Modify analyzeProduct to use context
export const analyzeProductWithContext = async (
  input: string, 
  imageBase64?: string
): Promise<AnalysisResult> => {
  return fetchWithRetry(`${API_BASE}/api/gemini/analyze-with-context`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, image: imageBase64, useContext: true })
  });
};
```

## 🎨 Frontend Integration

### Add a "Similar Innovations" Component

```typescript
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList } from 'react-native';
import { findSimilarInnovations } from '../hooks/usePinecone';

export const SimilarInnovations = ({ currentInnovation }) => {
  const [similar, setSimilar] = useState([]);
  
  useEffect(() => {
    const loadSimilar = async () => {
      const query = `${currentInnovation.conceptName} ${currentInnovation.conceptDescription}`;
      const results = await findSimilarInnovations(query, 3);
      setSimilar(results);
    };
    
    loadSimilar();
  }, [currentInnovation]);
  
  return (
    <View>
      <Text style={styles.title}>Similar Innovations</Text>
      <FlatList
        data={similar}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.name}>{item.conceptName}</Text>
            <Text style={styles.score}>
              {(item.score * 100).toFixed(0)}% match
            </Text>
          </View>
        )}
      />
    </View>
  );
};
```

## 🔧 Troubleshooting

### Issue: "Pinecone not available"
**Solution**: Check your `.env` file has `PINECONE_API_KEY` set correctly.

### Issue: Index creation timeout
**Solution**: Serverless indexes take ~60 seconds to initialize. Wait and restart the server.

### Issue: "Failed to generate embedding"
**Solution**: Ensure your Gemini API key is valid and has access to the embedding model.

### Issue: No search results
**Solution**: 
1. Check if innovations are stored: `GET /api/pinecone/stats`
2. Verify your query is descriptive enough
3. Lower the similarity threshold if needed

## 📊 Best Practices

1. **Auto-Save**: Store innovations automatically after Phase 2 completion
2. **Context Length**: Keep descriptions under 500 characters for metadata
3. **Search Queries**: Use descriptive queries (2-3 sentences work best)
4. **Index Size**: Monitor with `/api/pinecone/stats` endpoint
5. **Cleanup**: Delete test innovations regularly to keep index clean

## 🌟 Advanced Features

### Custom Metadata Filtering

Modify `pinecone.js` to add filters:

```javascript
const results = await index.query({
  vector: queryEmbedding,
  topK: topK,
  filter: {
    patternUsed: { $eq: 'subtraction' },
    noveltyScore: { $gte: 7 }
  },
  includeMetadata: true,
});
```

### Hybrid Search (Keyword + Semantic)

Combine traditional search with vector search for better results.

### Analytics Dashboard

Track which patterns are most successful using Pinecone stats.

## 🔗 Resources

- [Pinecone Documentation](https://docs.pinecone.io/)
- [Gemini Embeddings](https://ai.google.dev/docs/embeddings_guide)
- [Vector Database Guide](https://www.pinecone.io/learn/vector-database/)

## 🆘 Support

If you encounter issues:
1. Check server logs: `npm run api`
2. Verify health endpoint: `curl http://localhost:5000/health`
3. Review Pinecone dashboard for index status
4. Check this guide's troubleshooting section

---

**Need Help?** Open an issue or check the Pinecone community forum.
