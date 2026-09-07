# Optional smooth manifold seam display

Set `renderQuality.seamPolicy: 'smooth-manifold-v1'` together with
`renderQuality.version: 'iges-quality-v1'` and `renderQuality.edges: 'topology'`.
Existing presets and renderer defaults are unchanged.

The topology edge policy normally draws every imported B-rep face boundary.
That can draw internal joins between smoothly connected face patches. This
optional policy suppresses a join only inside one imported mesh, where exactly
two triangles meet at exactly matching endpoint coordinates, both have distinct
known B-rep face IDs with well-formed unique face ownership, opposite directed
edge incidence and distinct incident triangles. Their finite nonzero endpoint
normals must agree within one degree and align with each incident geometric
normal (positive normalized dot product greater than 0.2). Same-winding or
coincident duplicate faces, tangent normals and overlapping face ranges cannot
authorize suppression. The existing crease-angle and camera silhouette tests always take
precedence. Open edges (including hole loops), nonmanifold edges, forced/all-edge
styles, missing normals and merely rounded-coordinate matches remain visible.
No mesh welding, cross-mesh merging, source reconstruction or repair occurs.

This is a display inference from triangulated importer metadata. It does not
certify analytic surface continuity or semantic intent. The one-degree normal
agreement tolerance and existing crease threshold cannot independently identify
all shallow physical creases. Ambiguous joins remain under the prior policy;
this is not a whole-object line suppression option. Depth testing, shading,
geometry, units, transforms, STL and source-only confidence are unchanged.
`edgePolicyEvidence` reports the version, suppressed joins and retained ambiguous
B-rep joins only when this option is present.

The importer documents face triangle ranges and optional vertex normals, but
these fields do not expose analytic edge continuity or source part identities:
[OCCT importer output format](https://github.com/kovacsv/occt-import-js/blob/main/README.md).

Run `node scripts/iges-smooth-seams-test.js` for generic planar, curved, crease,
hole, duplicate-vertex, nonmanifold, missing-normal, near-coincident and
view-dependent silhouette cases. Existing quality, calibration, generalization
and historical regression suites remain required. Reference pictures are optional
visual QA inputs; they never raise source confidence. A historical multi-component
assembly/reference pair provides regression evidence, not fresh generalization.
Production preset promotion and app integration require separate review.
