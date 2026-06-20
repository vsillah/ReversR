# ReversR Welcome Video Production Checklist

## Current Asset Status

- `assets/welcome/reversr-welcome-intro.mp4` is a wiring proof only.
- `assets/welcome/reversr-welcome-poster.png` is a poster proof only.
- The local generator verifies playback, app timing, bundling, and fallback behavior.
- The approved cinematic creative must be generated through Claude-led Higgsfield image-to-video production.

## Generation Owner

Claude Code leads the creative generation process:

1. Review the production brief and prompt package.
2. Prepare the Higgsfield run notes for the session.
3. Choose the reference still strategy.
4. Decide which variant to iterate.
5. Produce candidate notes for Codex QA.

Codex does not lead creative generation. Codex packages, validates, smokes, and rejects candidates that do not meet the brief.

## Higgsfield Run Sequence

1. Prepare references:
   - R1 final hold still: finished caliper-R in a dark premium machine shop with empty lower 40%.
   - R2 mid-assembly still: caliper jaws partially closed, center bolt visible, knob readable.
   - R3 factory establishing still: CNC mill, lathe spindle, clamp fixture, gantry rail, torque driver.
   - R4 knob macro still: knurled center knob with teal index/accent.
   - R5 identity reference: `assets/logo-transparent.png`.
2. Start in image-to-video mode.
3. Use R1 or R2 as the visual seed and R5 as the identity reference.
4. Use a cinematic model suited to realistic machinery and controlled camera motion.
5. Set 9:16, 7-8 seconds, no audio.
6. Keep camera motion restrained:
   - slow dolly-in,
   - 25-30 degree orbit maximum,
   - no full 360 spin unless logo identity remains stable.
7. Generate variants:
   - Variant A: precision assembly line.
   - Variant B: center knob calibration.
   - Variant C: conveyor reveal.
8. Iterate one variable at a time:
   - camera move,
   - machine framing,
   - knob timing,
   - teal glow intensity,
   - final hold stability.

## Required Exports

For each candidate Claude selects for Codex QA, export:

- MP4 candidate, preferably 2160x3840 or at least 1080x1920.
- Poster frame from the final hold, preferably after 6.0s.
- Still/contact sheet with frames around 1s, 3s, 4.5s, and 6.2s.
- Candidate notes:
  - model used,
  - references used,
  - prompt variant,
  - known issues,
  - whether another iteration is recommended.

## Codex QA Before Human Review

Codex must reject the candidate before human review if any hard gate fails:

- Generated text, fake UI, subtitles, watermark, or invented brand wording appears.
- Logo identity drifts away from the approved caliper-R mark.
- Center knob does not visibly spin or get adjusted by machinery.
- Caliper jaws do not visibly align, close, or lock.
- The clip reads as generic tech animation instead of a factory/machine-shop scene.
- The final logo is blurry, warped, duplicated, or unstable after 4.5s.
- The lower CTA area is too busy for native app controls.
- Brand/title/tagline would need to appear before assembly completes.
- Asset is not 9:16, not H.264/yuv420p compatible, or includes audio.

If the candidate passes QA:

1. Run:
   ```bash
   npm run welcome:asset:package -- /path/to/higgsfield-candidate.mp4 --poster-at 6.2
   ```
2. Run:
   ```bash
   npm run typecheck
   npm run web:export
   ```
3. Smoke the welcome screen on mobile viewport.
4. Show the candidate to the human reviewer only after the QA gate passes.
