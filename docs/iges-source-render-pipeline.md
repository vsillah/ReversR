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

### Current Candidate Comparison

The August 8 calibration pass compared the controlled IGES renders against the approved JPG references as downstream visual QA only.

Observed gaps:

- Assembly: source geometry imports correctly, but the JPG resembles a SolidWorks assembly display with the bracket/isolator relationship shown through hidden-line or component-emphasis styling. The current candidate is a normal shaded assembly, so both parts render as equally solid and prominent.
- Bracket: geometry is present and the shaded/edge renderer now removes most tessellation bands, but the current best candidates still disagree with the JPG's display semantics. The JPG reads as a view where the holed flange is the lower/front plate and the upright wall is dominant; several render candidates still present the holed plate as a vertical surface.
- Isolator: the candidate is close on geometry, material, background, and edge style. Remaining differences are mostly camera angle, framing, and SolidWorks-like face lighting.

Implemented gap closures in this lane:

- switched from raw triangle-wire rendering to shaded CAD faces with crease/boundary outlines
- added a z-buffer and visibility-aware edge drawing to suppress hidden triangle bleed-through
- reduced per-triangle lighting contrast so CAD faces read as cleaner surfaces
- added reference-sized, part-specific visual calibration for `assem-1`, `bracket-1`, and `isolator-1`
- added bounded Euler camera and render-only axis-remap experiments without changing IGES source geometry
- added render-only display-state experiments, including assembly node styling where `bracket-1` remains shaded and `isolator-1` can render as faint hidden-line reference geometry
- added semantic visual QA flags so numeric visual scores cannot silently clear known display/orientation risks

Current visual calibration evidence:

- `assem-1`: best candidate `assembly-bracket-shaded-isolator-hidden-line`, `visual_fidelity_score` 85, `source_confidence_score` 98, semantic gate `blocked_human_semantic_review`
- `bracket-1`: best automated candidate `axis-remap-base-holes-c`, `visual_fidelity_score` 84, `source_confidence_score` 98, semantic gate `blocked_human_semantic_review`
- `isolator-1`: best candidate `side-isometric-camera`, `visual_fidelity_score` 84, `source_confidence_score` 98

Plan to close remaining gaps:

1. Capture mesh-to-subfigure/display-state mappings as first-class evidence for production source records, not only controlled fixtures.
2. Improve the visual scorer so high-level feature scores cannot hide semantic display mismatches such as "holes appear on the vertical plate instead of the base flange." The first semantic flags are present; the next step is image-derived orientation detection instead of conservative human-review blocking.
3. Expand bounded camera search around the human-preferred bracket view now that display-state and source confidence are separated.
4. Require human approval before promoting any candidate preset to production or marking an output golden-ready.

## Remaining Product Gate

This slice is a scripted proof. It does not yet expose the pipeline through app UI, production API routes, persistent database tables, source upload flows, or user-facing export screens.

Before launch usage, a follow-on lane should connect the source-record resolver to the real database model and add product UX/API gates around approved source-file records.
