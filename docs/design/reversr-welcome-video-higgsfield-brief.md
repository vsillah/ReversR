# ReversR Welcome Video: Higgsfield Production Brief

## Objective

Create a short vertical welcome video that plays before the ReversR home screen. The app overlays the final `REVERSR` title, subtitle, and `Enter ReversR` button natively, so the generated video should contain no readable text.

Current review asset:

- Video replacement path: `assets/welcome/reversr-welcome-intro.mp4`
- Poster replacement path: `assets/welcome/reversr-welcome-poster.png`
- App component: `components/WelcomeIntroScreen.tsx`
- Local generator: `npm run welcome:asset:generate`

The current committed MP4 is a locally generated production-review asset using the approved logo. If a Higgsfield render is produced later, replace the MP4 and poster at the same paths so the app code does not need to change.

## Approved Direction

Use the current ReversR caliper-R logo as the brand source. The video should show precision manufacturing systems assembling the logo from machined steel parts. The blue-teal accent should glow only after the mark is bolted together.

## Prompt

```text
Create a 7-second cinematic vertical welcome video for ReversR, a machine reconstruction app.

Scene: a dark premium manufacturing studio with brushed steel surfaces, precision lighting, robotic assembly arms, caliper jaws, bolts, and machined components.

Action: the camera performs a smooth 360-degree orbit around a manufacturing system as it assembles the ReversR caliper-R logo from separate metal parts. Steel jaws slide into place, a central machined bolt is inserted and tightened, the diagonal leg locks in, and the logo becomes a single brushed-steel R-shaped caliper mark.

Final moment: after assembly, the blue-teal accent ring and diagonal slot glow with a subtle luminescent light. The glow pulses once, clean and premium, then the finished logo holds centered on a dark industrial background.

Style: premium manufacturing, precision engineering, realistic brushed metal, cinematic macro detail, controlled teal-blue glow, smooth camera movement, high contrast, modern mobile app intro.

No people. No extra text. No gears. No sparks overload. No messy factory background. No distorted letters. No watermark. No subtitles.
```

## Output Targets

- 9:16 MP4, 720x1280 minimum, 1080x1920 preferred.
- 7 seconds.
- No audio.
- H.264 MP4, web and native safe.
- Poster frame exported as PNG from the final hold frame.

## Acceptance Criteria

- The logo concept remains the same at all sizes: brushed steel caliper-R with blue-teal accent.
- The generated video does not include text, fake UI, captions, watermarks, or alternate logo concepts.
- The final frame leaves enough lower contrast space for the native app CTA.
- The central machined bolt and caliper jaws are readable without visual clutter.
- The blue-teal glow feels like controlled precision lighting, not neon decoration.
