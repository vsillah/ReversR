# ReversR — AI-Powered Product Innovation Engine

ReversR is an Expo (React Native) app that applies Systematic Inventive Thinking (SIT)
to a scanned/described product and walks the user through a four-phase workflow:
**Scan → Reverse → Design → Build** (analysis → SIT pattern mutation → specs/2D/3D → BOM/export).
AI is Google Gemini, always called through our own API server (never directly from the client).

## Architecture

| Piece | Where | Notes |
|---|---|---|
| Mobile/web app | `app/` (Expo Router screens), `components/` (PhaseOne–PhaseFour, WelcomeScreen, modals) | Expo SDK 56, React Native 0.85, dark theme in `constants/theme.ts` |
| AI + billing API | `server/index.js` (Express) | Gemini via `@google/genai`, optional local Ollama, Stripe billing in `server/commercialization.js`, inventory matching in `server/inventoryMatcher.js` |
| Vercel deployment | `api/[...path].js` wraps `server/index.js`; `vercel.json` builds web via `npm run web:export` | One codebase serves static web + API |
| Client AI hook | `hooks/useGemini.ts` | All client→API calls live here |
| Release tooling | `scripts/` (~50 preflight/evidence/asset scripts), evidence output in `docs/*.json` | Evidence-driven release process — see `docs/release-next-actions.md` |

Machine inventory data lives in `public/inventory/`; connector secrets stay server-side
(`INVENTORY_CONNECTOR_SECRETS_JSON`), the app only ever holds a `credentialRef`.

## Commands

```bash
npm run dev              # API (port 3001) + Expo native dev server, concurrently
npm run web-preview      # API + Expo web on port 5001
npm run typecheck        # tsc --noEmit — run before pushing
npm run release:local-ci # What CI runs on PRs (see .github/workflows/release-local-ci.yml)
npm run release:status   # Where the release pipeline stands
```

Native builds: `npx eas-cli build --platform android --profile preview` (APK) or
`--profile production` (AAB). Full flow: `docs/native-release-runbook.md`.

## CI

`release-local-ci.yml` runs on every PR to `main`: `npm ci` → `release:local-ci` →
`release:evidence` → `release:status` on Node 22. If you touch release scripts or
evidence JSON in `docs/`, run `npm run release:local-ci` locally first.

## Conventions & gotchas

- **Secrets**: never in client code or EAS public env vars. `EXPO_PUBLIC_*` vars are
  public by definition. Gemini/Stripe keys live only on the API host (`.env.example`
  documents everything).
- **expo-image does NOT render base64 data URIs** in Expo Go — use React Native's
  built-in `Image` (`RNImage`) or `Animated.Image` instead.
- **Alerts**: use `components/AlertModal.tsx`, not native `Alert.alert`.
- **Loading states**: use `components/LoadingOverlay.tsx` (phase-aware step progress).
- Evidence JSON files in `docs/` are generated artifacts — regenerate via scripts,
  don't hand-edit.
- `replit.md` is the legacy Replit-era doc; this file supersedes it for agent context.
  Update **this** file when architecture or workflow changes.

## Cross-surface workflow (Claude chat / Cowork / Claude Code)

This repo is the shared source of truth across all Claude surfaces.

- Specs, decisions, and in-flight task context live in `docs/claude/handoff/` —
  read `docs/claude/handoff/README.md` before starting work that another surface began.
- Surface setup + connector parity: `docs/claude/onboarding.md`.
- Development happens on `claude/*` branches → PR to `main`; CI must be green to merge.
