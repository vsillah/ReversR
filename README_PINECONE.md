# 🔌 Pinecone API Integration for REVERSR

This repository now includes **Pinecone vector database integration** for semantic search and retrieval-augmented generation (RAG) capabilities.

## 🚀 What's New

Your REVERSR app can now:

- **🔍 Semantic Search**: Find similar innovations based on meaning, not just keywords
- **🧠 Smart Context (RAG)**: AI learns from past innovations to provide better suggestions
- **📊 Pattern Discovery**: Identify which SIT patterns work best across products
- **💾 Vector Storage**: Automatically save and retrieve innovation embeddings
- **🎯 Similarity Matching**: Discover connections between different product innovations

## 📦 Installation

Pinecone SDK is already installed. Just configure your API keys!

## ⚡ Quick Start

### 1. Get API Keys

- **Pinecone**: Sign up at [app.pinecone.io](https://app.pinecone.io/) (free tier available)
- Copy your API key from the dashboard

### 2. Configure Environment

```bash
# Copy example file
cp .env.example .env

# Edit .env and add:
PINECONE_API_KEY=your_pinecone_api_key_here
PINECONE_INDEX_NAME=reversr-innovations
```

### 3. Start Server

```bash
npm run api
```

Look for: `✅ Pinecone connected to index: reversr-innovations`

### 4. Test Connection

```bash
curl http://localhost:5000/health
```

Should show: `"pinecone": { "status": "connected" }`

## 📖 Documentation

- **[Quick Start Guide](./QUICKSTART_PINECONE.md)** - Get running in 5 minutes
- **[Full Setup Guide](./PINECONE_SETUP.md)** - Detailed documentation with examples
- **[API Reference](./PINECONE_SETUP.md#-api-endpoints)** - All available endpoints

## 🎨 Usage Examples

### Auto-save Innovations

```typescript
import { saveInnovationToPinecone } from '../hooks/usePinecone';

await saveInnovationToPinecone({
  ...innovation,
  id: 'innovation-123'
});
```

### Find Similar Innovations

```typescript
import { findSimilarInnovations } from '../hooks/usePinecone';

const similar = await findSimilarInnovations(
  'smart kitchen appliance with self-cleaning features',
  5 // top 5 results
);
```

### Use the SimilarInnovations Component

```typescript
import { SimilarInnovations } from '../components/SimilarInnovations';

<SimilarInnovations 
  query={analysis.productName}
  maxResults={3}
  onSelect={(innovation) => {
    console.log('Selected:', innovation);
  }}
/>
```

## 🔌 API Endpoints

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/pinecone/store` | Store innovation in vector DB |
| POST | `/api/pinecone/search` | Search similar innovations |
| DELETE | `/api/pinecone/delete/:id` | Delete innovation |
| GET | `/api/pinecone/stats` | Get index statistics |
| POST | `/api/gemini/analyze-with-context` | Enhanced analysis with RAG |

### Example Requests

**Store Innovation:**
```bash
curl -X POST http://localhost:5000/api/pinecone/store \
  -H "Content-Type: application/json" \
  -d '{
    "innovation": {
      "id": "inn-123",
      "conceptName": "Self-Cleaning Water Bottle",
      "conceptDescription": "Uses UV-C light...",
      "patternUsed": "task_unification"
    }
  }'
```

**Search Similar:**
```bash
curl -X POST http://localhost:5000/api/pinecone/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "smart kitchen appliance",
    "topK": 5
  }'
```

## 🏗️ Architecture

```
┌─────────────┐
│ React Native│
│     App     │
└──────┬──────┘
       │
       ├─ usePinecone hook
       └─ SimilarInnovations component
              │
              ▼
┌─────────────────────────────┐
│   Express Server (Node.js)  │
│                             │
│  ┌─────────────────────┐   │
│  │  Pinecone Module    │   │
│  │  - storeInnovation  │   │
│  │  - searchSimilar    │   │
│  │  - getContext (RAG) │   │
│  └─────────────────────┘   │
│                             │
│  ┌─────────────────────┐   │
│  │  Gemini API         │   │
│  │  - Embeddings       │   │
│  │  - Generation       │   │
│  └─────────────────────┘   │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────┐
│   Pinecone Cloud    │
│   Vector Database   │
│   (768 dimensions)  │
└─────────────────────┘
```

## 🎯 Use Cases

### 1. **Smart Recommendations**
When analyzing a product, show similar innovations from the past:
```typescript
<SimilarInnovations query={productDescription} />
```

### 2. **Pattern Discovery**
Find which SIT patterns work best for specific product categories:
```typescript
const results = await findSimilarInnovations('kitchen appliance');
const patterns = results.map(r => r.patternUsed);
// Analyze pattern frequency
```

### 3. **Context-Aware AI**
Enhance AI responses with relevant past innovations (RAG):
```typescript
// Uses the /analyze-with-context endpoint automatically
const analysis = await analyzeProduct(input, image);
// AI now has context from similar innovations
```

### 4. **Innovation History**
Build a searchable knowledge base of all innovations:
```typescript
const stats = await getPineconeStats();
console.log(`Total innovations: ${stats.totalRecordCount}`);
```

## 🔧 Configuration Options

### Environment Variables

```env
# Required
PINECONE_API_KEY=pc-xxxxx

# Optional
PINECONE_INDEX_NAME=reversr-innovations  # Default index name
PINECONE_ENVIRONMENT=us-east-1-aws       # Auto-detected

# Gemini (already configured)
AI_INTEGRATIONS_GEMINI_API_KEY=xxxxx
```

### Index Settings

Default configuration (in `server/pinecone.js`):
- **Dimension**: 768 (Gemini text-embedding-004)
- **Metric**: Cosine similarity
- **Type**: Serverless (auto-scaling)
- **Cloud**: AWS us-east-1

## 🧪 Testing

### Manual Tests

```bash
# 1. Health check
curl http://localhost:5000/health

# 2. Store test innovation
curl -X POST http://localhost:5000/api/pinecone/store \
  -H "Content-Type: application/json" \
  -d '{"innovation": {"conceptName": "Test", "conceptDescription": "Testing"}}'

# 3. Search for it
curl -X POST http://localhost:5000/api/pinecone/search \
  -H "Content-Type: application/json" \
  -d '{"query": "test product", "topK": 1}'

# 4. Check stats
curl http://localhost:5000/api/pinecone/stats
```

## 📊 Monitoring

Check Pinecone usage:
1. Visit [app.pinecone.io](https://app.pinecone.io/)
2. Go to your index
3. View metrics: queries, storage, performance

## 🚨 Troubleshooting

### "Pinecone not available"
- Check `.env` has `PINECONE_API_KEY`
- Verify API key is valid in Pinecone dashboard
- Check server logs for errors

### "Index not ready"
- Serverless indexes take ~60 seconds to initialize
- Wait and restart the server
- Check index status in Pinecone dashboard

### No search results
- Verify innovations are stored: `GET /api/pinecone/stats`
- Ensure query is descriptive (not too short)
- Check if embeddings are being generated correctly

### High latency
- First request initializes Pinecone (slower)
- Subsequent requests use connection pooling (faster)
- Consider upgrading Pinecone plan for more performance

## 📈 Pricing

**Pinecone Free Tier:**
- ✅ 100,000 vectors
- ✅ 1 index
- ✅ Unlimited queries
- ✅ Serverless architecture

Perfect for development and small-scale production!

## 🔐 Security

- ✅ API keys stored in `.env` (not committed)
- ✅ `.env` added to `.gitignore`
- ✅ Server-side only (keys never exposed to client)
- ✅ CORS configured for your domains

## 🌟 Next Steps

1. **Auto-save**: Enable auto-save in Phase 2 completion
2. **UI Component**: Add `<SimilarInnovations />` to your phases
3. **Analytics**: Track pattern success rates
4. **Export**: Add "Similar Innovations" to history screen
5. **Advanced**: Implement metadata filtering for better search

## 📚 Resources

- [Pinecone Documentation](https://docs.pinecone.io/)
- [Gemini Embeddings Guide](https://ai.google.dev/docs/embeddings_guide)
- [Vector Database Primer](https://www.pinecone.io/learn/vector-database/)
- [RAG Tutorial](https://www.pinecone.io/learn/retrieval-augmented-generation/)

## 🆘 Support

Issues? Check:
1. Server logs: `npm run api`
2. Health endpoint: `curl http://localhost:5000/health`
3. Pinecone dashboard: [app.pinecone.io](https://app.pinecone.io/)
4. Full guide: [PINECONE_SETUP.md](./PINECONE_SETUP.md)

## 📄 License

Same as the main project.

---

**Built with** ❤️ **for REVERSR**

