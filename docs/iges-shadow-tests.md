# Synthetic shadow coverage regression tests

Run `npm run iges:shadow:test` after installing the repository's normal dependencies. The release-local-ci workflow runs this focused command before the existing release checks. The suite makes 20 small (160 × 160) synthetic render calls and uses only local triangle fixtures. It requires no CAD file, importer invocation, network, environment override, ignored file or Git history. Output goes to temporary directories.

Coverage checks preserve every pre-existing foreground pixel, require real background shadows, preserve background-colored edges for topology and legacy paths, and check geometry-only PNG and visible-mesh metadata equality. Overlay checks require exact control/overlay PNG equality for zero-alpha, quantized-zero-alpha and fully depth-rejected edges, while retaining real shadow at a transparent-edge location. Ordinary and legacy hidden-line rendering must match baseline RGBA bytes, with visible edges in the hidden-line case.

## Baseline provenance

The four baseline records were generated twice from unmodified main commit `88322d764f516045c0f2f6032554410a409434d8`. They contain only synthetic output hashes, dimensions and explicit probe pixels. Both generation runs produced identical JSON. The baseline records source renderer/quality SHA-256 and Node/zlib versions. No old renderer or private source is vendored.

Decoded RGBA hashes and dimensions are mandatory across runtime versions. Exact encoded PNG hashes are additionally required when Node and zlib match the generation runtime, since compression can vary across versions. Same-runtime shadow-off/geometry-only and overlay/control PNG comparisons always remain exact. Missing, malformed or changed baseline bytes fail before rendering; the loader pins the complete baseline file hash.

## Deliberate baseline maintenance

Do not refresh these baselines to make a regression pass. In a disposable export of the pinned unmodified commit above, copy `scripts/generate-iges-shadow-baseline.js`, `scripts/fixtures/iges-shadow-scenes.js`, and `scripts/fixtures/iges-shadow-overlay-scenes.js` from this change. With existing dependencies available, run `node scripts/generate-iges-shadow-baseline.js /tmp/new-shadow-baseline.json`. The output path must not exist. The generator verifies exact unmodified renderer and quality hashes before making exactly four synthetic calls. It refuses the fixed renderer. Repeat to a second new path to verify determinism. On macOS use an explicit sandbox-exec profile with `(version 1) (allow default) (deny network*)` around each command. No network is needed by generation.

Review any intended baseline update, its fixture changes and runtime metadata before updating both the JSON and its pinned hash in the loader. The two old-bug probe records must remain darker than the background; they are regression evidence, not desired output. Tests do not run this maintenance generator.
