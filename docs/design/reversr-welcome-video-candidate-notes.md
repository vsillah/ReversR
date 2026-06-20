# ReversR Welcome Video Candidate Notes

## Candidate 2026-06-20: Kling Metal-To-Teal

Status: packaged into the app welcome flow for branch review.

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
