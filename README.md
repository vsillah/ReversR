# REVERSR - AI-Powered Innovation Platform

Systematic Inventive Thinking (SIT) app with Pinecone vector database integration.

## 🎉 Pinecone Integration Active

This project includes **Pinecone vector database** for semantic search and AI enhancement.

**Status:** ✅ Configured and ready to use

### Quick Start

```bash
# Start server (Pinecone auto-connects)
npm run api

# Test connection
curl http://localhost:5000/health
```

## 🚀 For New Cursor Projects

To add Pinecone to a new project:

```bash
# Run the installer
./install-pinecone-new-project.sh /path/to/new-project

# Or for current directory
./install-pinecone-new-project.sh .
```

The installer will:
- ✅ Copy all integration files
- ✅ Configure your API key automatically
- ✅ Install Pinecone SDK
- ✅ Create documentation
- ✅ Generate setup instructions

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| [START_HERE.md](./START_HERE.md) | Overview and quick links |
| [QUICKSTART_PINECONE.md](./QUICKSTART_PINECONE.md) | 5-minute quick start |
| [CURSOR_PROJECTS_SETUP.md](./CURSOR_PROJECTS_SETUP.md) | Setup for new projects |
| [PINECONE_GETTING_STARTED.md](./PINECONE_GETTING_STARTED.md) | Complete guide |

## 🔌 Features

- **Semantic Search**: Find similar innovations by meaning
- **Smart AI (RAG)**: Context-aware suggestions from past work
- **Pattern Discovery**: Track successful SIT patterns
- **Auto-Save**: Build knowledge base automatically

## 💡 Usage

### Backend API

```bash
POST /api/pinecone/store          # Store innovation
POST /api/pinecone/search         # Find similar
GET  /api/pinecone/stats          # Get statistics
```

### Frontend Components

```typescript
// Show similar innovations
import { SimilarInnovations } from './components/SimilarInnovations';
<SimilarInnovations query={productName} maxResults={3} />

// Save to Pinecone
import { saveInnovationToPinecone } from './hooks/usePinecone';
await saveInnovationToPinecone(innovation);
```

## 🛠️ Installation

```bash
# Install dependencies
npm install

# Configure (already done in this project)
# .env contains your Pinecone API key

# Start development
npm run dev        # Start both API and expo
npm run api        # API server only
npm run expo       # Expo only
```

## 🔐 Configuration

Your Pinecone API key is stored in:
- `.env` (git-ignored)
- `.cursor/pinecone-config.json` (project config)

**API Key:** Already configured ✅

## 📦 Integration Files

```
/workspace/
├── server/
│   ├── index.js              (modified with Pinecone endpoints)
│   └── pinecone.js           (NEW - Pinecone integration)
├── hooks/
│   └── usePinecone.ts        (NEW - React hooks)
├── components/
│   └── SimilarInnovations.tsx (NEW - UI component)
└── install-pinecone-new-project.sh (NEW - Installer)
```

## 🧪 Testing

```bash
# Run automated tests
./test-pinecone.sh

# Manual test
curl http://localhost:5000/health
```

## 📊 Monitoring

View your Pinecone dashboard:
- **URL:** https://app.pinecone.io/
- **Index:** `reversr-innovations`
- **Status:** Check via `/health` endpoint

## 🎯 Next Steps

1. **This Project:** Start using immediately with `npm run api`
2. **New Projects:** Use `./install-pinecone-new-project.sh`
3. **Documentation:** Read [START_HERE.md](./START_HERE.md)

## 🆘 Support

- **Quick Help:** [QUICKSTART_PINECONE.md](./QUICKSTART_PINECONE.md)
- **Full Docs:** [PINECONE_SETUP.md](./PINECONE_SETUP.md)
- **Checklist:** [PINECONE_CHECKLIST.md](./PINECONE_CHECKLIST.md)

## 📄 License

[Your License Here]

---

**Built with Pinecone + Gemini AI**
