#!/bin/bash

# Test script for Pinecone integration
# Run this after starting your server with: npm run api

echo "🧪 Testing Pinecone Integration for REVERSR"
echo "==========================================="
echo ""

API_BASE="http://localhost:5000"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Health Check
echo "📋 Test 1: Health Check"
echo "----------------------"
HEALTH=$(curl -s $API_BASE/health)
PINECONE_STATUS=$(echo $HEALTH | grep -o '"status":"[^"]*"' | grep -o 'pinecone' | head -1)

if [ -n "$PINECONE_STATUS" ]; then
    echo -e "${GREEN}✅ Server is running${NC}"
    echo "Response: $HEALTH"
else
    echo -e "${RED}❌ Server not responding${NC}"
    echo "Make sure server is running: npm run api"
    exit 1
fi
echo ""

# Test 2: Store Innovation
echo "📋 Test 2: Store Test Innovation"
echo "--------------------------------"
STORE_RESPONSE=$(curl -s -X POST $API_BASE/api/pinecone/store \
  -H "Content-Type: application/json" \
  -d '{
    "innovation": {
      "id": "test-innovation-'$(date +%s)'",
      "conceptName": "Smart Self-Cleaning Mug",
      "conceptDescription": "A coffee mug that uses ultrasonic vibrations to clean itself, eliminating the need for manual washing. Perfect for busy professionals.",
      "patternUsed": "task_unification",
      "marketGap": "People often forget to wash their reusable mugs, leading to bacterial growth",
      "marketBenefit": "Reduces bacterial growth and saves time on cleaning",
      "noveltyScore": 8,
      "viabilityScore": 7
    }
  }')

if echo "$STORE_RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ Innovation stored successfully${NC}"
    echo "Response: $STORE_RESPONSE"
else
    echo -e "${YELLOW}⚠️  Store may have failed (check if Pinecone is configured)${NC}"
    echo "Response: $STORE_RESPONSE"
fi
echo ""

# Wait a moment for indexing
sleep 2

# Test 3: Search for Similar
echo "📋 Test 3: Search for Similar Innovations"
echo "-----------------------------------------"
SEARCH_RESPONSE=$(curl -s -X POST $API_BASE/api/pinecone/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "innovative kitchen appliance that cleans itself",
    "topK": 3
  }')

if echo "$SEARCH_RESPONSE" | grep -q 'results'; then
    echo -e "${GREEN}✅ Search completed${NC}"
    echo "Response: $SEARCH_RESPONSE"
else
    echo -e "${YELLOW}⚠️  Search may have failed${NC}"
    echo "Response: $SEARCH_RESPONSE"
fi
echo ""

# Test 4: Get Statistics
echo "📋 Test 4: Get Index Statistics"
echo "-------------------------------"
STATS_RESPONSE=$(curl -s $API_BASE/api/pinecone/stats)

if echo "$STATS_RESPONSE" | grep -q 'stats'; then
    echo -e "${GREEN}✅ Stats retrieved${NC}"
    echo "Response: $STATS_RESPONSE"
else
    echo -e "${YELLOW}⚠️  Stats may be unavailable${NC}"
    echo "Response: $STATS_RESPONSE"
fi
echo ""

# Test 5: RAG Analysis
echo "📋 Test 5: RAG-Enhanced Analysis"
echo "--------------------------------"
RAG_RESPONSE=$(curl -s -X POST $API_BASE/api/gemini/analyze-with-context \
  -H "Content-Type: application/json" \
  -d '{
    "input": "A water bottle that keeps drinks cold",
    "useContext": true
  }')

if echo "$RAG_RESPONSE" | grep -q 'productName'; then
    echo -e "${GREEN}✅ RAG analysis completed${NC}"
    echo "Product found: $(echo $RAG_RESPONSE | grep -o '"productName":"[^"]*"')"
else
    echo -e "${YELLOW}⚠️  RAG analysis may have failed${NC}"
    echo "Response: $RAG_RESPONSE"
fi
echo ""

# Summary
echo "==========================================="
echo "🎉 Integration Test Complete!"
echo ""
echo "Next steps:"
echo "1. Check server logs for any errors"
echo "2. Verify Pinecone dashboard: https://app.pinecone.io/"
echo "3. Add integration to your React components"
echo ""
echo "Documentation:"
echo "- Quick Start: ./QUICKSTART_PINECONE.md"
echo "- Full Guide: ./PINECONE_SETUP.md"
echo "- Summary: ./INTEGRATION_SUMMARY.md"
echo ""
