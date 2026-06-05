# ReversR Rebuild Policy Hosting Deployment

Last updated: June 5, 2026

Apple and Google require reachable privacy, terms, and support URLs before submission. ReversR Rebuild includes web routes for:

- `/privacy`
- `/terms`
- `/support`

Expo exports the web app as a single-page static bundle, so the host must rewrite these paths to `index.html`.

## Local Export Check

Run:

```bash
npm run policy:preflight:local
```

The preflight:

- runs `expo export --platform web`,
- verifies `index.html`, `metadata.json`, and `favicon.ico`,
- confirms the exported bundle contains the privacy, terms, support, camera-use, vendor-handoff, and contact copy,
- confirms `vercel.json` rewrites all routes to `index.html`.

## Static Export

```bash
npm run web:export
```

The static output is written to:

```text
dist/
```

`dist/` is ignored by git and should be treated as generated deployment output.

## Vercel Static Deployment

This repo includes `vercel.json`:

```json
{
  "buildCommand": "npm run web:export",
  "outputDirectory": "dist",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

After deployment, set the hosted URLs in EAS:

```bash
EXPO_PUBLIC_PRIVACY_POLICY_URL=https://your-domain.example/privacy
EXPO_PUBLIC_TERMS_URL=https://your-domain.example/terms
EXPO_PUBLIC_SUPPORT_URL=https://your-domain.example/support
```

Then run the strict check:

```bash
EXPO_PUBLIC_PRIVACY_POLICY_URL=https://your-domain.example/privacy \
EXPO_PUBLIC_TERMS_URL=https://your-domain.example/terms \
EXPO_PUBLIC_SUPPORT_URL=https://your-domain.example/support \
npm run policy:preflight
```

To verify live hosted content, add `-- --check-hosted`:

```bash
EXPO_PUBLIC_PRIVACY_POLICY_URL=https://your-domain.example/privacy \
EXPO_PUBLIC_TERMS_URL=https://your-domain.example/terms \
EXPO_PUBLIC_SUPPORT_URL=https://your-domain.example/support \
npm run policy:preflight -- --check-hosted
```

## Generic Static Host Requirements

Any static host can work if it supports:

- serving the exported `dist/` directory,
- HTTPS,
- direct URLs for `/privacy`, `/terms`, and `/support`,
- fallback rewrite from unknown paths to `/index.html`,
- no authentication or IP restrictions on the policy/support pages.

Do not submit store builds until the hosted URLs pass the strict policy hosting preflight and are copied into App Store Connect, Play Console, and EAS production environment variables.
