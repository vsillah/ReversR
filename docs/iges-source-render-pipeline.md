# IGES Source Render Pipeline

This lane proves the first source-backed CAD rendering slice for the supplied SolidWorks IGES package.

## Source Boundary

The IGES file is the only production/rendering input.

Approved fixture source:

- `/Users/vambahsillah/Downloads/Assem-1.IGS`
- expected SHA-256: `28a15d323c764878e7b41398bf51a46efb1ec98108c00f42e41072681e2fcf68`
- expected units: millimeters
- expected assembly subfigures: `bracket-1`, `isolator-1`

The matching JPG files are not read by the pipeline. They are not source inputs, renderer inputs, STL inputs, scoring inputs, or automated QA evidence. They may be used later only as optional human visual review aids.

## Shared Pipeline

Fixture and database-source-record modes share the same contract:

```text
source resolver -> IGES ingestion -> source validation -> scene assembly -> deterministic renderer -> STL exporter -> source-only confidence scorer
```

The only allowed difference is the resolver:

- controlled fixture resolver: binds the approved local fixture path
- database source-record resolver: binds an approved source-file record to the same path, hash, and preset

Everything after source resolution is shared code in `utils/igesSourcePipeline.js`.

## Implemented First Slice

- OpenCascade/WASM IGES import through `occt-import-js`
- millimeter unit inspection from the IGES global section
- assembly subfigure detection for `bracket-1` and `isolator-1`
- deterministic scene manifest with mesh counts, bounds, triangle counts, and hash
- deterministic PNG render from the parsed IGES mesh
- binary STL export from the same parsed mesh
- STL metadata and integrity checks
- source-only 0-100 render-confidence evidence
- fixture/database equivalence smokes for render, STL, and confidence
- blocked/invalid source-binding examples for missing source, invalid hash, unsupported image binding, and missing render preset
- downstream visual-calibration evidence packet with bounded render-preset experiments

## Validation

Run the full proof:

```bash
npm run iges:pipeline:smoke
```

Individual checks:

```bash
npm run iges:source:inspection
npm run iges:render:smoke
npm run iges:render:db-equivalence
npm run iges:stl:smoke
npm run iges:stl:db-equivalence
npm run iges:confidence:smoke
npm run iges:confidence:db-equivalence
npm run iges:visual-calibration:smoke
```

Generated local artifacts are written under `.local/iges-source-pipeline/`.

Evidence JSON files are written under `docs/iges-*-evidence.json`.

## Confidence Meaning

Render confidence is source/render QA confidence. It is not engineering certification, CAD qualification, dimensional inspection, manufacturing approval, or fabrication readiness.

The score is computed only from:

- source binding and checksum validation
- IGES parse and assembly resolution
- unit/scene validity
- geometry and mesh integrity
- renderer determinism and output completeness
- STL conversion integrity when STL is requested

No reference image affects the score.

## Post-Render Visual Calibration

Visual calibration is a separate downstream loop. It starts only after the IGES-only render completes.

It may use the approved JPG as a golden visual reference for comparison, but only inside the calibration agent. The JPG remains excluded from source binding, IGES ingestion, scene assembly, renderer source data, STL export, and source-confidence scoring.

The visual calibration packet reports:

- `source_confidence_score`: source-only IGES/scene/render health score
- `visual_fidelity_score`: post-render visual similarity score against the golden reference
- camera/framing differences
- object placement/orientation differences
- silhouette differences
- lighting/material/background differences
- line/edge treatment differences
- resolution/aspect differences
- ranked render-preset hypotheses

Bounded experiments may change render presets and re-render. They must not change IGES geometry. The visual score must not be promoted into source confidence.

Human approval is required before changing a production render preset or calling an output golden-ready.

### Calibration Corpus Expansion

The follow-on calibration set is planned in `docs/iges-calibration-corpus.md` and seeded by `docs/iges-calibration-corpus.seed.json`.

The target set is 12 to 20 reviewed IGES samples covering:

- simple block or plate geometry
- bracket or flange geometry with holes
- cylindrical or bearing-style parts
- small assemblies
- surface or wireframe stress cases

Every admitted sample must preserve the same source boundary: IGES/IGS is the only geometry source, and any JPG/PNG preview is post-render visual QA only.

Run the corpus manifest guard with:

```bash
npm run iges:calibration:corpus:preflight
```

### Current Candidate Comparison

The August 8 calibration pass compared the controlled IGES renders against the approved JPG references as downstream visual QA only.

Observed gaps:

- Assembly: source geometry imports correctly, but the JPG resembles a SolidWorks assembly display with the bracket/isolator relationship shown through hidden-line or component-emphasis styling. The current candidate is a normal shaded assembly, so both parts render as equally solid and prominent.
- Bracket: geometry is present and the shaded/edge renderer now removes most tessellation bands, but the current best candidates still disagree with the JPG's display semantics. The JPG reads as a view where the holed flange is the lower/front plate and the upright wall is dominant. IGES-derived circular-cutout evidence currently places the hole candidates on the upright flange, so this is treated as a source/reference alignment blocker rather than a camera-only gap.
- Isolator: the candidate is close on geometry, material, background, and edge style. Remaining differences are mostly camera angle, framing, and SolidWorks-like face lighting.

Implemented gap closures in this lane:

- switched from raw triangle-wire rendering to shaded CAD faces with crease/boundary outlines
- added a z-buffer and visibility-aware edge drawing to suppress hidden triangle bleed-through
- reduced per-triangle lighting contrast so CAD faces read as cleaner surfaces
- added reference-sized, part-specific visual calibration for `assem-1`, `bracket-1`, and `isolator-1`
- added bounded Euler camera and render-only axis-remap experiments without changing IGES source geometry
- added render-only display-state experiments, including assembly node styling where `bracket-1` remains shaded and `isolator-1` can render as faint hidden-line reference geometry
- added semantic visual QA flags so numeric visual scores cannot silently clear known display/orientation risks
- added IGES-derived bracket hole-placement evidence so the visual QA packet can flag a possible source/reference mismatch without treating the JPG as source geometry

Current visual calibration evidence:

- `assem-1`: best candidate `assembly-bracket-shaded-isolator-hidden-line`, `visual_fidelity_score` 85, `source_confidence_score` 98, semantic gate `blocked_human_semantic_review`
- `bracket-1`: best automated candidate `axis-remap-base-holes-c`, `visual_fidelity_score` 84, `source_confidence_score` 98, semantic gate `blocked_human_semantic_review`, with `source_reference_hole_plane_mismatch` recorded from IGES-derived geometry evidence
- `isolator-1`: best candidate `side-isometric-camera`, `visual_fidelity_score` 84, `source_confidence_score` 98

Plan to close remaining gaps:

1. Capture mesh-to-subfigure/display-state mappings as first-class evidence for production source records, not only controlled fixtures.
2. Confirm whether `bracket-1.JPG` is the correct golden reference for `bracket-1.IGS`. Current IGES-derived evidence places the hole geometry on the upright flange, while the JPG visually reads as holes on the lower/front flange. If the JPG is correct, the source IGES binding may be wrong; if the IGES is correct, the JPG should not be used as a golden-ready target for that asset.
3. Improve the visual scorer so high-level feature scores cannot hide semantic display mismatches such as "holes appear on the vertical plate instead of the base flange." The first semantic flags are present; the next step is image-derived orientation detection instead of conservative human-review blocking.
4. Expand bounded camera search around the human-preferred bracket view only after the bracket source/reference alignment is resolved.
5. Require human approval before promoting any candidate preset to production or marking an output golden-ready.

## Remaining Product Gate

This slice is a scripted proof. It does not yet expose the pipeline through app UI, production API routes, persistent database tables, source upload flows, or user-facing export screens.

Before launch usage, a follow-on lane should connect the source-record resolver to the real database model and add product UX/API gates around approved source-file records.

## Arbitrary approved local sources and named-view calibration

Run `node scripts/iges-local-calibration.js .local/calibration-input.json`.
The private manifest is local-only and has this structure (paths and hashes below
are placeholders, not a supplied dataset):

```json
{
  "outputDir": ".local/calibration-review",
  "candidateLimit": 256,
  "sources": [{
    "id": "sample",
    "record": {
      "id": "approved-local-sample",
      "status": "approved",
      "sourceAssetId": "sample",
      "sourcePath": "/absolute/private/sample.IGS",
      "approvedSha256": "<verified source SHA-256>",
      "expectedUnits": "inch",
      "expectedSubfigures": [],
      "renderPresetId": "source-iges-isometric-v1"
    },
    "references": [{
      "id": "front",
      "path": "/absolute/private/sample_FRONT.JPG",
      "sha256": "<verified reference SHA-256>",
      "kind": "standalone_view"
    }],
    "unmatchedReferences": []
  }]
}
```

Pin source units from IGES inspection when preparing a new record. An existing
record with mismatched units fails before import. Unknown units also fail.
The importer normalizes to millimeters through its explicit `linearUnit` option;
scene and STL evidence now distinguish native `sourceUnits` from `meshUnits`,
record the conversion factor, and retain the installed importer version. STL
coordinates are labeled millimeters. This corrects the earlier metadata behavior
that labeled converted coordinates with native source units. No additional
rescaling or geometry repair occurs. The installed `occt-import-js` README defines
`linearUnit` as the output coordinate unit.

Every source's untouched default 1024×768 baseline completes before any reference
image is read. The runner exercises the same approved binding as a controlled
fixture and a source-record resolution and verifies equivalent scene, render,
STL and source confidence. Each subsequent candidate must retain baseline scene
and STL hashes. Source-only confidence includes render health; the downstream
image score is never a source-confidence input.

Type 308 names are extracted from IGES parameter records, including continuation
records and Hollerith strings. Scene evidence records expected/imported/missing
component names, entity-type counts, 404/410 drawing/view metadata presence, and
the explicit limitation that OCCT resolves transforms without a second independent
matrix reconstruction. Raw imported mesh boundary/component reports are retained;
separate face meshes do not establish a welded solid's connectedness or fabrication
readiness. Calibration does not weld those meshes.

Named standalone reference views use the entire supplied view image with recorded
pixel bounds and SHA-256. Whole drawings require `kind: "drawing_view_crop"`, an
explicit `{x,y,width,height}` crop and `mappingProvenance`; title blocks and dimensions
must remain outside the crop. A standalone file is not asserted to be a crop of
another sheet. Unmapped sheets, photographs and PDFs remain unscored with reasons.
View labels do not establish the source coordinate axes.

The bounded search uses at most 256 camera presets, then up to 27 angle refinements
per isometric view, one reference-resolution render and three light/framing trials.
Final framing is a uniform viewport fit with explicit normalized offsets. All
presets remain experimental. The report preserves baseline, coarse/fine candidate,
final render and reference provenance, including an experiment trace.

The heuristic alignment score weights foreground silhouette IoU 65%, tolerant
internal/boundary edge agreement 30%, framing 3% and luminance 2%. Blank backgrounds
are unscorable. Independently segmented foregrounds are letterboxed without aspect
distortion. This metric is not exact pixel agreement, component recognition or an
engineering measurement. Shadows, selection marks, thin features and unmodeled
CAD annotations can still affect it. A high score never clears human review.

If a reference depicts only selected assembly components, an optional
`displayHypothesis` provides `visibleNodes` (exact source node names) and a `reason`.
The candidate hides other nodes only during rendering, including viewport fitting
and occlusion. Full scene and STL hashes remain unchanged. The report names the
hidden nodes and requires human confirmation of that display state. Missing parts,
markings, dimensions or textures must not be invented from the reference.

Local artifacts include `baselines.json`, `report.json`, `index.html`, PNG renders,
reference crops and STL. Keep them ignored and private. The HTML uses local images
and no network dependencies. If a browser rejects a local URL, use workspace-file
review or local PNG comparison artifacts; do not route around the URL policy.

Focused validation: `node scripts/iges-local-calibration-test.js`, the existing IGES
pipeline/equivalence smokes, and `npm run typecheck`. Human review must confirm view
identity, source component coverage, both sides of thin/cutting parts, and remaining
mesh/display limitations before any golden-ready or production-preset decision.

### Supported subset and reusable behavior

The current local runner accepts approved `.igs`/`.iges` files whose Global unit
flag and unit-name fields agree on inch (`1/IN` or `1/INCH`), millimeter (`2/MM`),
or meter (`6/M`), with Global model scale exactly 1. Global Hollerith fields and
custom parameter/record delimiters are consumed as fields; misleading product or
filename text cannot select units. Unsupported units, flag/name disagreement,
non-unit model scale, malformed bindings, changed checksums, unknown units and
empty imports fail explicitly. This is a supported subset, not universal IGES
support. OCCT's importable trimmed-surface/solid data supplies the triangulated
scene. Wire-only geometry, text/dimension entities and unmeshed display annotations
are not reconstructed by this renderer; such content does not become invented
mesh geometry. Declared source transforms are resolved by OCCT, not independently
certified here.

The generic `basis` camera accepts `viewDirection` and `upDirection`, constructs
orthogonal screen vectors with cross products, and measures depth toward the
observer. Parallel up/view vectors fail. It has no model-specific axes. Optional
source-local camera hypotheses are capped at 32 in addition to the coarse budget;
reference views are capped at 24 per source and the complete run at 4096 estimated
experiments. A run with no references stops after baseline and resolver parity,
reports `not_assessed_no_reference`, and performs zero calibration experiments.

Projected visible geometry must remain inside the output frame. Foreground touching
the canvas and source-local required components with no surviving z-buffer face
pixels reject a candidate regardless of score. If all final trials fail, they do
not replace an eligible prior candidate. The finalizer regenerates reference pixels
from pinned raw bytes and validated crops, verifies image hashes, and separates
blocked/unscorable output from a selected candidate. Visible pixel counts establish
source-node contribution only; they do not establish a complete semantic match.

`node scripts/iges-local-calibration-heldout.js .local/iges-heldout` freezes generic
module hashes and evaluates all three historical approved fixtures plus admitted
local corpus sources without reading reference images. It checks repeated PNG/STL
hashes, fixture/source-record parity, renamed-file invariance, units/bounds/assembly
handling and four basis cameras per shape. The historical fixtures are regression
held out from this pass, not previously unseen generalization evidence. The current
admitted public corpus contains one dependency cube; supplier samples remain gated.
No evidence claims a 12–20 model corpus has been validated.

`node scripts/iges-local-calibration-finalize.js .local/finalize-manifest.json`
consolidates review passes from `reportPaths` using pinned `sources` and an ignored
`outputDir`. `python3 scripts/iges-calibration-montage.py .local/review/report.json`
uses Pillow to create local, aspect-preserving comparison sheets. These review
artifacts can be inspected without opening a blocked browser URL.

Camera and display-subset choices learned from a reference remain per-view
experiment data. Generalizable changes are source validation, explicit unit and
assembly evidence, basis-camera mathematics, bounded execution, invariants and
review/provenance gates. Existing historical fixture-specific calibration remains
in the legacy calibration module; the arbitrary-source runner does not call its
asset-specific semantic rules or use historical filename-based camera choices.
