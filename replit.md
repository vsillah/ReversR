# ReversR - AI-Powered Product Innovation Engine (Expo)

## Overview
ReversR is a React Native mobile application that uses Google's Gemini AI and Systematic Inventive Thinking (SIT) methodology to analyze products and generate innovative concepts.

## How to Use
1. Open the **Expo Go** app on your phone (download from App Store or Google Play)
2. Scan the QR code shown in the console output
3. The app will load on your device

## Project Structure
```
├── app/
│   ├── _layout.tsx      # Root layout with dark theme
│   └── index.tsx        # Main screen with phase navigation
├── components/
│   ├── WelcomeScreen.tsx # Welcome/splash screen
│   ├── PhaseOne.tsx     # Closed World Scan - product analysis + camera
│   ├── PhaseTwo.tsx     # Pattern Application - SIT mutation
│   └── PhaseThree.tsx   # Architect - specs & visualization
├── constants/
│   └── theme.ts         # Colors, spacing, font sizes
├── hooks/
│   └── useGemini.ts     # Gemini AI service with all API calls
├── assets/              # App icons and logo
├── server/              # Local dev server (production uses reversr-vsillah.replit.app)
├── app.json             # Expo configuration
├── eas.json             # EAS build configuration
├── package.json         # Dependencies
└── tsconfig.json        # TypeScript configuration
```

## Key Features
1. **Three-Phase SIT Workflow**
   - Phase 1 (Scan): Analyze product via text or camera
   - Phase 2 (Mutate): Apply SIT patterns
   - Phase 3 (Architect): Generate specs and visualizations

2. **Camera Support**: Use device camera to scan physical objects

3. **5 SIT Patterns**: Subtraction, Task Unification, Multiplication, Division, Attribute Dependency

4. **Export**: Share specs as JSON, 3D scenes as OBJ/STL

5. **Bill of Materials**: Generate BOM for innovation concepts (Phase 4)

## API Endpoints (Production Server)
Base URL: `https://reversr-vsillah.replit.app`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/gemini/analyze` | POST | Analyze product (text/image) |
| `/api/gemini/apply-pattern` | POST | Apply SIT pattern |
| `/api/gemini/technical-spec` | POST | Generate technical spec |
| `/api/gemini/generate-2d` | POST | Generate 2D visualization |
| `/api/gemini/generate-3d` | POST | Generate 3D scene descriptor |
| `/api/gemini/generate-bom` | POST | Generate Bill of Materials |

## Technology Stack
- **Framework**: Expo SDK 54 + React Native
- **Navigation**: Expo Router
- **AI**: Google Gemini via production server
- **Camera**: expo-camera
- **File System**: expo-file-system, expo-sharing

## Building for Release
- **APK (testing)**: `npx eas-cli build --platform android --profile preview`
- **AAB (Google Play)**: `npx eas-cli build --platform android --profile production`

## Running the App (Development)
The workflow runs: `npx expo start --tunnel`

To use on your phone:
1. Install Expo Go app
2. Scan the QR code from the console
3. Wait for the bundle to load

## Synced with ReversR Web
This Expo app shares the same API backend as the ReversR Web project.
Last synced: December 4, 2025
