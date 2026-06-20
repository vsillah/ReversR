# ReversR Welcome Video Production Checklist

## Current Asset Status

- `assets/welcome/reversr-welcome-intro.mp4` is a wiring proof only.
- `assets/welcome/reversr-welcome-poster.png` is a poster proof only.
- The local generator verifies playback, app timing, bundling, and fallback behavior.
- The approved cinematic creative must be generated through Claude-led Higgsfield image-to-video production.

## Claude Creative Lead Decision

The local FFmpeg MP4 stands as wiring proof only. It confirms the asset loads, sizes, and plays inside onboarding. It is not the creative and gets retired the moment Higgsfield delivers.

Final creative is generated through Higgsfield image-to-video. Codex does not touch the creative layer. Codex picks up downstream, after a take is locked, to validate specs and package derivatives.

Creative north star: a single continuous precision-assembly beat. The ReversR mark is manufactured on a premium shop floor - clamped, aligned, torqued - and ignites a controlled teal only on the final turn. Roughly 6-8 seconds. One idea, executed cleanly. Everything in the packet serves that beat.

## Reference Still Direction

One hero still seeds the run. Build it first, lock it, generate everything from it.

Frame: low three-quarter angle across a CNC mill bed. A brushed-aluminum clamp fixture holds a matte-black ReversR mark blank at center. Lathe spindle and gantry rail sit in soft-focus depth behind. Caliper jaws stage left, open, parked at the edge of the mark.

Lighting: cool gray key from camera-left, single warm rim raking the metal edges, shop haze catching the falloff. Shallow depth of field, mechanism sharp, environment dissolving.

Material truth: oil sheen, fine machining lines, micro-scratches, a faint coolant film on the bed. The metal has to read manufactured, not rendered.

Critical rule: the still is inert. The mark is dark. No teal anywhere in the reference frame. Teal exists only as the motion payoff. If Higgsfield's end-frame control is available, build a second still identical to the first but with the mark glowing teal from inside the seams, and feed it as the terminal frame. If not, the glow is driven by the motion prompt and lands on the final torque.

## Higgsfield Image-To-Video Setup

Seed: the inert hero still from the reference direction. Use the same seed across every variant of the same shot so motion is the only thing changing.

Motion direction held constant across the run: torque driver descends onto the center knob and spins it down, caliper jaws travel inward and close flush against the mark, teal ignites from the clamp seam on the last quarter-turn and settles into a steady controlled glow. The driver and jaws carry the eye; the gantry and spindle stay parked in soft focus so nothing competes with the assembly.

Settings: 6-8 second duration, 24fps for mechanical weight, slow push-in on the mark, motion strength tuned mid - enough to drive the torque and jaw travel without smearing the machining detail. Camera moves a few degrees only; the mechanism does the work, not the lens.

Teal discipline: glow is suppressed until the final turn. Prompt the ignition to the last quarter-turn of the knob, then hold steady. No flicker, no early bleed, no ambient teal in the shop. Controlled means controlled.

## Variant Run Order

1. **Anchor.** Hero still, full motion direction as written. This is the baseline every other variant is judged against.
2. **Timing shift.** Same seed, delay the teal ignition another beat later so glow lands closer to the jaws closing flush. Tests whether a later payoff hits harder.
3. **Motion strength down.** Same seed, lower motion strength. Buys sharper machining detail and a heavier, more deliberate torque at the cost of travel range.
4. **Camera variant.** Same seed, kill the push-in, hold a locked frame. Tests whether stillness makes the mechanism read more premium.
5. **Glow extent.** Same seed, ignition from seams across the full mark instead of the clamp seam alone. Tests reveal coverage on the final turn.

Run the anchor first and review before launching variants 2-5. If the anchor's motion or teal timing is off, fix it on the anchor before spending runs on variants.

## Iteration Rules

Change one variable per run. Seed, motion direction, timing, motion strength, camera, glow extent - move one, hold the rest. A run that changes two teaches nothing.

Lock the seed across a shot family. New seed only when the hero still itself is rebuilt.

If a variant smears the machining lines or bleeds teal early, it is rejected. Three failed runs on the same variable means the still is wrong; go back to the reference still and rebuild before generating again.

Pick the take on the assembly beat and the teal payoff, not on incidental background motion. Best torque-and-ignite wins.

## Required Exports

For each candidate Claude selects for Codex QA, export:

- MP4 candidate, preferably 2160x3840 or at least 1080x1920.
- Poster frame from the inert open, with the mark dark and no teal.
- Still/contact sheet with frames around 0s, 2s, 4s, and the final hold.
- Candidate notes:
  - model used,
  - references used,
  - prompt variant,
  - known issues,
  - whether another iteration is recommended.

## Codex QA Gates

Codex runs only after a Higgsfield take is locked. All gates must pass:

- **Container.** MP4, H.264, no audio, 6-8s duration, even-dimension resolution matching the onboarding asset slot.
- **First frame.** Inert: mark dark, zero teal. A teal-at-open frame fails the gate.
- **Last frame.** Controlled teal present and steady, no flicker on the hold.
- **Loop seam.** If onboarding loops, first and last frames reconcile without a visible jump.
- **Color/levels.** Teal hue consistent with the brand value, no clipping in the glow, blacks retain machining detail.
- **Integration.** Plays in the onboarding slot at correct size, no aspect distortion, no dropped frames.
- **Generated content.** No generated text, fake UI, subtitles, watermark, invented brand wording, people, hands, or unrelated machinery clutter.
- **Logo identity.** The final mark remains recognizable as the approved brushed-steel caliper-R, with readable caliper jaws and center knob.

Any fail bounces back to creative. Codex does not patch the creative locally to force a pass.

## Export Handoff

Codex packages from the locked Higgsfield master:

- **Master.** Full-res H.264 MP4, original duration, archived as source of truth.
- **Onboarding deliverable.** Sized and encoded for the in-app slot, even dimensions, optimized bitrate for load.
- **Poster frame.** Single still pulled from the inert open - dark mark, no teal - for the pre-play state.
- **Loop build.** Trimmed at the reconciled seam if a looping variant is required.

Naming and slot path follow the onboarding asset convention already wired in the proof build. Codex confirms the deliverable drops into the same path the proof MP4 occupied, then closes the handoff.

## App Packaging

After a candidate passes QA:

1. Run:
   ```bash
   npm run welcome:asset:package -- /path/to/higgsfield-candidate.mp4 --poster-at 0.1
   ```
2. Run:
   ```bash
   npm run typecheck
   npm run web:export
   ```
3. Smoke the welcome screen on a mobile viewport.
4. Show the candidate to the human reviewer only after the QA gate passes.
