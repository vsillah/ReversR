# IGES cross-model generalization gate

This local evaluation uses the existing IGES resolver, OCCT scene, renderer,
STL exporter and source-confidence rubric. It does not integrate an app upload,
public API or live database, and does not promote presets or golden images.
Execution completion is explicitly separate from acceptance.

## Manifest and admission

Use schema `iges-generalization-v2` and keep inputs/evidence under ignored `.local`
directories. A manifest contains `sources`, fixed `preset`, `candidatePreset` and
up to four additional `cameras`. Sources have safe unique `id`, `family`, `split`,
`origin`, `path`, original `sha256`, `expectedUnits`, optional `expectedSubfigures`
and `requiredVisibleNodes`, admitted `rights` evidence and optional `references`.

Splits are `dev`, `holdout`, `regression` and `synthetic`. Origins are
`independent_archival`, `dependency_regression`, `historical_regression` and
`synthetic`. Fresh holdout requires archival origin and `priorExposure: false`.
Keep all derivatives/views of a source family together. Duplicate source bytes
are rejected. Historical/dependency fixtures never establish new-source coverage;
generated stress fixtures must remain synthetic.

Retain primary source URLs, immutable source revision, original hashes, rights
notice/hash and the reviewed use basis. Admission declarations are trusted local
inputs, not automated legal approval. The NIST repository describes a public-domain
archival CAD collection but warns files may be incomplete or unsupported. Supplier
permission blockers remain unchanged. See the
[NIST primary repository](https://github.com/usnistgov/engineering-design-models).

Each optional reference has `path`, expected `sha256`, optional reviewed `crop`,
and role `verified_view` or `related_native_preview_context_only`. A sibling image
from another CAD format is not certified source/view equivalence. Missing,
mismatched or undecodable references remain per-reference visual-unavailable;
they never block source ingestion, including when they belong to another phase.
All source-only work precedes reference availability checks/decoding. Results are
stored per reference, with declared/decoded/scored counts. Blocked or partial
source/candidate runs cannot receive visual scores.

## Freeze, review and exposure

```sh
node scripts/iges-generalization-gate-test.js
python3 scripts/iges-generalization-montage-test.py
node scripts/iges-generalization-gate.js freeze .local/corpus/manifest.json .local/corpus/freeze.json
node scripts/iges-generalization-gate.js run .local/corpus/freeze.json dev .local/corpus/dev
python3 scripts/iges-generalization-montage.py .local/corpus/dev/report.json
# After actual DEV review, record the decision and reason explicitly:
node scripts/iges-generalization-gate.js accept-dev .local/corpus/freeze.json "Reviewed eligible DEV cases and retained limitations"
node scripts/iges-generalization-gate.js run .local/corpus/freeze.json holdout .local/corpus/holdout
python3 scripts/iges-generalization-montage.py .local/corpus/holdout/report.json
```

Pillow is required for montage tests/output. The freeze binds manifest, exact
expected implementation files (including CLI/montage), Node platform/version,
OCCT package/JavaScript/WASM and image decoder fingerprints to a random experiment
identity. A canonical registry under `.local/iges-generalization-experiments`
stores receipts independently of the freeze location. Copying a freeze cannot
reset exposure. A fail-closed exclusive lock serializes freshness checks, exposure
reservation and reconciliation. Immutable receipts containing both source hashes
and families are authoritative; `history.json` is only a rebuildable index. Lost
index files cannot restore freshness. A busy/stale lock rejects without retry or
automatic bypass. Legacy receipts lacking source hashes require reconciliation
before any fresh holdout can be established. This is integrity checking for a trusted cooperative
workspace, not cryptographic resistance to an owner deliberately rewriting the
registry and code.

Zero-source phases reject. Fail/unknown source confidence and invalid/blank
foreground block eligibility. An all-blocked run exits nonzero and cannot unlock
holdout. `accept-dev` requires explicit review plus a completed, nonempty,
resource-bounded DEV evaluation with eligible sources. This decision is not app or
production acceptance. Reports always separate `executionStatus`, source states,
eligibility and `gateAccepted: false`; independent review remains required.

Preserve old failed/started/completed receipts. `reconcile receipts.json` appends
hash-verified historical freeze/ledger records to canonical exposure history
without rewriting originals. A receipt has `reason` and `attempts`, each containing
`freezePath`, `freezeSha256`, `ledgerPath`, `ledgerSha256`. Failed historical
attempts retain their original ledger and add `reconciledStatus: "failed"`, the
exact error, date/basis and hash-verified `evidence` entries. This writes a distinct
immutable receipt. Decoder fingerprints include package version, package.json,
entry point and the entire implementation lib tree. After holdout inspection,
any replay uses `regression` with `priorExposure: true`; it is not fresh evidence.
New tuning needs replacement holdout families or an explicit coverage shortfall.

## Bounds and proof scope

The gate allows 1–20 sources, 20 MiB per source, safe preset/artifact IDs,
64–2048-pixel render dimensions and at most four references per source. Output
paths resolve real ancestors and reject `.local` symlink escapes before writes.
References are bounded to 8 MiB and 4,194,304 decoded pixels. The existing image
loader accepts optional bounds: PNG chunk bounds and header semantics checks before decoding, rejecting duplicate
IHDR chunks, with a final decoded-dimension check; jpeg-js
resolution/64 MiB decoder limits. Default loader behavior remains compatible.

The CLI runs imports in a separate process with a 120-second timeout and 1536 MiB
V8 heap cap; timeout/failure evidence remains local and exposure stays consumed.
WASM/native allocations are not a hard OS address-space quota. Direct in-process
API runs report resource isolation unavailable and cannot satisfy DEV acceptance.
HTTP(S), socket, DNS, fetch, worker and subprocess APIs are denied inside the known
pipeline. `externalRequests: []` means no intercepted API attempt; it is not an
OS/process-wide network capture or a sandbox for arbitrary executable code.
Public acquisition is separate and requires its own requests log.

The report retains source-only checkpoints and failures. Baseline fixture/source-
record results must have equivalent manifest/PNG/STL/confidence evidence; fixture
bindings are independently constructed from frozen local bytes, not obtained by
relabeling a DB binding. There is no live database call. Baseline and every
candidate are repeated; scene, mesh coordinates/indices, STL and source-score
components must remain invariant. No invented visual score is used for gating.

Shared pipeline diagnostic blocker examples are now opt-in via
`includeBlockedStateExamples: true`. Normal source-record/gate runs return
`blockedStates: null` and do not inspect unrelated legacy fixture files. This
changes diagnostic metadata only, not render/geometry/scoring behavior. Focused
gate tests require only the installed rights-cleared dependency cube; historical
regression suites are separate and may require approved local regression assets.

## Reading the result

Keep blocked cases in denominators. Mesh-owned pixels measure imported surface
contribution, not semantic assembly parts. Expose units, source entity types,
occluded meshes, unsupported/nonmesh cases and unverified transforms explicitly.
OCCT transform resolution without an independent oracle is not certified transform
accuracy. Missing assemblies, repeated-name sources, non-unit model scales and
reference coverage remain unavailable when not exercised.

Inspect actual complete objects, orientation and required features in multiple
views. Edge-on framing alone does not establish 3D correctness. Patch-line or
component-visibility concerns can reject a deterministic candidate. Source scores
are not geometry-accuracy percentages. Montage panels verify image hashes, stamp
manifest/experiment/report identity, apply recorded crops, size rows dynamically
and show useful unavailable states for tampered, missing or invalid images.

Validation limits: timeout kill and heap exhaustion are configured but have not
been fault-injected. Only the null-source and approved-hash mismatch binding
variants are explicitly fault-injected by the new gate test. Focused tests compare
full source/PNG/STL/confidence evidence across no-reference, PNG, JPEG and missing
reference runs; they do not prove independent geometric truth.
