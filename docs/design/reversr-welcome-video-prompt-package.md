# ReversR Welcome Video Prompt Package

## Reference Assets

Generate or assemble these stills before opening Higgsfield video generation. Do not start from text-only video.

| # | Still | Purpose |
|---|---|---|
| R1 | Hero end-frame: fully assembled brushed-steel caliper-R logo centered on a dark factory/studio backdrop, teal accent glowing at low intensity, lower 40% intentionally quiet for native UI. | Defines the target final frame and app-safe overlay area. |
| R2 | Mid-assembly: caliper jaws partially closed around the diagonal leg, center bolt visible but not seated, knob clearly visible. | Anchors logo geometry and construction beat. |
| R3 | Wide factory establishing still: premium machine shop with CNC mill, lathe spindle, torque driver, clamp fixture, gantry rail, brushed steel workbench, and controlled lighting. | Prevents drift into generic sci-fi or abstract backgrounds. |
| R4 | Knob macro: close-up of knurled steel calibration knob with teal index marker at the center of the caliper. | Anchors the required spinning knob moment. |
| R5 | Logo identity reference: `/private/tmp/reversr-higgsfield/reversr-hero-still-anchor.png`. | Keeps the model tied to the approved welcome-video logo geometry and factory composition. |

R1, R2, and R5 are required. R3 and R4 are strongly recommended.

Do not use `assets/logo-transparent.png` for welcome-video generation until a newer standalone transparent logo export replaces it in the repo. That file drifted from the approved video identity.

## Higgsfield Setup

- Mode: image-to-video.
- Source references: R1 or R2 as the visual seed, R5 as the logo identity reference.
- First pass camera: mostly locked frontal three-quarter product view with a very slow push-in only.
- Duration: 7-8 seconds.
- Aspect: 9:16.
- No audio.
- First retry strategy: change one variable at a time only after the closure beat works. Do not spend credits on macro inserts, orbit, or extra assembly beats before the left/right closure is visible.

Recommended model:

- Veo 3.1 or Kling 3.0 for cinematic realism and controlled machinery.
- Seedance 2.0 only if logo adherence beats movement quality in testing.

Avoid:

- Talking-head/avatar modes.
- Fast social presets.
- Text/logo generation modes that invent wordmarks.

## Primary Mobile Prompt

Use for Variant A.

```text
8-second vertical 9:16 cinematic product shot in a premium precision machine shop. Photoreal brushed steel, dark fixture bed, CNC tooling, no people, no text.

Show the approved ReversR metal logo as two separate machined structural halves on a clamp fixture:
1. a left caliper-jaw half,
2. a right rounded R-body half.
At the start, there is a clear physical gap between the left half and the right half. They are not touching. The center knob is visible but the logo is not yet locked.

Main action:
A torque driver engages the center knob. As the knob turns, the mechanism visibly pulls the left half inward and seats the right half into final alignment. The viewer must clearly see the two halves move together and mechanically close the gap. This closure is the hero moment. The knob rotation causes the closure. The halves lock flush into one finished ReversR mark.

Only after the halves fully close and lock:
the brushed steel finish brightens from matte dark machined metal to polished brushed metal,
then the teal accent appears inside the center ring and diagonal slot,
then the teal gives one restrained glow pulse and holds steady.

Camera:
mostly locked frontal three-quarter product view, very slow push-in only, no orbit that hides the closure, no cutaways, no macro insert, no second angle.

Composition:
logo centered, fixture visible, premium machine context in soft focus behind, lower 35 to 40 percent of frame kept clean and dark for app UI overlay during the final hold.

Style:
real factory cinematography, premium industrial commercial, believable machining hardware, controlled reflections, shallow depth of field, crisp metal edges.
```

## Shot Variants

### Variant A: Precision Assembly

Best first pass. This is the only recommended next credit burn until the closure beat works.

- Seed: R1 end-frame plus R5 identity reference.
- Camera: locked or nearly locked product shot, very slow push-in only.
- 0.0-1.5s: factory environment establishes, left half and right half are visibly separate with a clear gap.
- 1.5-4.0s: torque driver engages the center knob; the left half travels inward and the right half seats into place; the gap visibly shrinks to zero.
- 4.0-5.2s: the halves lock flush; brushed metal brightens from matte dark to polished steel.
- 5.2-7.0s: teal appears only after closure, pulses once softly, then holds.

### Variant B: Center Knob Calibration

Use only if Variant A already shows a correct visible left/right closure.

- Seed: R2 mid-assembly plus R4 knob macro.
- Camera: slightly tighter framing on the knob and gap, but still wide enough to clearly show both logo halves closing.
- 0.0-2.0s: machine head approaches; clear gap remains visible.
- 2.0-4.0s: torque driver rotates knob; the two halves close and lock flush.
- 4.0-7.0s: polished metal, then teal ignition, then final hold.

### Variant C: Conveyor Reveal

Defer. Highest drift risk and not recommended until the core closure action is solved.

- Seed: R3 establishing still plus R1 end-frame.
- Camera: minimal travel only if the closure action remains obvious.
- 0.0-2.5s: parts stage on the line.
- 2.5-4.2s: left half and right half close through center-knob torque.
- 4.2-7.0s: hold centered.

## Negative Prompt

Paste this into the negative field.

```text
text, letters, captions, subtitles, watermark, logo text, brand name, typography, fake UI, buttons, menus, status bar, phone mockup, human, hand, finger, face, body, robot arm as the only machine, sci-fi, holograms, neon signs, glitch, lens flare overload, sparks, flames, smoke, dust storm, debris, gears, cogs, clockwork, steampunk, warped letters, distorted logo, multiple logos, alternate logo, deformed parts, cluttered factory, messy workshop, oil stains, rust, grime, cartoon, illustration, low-poly, plastic look, chromatic aberration, heavy film grain, vignette, blur on final logo, abstract assembly, floating parts, shape morphing, generic circular monogram, invented logo geometry, early teal glow, hidden closure, cutaway to another angle before the two halves lock
```

## Output Specs

- Aspect: 9:16.
- Duration: 7.0 seconds preferred; 7-8 seconds acceptable.
- Resolution: 2160 x 3840 preferred; 1080 x 1920 minimum.
- Frame rate: 30 fps preferred.
- Codec: H.264, yuv420p, faststart.
- Audio: none. Strip audio track entirely.
- MP4 budget: target 4-6 Mbps, under 4 MB if possible.
- Poster: PNG from the inert opening frame, ideally around 0.1s, before teal ignition.
- Review still: PNG from final hold frame, ideally at or after 6.0s.

## Review Checklist

Reject the candidate if any item fails.

- Logo identity matches the approved hero/reference still package used for the run.
- No invented R shape, alternate mark, or second logo.
- At 0.5s, the left half and right half are clearly readable as separate structural bodies.
- By 3.0-4.0s, the gap between the two halves visibly shrinks because of center-knob torque.
- Assembly resolves to a stable logo by 4.0s.
- Logo holds clean and motion-stable from 4.5s to 7.0s.
- Center knob visibly spins or is visibly turned by a machine.
- Caliper jaws visibly adjust or lock.
- The two halves visibly seat flush into one structure before teal appears.
- Factory background reads premium and minimal, not cluttered or unsafe.
- No generated text, subtitles, fake UI, watermark, or human body parts.
- Teal accent is a thin controlled glow, not broad neon decoration.
- Final lower 40% is dark and low-contrast for the app CTA.
- First frame is dark enough to start without a flash.
- Loop point is not visually jarring.

## App Handoff

After a candidate passes review:

1. Replace:
   - `assets/welcome/reversr-welcome-intro.mp4`
   - `assets/welcome/reversr-welcome-poster.png`
2. Preferred packaging command:
   ```bash
   npm run welcome:asset:package -- /path/to/higgsfield-candidate.mp4 --poster-at 0.1
   ```
3. To validate without changing app assets:
   ```bash
   npm run welcome:asset:package -- /path/to/higgsfield-candidate.mp4 --poster-at 0.1 --dry-run
   ```
4. Manual fallback if needed:
   ```bash
   ffmpeg -i in.mp4 -c:v libx264 -profile:v high -pix_fmt yuv420p \
     -movflags +faststart -an -b:v 4M \
     assets/welcome/reversr-welcome-intro.mp4
   ```
5. Re-export poster manually:
   ```bash
   ffmpeg -ss 0.1 -i assets/welcome/reversr-welcome-intro.mp4 \
     -frames:v 1 -update 1 assets/welcome/reversr-welcome-poster.png
   ```
6. Check `components/WelcomeIntroScreen.tsx`.
   - Brand reveal currently starts at 4200ms.
   - CTA reveal currently starts at 4700ms.
   - If the final video resolves earlier/later, adjust those delays so native UI appears after assembly stabilizes.
7. Run:
   - `npm run typecheck`
   - mobile/web intro smoke
   - `npm run web:export`
8. Commit the final MP4, poster, timing adjustment if needed, and prompt/evidence note together.
