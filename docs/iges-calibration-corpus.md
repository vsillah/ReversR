# IGES Calibration Corpus Plan

This corpus is for improving the post-render visual-calibration loop without weakening the source-of-truth boundary.

## Boundary

The IGES or IGS file is the only geometry source.

Reference JPG or PNG previews may be stored only as post-render visual QA aids. They must not feed:

- source binding
- IGES ingestion
- scene assembly
- renderer source data
- STL export
- source confidence scoring

The visual fidelity score remains separate from source confidence.

## Seed Manifest

The seed manifest is:

- `docs/iges-calibration-corpus.seed.json`

It defines the target sample mix, candidate acquisition sources, admission checklist, and blocked states.

Run:

```bash
npm run iges:calibration:corpus:preflight
npm run iges:calibration:corpus:smoke
```

The checks write:

- `docs/iges-calibration-corpus-preflight-evidence.json`
- `docs/iges-calibration-corpus-smoke-evidence.json`

## Target Mix

The initial calibration set should contain 12 to 20 reviewed samples:

- 2 simple block or plate parts
- 4 bracket or flange parts with holes
- 3 cylindrical or bearing-style parts
- 2 small assemblies
- 1 surface or wireframe stress sample

This mix directly targets the current renderer gaps: camera framing, face shading, crease and hidden-line treatment, circular cutout placement, and assembly display states.

## First Admitted Sample

The first admitted sample is the `occt-import-js` `Cube 10x10mm` dependency fixture.

It gives the lane a small, checksumed IGES plus PNG reference pair that can run without catalog login, scraping, or unclear item download terms:

- source package: `occt-import-js`
- package version: `0.0.23`
- package license: `LGPL-2.1`
- source IGES: `node_modules/occt-import-js/test/testfiles/cube-10x10mm/Cube 10x10.igs`
- reference PNG: `node_modules/occt-import-js/test/testfiles/cube-10x10mm/Cube 10x10.png`

The PNG remains visual QA only. The corpus smoke asserts it is not used for source confidence.

## Candidate Sources

High-priority sources:

- TraceParts: supplier catalog parts with CAD downloads and preview imagery.
- 3Dfindit / CADENAS: manufacturer catalog parts with configurable CAD downloads and previews.
- 3D ContentCentral: useful SolidWorks-adjacent parts and assemblies, with item-level provenance review.

Medium-priority sources:

- McMaster-Carr: high-quality mechanical parts, pending item-level format and terms review.
- AST Bearings and similar bearing libraries: useful narrow-domain cylindrical/circular geometry.

Low-priority or follow-up sources:

- GrabCAD: high volume, but mixed provenance. Use only when the item license is clear.
- NIST Engineering Design Model Repository: useful for public-domain parser and translation stress tests, but not yet confirmed as IGES/JPG-paired.

## Admission Rules

Each admitted sample needs:

- source URL and item title
- license or terms status
- local IGES/IGS path
- source SHA-256
- detected or declared units
- optional reference image path
- reference image SHA-256 when present
- category and expected renderer challenge
- fixture and database-source-record route plan

If a sample has no clear license, no IGES source, or only an image reference, it stays blocked.

## Human QA Gate

The first pass should remain human-reviewed. A sample becomes golden-ready only after:

- source identity is confirmed
- terms are acceptable for internal calibration or committed test use
- fixture and database-source-record routes produce equivalent source-only evidence
- visual fidelity is evaluated downstream
- no reference image has influenced source confidence
