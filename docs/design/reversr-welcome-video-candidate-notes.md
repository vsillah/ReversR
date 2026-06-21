# ReversR Welcome Video Candidate Notes

## Candidate 2026-06-20: Kling Metal-To-Teal

Status: packaged into the app welcome flow for branch review.

## Candidate 2026-06-21: Explicit Frame-Control Retry

Status: setup prepared; live run not yet completed.

### What Changed

- Switched away from the freeform prompt-only composer path.
- Confirmed that Higgsfield exposes dedicated `START FRAME` and `END FRAME` slots on `Kling 3.0`.
- Built a local frame packet to force the metallic `R` identity and the structural open/closed states:
  - `/private/tmp/reversr-higgsfield-framepack/reversr-clean-base-v1.png`
  - `/private/tmp/reversr-higgsfield-framepack/reversr-start-frame-v6.png`
  - `/private/tmp/reversr-higgsfield-framepack/reversr-end-frame-v6.png`
  - `/private/tmp/reversr-higgsfield-framepack/reversr-framepack-sheet-v6.png`
- Verified a temporary fallback path using already-uploaded project assets:
  - start: `b038c245-b27a-435b-b5a5-5f6caed957cf.png`
  - end: `e104fc52-207a-48e7-9cb0-c039780feee4.png`

### Live Setup Snapshot

- Model: `Kling 3.0`
- Aspect: `9:16`
- Resolution: `720p`
- Duration target for validation: `5s`
- Multi-shot: `Off`
- Prompt mode: motion-only, with the identity carried by the frame slots rather than extra prompt references

### Current Blocker

- Higgsfield repeatedly fell into a Chrome `Page Unresponsive` state while the duration popover remained active.
- The explicit frame workflow is now the correct production path, but the first validation render was not cleanly launched from this session because the page became unstable before the final `Generate` action could be confirmed.

### Prompt Corrections After Live Account Review

- The live prompt had drifted into over-specific machining language such as `center circle`, `outer circle`, and multiple machine actions.
- That wording encourages the model to reinterpret the approved `R` as a circular coin or monogram instead of preserving the asymmetrical silhouette from the frame slots.
- The revised prompt now does three things:
  - tells the model to preserve the exact start/end-frame silhouette and never become circular
  - treats the main R body as fixed and the left caliper jaw as the primary moving part
  - limits teal to the existing inset channels already present in the end frame

## Candidate 2026-06-21: bac3cd62 Frame-Control Test

Source file: `/Users/vambahsillah/Downloads/hf_20260621_024656_bac3cd62-b8c3-4239-b34e-1bc87a69a799.mp4`

Status: rejected after motion review.

### Observed Failures

- The `R` reshapes before the torque drill reaches the knob. The top-left structure visibly morphs during approach instead of holding the start frame.
- The metal brightens to brushed silver on its own before the causal assembly beat is complete.
- Teal appears while the tool is still active, which weakens the intended sequence.

### Prompt Implications

- The next prompt must explicitly freeze the start state until tool contact.
- The next prompt must prohibit any pre-contact geometry change.
- The next prompt must prohibit autonomous metal brightening before full closure.
- The next prompt must make the event order explicit:
  1. stable dark matte start frame
  2. tool approach
  3. tool contact
  4. jaw closure
  5. brushed-metal transition
  6. teal reveal

## Source Files

- Approved candidate video: `/private/tmp/reversr-higgsfield/reversr-kling-metal-teal-glow.mp4`
- In-app smoke reference: `/private/tmp/reversr-higgsfield/welcome-metal-teal-smoke.png`
- Anchor still: `/private/tmp/reversr-higgsfield/reversr-hero-still-anchor.png`

## Generation Inputs

- Logo reference upload: `1bcb3775-5a68-4a54-b78b-c31e9468a908`
- Inert hero still job: `28930df2-f244-498b-b418-ddd5ad2187eb`
- Selected video candidate job: `e8904ade-c93f-48b6-a95e-a7cd0bc1a6bb`
- Previous packaged candidate job: `9fcb3b20-5da5-4998-86de-ada3cd46d3b9`
- Rejected zoom/glow-only variant job: `e657be03-654e-48d7-bc39-ce7de7e81631`
- Image model: `nano_banana_2`
- Video model: `kling3_0`
- Video mode: `std`
- Duration: 8 seconds
- Sound: off
- Poster timestamp: `0.1`

## Why This Candidate Was Chosen

- Preserves an inert, dark opening frame with no text, no people, and no early teal reveal.
- Uses a real machine-shop environment with spindle/lathe context rather than an abstract animation.
- Shows the dark/matte machined blank turning into shiny brushed metal before teal appears.
- Shows a torque-driver action at the center knob after the metal finish is established.
- Injects teal into the center ring and diagonal channel after the logo becomes shiny metal.
- Delays the teal glow until late in the clip and holds the finished mark.
- Keeps the lower part of the frame comparatively quiet for native app copy and CTA.

## Known Limitations

- Higgsfield generated the source at `716x1284`, below the preferred production resolution.
- The packaging script normalized the app asset to `1080x1920`, H.264, yuv420p, no audio.
- The caliper geometry is recognizable but should still be judged by human review before treating this as final brand creative.
- The current candidate does not clearly show the left structural half and right structural half torquing together; the center tool spins, but the hero closure beat is still missing.
- Veo 3.1 was the preferred model but required a Pro/Ultimate Higgsfield plan on this account.
- The final push-in is present but restrained; the material transformation is stronger than the camera move.

## App Asset Handoff

- Video: `assets/welcome/reversr-welcome-intro.mp4`
- Poster: `assets/welcome/reversr-welcome-poster.png`

The packaged app asset should be reviewed in the welcome preview before final approval.

## Validation

- Packaged with `npm run welcome:asset:package -- /private/tmp/reversr-higgsfield/reversr-kling-metal-teal-glow.mp4 --poster-at 0.1`
- Local web preview verified on `http://localhost:5001`
- Browser smoke confirmed the welcome video was playing at runtime with `currentTime > 7s` and `paused = false`
