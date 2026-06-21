# ReversR Welcome Video: Higgsfield Production Brief

## Objective

Create a premium 9:16 welcome video for ReversR that plays before the Home screen. The video should feel like a real factory production shot: standard manufacturing machines visibly torque the left and right structural halves of the ReversR caliper-R logo together, then the center knob locks the mark before the final brand lockup appears in native app UI.

The current committed MP4 is the approved metal-to-teal welcome candidate for app review. It proves playback, timing, bundling, and fallback behavior in the app while preserving the selected factory composition.

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

- **Video identity reference:** `/private/tmp/reversr-higgsfield/reversr-hero-still-anchor.png`
  - Use this still as the canonical welcome-video identity source.
  - It reflects the approved factory composition and updated metal mark used in the packaged candidate.
  - Do not use `assets/logo-transparent.png` for video generation until a newer standalone transparent logo export is staged into the repo.

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
2. Upload `/private/tmp/reversr-higgsfield/reversr-hero-still-anchor.png` as the primary identity and composition reference.
3. Keep `/private/tmp/reversr-higgsfield/reversr-kling-metal-teal-glow-contact.png` or `/private/tmp/reversr-higgsfield/reversr-packaged-metal-teal-contact.png` alongside the run for frame-sequence review.
4. In Higgsfield, start from the explicit frame-control workflow instead of the freeform composer:
   - model: `Kling 3.0`
   - use the dedicated `START FRAME` and `END FRAME` slots
   - avoid relying on prompt-only asset references for the first validation pass
5. Frame packet for the current lane:
   - clean fixture base: `/private/tmp/reversr-higgsfield-framepack/reversr-clean-base-v1.png`
   - preferred start anchor: `/private/tmp/reversr-higgsfield-framepack/reversr-start-frame-v6.png`
   - preferred end anchor: `/private/tmp/reversr-higgsfield-framepack/reversr-end-frame-v6.png`
   - side-by-side review sheet: `/private/tmp/reversr-higgsfield-framepack/reversr-framepack-sheet-v6.png`
6. If Higgsfield blocks local-frame upload or the page becomes unstable, use the already-uploaded project assets as a temporary fallback for one validation pass:
   - `b038c245-b27a-435b-b5a5-5f6caed957cf.png` as the start frame
   - `e104fc52-207a-48e7-9cb0-c039780feee4.png` as the end frame
7. Set output to vertical 9:16, no audio, 5 seconds for the first structural test pass and 7-8 seconds only after the closure beat works.
8. First run one constrained variant only:
   - locked or nearly locked camera
   - visible left half and right half with a clear starting gap
   - center-knob torque visibly closes that gap
   - teal appears only after closure
9. Claude rejects the candidate immediately if the first 3-4 seconds do not show the two halves and their visible closure. Also reject immediately if the logo collapses toward a circular coin, monogram, or full-ring emblem, if the geometry morphs before tool contact, if the metal turns brushed silver before closure is earned, or if teal appears while the tool is still touching the knob. Only then should secondary variants be explored.
10. Codex performs technical QA against the acceptance criteria before bringing the candidate to human review.
11. Export the final MP4, an inert opening poster frame for the pre-play state, and a final-hold still for review.
12. Replace `assets/welcome/reversr-welcome-intro.mp4` and `assets/welcome/reversr-welcome-poster.png`.
13. Run `npm run typecheck`, app smoke, and `npm run web:export`.

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
- Poster frame: PNG from the inert opening frame, before teal ignition.
- Review still: PNG from the final hold frame.
- No generated text, subtitles, labels, UI, or watermarks.

## Timeline

- **0.0-1.0s:** Establish a dark precision factory bay. The left caliper-jaw half and the right rounded R-body half sit in a fixture with a clear visible gap between them. Native title/tagline are not visible yet.
- **1.0-4.0s:** A torque driver engages the center knob. The viewer must clearly see the left half move inward and the right half seat into final alignment. The gap visibly closes to zero because of the knob torque.
- **4.0-5.2s:** The completed logo locks flush into position. The metal brightens from matte dark machined steel to polished brushed steel.
- **5.2-6.2s:** Blue-teal center ring and diagonal slot appear only after closure and pulse once with controlled luminescence.
- **6.2-7.5s:** Camera settles into the final hold. Native app title, subtitle, tagline, and CTA fade in over the video.

## Acceptance Criteria

The output is usable only if:

- It looks like a real premium manufacturing scene, not a vector animation or generic tech background.
- Standard manufacturing machines are visible and purposeful: CNC head, lathe spindle, torque driver, robotic arm, clamp fixture, or gantry rail.
- At the start, the left half and right half of the logo are visibly separate with a clear gap.
- The center knob visibly spins to adjust or lock the caliper.
- The knob torque visibly causes the two halves to move together and close the gap.
- The ReversR logo remains recognizable as the approved brushed-steel caliper-R used in the selected metal-to-teal candidate.
- The asymmetrical `R` silhouette remains intact; the model must not reinterpret the mark as a centered circular emblem.
- Before the torque tool touches the knob, the logo remains visually stable in the dark matte start state.
- Caliper jaws, center knob, and teal accents are readable on mobile.
- The two halves seat flush before teal appears.
- The brushed-steel transition happens only after closure, not autonomously during approach.
- The torque tool retracts enough for the closure and payoff to remain readable; it does not dominate the final silver/teal beats.
- The blue-teal glow is controlled and material-aware, not neon decoration.
- No generated text, fake UI, labels, subtitles, or watermark appear.
- The native title/tagline only appear after the logo is assembled.
- The lower area remains clean enough for the native CTA.
- The opening poster is strong enough to use before playback without revealing the final teal payoff.
- A still frame from the final hold is strong enough to use in review notes.
