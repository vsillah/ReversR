# Pinecone Quick Start Guide

Get Pinecone running with your REVERSR app in 5 minutes! ⚡

## Step 1: Get Pinecone API Key (2 min)

1. Visit [https://app.pinecone.io/](https://app.pinecone.io/)
2. Sign up (free tier available)
3. Go to **API Keys** → Copy your API key

## Step 2: Configure Environment (1 min)

Create a `.env` file in the root directory:

```bash
# Copy the example file
cp .env.example .env
```

Edit `.env` and add your keys:

```env
# Gemini (you already have this)
AI_INTEGRATIONS_GEMINI_API_KEY=your_gemini_key

# Pinecone (add this)
PINECONE_API_KEY=your_pinecone_key_here
PINECONE_INDEX_NAME=reversr-innovations
```

## Step 3: Start the Server (1 min)

```bash
npm run api
```

Wait for this message:
```
✅ Pinecone connected to index: reversr-innovations
API server running on port 5000
```

## Step 4: Test the Connection (1 min)

Open a new terminal and test:

```bash
# Check health
curl http://localhost:5000/health

# Should show:
# "pinecone": { "status": "connected", "stats": { ... } }
```

## Step 5: Use in Your App!

### Option A: Auto-save innovations (Recommended)

In `app/index.tsx`, add this after Phase 2 completion:

```typescript
import { saveInnovationToPinecone } from '../hooks/usePinecone';

const handlePhaseTwoComplete = async (innovation: InnovationResult) => {
  // Existing code...
  const newContext = {
    ...context,
    innovation,
    selectedPattern: innovation.patternUsed,
    phase: 3,
  };
  setContext(newContext);
  await autoSave(newContext);
  
  // 🆕 Auto-save to Pinecone
  await saveInnovationToPinecone({
    ...innovation,
    id: context.id,
  });
  
  startBackgroundImageGeneration(innovation, context.id);
};
```

### Option B: Add "Similar Innovations" feature

Create `components/SimilarInnovations.tsx`:

```typescript
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { findSimilarInnovations, SimilarInnovation } from '../hooks/usePinecone';
import { Colors, Spacing, FontSizes } from '../constants/theme';

interface Props {
  query: string;
  onSelect?: (innovation: SimilarInnovation) => void;
}

export const SimilarInnovations = ({ query, onSelect }: Props) => {
  const [similar, setSimilar] = useState<SimilarInnovation[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const loadSimilar = async () => {
      setLoading(true);
      const results = await findSimilarInnovations(query, 3);
      setSimilar(results);
      setLoading(false);
    };
    
    if (query) {
      loadSimilar();
    }
  }, [query]);
  
  if (loading) {
    return <Text style={styles.loading}>Finding similar innovations...</Text>;
  }
  
  if (similar.length === 0) {
    return null;
  }
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>💡 Similar Past Innovations</Text>
      <FlatList
        data={similar}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.card}
            onPress={() => onSelect?.(item)}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.name}>{item.conceptName}</Text>
              <Text style={styles.score}>
                {(item.score * 100).toFixed(0)}%
              </Text>
            </View>
            <Text style={styles.description} numberOfLines={2}>
              {item.conceptDescription}
            </Text>
            <View style={styles.tags}>
              <Text style={styles.tag}>{item.patternUsed}</Text>
              <Text style={styles.tag}>⭐ {item.noveltyScore}/10</Text>
            </View>
          </TouchableOpacity>
        )}
        horizontal
        showsHorizontalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.lg,
  },
  title: {
    fontSize: FontSizes.md,
    fontWeight: 'bold',
    color: Colors.white,
    marginBottom: Spacing.md,
  },
  loading: {
    color: Colors.gray[400],
    fontSize: FontSizes.sm,
    fontStyle: 'italic',
  },
  card: {
    backgroundColor: Colors.panel,
    borderRadius: 12,
    padding: Spacing.md,
    marginRight: Spacing.md,
    width: 250,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  name: {
    fontSize: FontSizes.md,
    fontWeight: 'bold',
    color: Colors.accent,
    flex: 1,
  },
  score: {
    fontSize: FontSizes.sm,
    color: Colors.green[400],
    fontWeight: 'bold',
  },
  description: {
    fontSize: FontSizes.sm,
    color: Colors.gray[300],
    marginBottom: Spacing.sm,
  },
  tags: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  tag: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    backgroundColor: Colors.dark,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 4,
  },
});
```

Then use it in `PhaseOne.tsx` or `PhaseTwo.tsx`:

```typescript
import { SimilarInnovations } from './SimilarInnovations';

// Inside your component:
<SimilarInnovations 
  query={input} // or analysis.productName
  onSelect={(innovation) => {
    console.log('User selected:', innovation);
    // Optional: Show details or suggest pattern
  }}
/>
```

## 🎉 Done!

Your app now has:
- ✅ Vector storage for innovations
- ✅ Semantic search capability
- ✅ Context-aware AI (RAG)
- ✅ Pattern discovery across products

## Next Steps

1. **Auto-save**: Add auto-save to Phase 2 completion
2. **Search UI**: Add the SimilarInnovations component
3. **Analytics**: Track which patterns work best
4. **Export**: Add "Find Similar" button to history screen

## Troubleshooting

**Issue**: Server says "Pinecone not available"
```bash
# Check your .env file
cat .env | grep PINECONE

# Should show your API key
```

**Issue**: Index creation taking long
```bash
# Serverless indexes need ~60 seconds on first creation
# Wait and restart:
npm run api
```

**Issue**: No similar results
```bash
# Check if innovations are stored:
curl http://localhost:5000/api/pinecone/stats

# Should show: "totalVectorCount": > 0
```

## Learn More

- 📖 Full guide: `PINECONE_SETUP.md`
- 🔗 API docs: Check the endpoints section
- 💡 Examples: See the usage examples in the full guide

---

**Questions?** Check `PINECONE_SETUP.md` or open an issue!
