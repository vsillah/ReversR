# 🚀 Pinecone Setup for All Cursor Projects

## ✅ Current Project Setup Complete

Your Pinecone API key has been configured for this project:
- **API Key:** `pcsk_6aRUee_AapDrFkN7nz6Fi56bbXdTZGphub9L9uEV1k8x87VG3M1LMCpqRS9mMqpW4vzMkB`
- **Index Name:** `reversr-innovations`
- **Status:** ✅ Ready to use

### Test Your Setup Now

```bash
# Start the server
npm run api

# In another terminal, test the connection
curl http://localhost:5000/health
```

You should see:
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

---

## 📋 For New Cursor Projects

To use this Pinecone integration in any new Cursor project:

### Method 1: Copy Integration Files (Recommended)

**From this project, copy these files to your new project:**

1. **Backend Files:**
   ```bash
   cp server/pinecone.js /path/to/new-project/server/
   ```

2. **Frontend Files:**
   ```bash
   cp hooks/usePinecone.ts /path/to/new-project/hooks/
   cp components/SimilarInnovations.tsx /path/to/new-project/components/
   ```

3. **Configuration:**
   ```bash
   cp .env /path/to/new-project/.env
   cp .cursor/pinecone-config.json /path/to/new-project/.cursor/
   ```

4. **Documentation:**
   ```bash
   cp *PINECONE*.md START_HERE.md /path/to/new-project/
   cp test-pinecone.sh /path/to/new-project/
   ```

5. **Install Dependencies:**
   ```bash
   cd /path/to/new-project
   npm install @pinecone-database/pinecone
   ```

6. **Update server/index.js** with Pinecone endpoints (refer to INTEGRATION_SUMMARY.md)

### Method 2: Quick Setup Script

Create a setup script in your new project:

```bash
#!/bin/bash
# setup-pinecone.sh

# Install Pinecone SDK
npm install @pinecone-database/pinecone

# Create .env file
cat > .env << 'EOF'
PINECONE_API_KEY=pcsk_6aRUee_AapDrFkN7nz6Fi56bbXdTZGphub9L9uEV1k8x87VG3M1LMCpqRS9mMqpW4vzMkB
PINECONE_INDEX_NAME=reversr-innovations
EOF

echo "✅ Pinecone configured! Copy integration files from your reference project."
```

### Method 3: Template Repository

**Best for multiple projects:**

1. Create a GitHub template repository with this integration
2. Include all Pinecone files (server, hooks, components)
3. Use as template for new Cursor projects
4. `.env` is git-ignored but documented in `.env.example`

---

## 🔄 Using Same Index Across Projects

Your Pinecone API key and index can be shared across projects:

### ✅ Benefits:
- **Single Knowledge Base**: All projects contribute to same vector database
- **Cross-Project Insights**: Find similar innovations across different apps
- **Unified Search**: One index for all your innovations

### ⚠️ Considerations:
- Add project identifier to metadata:
  ```typescript
  await saveInnovationToPinecone({
    ...innovation,
    metadata: {
      projectId: 'reversr',
      projectName: 'REVERSR App'
    }
  });
  ```

- Filter by project when searching:
  ```typescript
  // In server/pinecone.js, add filter option
  const results = await index.query({
    vector: queryEmbedding,
    topK: topK,
    filter: {
      projectId: { $eq: 'reversr' }
    },
    includeMetadata: true,
  });
  ```

### 🎯 Recommended Approach:

**Option A: Separate Index Per Project**
```env
# Project 1
PINECONE_INDEX_NAME=project1-innovations

# Project 2
PINECONE_INDEX_NAME=project2-innovations
```

**Option B: Shared Index with Project Filter**
```env
# All projects
PINECONE_INDEX_NAME=all-innovations
PROJECT_ID=reversr
```

---

## 🔐 Security Best Practices

### For Production Projects:

1. **Never commit `.env` to git**
   ```bash
   # Already in .gitignore
   echo ".env" >> .gitignore
   ```

2. **Use environment variables in deployment**
   ```bash
   # In production (Vercel, Railway, etc.)
   PINECONE_API_KEY=pcsk_6aRUee...
   ```

3. **Rotate keys periodically**
   - Generate new key in Pinecone dashboard
   - Update `.env` in all projects
   - Revoke old key

4. **Separate keys for dev/prod**
   ```env
   # Development
   PINECONE_API_KEY=pcsk_dev_xxx

   # Production
   PINECONE_API_KEY=pcsk_prod_xxx
   ```

---

## 📦 NPM Package Integration Files

The core files you need in any project:

```
Required Files:
├── server/
│   └── pinecone.js              (7.9 KB)
├── hooks/
│   └── usePinecone.ts           (4.5 KB)
└── components/
    └── SimilarInnovations.tsx   (8.0 KB)

Required Changes:
└── server/index.js              (add Pinecone endpoints)

Configuration:
├── .env                         (with your API key)
└── package.json                 (add @pinecone-database/pinecone)
```

---

## 🎯 Quick Start for New Project

```bash
# 1. Navigate to new project
cd /path/to/new-cursor-project

# 2. Install Pinecone
npm install @pinecone-database/pinecone

# 3. Copy integration files
cp /path/to/reversr/server/pinecone.js ./server/
cp /path/to/reversr/hooks/usePinecone.ts ./hooks/
cp /path/to/reversr/components/SimilarInnovations.tsx ./components/

# 4. Create .env with your key
echo "PINECONE_API_KEY=pcsk_6aRUee_AapDrFkN7nz6Fi56bbXdTZGphub9L9uEV1k8x87VG3M1LMCpqRS9mMqpW4vzMkB" >> .env
echo "PINECONE_INDEX_NAME=your-project-name" >> .env

# 5. Update server/index.js
# Add Pinecone endpoints (see INTEGRATION_SUMMARY.md)

# 6. Test
npm run api
curl http://localhost:5000/health
```

---

## 🌐 Cursor Workspace Configuration

To make this available across all Cursor workspaces:

### Option 1: Global Config File

Create `~/.cursor/pinecone-global.json`:
```json
{
  "apiKey": "pcsk_6aRUee_AapDrFkN7nz6Fi56bbXdTZGphub9L9uEV1k8x87VG3M1LMCpqRS9mMqpW4vzMkB",
  "defaultIndexPrefix": "cursor-project"
}
```

### Option 2: Cursor Settings

In Cursor Settings (Cmd/Ctrl + ,):
```json
{
  "pinecone.apiKey": "pcsk_6aRUee_AapDrFkN7nz6Fi56bbXdTZGphub9L9uEV1k8x87VG3M1LMCpqRS9mMqpW4vzMkB",
  "pinecone.enabled": true
}
```

### Option 3: Project Template

Create a template directory:
```bash
~/cursor-templates/pinecone-integration/
├── server/pinecone.js
├── hooks/usePinecone.ts
├── components/SimilarInnovations.tsx
├── .env.template
└── README.md
```

Copy to new projects:
```bash
cp -r ~/cursor-templates/pinecone-integration/* ./
```

---

## 🧪 Test Your API Key

Quick test to verify your API key works:

```bash
curl -X POST http://localhost:5000/api/pinecone/store \
  -H "Content-Type: application/json" \
  -d '{
    "innovation": {
      "conceptName": "Test Innovation",
      "conceptDescription": "Testing Pinecone integration",
      "patternUsed": "subtraction"
    }
  }'
```

Expected response:
```json
{
  "success": true,
  "message": "Innovation stored in Pinecone"
}
```

---

## 📊 Monitor Your Usage

Check your Pinecone dashboard:
- **URL:** https://app.pinecone.io/
- **View:** All indexes using this API key
- **Monitor:** Query counts, storage, performance

---

## 🎉 Summary

Your Pinecone integration is now configured for:

✅ **Current Project:** Ready to use immediately  
✅ **New Projects:** Copy files + .env  
✅ **All Cursor Projects:** Use template method  
✅ **Single API Key:** Works across all projects  
✅ **Free Tier:** 100,000 vectors available  

---

## 🚀 Start Using Now

```bash
# This project is ready!
npm run api

# Test it
./test-pinecone.sh
```

For new projects, follow the "Quick Start for New Project" section above.

---

**Your API Key:** `pcsk_6aRUee_AapDrFkN7nz6Fi56bbXdTZGphub9L9uEV1k8x87VG3M1LMCpqRS9mMqpW4vzMkB`

**Questions?** Check the comprehensive docs in this project!
