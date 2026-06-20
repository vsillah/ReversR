# ReversR Welcome Video Prompt Package

## Reference Assets

Generate or assemble these stills before opening Higgsfield video generation. Do not start from text-only video.

| # | Still | Purpose |
|---|---|---|
| R1 | Hero end-frame: fully assembled brushed-steel caliper-R logo centered on a dark factory/studio backdrop, teal accent glowing at low intensity, lower 40% intentionally quiet for native UI. | Defines the target final frame and app-safe overlay area. |
| R2 | Mid-assembly: caliper jaws partially closed around the diagonal leg, center bolt visible but not seated, knob clearly visible. | Anchors logo geometry and construction beat. |
| R3 | Wide factory establishing still: premium machine shop with CNC mill, lathe spindle, torque driver, clamp fixture, gantry rail, brushed steel workbench, and controlled lighting. | Prevents drift into generic sci-fi or abstract backgrounds. |
| R4 | Knob macro: close-up of knurled steel calibration knob with teal index marker at the center of the caliper. | Anchors the required spinning knob moment. |
| R5 | Logo identity reference: `assets/logo-transparent.png`. | Keeps the model from inventing a new logo concept. |

R1, R2, and R5 are required. R3 and R4 are strongly recommended.

## Higgsfield Setup

- Mode: image-to-video.
- Source references: R1 or R2 as the visual seed, R5 as the logo identity reference.
- Camera: slow dolly-in, subtle orbit no more than 25-30 degrees, optional macro rack focus.
- Duration: 7-8 seconds.
- Aspect: 9:16.
- No audio.
- Generate variants by changing one variable at a time: camera move, lighting, machine framing, or knob timing.

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
A 7-second cinematic vertical 9:16 product reveal set inside a dark premium precision machine shop. Brushed steel surfaces, soft overhead key light, low teal rim light, no people.

On a polished steel platen at center frame, standard manufacturing machines assemble a single brushed-steel caliper-shaped R mark from separate machined parts. Two caliper jaws slide in from the sides. A diagonal machined leg locks between them. A central hex bolt drops vertically and seats with a quiet mechanical click. A knurled steel calibration knob at the center of the caliper then rotates one quarter turn, closing the jaws to their final spacing and locking the mark's geometry.

The instant the knob completes its turn, a thin teal-blue accent ring and the diagonal slot ignite with controlled luminescent light, pulse once softly, and hold steady. Final 3 seconds: camera settles dead-center on the finished brushed-steel caliper-R mark, lower 40 percent of frame intentionally empty and low-contrast for native app UI overlay.

Camera: slow 25-degree lateral orbit combined with a gentle dolly-in, finishing locked center. Cinematic macro detail on the bolt seat and knob knurl. Shallow depth of field on machine parts, sharp on the logo at the end.

Style: premium precision engineering, realistic brushed metal, controlled teal-blue accent only, deep blacks, no neon, no sparks, no smoke, modern mobile app intro, photoreal.
```

## Shot Variants

### Variant A: Precision Assembly

Best first pass.

- Seed: R1 end-frame.
- Camera: subtle lateral orbit plus slow dolly-in.
- 0.0-1.5s: factory environment establishes, parts staged on precision platen.
- 1.5-3.0s: jaws slide in, diagonal leg locks, bolt drops and seats.
- 3.0-4.0s: center knob rotates one quarter turn, caliper jaws close to final spacing, teal accent ignites.
- 4.0-7.0s: camera settles centered, glow pulses once, hold.

### Variant B: Center Knob Calibration

Most premium if the knob action lands.

- Seed: R2 mid-assembly plus R4 knob macro.
- Camera: locked macro on knob, then rack-focus pull to finished logo.
- 0.0-2.0s: macro on knurled knob as the machine head approaches.
- 2.0-4.0s: torque driver rotates knob, jaws complete closure, glow ignites.
- 4.0-7.0s: held wide on finished logo.

### Variant C: Conveyor Reveal

Most factory-forward, highest drift risk.

- Seed: R3 establishing still plus R1 end-frame.
- Camera: slow dolly down conveyor/assembly line.
- 0.0-2.5s: parts travel toward assembly station.
- 2.5-4.2s: press seats parts, jaws clamp, knob turns, logo resolves.
- 4.2-7.0s: hold centered.

## Negative Prompt

Paste this into the negative field.

```text
text, letters, captions, subtitles, watermark, logo text, brand name, typography, fake UI, buttons, menus, status bar, phone mockup, human, hand, finger, face, body, robot arm as the only machine, sci-fi, holograms, neon signs, glitch, lens flare overload, sparks, flames, smoke, dust storm, debris, gears, cogs, clockwork, steampunk, warped letters, distorted logo, multiple logos, alternate logo, deformed parts, cluttered factory, messy workshop, oil stains, rust, grime, cartoon, illustration, low-poly, plastic look, chromatic aberration, heavy film grain, vignette, blur on final logo
```

## Output Specs

- Aspect: 9:16.
- Duration: 7.0 seconds preferred; 7-8 seconds acceptable.
- Resolution: 2160 x 3840 preferred; 1080 x 1920 minimum.
- Frame rate: 30 fps preferred.
- Codec: H.264, yuv420p, faststart.
- Audio: none. Strip audio track entirely.
- MP4 budget: target 6-8 Mbps, under 4 MB if possible.
- Poster: PNG from final hold frame, ideally at or after 6.0s.

## Review Checklist

Reject the candidate if any item fails.

- Logo identity matches `assets/logo-transparent.png`.
- No invented R shape, alternate mark, or second logo.
- Assembly resolves to a stable logo by 4.0s.
- Logo holds clean and motion-stable from 4.5s to 7.0s.
- Center knob visibly spins or is visibly turned by a machine.
- Caliper jaws visibly adjust or lock.
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
2. If needed, re-encode:
   ```bash
   ffmpeg -i in.mp4 -c:v libx264 -profile:v high -pix_fmt yuv420p \
     -movflags +faststart -an -b:v 6M \
     assets/welcome/reversr-welcome-intro.mp4
   ```
3. Re-export poster:
   ```bash
   ffmpeg -ss 6.2 -i assets/welcome/reversr-welcome-intro.mp4 \
     -frames:v 1 -update 1 assets/welcome/reversr-welcome-poster.png
   ```
4. Check `components/WelcomeIntroScreen.tsx`.
   - Brand reveal currently starts at 4200ms.
   - CTA reveal currently starts at 4700ms.
   - If the final video resolves earlier/later, adjust those delays so native UI appears after assembly stabilizes.
5. Run:
   - `npm run typecheck`
   - mobile/web intro smoke
   - `npm run web:export`
6. Commit the final MP4, poster, timing adjustment if needed, and prompt/evidence note together.

