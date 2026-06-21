# Source-Backed 2D Provider Readiness

ReversR can already prove the source-backed 2D path with `public/inventory/source-backed-2d-proof.json`.
The professional source pilots are different: they currently contain provider pages, CAD/viewer metadata, and possible export formats, but not approved direct 2D image or diagram assets.

## Audit commands

- `npm run inventory:visual:audit` prints human-readable source-backed visual status for TraceParts, CADENAS, Documoto, and the controlled proof fixture.
- `npm run inventory:provider2d:readiness` prints JSON readiness for only the professional providers.
- `npm run inventory:source2d:proof` proves that a direct source-backed 2D record validates, matches, and bypasses AI in the 2D generator.

## Provider gates

### TraceParts

Public docs confirm TraceParts hosts 2D drawings and CAD files, and its API exposes CAD format availability and CAD request flows.
The fixture now records the readiness packet under `provider2DExport`.

Required before we can mark the TraceParts pilot as real source-backed 2D:

- `TRACEPARTS_API_KEY`
- `TRACEPARTS_USER_EMAIL`
- Real provider catalog identifiers: either `partFamilyCode` plus `selectionPath`, or `classificationCode` plus `partNumber`
- A verified 2D CAD format ID returned by `Product/CadDataAvailability`
- License approval to use the returned drawing/export URL inside ReversR

Sources:

- https://developers.traceparts.com/reference/get_v3-product-caddataavailability
- https://developers.traceparts.com/reference/post_v3-product-cadrequest
- https://developers.traceparts.com/reference/get_v2-product-cadfileurl

### CADENAS / 3Dfindit

Public CADENAS/3Dfindit material confirms 2D and 3D CAD export availability, but the current public fixture has no approved direct export URL.

Required before we can mark the CADENAS pilot as real source-backed 2D:

- Confirm CADENAS/PARTsolutions export terms for ReversR
- Add a backend credential reference or approved direct provider export URL
- Confirm selected 2D export format, such as DWG or DXF
- Add the direct source-backed 2D asset to `referenceImages`

Sources:

- https://www.3dfindit.com/
- https://www.cadenas.de/en/products/ecatalogsolutions/innovative-marketing-strategies/3dfindit-com

### Documoto

Documoto is the strongest fit for whole-machine exploded diagrams and BOM-linked parts-book views. The current public fixture only links provider pages.

Required before we can mark the Documoto pilot as real source-backed 2D:

- `DOCUMOTO_TENANT_URL`
- `DOCUMOTO_API_TOKEN`
- Tenant catalog/equipment identifiers
- Approved exploded diagram, widget export, PDF page, or image URL
- License approval to cache or display that diagram in ReversR

Sources:

- https://www.documoto.com/create-digital-parts-catalogs
- https://www.documoto.com/blog/unleashing-the-power-of-integration-how-documotos-headless-api-and-widgets-drive-real-world-results

## Readiness meanings

- `ready_direct_source_2d`: the inventory record already contains a direct source-backed 2D image.
- `provider_export_credentials_configured`: the audit sees the declared provider credential env vars, but a real provider export still requires provider identifiers and license approval.
- `waiting_for_provider_credentials`: provider export metadata exists, but credential env vars are missing.
- `no_provider_export_plan`: the record has neither direct source-backed 2D nor a provider export plan.
