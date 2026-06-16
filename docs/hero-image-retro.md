# ReversR Hero Image Retro

## Why this took longer than it should have

The work started as a visual polish task, but the real problem changed several times:

1. The original hero asset was too dark and too tightly framed.
2. The replacement asset was generated correctly, but the web render path made it look missing.
3. Once the asset rendered, the framing was still wrong.
4. Once the framing was corrected, the copy still spilled into the image field.

We lost time because those looked like one problem from the UI, but they were four different problems.

## What actually failed

### 1. Asset quality was the first blocker

The original Canva render was too dark, too atmospheric, and too crop-sensitive for the split hero.

Symptoms:
- the machine did not read clearly on mobile
- crop changes only exposed more empty atmosphere
- layout tuning produced diminishing returns

Lesson:
- when the subject is not legible at thumbnail size, stop adjusting layout and regenerate the source image

### 2. React Native Web hid the asset even though it was loaded

The image was present in the DOM and the asset URL resolved correctly, but the hero still looked black.

What happened:
- the React Native Web `Image` treatment ended up visually behind the hero base layer
- the browser showed the asset URL, but the rendered image was effectively invisible

Fix:
- for web, switch the hero image to an explicit background-image layer
- resolve the asset through `expo-asset`
- verify final computed `backgroundImage`, `backgroundPosition`, `backgroundSize`, and layer order in the browser

Lesson:
- if an asset appears "loaded but invisible," inspect the live DOM and computed styles before doing more crop or spacing work

### 3. The wrong Canva variant was being used

The first generated Canva option was safer for seam blending, but it did not preserve the full machine.
The second option was the right answer once the goal became "show the whole machine."

Lesson:
- choose the asset based on the final composition goal, not just on general aesthetics
- for a right-side product hero:
  - use the variant with the clearest intact silhouette
  - do not prioritize drama over object readability

### 4. Copy and composition had to be solved together

Even after the machine rendered correctly, the supporting line still drifted into the image field.

What worked:
- shorten the line
- stop repeating the headline
- use a line that introduces a different idea

Final accepted copy:
- `Start with what you see.`

Lesson:
- when the hero composition is tight, copy must be treated as a layout variable, not just content

## Reusable workflow for next time

### Phase 1: Decide whether this is an asset problem or a layout problem

Before editing layout repeatedly, ask:
- Is the subject clearly readable in the raw image?
- Does the silhouette survive a narrow mobile crop?
- Does the image still look good at thumbnail size?

If no:
- regenerate the image first

If yes:
- proceed to layout tuning

### Phase 2: Validate the live render path immediately

On web:
- confirm the asset is present in the DOM
- inspect computed styles, not just JSX
- verify layer order and background/image behavior

For React Native Web hero images:
- do not assume native `Image` behavior will match the browser result
- if the image is loaded but not visually present, switch to an explicit web background-image treatment

### Phase 3: Tune composition in this order

1. Asset choice
2. Visible subject size
3. Subject position
4. Text-column width
5. Seam blending
6. Supporting copy length

This order matters. We spent time adjusting lower-level details before locking the right asset and render path.

### Phase 4: Validate on the actual local target

Use the live local surface, not just code review:
- reload the target page after every meaningful hero change
- inspect the exact browser the user is looking at
- capture screenshots while iterating

For this repo, the critical check was:
- `http://localhost:5003`

## Canva prompt guidance that worked

The useful prompt direction was:
- premium industrial product render
- portrait
- right-side split hero usage
- slightly zoomed out
- darker left-edge negative space
- brighter separation between subject and background
- legible at small mobile sizes

What to avoid:
- cinematic prompts that over-prioritize atmosphere
- prompts that crop the object too aggressively
- assets that put the machine too low in frame

## Known-good implementation pattern

For the current ReversR home hero:
- use a dark text panel on the left
- use the machine render as the right-side image field
- soften the seam with a wide gradient band, not a hard vertical edge
- keep the full machine in frame
- keep supporting copy short enough to stay inside the left column

## What to do faster next time

1. Generate 3-4 candidate hero assets immediately.
2. Compare them at thumbnail size before wiring any one of them into code.
3. Test web rendering behavior right away.
4. If the image is invisible but present, inspect computed styles before changing layout.
5. Treat hero supporting copy as part of composition, not as a final garnish.

## Final takeaway

This was not one bug.

It was:
- asset selection
- web rendering behavior
- composition tuning
- copy tuning

The next time we face a "hero image problem," we should classify which of those four layers is actually failing before we start iterating.
