# 🚀 Getting Started with Pinecone in REVERSR

**Complete guide to connect Pinecone API to your Cursor project**

---

## 📚 Table of Contents

1. [What is Pinecone?](#what-is-pinecone)
2. [Why Use Pinecone?](#why-use-pinecone)
3. [Quick Setup (5 minutes)](#quick-setup)
4. [Understanding the Integration](#understanding-the-integration)
5. [Usage Examples](#usage-examples)
6. [Testing Your Setup](#testing-your-setup)
7. [Common Issues](#common-issues)
8. [Next Steps](#next-steps)

---

## What is Pinecone?

**Pinecone** is a vector database designed for AI applications. It stores and searches high-dimensional vectors (embeddings) that represent the semantic meaning of your data.

### What it does for REVERSR:

🔍 **Semantic Search**: Find innovations by meaning, not keywords  
🧠 **Smart AI Context**: AI learns from past innovations (RAG)  
📊 **Pattern Analysis**: Discover which SIT patterns work best  
💾 **Knowledge Base**: Build searchable history of innovations  

---

## Why Use Pinecone?

### Before Pinecone:
- ❌ Can't find similar past innovations
- ❌ AI has no context from previous work
- ❌ Hard to identify successful patterns
- ❌ No semantic understanding

### After Pinecone:
- ✅ Find similar innovations instantly
- ✅ AI provides context-aware suggestions
- ✅ Track which patterns work best
- ✅ Search by meaning, not keywords

---

## Quick Setup

### Step 1: Get Pinecone API Key (2 min)

1. Visit **[app.pinecone.io](https://app.pinecone.io/)**
2. Click **"Sign Up"** (free tier available)
3. Go to **"API Keys"** in sidebar
4. Click **"Create API Key"**
5. Copy your API key

### Step 2: Configure Environment (1 min)

```bash
# In your project root
cp .env.example .env
```

Edit `.env` file:
```env
# Gemini (you already have this)
AI_INTEGRATIONS_GEMINI_API_KEY=your_gemini_key_here

# Pinecone (add these)
PINECONE_API_KEY=pc-xxxxxxxxxxxxxxxxxxxxxxxxx
PINECONE_INDEX_NAME=reversr-innovations
```

### Step 3: Start Server (1 min)

```bash
npm run api
```

**Look for these success messages:**
```
🔌 Initializing Pinecone...
✅ Pinecone connected to index: reversr-innovations
API server running on port 5000
```

### Step 4: Verify Connection (1 min)

```bash
# Test health endpoint
curl http://localhost:5000/health
```

**Expected response includes:**
```json
{
  "status": "ok",
  "pinecone": {
    "status": "connected",
    "stats": {
      "totalVectorCount": 0,
      "dimension": 768
    }
  }
}
```

✅ **Done!** Pinecone is now connected!

---

## Understanding the Integration

### Architecture Overview

```
┌─────────────────────────┐
│   React Native App      │
│   - Components          │
│   - Hooks (usePinecone) │
└───────────┬─────────────┘
            │
            │ HTTP Requests
            ▼
┌─────────────────────────┐
│   Express Server        │
│   - API Endpoints       │
│   - Pinecone Module     │
│   - Gemini Integration  │
└───────────┬─────────────┘
            │
            ├──► Gemini API
            │    (Generate embeddings)
            │
            └──► Pinecone Cloud
                 (Store & search vectors)
```

### Data Flow Example

**Storing an Innovation:**
```
User creates innovation
    ↓
Innovation data + description
    ↓
Server generates embedding via Gemini
    ↓
768-dimensional vector created
    ↓
Vector + metadata stored in Pinecone
```

**Searching for Similar:**
```
User searches "smart kitchen appliance"
    ↓
Server generates query embedding
    ↓
Pinecone finds similar vectors
    ↓
Returns matching innovations with scores
    ↓
App displays results
```

### File Structure

```
/workspace/
├── server/
│   ├── index.js          ← Modified: Added Pinecone endpoints
│   └── pinecone.js       ← NEW: Pinecone integration logic
├── hooks/
│   └── usePinecone.ts    ← NEW: React hooks for Pinecone
├── components/
│   └── SimilarInnovations.tsx  ← NEW: UI component
├── .env.example          ← Updated: Pinecone config template
├── .env                  ← Create this with your keys
├── QUICKSTART_PINECONE.md     ← Quick start guide
├── PINECONE_SETUP.md          ← Detailed documentation
└── INTEGRATION_SUMMARY.md     ← What was changed
```

---

## Usage Examples

### Example 1: Auto-Save Innovations

**Location:** `app/index.tsx`

```typescript
import { saveInnovationToPinecone } from '../hooks/usePinecone';

const handlePhaseTwoComplete = async (innovation: InnovationResult) => {
  // Your existing code
  const newContext = {
    ...context,
    innovation,
    selectedPattern: innovation.patternUsed,
    phase: 3,
  };
  setContext(newContext);
  await autoSave(newContext);
  
  // 🆕 Save to Pinecone automatically
  try {
    await saveInnovationToPinecone({
      ...innovation,
      id: context.id,
    });
    console.log('✅ Saved to Pinecone');
  } catch (error) {
    console.error('⚠️ Pinecone save failed:', error);
  }
  
  startBackgroundImageGeneration(innovation, context.id);
};
```

### Example 2: Show Similar Innovations

**Location:** `components/PhaseTwo.tsx` or `PhaseThree.tsx`

```typescript
import { SimilarInnovations } from '../components/SimilarInnovations';

// In your component render:
<View>
  <Text style={styles.sectionTitle}>Your Innovation</Text>
  <Text>{innovation.conceptName}</Text>
  
  {/* 🆕 Show similar past innovations */}
  <SimilarInnovations 
    query={`${innovation.conceptName} ${innovation.conceptDescription}`}
    maxResults={3}
    onSelect={(selectedInnovation) => {
      console.log('User interested in:', selectedInnovation.conceptName);
      // Optional: Show details modal or compare
    }}
  />
</View>
```

### Example 3: Manual Search

**Location:** Create new `SearchScreen.tsx` or add to existing component

```typescript
import { useState } from 'react';
import { View, TextInput, FlatList, Text } from 'react-native';
import { findSimilarInnovations, SimilarInnovation } from '../hooks/usePinecone';

export const InnovationSearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SimilarInnovation[]>([]);

  const handleSearch = async () => {
    const found = await findSimilarInnovations(query, 10);
    setResults(found);
  };

  return (
    <View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search innovations..."
        onSubmitEditing={handleSearch}
      />
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View>
            <Text>{item.conceptName}</Text>
            <Text>{(item.score * 100).toFixed(0)}% match</Text>
          </View>
        )}
      />
    </View>
  );
};
```

### Example 4: Pattern Analytics

**Get insights on which patterns work best:**

```typescript
import { findSimilarInnovations } from '../hooks/usePinecone';

const analyzePatterns = async (productCategory: string) => {
  const results = await findSimilarInnovations(productCategory, 20);
  
  const patternCounts = results.reduce((acc, item) => {
    acc[item.patternUsed] = (acc[item.patternUsed] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log('Pattern distribution:', patternCounts);
  
  const avgNovelty = results.reduce((sum, item) => 
    sum + item.noveltyScore, 0) / results.length;
  
  console.log('Average novelty score:', avgNovelty);
};
```

---

## Testing Your Setup

### Method 1: Using the Test Script

```bash
# Make script executable (first time only)
chmod +x test-pinecone.sh

# Run tests
./test-pinecone.sh
```

### Method 2: Manual Testing

```bash
# 1. Health check
curl http://localhost:5000/health

# 2. Store test innovation
curl -X POST http://localhost:5000/api/pinecone/store \
  -H "Content-Type: application/json" \
  -d '{
    "innovation": {
      "conceptName": "Self-Cleaning Coffee Mug",
      "conceptDescription": "A mug that uses UV-C light to sanitize itself",
      "patternUsed": "task_unification"
    }
  }'

# 3. Search for it
curl -X POST http://localhost:5000/api/pinecone/search \
  -H "Content-Type: application/json" \
  -d '{"query": "smart coffee cup that cleans", "topK": 3}'

# 4. Check statistics
curl http://localhost:5000/api/pinecone/stats
```

### Expected Results

✅ All requests return JSON responses  
✅ Store returns `{"success": true}`  
✅ Search returns array of results  
✅ Stats shows `totalVectorCount > 0`  

---

## Common Issues

### Issue 1: "Pinecone not available"

**Symptoms:** Health check shows `"status": "not_configured"`

**Solution:**
```bash
# Check if .env exists
ls -la .env

# Verify Pinecone key is set
cat .env | grep PINECONE_API_KEY

# Restart server
npm run api
```

### Issue 2: Index Creation Timeout

**Symptoms:** Server hangs on "Creating Pinecone index..."

**Solution:**
- Serverless indexes take 60-90 seconds to initialize (first time only)
- Wait patiently
- Check Pinecone dashboard: [app.pinecone.io](https://app.pinecone.io/)
- If stuck > 2 minutes, restart server

### Issue 3: No Search Results

**Symptoms:** Search returns empty array

**Solution:**
```bash
# Check if any data is stored
curl http://localhost:5000/api/pinecone/stats

# Should show: "totalVectorCount": > 0
# If 0, no innovations stored yet
# Store some data first!
```

### Issue 4: "Failed to generate embedding"

**Symptoms:** Error when storing innovation

**Solution:**
- Verify Gemini API key is valid
- Check Gemini API quota
- Ensure text is not empty
- Check server logs for details

### Issue 5: TypeScript Errors

**Symptoms:** Import errors in IDE

**Solution:**
```bash
# Restart TypeScript server in VS Code/Cursor
# Or rebuild
npm run build

# Check if types are recognized
```

---

## Next Steps

### Immediate (Do these now)

1. ✅ **Configure** `.env` with your Pinecone API key
2. ✅ **Test** with curl commands or test script
3. ✅ **Verify** health endpoint shows "connected"
4. ✅ **Store** a test innovation

### Short-term (This week)

1. 🎯 **Add auto-save** to Phase 2 completion
2. 🎨 **Integrate** `<SimilarInnovations />` component
3. 📊 **Monitor** Pinecone dashboard
4. 🧪 **Test** with real innovations

### Long-term (Future enhancements)

1. 🔍 **Build** search functionality in UI
2. 📈 **Add** analytics dashboard
3. 🎯 **Implement** pattern recommendations
4. 🚀 **Optimize** for production

---

## Documentation Quick Links

Choose what you need:

| Document | Purpose | Time |
|----------|---------|------|
| **[QUICKSTART_PINECONE.md](./QUICKSTART_PINECONE.md)** | Get running fast | 5 min |
| **[PINECONE_SETUP.md](./PINECONE_SETUP.md)** | Complete guide | 20 min |
| **[INTEGRATION_SUMMARY.md](./INTEGRATION_SUMMARY.md)** | What changed | 5 min |
| **[PINECONE_CHECKLIST.md](./PINECONE_CHECKLIST.md)** | Verify setup | 10 min |
| **[README_PINECONE.md](./README_PINECONE.md)** | Overview | 10 min |

---

## Need Help?

### Troubleshooting Steps

1. Check server logs: `npm run api`
2. Test health endpoint: `curl http://localhost:5000/health`
3. Review documentation above
4. Check Pinecone dashboard for index status
5. Verify environment variables are set

### Resources

- 📖 [Pinecone Documentation](https://docs.pinecone.io/)
- 🎓 [Vector Database Guide](https://www.pinecone.io/learn/vector-database/)
- 🔗 [Gemini Embeddings](https://ai.google.dev/docs/embeddings_guide)
- 💬 [Pinecone Community](https://community.pinecone.io/)

### Still Stuck?

- Review `PINECONE_SETUP.md` for detailed troubleshooting
- Check server logs for specific error messages
- Verify all environment variables are set correctly
- Ensure Gemini API is working (test other endpoints)

---

## 🎉 Congratulations!

You now have Pinecone integrated with your REVERSR app!

**What you can do:**
- ✅ Store innovations in vector database
- ✅ Search semantically for similar products
- ✅ Enhance AI with context from past work
- ✅ Build a searchable innovation knowledge base

**Start using it:**
1. Configure your `.env` file
2. Run the test script
3. Add auto-save to your code
4. Use the SimilarInnovations component

---

**Happy innovating with Pinecone! 🚀**

