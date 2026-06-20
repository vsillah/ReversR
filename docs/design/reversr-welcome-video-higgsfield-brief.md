# ReversR Welcome Video: Higgsfield Production Brief

## Objective

Create a premium 9:16 welcome video for ReversR that plays before the Home screen. The video should feel like a real factory production shot: standard manufacturing machines assemble the ReversR caliper-R logo, then the center knob spins to adjust the caliper before the final brand lockup appears in native app UI.

The current committed MP4 is a wiring placeholder only. It proves playback, timing, bundling, and fallback behavior in the app. It is not the approved final creative asset.

## Role Split

- **Claude Code:** creative lead for the generation run. Claude should translate the brief into the Higgsfield setup, manage variant strategy, decide which generation to iterate, and write the candidate notes.
- **Higgsfield AI:** final video generation tool. The approved creative must come from Higgsfield image-to-video or an equivalent cinematic video model, not from the local FFmpeg placeholder generator.
- **Codex:** technical QA and app integration only. Codex should package exported MP4s, validate dimensions/codec/timing, smoke the welcome screen, and reject candidates that fail this brief before showing them for human review.
- **Human review:** final taste/brand approval after Codex confirms the asset meets the objective requirements.

Do not present a local FFmpeg/programmatic render as the final cinematic creative. Local renders are acceptable only as wiring proofs or timing placeholders.

## Current App Integration

- Video path: `assets/welcome/reversr-welcome-intro.mp4`
- Poster path: `assets/welcome/reversr-welcome-poster.png`
- App component: `components/WelcomeIntroScreen.tsx`
- Placeholder generator: `npm run welcome:asset:generate`

The final production MP4 and poster should replace the two files above. No app code should need to change if the final file stays 9:16, H.264 MP4, muted, and text-free.

## Portfolio Process To Repeat

The Portfolio hero worked because it followed a production sequence instead of relying on text-only generation or code animation:

1. Create or select approved still reference assets first.
2. Use image-to-video so the model inherits the composition, lighting, material quality, and subject identity.
3. Use Cinema Studio or equivalent controls for camera, lens, and motion consistency.
4. Generate multiple shot variants, changing one variable per retry.
5. Keep all readable copy out of generated media; overlay final title/buttons natively in code.
6. Export a high-resolution loop plus a clean poster frame.
7. Judge the clip against written acceptance criteria before wiring it into the app.

## Required Reference Assets

Use these as the source package before generating video:

- **Logo identity reference:** `assets/logo-transparent.png`
  - Brushed steel caliper-R mark.
  - Blue-teal center ring and diagonal slot.
  - Keep this exact concept at all sizes.

- **Factory environment reference:** create a portrait still before video generation.
  - Dark premium factory bay, not a generic warehouse.
  - CNC mill, lathe spindle, robotic arm, gantry rail, clamp fixture, torque driver.
  - Brushed steel workbench and controlled overhead lighting.
  - No people, no text, no brand words.

- **Final hold reference:** still frame showing the completed ReversR logo locked into a fixture.
  - Center knob visible and readable.
  - Caliper jaws visible.
  - Teal accents glowing subtly.
  - Empty lower-safe area preserved for native CTA.

## Production Workflow

1. Claude reviews this brief and the prompt package, then prepares the exact Higgsfield run notes for the session.
2. Upload `assets/logo-transparent.png` as the primary identity reference.
3. Generate or upload the factory environment still as the composition reference.
4. In Higgsfield, use image-to-video first. Avoid text-only video generation.
5. Use Cinema Studio if available.
6. Set output to vertical 9:16, no audio, 7-8 seconds.
7. Generate three variants:
   - **A: Precision Assembly**: robotic arms and CNC head assemble logo parts.
   - **B: Center Knob Calibration**: logo is mostly assembled; torque driver spins the center knob and caliper jaws adjust.
   - **C: Quiet Premium Macro**: minimal camera movement, close-up machining detail, controlled teal glow.
8. Claude selects the strongest candidate or requests another Higgsfield iteration.
9. Codex performs technical QA against the acceptance criteria before bringing the candidate to human review.
10. Export the final MP4 and a poster frame from the final hold.
11. Replace `assets/welcome/reversr-welcome-intro.mp4` and `assets/welcome/reversr-welcome-poster.png`.
12. Run `npm run typecheck`, app smoke, and `npm run web:export`.

## Model Direction

Primary:

- **Veo 3.1** or **Kling 3.0** for realism, factory lighting, and controlled camera motion.

Alternate:

- **Seedance 2.0** if prompt adherence and logo consistency are stronger than cinematic movement.

Avoid:

- Fast social-video presets.
- Character/talking-avatar modes.
- Text/logo-generation modes that may invent fake wordmarks.

## Output Targets

- Mobile loop: 9:16, 7-8 seconds, no audio.
- Preferred production resolution: 2160 x 3840.
- Minimum acceptable app asset: 1080 x 1920.
- H.264 MP4, yuv420p, web/native compatible.
- Poster frame: PNG from the final hold frame.
- No generated text, subtitles, labels, UI, or watermarks.

## Timeline

- **0.0-1.0s:** Establish a dark precision factory bay. Logo parts sit in a fixture on a brushed steel workbench. Native title/tagline are not visible yet.
- **1.0-2.8s:** CNC head, gantry rail, and robotic arm move parts into place. Caliper jaws align. Motion is smooth and mechanical.
- **2.8-4.4s:** A torque driver or spindle lowers to the center. The center knob spins, tightening and calibrating the caliper. The jaws subtly adjust.
- **4.4-5.7s:** The completed logo locks into position. Blue-teal center ring and diagonal slot glow once with controlled luminescence.
- **5.7-7.5s:** Camera settles into the final hold. Native app title, subtitle, tagline, and CTA fade in over the video.

## Acceptance Criteria

The output is usable only if:

- It looks like a real premium manufacturing scene, not a vector animation or generic tech background.
- Standard manufacturing machines are visible and purposeful: CNC head, lathe spindle, torque driver, robotic arm, clamp fixture, or gantry rail.
- The center knob visibly spins to adjust or lock the caliper.
- The ReversR logo remains recognizable as the approved brushed-steel caliper-R.
- Caliper jaws, center knob, and teal accents are readable on mobile.
- The blue-teal glow is controlled and material-aware, not neon decoration.
- No generated text, fake UI, labels, subtitles, or watermark appear.
- The native title/tagline only appear after the logo is assembled.
- The lower area remains clean enough for the native CTA.
- A still frame from the final hold is strong enough to use as the poster.
