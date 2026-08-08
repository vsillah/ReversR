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

## Remaining Product Gate

This slice is a scripted proof. It does not yet expose the pipeline through app UI, production API routes, persistent database tables, source upload flows, or user-facing export screens.

Before launch usage, a follow-on lane should connect the source-record resolver to the real database model and add product UX/API gates around approved source-file records.
