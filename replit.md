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
│   ├── PhaseThree.tsx   # Architect - specs & visualization
│   └── PhaseFour.tsx    # Build - BOM generation & exports
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
1. **Four-Phase SIT Workflow**
   - Phase 1 (Scan): Analyze product via text or camera
   - Phase 2 (Reverse): Apply SIT patterns with Back/Reset navigation
   - Phase 3 (Architect): Generate specs and visualizations with tabbed 2D/3D viewer
   - Phase 4 (Build): Bill of Materials generation with export options

2. **Camera Support**: Use device camera to scan physical objects

3. **5 SIT Patterns**: Subtraction, Task Unification, Multiplication, Division, Attribute Dependency

4. **Innovation History**: Auto-saves progress after each phase, allows resume and review
   - Stored locally on device using AsyncStorage
   - View past innovations from History screen
   - Resume any saved innovation at any phase

5. **Enhanced Phase 2 UI**:
   - Detailed 4-step pattern breakdown for each SIT pattern
   - Numbered steps with arrow indicators showing methodology
   - Italic quote block with pattern description

6. **Enhanced Phase 3 UI**:
   - Streamlined Innovation Summary with SIT Pattern, Key Benefit (green), Constraint (purple)
   - Tabbed 2D/3D visualization panel with generation timer
   - Collapsible specifications with color-coded sections
   - Continue to Build button to advance to Phase 4

7. **Enhanced Phase 4 UI**:
   - Manufacturing Readiness tracker with percentage badge (Specs, BOM, 2D, 3D)
   - Send to Manufacturer section with links to Xometry, Shapeways, Protolabs, JLCPCB
   - Export options for BOM (CSV) and complete package (JSON)

8. **Global Navigation**: Back + Reset buttons on all phases (2, 3, 4)

9. **Background Image Generation**:
   - 2D sketches generate lazily in the background after Phase 2 completes
   - Floating notification shows generation progress across all phases
   - Users can navigate freely while generation continues
   - Notification auto-dismisses after 5 seconds when complete
   - Tapping notification navigates directly to Phase 3 to view the sketch

10. **Multi-Angle 2D Image Generation (Progressive Loading)**:
    - Generates 3 views automatically: Front, Side, and Isometric
    - Progressive loading: Each angle generates in parallel with independent API calls
    - Images appear as they complete (~15-20s for first, all 3 within ~45-60s)
    - Angle selector shows loading indicators for pending angles with progress counter (1/3, 2/3)
    - Navigation arrows with page indicator
    - "Save All" button to download all angles at once
    - Each angle saved with descriptive filename

11. **Interactive 2D Image Viewer**:
    - Fullscreen modal with dark background
    - Pinch-to-zoom and pan controls
    - Angle navigation in fullscreen mode with dot indicators
    - Save individual angle or all angles
    - Share via system share sheet

## API Endpoints (Production Server)
Base URL: `https://reversr-vsillah.replit.app`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/gemini/analyze` | POST | Analyze product (text/image) |
| `/api/gemini/apply-pattern` | POST | Apply SIT pattern |
| `/api/gemini/technical-spec` | POST | Generate technical spec |
| `/api/gemini/generate-2d` | POST | Generate 2D visualization |
| `/api/gemini/generate-2d-single-angle` | POST | Generate single angle for progressive loading |
| `/api/gemini/generate-2d-angles` | POST | Generate multi-angle 2D views |
| `/api/gemini/generate-3d` | POST | Generate 3D scene descriptor |
| `/api/gemini/generate-bom` | POST | Generate Bill of Materials |
| `/health` | GET | Server health + API key status |

## Rate Limiting & Resilience
The server includes built-in protection against API rate limits:

1. **API Key Pool**: Support for multiple Gemini API keys via `GEMINI_API_KEYS` env var (comma-separated)
2. **Key Rotation**: Automatically rotates to next available key when one is rate-limited
3. **Exponential Backoff**: Retries with increasing delays (1s, 2s, 4s...) + jitter
4. **Response Caching**: LRU cache (5 min TTL) for identical text requests
5. **Graceful Fallback**: Image generation provides fallback message if unavailable
6. **Structured Errors**: Returns `{ error, code, retryAfter, canRetry }` for client handling

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
