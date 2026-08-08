# IGES Calibration Corpus Acquisition Pass - 2026-08-08

This pass extends the calibration corpus with reviewed source candidates while preserving the IGES-only source boundary.

## Result

Admitted:

- `occt-cube-10x10mm`: dependency fixture from `occt-import-js` with checksumed IGES and PNG reference.

Blocked but actionable:

- `ideal-standard-t4892-bracing-bracket`
- `ideal-standard-k9381-connect-bracing-bracket`
- `ideal-standard-bc770-shower-bracket`
- `ideal-standard-b9446-shower-arm`
- `ideal-standard-t4107-cabinet`

The blocked candidates appear useful because their product pages expose both a JPG/drawing-style reference and an IGES CAD planning file. They are not admitted because Ideal Standard terms need permission review before using downloaded assets for a commercial product calibration corpus.

## Source Boundary

The source boundary remains unchanged:

- IGES/IGS is the only geometry source.
- JPG/PNG files are post-render visual QA references only.
- JPG/PNG files cannot feed source binding, ingestion, scene assembly, renderer source data, STL export, or source confidence.
- Visual fidelity and source confidence remain separate scores.

## Ideal Standard Candidate Evidence

The strongest product-page candidate is:

- T4892 i.life Bracing bracket 35x1500x15 mm
- product page: `https://www.idealstandard.ie/products/t4892`
- observed product dimensions: 35 mm width, 1500 mm length/projection, 15 mm height
- observed material/type: metal bracing bracket
- observed reference asset: Price List Drawing JPG, 299.1 KB
- observed source asset: CAD 3D Planning File IGS, 691.23 KB

The terminal HEAD check against the download endpoints returned Cloudflare 403, so the direct download URLs are recorded only as download candidates. No Ideal Standard assets were committed.

Terms review:

- Terms permit downloaded extracts only for personal, non-commercial use.
- Terms prohibit broader reproduction, transfer, adaptation, distribution, incorporation, or storage outside those limits without permission.
- CAD material is provided as-is and must be independently verified.

This makes the product family useful for a permission request, not for immediate corpus admission.

## Next Permission Request

Ask Ideal Standard or Villeroy & Boch Group for written permission to use selected IGES and JPG/drawing assets for internal ReversR renderer calibration, visual QA, and non-public automated regression evidence.

The request should clarify:

- assets will not be redistributed as a standalone CAD library
- IGES remains source geometry only
- JPG/drawing assets are visual QA references only
- source confidence will not use reference images
- outputs will support renderer development and QA, not manufacturing certification

If permission is granted, the next lane should download the approved files into a non-public fixture area first, record SHA-256 checksums, run fixture and DB-source-record equivalence, and only then decide whether any derivative evidence belongs in the repo.

