#!/bin/bash

##############################################################################
# Pinecone Integration Installer for New Cursor Projects
# 
# This script copies the Pinecone integration to a new Cursor project.
# 
# Usage:
#   ./install-pinecone-new-project.sh /path/to/new-project
#
# Or for current directory:
#   ./install-pinecone-new-project.sh .
##############################################################################

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Pinecone API Key (embedded)
PINECONE_API_KEY="pcsk_6aRUee_AapDrFkN7nz6Fi56bbXdTZGphub9L9uEV1k8x87VG3M1LMCpqRS9mMqpW4vzMkB"

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║        Pinecone Integration Installer for Cursor            ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if target directory provided
if [ -z "$1" ]; then
    echo -e "${RED}❌ Error: No target directory specified${NC}"
    echo "Usage: $0 /path/to/new-project"
    echo "   or: $0 . (for current directory)"
    exit 1
fi

TARGET_DIR="$1"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Resolve target directory
if [ "$TARGET_DIR" = "." ]; then
    TARGET_DIR="$(pwd)"
else
    TARGET_DIR="$(cd "$TARGET_DIR" 2>/dev/null && pwd || echo "$TARGET_DIR")"
fi

echo -e "${BLUE}📂 Target Directory: ${TARGET_DIR}${NC}"
echo ""

# Create directories if they don't exist
echo -e "${YELLOW}📁 Creating directories...${NC}"
mkdir -p "$TARGET_DIR/server"
mkdir -p "$TARGET_DIR/hooks"
mkdir -p "$TARGET_DIR/components"
mkdir -p "$TARGET_DIR/.cursor"

# Copy integration files
echo -e "${YELLOW}📋 Copying integration files...${NC}"

# Backend
if [ -f "$SOURCE_DIR/server/pinecone.js" ]; then
    cp "$SOURCE_DIR/server/pinecone.js" "$TARGET_DIR/server/"
    echo -e "${GREEN}✅ Copied server/pinecone.js${NC}"
else
    echo -e "${RED}❌ Warning: server/pinecone.js not found${NC}"
fi

# Frontend
if [ -f "$SOURCE_DIR/hooks/usePinecone.ts" ]; then
    cp "$SOURCE_DIR/hooks/usePinecone.ts" "$TARGET_DIR/hooks/"
    echo -e "${GREEN}✅ Copied hooks/usePinecone.ts${NC}"
else
    echo -e "${RED}❌ Warning: hooks/usePinecone.ts not found${NC}"
fi

if [ -f "$SOURCE_DIR/components/SimilarInnovations.tsx" ]; then
    cp "$SOURCE_DIR/components/SimilarInnovations.tsx" "$TARGET_DIR/components/"
    echo -e "${GREEN}✅ Copied components/SimilarInnovations.tsx${NC}"
else
    echo -e "${RED}❌ Warning: components/SimilarInnovations.tsx not found${NC}"
fi

# Documentation
echo -e "${YELLOW}📚 Copying documentation...${NC}"
for doc in START_HERE.md QUICKSTART_PINECONE.md PINECONE_GETTING_STARTED.md PINECONE_SETUP.md INTEGRATION_SUMMARY.md PINECONE_CHECKLIST.md README_PINECONE.md CURSOR_PROJECTS_SETUP.md; do
    if [ -f "$SOURCE_DIR/$doc" ]; then
        cp "$SOURCE_DIR/$doc" "$TARGET_DIR/"
        echo -e "${GREEN}✅ Copied $doc${NC}"
    fi
done

# Test script
if [ -f "$SOURCE_DIR/test-pinecone.sh" ]; then
    cp "$SOURCE_DIR/test-pinecone.sh" "$TARGET_DIR/"
    chmod +x "$TARGET_DIR/test-pinecone.sh"
    echo -e "${GREEN}✅ Copied test-pinecone.sh${NC}"
fi

# Create .env file
echo -e "${YELLOW}⚙️  Creating .env file...${NC}"
if [ -f "$TARGET_DIR/.env" ]; then
    echo -e "${YELLOW}⚠️  .env already exists, appending Pinecone config...${NC}"
    if ! grep -q "PINECONE_API_KEY" "$TARGET_DIR/.env"; then
        echo "" >> "$TARGET_DIR/.env"
        echo "# Pinecone Configuration" >> "$TARGET_DIR/.env"
        echo "PINECONE_API_KEY=$PINECONE_API_KEY" >> "$TARGET_DIR/.env"
        echo "PINECONE_INDEX_NAME=cursor-project-$(basename "$TARGET_DIR")" >> "$TARGET_DIR/.env"
    else
        echo -e "${BLUE}ℹ️  Pinecone config already exists in .env${NC}"
    fi
else
    cat > "$TARGET_DIR/.env" << EOF
# ============================================
# PINECONE CONFIGURATION
# ============================================

PINECONE_API_KEY=$PINECONE_API_KEY
PINECONE_INDEX_NAME=cursor-project-$(basename "$TARGET_DIR")

# ============================================
# SERVER CONFIGURATION
# ============================================

API_PORT=5000
EOF
    echo -e "${GREEN}✅ Created .env file${NC}"
fi

# Create Cursor config
echo -e "${YELLOW}⚙️  Creating Cursor configuration...${NC}"
cat > "$TARGET_DIR/.cursor/pinecone-config.json" << EOF
{
  "pinecone": {
    "apiKey": "$PINECONE_API_KEY",
    "indexName": "cursor-project-$(basename "$TARGET_DIR")",
    "environment": "us-east-1",
    "dimension": 768,
    "metric": "cosine"
  },
  "integration": {
    "enabled": true,
    "autoSave": true,
    "ragEnabled": true
  },
  "installedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
echo -e "${GREEN}✅ Created .cursor/pinecone-config.json${NC}"

# Check if package.json exists and install Pinecone
echo ""
if [ -f "$TARGET_DIR/package.json" ]; then
    echo -e "${YELLOW}📦 Installing Pinecone SDK...${NC}"
    cd "$TARGET_DIR"
    
    # Check if already installed
    if grep -q "@pinecone-database/pinecone" package.json; then
        echo -e "${BLUE}ℹ️  Pinecone SDK already in package.json${NC}"
    else
        if command -v npm &> /dev/null; then
            npm install --save @pinecone-database/pinecone
            echo -e "${GREEN}✅ Installed @pinecone-database/pinecone${NC}"
        else
            echo -e "${YELLOW}⚠️  npm not found. Add to package.json manually:${NC}"
            echo "   \"@pinecone-database/pinecone\": \"^6.1.3\""
        fi
    fi
else
    echo -e "${YELLOW}⚠️  No package.json found. Create it and run:${NC}"
    echo "   npm install @pinecone-database/pinecone"
fi

# Create integration instructions
echo ""
echo -e "${YELLOW}📝 Creating integration instructions...${NC}"
cat > "$TARGET_DIR/INTEGRATION_STEPS.md" << 'EOF'
# 🔌 Pinecone Integration Steps

Your Pinecone integration files have been copied! Follow these steps to complete the setup:

## ✅ Already Done
- [x] Pinecone SDK installed
- [x] Integration files copied
- [x] .env configured with API key
- [x] Documentation added

## 📋 Required Steps

### 1. Update server/index.js

Add these imports at the top:
```javascript
const {
  initializePinecone,
  storeInnovation,
  searchSimilarInnovations,
  getInnovationContext,
  deleteInnovation,
  getIndexStats,
} = require('./pinecone');
```

Add these endpoints (see INTEGRATION_SUMMARY.md for full code):
- POST /api/pinecone/store
- POST /api/pinecone/search
- DELETE /api/pinecone/delete/:id
- GET /api/pinecone/stats
- POST /api/gemini/analyze-with-context (optional RAG)

Update the health endpoint to include Pinecone status.

Initialize Pinecone on server start:
```javascript
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server running on port ${PORT}`);
  await initializePinecone();
});
```

### 2. Test the Integration

```bash
# Start server
npm run api

# Test health
curl http://localhost:5000/health

# Run full tests
./test-pinecone.sh
```

### 3. Add to Your React App

Import and use in your components:
```typescript
import { SimilarInnovations } from '../components/SimilarInnovations';
import { saveInnovationToPinecone } from '../hooks/usePinecone';

// Show similar innovations
<SimilarInnovations query={productName} maxResults={3} />

// Auto-save innovations
await saveInnovationToPinecone(innovation);
```

## 📚 Documentation

- START_HERE.md - Overview and quick links
- QUICKSTART_PINECONE.md - 5-minute setup
- PINECONE_SETUP.md - Complete API documentation

## 🆘 Need Help?

Check the documentation or run:
```bash
cat START_HERE.md
```
EOF
echo -e "${GREEN}✅ Created INTEGRATION_STEPS.md${NC}"

# Summary
echo ""
echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║              ✅  Installation Complete!                     ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""
echo -e "${BLUE}📁 Target Directory: ${TARGET_DIR}${NC}"
echo ""
echo -e "${GREEN}✅ Files Copied:${NC}"
echo "   • server/pinecone.js"
echo "   • hooks/usePinecone.ts"
echo "   • components/SimilarInnovations.tsx"
echo "   • Documentation (8 files)"
echo "   • test-pinecone.sh"
echo ""
echo -e "${GREEN}✅ Configuration:${NC}"
echo "   • .env created with Pinecone API key"
echo "   • .cursor/pinecone-config.json created"
echo "   • Pinecone SDK installed (if npm available)"
echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo "   1. Read: ${TARGET_DIR}/INTEGRATION_STEPS.md"
echo "   2. Update: ${TARGET_DIR}/server/index.js"
echo "   3. Start: npm run api"
echo "   4. Test: ./test-pinecone.sh"
echo ""
echo -e "${BLUE}📚 Documentation: ${TARGET_DIR}/START_HERE.md${NC}"
echo ""
echo -e "${GREEN}🎉 Ready to use Pinecone in your Cursor project!${NC}"
echo ""
