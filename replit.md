# ReversR - AI-Powered Product Innovation Engine

## Overview
ReversR is a web application that uses Google's Gemini AI and Systematic Inventive Thinking (SIT) methodology to analyze products and generate innovative concepts with 2D sketches and 3D wireframe visualizations.

## Project Structure
```
├── src/
│   ├── components/
│   │   ├── PhaseOne.tsx        # Closed World Scan - product analysis
│   │   ├── PhaseTwo.tsx        # Pattern Application - SIT mutation
│   │   ├── PhaseThree.tsx      # Architect - specs & visualization
│   │   ├── ContextViewer.tsx   # Context.md sidebar panel
│   │   └── PrototypeViewer.tsx # Three.js 3D wireframe viewer
│   ├── services/
│   │   └── geminiService.ts    # Gemini AI integration
│   ├── utils/
│   │   └── contextMarkdown.ts  # Context export utilities
│   ├── types.ts                # TypeScript type definitions
│   ├── App.tsx                 # Main application component
│   ├── main.tsx               # React entry point
│   └── index.css              # Tailwind CSS styles
├── public/
│   └── icon.png               # App icon
├── index.html                 # HTML template with Three.js CDN
├── vite.config.ts            # Vite configuration
├── tailwind.config.js        # Tailwind with custom theme
├── tsconfig.json             # TypeScript configuration
└── package.json              # Dependencies
```

## Key Features
1. **Three-Phase SIT Workflow**
   - Phase 1 (Scan): Analyze product components, identify essential parts, neighborhood resources
   - Phase 2 (Mutate): Apply SIT patterns (Subtraction, Task Unification, Multiplication, Division, Attribute Dependency)
   - Phase 3 (Architect): Generate technical specs, 2D sketches, and interactive 3D wireframes

2. **Camera Support**: Scan physical objects using device camera for analysis

3. **3D Visualization**: Interactive Three.js wireframe viewer with export to .obj and .stl formats

4. **Context.md**: Real-time operational memory sidebar tracking session progress

## Technology Stack
- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS with custom cyberpunk theme
- **AI**: Google Gemini (gemini-2.5-flash for analysis, gemini-2.5-flash-preview-05-20 for images)
- **3D**: Three.js (loaded via CDN)
- **Integration**: Replit AI Integrations for Gemini (no user API key required)

## Running the Application
The app runs on port 5000 using `npm run dev`.

## SIT Patterns Implemented
- **Subtraction**: Remove essential component to find new benefits
- **Task Unification**: Assign new task to existing resource
- **Multiplication**: Copy component but change attribute
- **Division**: Split product physically or functionally
- **Attribute Dependency**: Create correlation between variables

## User Preferences
- Dark/cyberpunk UI theme with neon accents
- Monospace fonts for technical elements
- Minimal, clean interface design

## Recent Changes
- Converted from Expo React Native to Vite + React web application
- Integrated Gemini AI via Replit AI Integrations
- Implemented complete SIT workflow with all 5 patterns
- Added camera functionality for object scanning
- Built 3D wireframe viewer with Three.js
