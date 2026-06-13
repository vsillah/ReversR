# AI CAD And Machinist-Ready Schematic Research

Date: 2026-06-13

## Purpose

ReversR currently produces reconstruction planning packets, 2D visual references, a 3D scene descriptor, BOMs, and manufacturer handoff language. That is useful for review, quoting, and product understanding, but it is not the same as CAD software-level geometry.

The product gap is specific:

- Prompt-generated images are not fabrication drawings.
- Mesh outputs such as OBJ/STL can be useful for printing, but they usually do not preserve editable features, datum logic, tolerances, or design intent.
- Machinist-ready work needs source-backed dimensions, parametric or B-rep geometry, tolerances/GD&T where needed, exportable STEP/native CAD, drawings, inspection notes, and human engineering review.

This brief maps the current AI-to-CAD solution landscape against the ReversR requirement: generate or route machine-grade schematics from approved inventory and scan evidence, then hand them to a machinist or 3D printing vendor without pretending raw AI output is production-certified.

## Decision Standard

A ReversR CAD solution should be judged on these gates:

1. **Geometry type:** Prefer parametric CAD, B-rep solids, STEP, Parasolid, or native CAD over image-only or decorative mesh.
2. **Dimensional control:** Must support explicit units, dimensions, constraints, datum references, and revision tracking.
3. **Editability:** A qualified CAD user must be able to inspect and revise the model in a real CAD environment.
4. **Fabrication package:** Must produce or support STEP/native CAD, STL/3MF where appropriate, 2D PDF/DXF drawings, BOM, tolerance notes, and an inspection/checklist packet.
5. **API/automation:** Must integrate with ReversR without forcing a manual-only workflow.
6. **Safety boundary:** Must keep human review, DfM review, and first-article inspection as required gates before fabrication.

## Current ReversR Baseline

The app already has a good safety boundary in its manufacturing handoff:

- Required files include STEP assembly, native CAD or Parasolid export, PDF detail drawings, BOM CSV, inspection plan, and quote packet JSON.
- The current handoff explicitly says generated dimensions and tolerances are for review and must be confirmed by qualified CAD, DfM, safety, and first-article checks.
- The current visual path is source-backed first: inventory `referenceImages`, approved `sourceLinks`, then AI sketch fallback.

That means the next product step is not "make Gemini draw better schematics." The next product step is a CAD qualification layer.

## Solution Categories

### 1. CAD-Native AI Generation: Zoo / Zookeeper / KCL

**Fit:** Strong pilot candidate.

Zoo is the most directly aligned with "AI prompt to editable CAD" among currently visible options. Its Text-to-CAD API accepts a prompt and returns CAD files; its docs say Text-to-CAD returns GLTF and STEP by default and can specify other supported file formats. Zoo Design Studio uses KCL, a code-first CAD language, and supports import/export formats including STEP, STL, glTF, OBJ, and PLY. Zoo MCP is especially relevant because it can let Codex or another assistant call Zoo-backed CAD utilities instead of a general model guessing geometry.

**Strengths**

- Prompt-to-CAD path already exists.
- STEP export is a real CAD handoff format.
- KCL gives ReversR a versionable text artifact for review.
- MCP path matches the agent tooling direction.
- Good candidate for mounting brackets, plates, housings, adapters, fixture parts, and other prismatic/mechanical components.

**Risks**

- Still needs engineering review before production.
- Complex assemblies and safety-critical parts may exceed prompt reliability.
- Need pilot access, API token, cost check, and sample-part validation.

**Best ReversR use**

Use Zoo as a CAD generation/review engine for selected parts after ReversR has identified the machine, part, source dimensions, and required function. Do not let a bare prompt invent dimensions.

Sources:

- https://zoo.dev/docs/developer-tools/tutorials/text-to-cad
- https://zoo.dev/docs/zoo-design-studio/getting-started
- https://zoo.dev/docs/developer-tools/mcp

### 2. Open Parametric CAD Pipeline: CadQuery + FreeCAD/OpenCASCADE

**Fit:** Best controllable MVP backend.

CadQuery is a Python library for parametric CAD. Its docs emphasize editable/customizable parametric models and high-quality exports including STEP, AMF, 3MF, and STL. Its import/export docs also specify unit handling, including millimeter STEP exports by default. FreeCAD provides a broader CAD application and can produce/export full-precision models, 2D drawings, and files for 3D printing or CNC workflows.

**Strengths**

- Local-first, reproducible, auditable.
- ReversR can generate code, not just images.
- Good fit for standardizable parts: plates, brackets, blocks, spacers, covers, panels, mounting adapters, simple enclosures.
- Can produce STEP/STL/3MF from deterministic scripts.
- Low vendor lock-in.

**Risks**

- The AI has to write correct CAD scripts; validation is mandatory.
- Complex organic surfaces or reverse-engineered assemblies are not ideal.
- Drawing generation and GD&T still need a qualified CAD workflow or engineer review.

**Best ReversR use**

Build a "CAD script draft" path for parts where the inventory record includes dimensions or enough measured constraints. ReversR outputs CadQuery source, STEP/STL/3MF, a screenshot/preview, and a validation report. A qualified reviewer then approves or revises.

Sources:

- https://cadquery.readthedocs.io/
- https://cadquery.readthedocs.io/en/latest/importexport.html
- https://www.freecad.org/features.php

### 3. Professional Cloud CAD Workflow: Onshape + FeatureScript/API

**Fit:** Best review/edit/collaboration environment.

Onshape is not currently a pure prompt-to-production-CAD answer. Its AI Advisor is documentation/workflow assistance, and Onshape explicitly says it does not generate designs or make complex engineering decisions today. But Onshape is strong as the controlled CAD environment around generated files. It supports major CAD formats, including STEP, IGES, STL, DXF, DWG, PDF, and native CAD imports. Its API supports import/export translation, including Part Studio and Assembly exports to STEP and Drawing exports.

**Strengths**

- Real CAD environment, browser-based collaboration, version history.
- Strong API for importing/exporting and translation workflows.
- Good destination for ReversR-generated STEP/KCL/CadQuery outputs.
- FeatureScript can support automation for repeatable features.

**Risks**

- AI Advisor is not a CAD generator.
- Full automated design generation would require custom FeatureScript/API work or a third-party assistant.
- Requires account/API setup and document management.

**Best ReversR use**

Use Onshape as the review and release environment: import generated STEP, attach source evidence, allow a CAD reviewer to revise, then export final STEP/PDF/DXF package through Onshape.

Sources:

- https://www.onshape.com/en/features/ai-advisor
- https://www.onshape.com/en/resource-center/tech-tips/how-to-import-and-export-with-onshape
- https://onshape-public.github.io/docs/api-adv/translation/

### 4. Professional CAD/CAM Workflow: Autodesk Fusion + Fusion API + Generative Design

**Fit:** Strong downstream manufacturing environment, not a direct prompt-to-machinist solution.

Fusion combines CAD, CAM, CAE, PCB, and manufacturing workflows. Autodesk's generative design is useful when design goals, constraints, materials, and manufacturing methods are defined. The Fusion API supports scripts and add-ins. Fusion also has a documentation environment for technical drawings and supports additive manufacturing workflows.

**Strengths**

- CAD/CAM/manufacturing workflow in one environment.
- Good for simulation, manufacturing planning, and toolpath-adjacent work.
- Generative design can help optimize parts once constraints are real.
- API can automate repeatable modeling/export tasks.

**Risks**

- Generative design is constraint-driven, not magic prompt-to-CAD.
- Requires a skilled operator to define loads, constraints, preserve geometry, materials, and manufacturing methods.
- API automation is possible but implementation-heavy.

**Best ReversR use**

Use Fusion for engineer-led downstream validation, generative optimization, drawings, and manufacturing planning after ReversR has produced a qualified CAD draft or source-backed handoff.

Sources:

- https://www.autodesk.com/solutions/generative-design/manufacturing
- https://www.autodesk.com/solutions/generative-design-ai-software
- https://aps.autodesk.com/developer/overview/autodesk-fusion-api
- https://www.autodesk.com/learn/ondemand/tutorial/create-technical-drawings-and-document-the-3d-model

### 5. Enterprise Engineering AI Copilot: Leo AI

**Fit:** Worth evaluating for enterprise/customer workflows.

Leo AI positions itself as an engineering-grade AI system for mechanical engineers, with a domain-specific Large Mechanical Model, engineering-source validation, enterprise security, and part reuse. Public claims include CAD assembly generation and compatibility with major CAD systems, but this should be validated in a pilot because most detailed capability claims are marketing/sales-gated.

**Strengths**

- More engineering-specific than general 3D generators.
- Claims to work with organizational CAD/text data and engineering sources.
- Potentially valuable for part reuse and assembly reasoning.

**Risks**

- Likely enterprise sales motion.
- Need hands-on proof for export formats, API access, revision control, security, and machinist-readiness.
- Not enough public implementation detail to depend on without a pilot.

**Best ReversR use**

Evaluate as a paid/partner pilot if ReversR targets enterprise repair, MRO, or machine-rebuild teams with existing CAD/PDM libraries.

Sources:

- https://www.getleo.ai/
- https://www.getleo.ai/blog/best-text-to-cad-tools-2026

### 6. Scan-To-CAD And Reverse Engineering: Backflip, Geomagic Design X, PolyWorks

**Fit:** Strong when the source is a physical machine or part scan rather than only a prompt.

Backflip is focused on AI 3D mesh-to-CAD and scan-to-parametric CAD. Its site says it can build natively in Onshape or export STEP files. Geomagic Design X and PolyWorks are more established reverse-engineering and metrology tools for converting scan/point-cloud/polygonal data into CAD entities.

**Strengths**

- Better match for ReversR's "scan a machine" premise than prompt-only CAD.
- Can use physical geometry as evidence instead of hallucinated dimensions.
- Useful for replacement parts, brackets, broken components, legacy machines, and MRO workflows.

**Risks**

- Requires scanner quality and proper measurement workflow.
- Scan-to-CAD is not fully automatic for professional results.
- Tooling can be expensive and operator-heavy.

**Best ReversR use**

Offer a "scan-to-CAD vendor/partner route" for customers who need accurate reverse engineering from physical machines. ReversR should package scan images, machine match, BOM, known dimensions, and quote request, then route to a CAD/reverse-engineering vendor.

Sources:

- https://www.backflip.ai/
- https://hexagon.com/products/geomagic-design-x
- https://www.polyworks.com/en-us/products/polyworks-modeler

### 7. Mesh/Image Generators: Useful For Concepts, Not Machinist-Ready CAD

**Fit:** Keep as visual reference only.

Tools such as Autodesk Wonder 3D, Meshy, Luma, Tripo, and similar text/image-to-3D generators can produce textured 3D assets, OBJ files, or printable meshes. They can help with visualization, early ideation, and non-critical 3D printed forms. They should not be treated as source-of-truth CAD for machine parts because they typically lack parametric feature trees, explicit tolerances, datum schemes, and verified dimensions.

**Strengths**

- Fast concept visuals.
- Helpful for user understanding and early product storytelling.
- Can create rough meshes for non-critical physical mockups.

**Risks**

- Meshes are not the same as editable mechanical CAD.
- No reliable dimensions unless constrained downstream.
- Not appropriate for load-bearing, safety-critical, fit-critical, or revision-sensitive machine parts.

**Best ReversR use**

Keep this category behind the current "visual reference" boundary. Label generated mesh/image assets as references, not manufacturable files.

Source:

- https://www.creativebloq.com/ai/autodesks-new-ai-3d-generator-could-open-game-art-and-3d-printing-to-everyone

### 8. Additive-Manufacturing Optimization: nTop And Similar DfAM Tools

**Fit:** Later-stage optimization for advanced 3D printed components.

nTop and similar implicit-modeling/DfAM tools are powerful when a team needs lattice structures, topology optimization, lightweighting, or advanced additive manufacturing workflows. They are not the first solution for generic prompt-to-machinist schematics, but they matter if ReversR moves into high-performance printed parts.

**Strengths**

- Strong for advanced additive manufacturing.
- Useful after loads, constraints, material, and print process are known.

**Risks**

- Not a beginner prompt-to-CAD path.
- Requires engineering setup and manufacturing context.

**Best ReversR use**

Treat as a partner/advanced workflow for specialty parts after baseline CAD and requirements are verified.

Source:

- https://www.ntop.com/resources/product-updates/implicit-modeling-for-additive-manufacturing/

## Recommended ReversR Architecture

### Phase 1: Reframe The Output Contract

Replace any product language that implies "schematic" means production-ready. Use three tiers:

1. **Visual Reference:** PNG, sketch, mesh preview, or 3D scene descriptor.
2. **CAD Draft:** Parametric script, STEP/STL/3MF draft, generated dimensions, source evidence, validation report.
3. **Manufacturing Release Package:** Reviewer-approved CAD, drawings, tolerances, BOM, inspection plan, and DfM/vendor signoff.

### Phase 2: Build A CAD Qualification Layer

Add a backend service that takes:

- machine ID and revision,
- inventory source,
- part/component ID,
- source dimensions or measured dimensions,
- material/process requirement,
- reference images/source links,
- user/admin notes,
- tolerance class,
- required output format.

Then it routes to one of three lanes:

- **CadQuery lane:** deterministic local generation for simple mechanical parts.
- **Zoo lane:** AI-native CAD generation/editing and KCL/STEP outputs.
- **Vendor/professional lane:** Onshape/Fusion/Geomagic/PolyWorks route when accuracy, reverse engineering, or complex assembly exceeds automated draft confidence.

The first implementation slice uses an AI CAD gate before CAD qualification. The gate does not release files for fabrication. It classifies the package as one of:

- `ready_for_cad_draft`
- `needs_dimensions`
- `route_to_scan_to_cad_vendor`
- `visual_reference_only`
- `blocked_safety_review`

The gate also records the recommended CAD lane, source evidence, missing inputs, risk flags, reviewer actions, and final release boundary.

### Phase 3: Add Validation Gates

Every generated CAD draft should include:

- generated file list,
- source dimensions used,
- missing dimensions,
- units,
- bounding box,
- part volume/mass if available,
- export format,
- preview render,
- validation status,
- reviewer-required warnings,
- vendor notes.

Material and treatment review is a required part of the CAD qualification path, not a cosmetic afterthought. Every CAD draft or quote packet should identify the base material, expected environment, surface finish, coating/plating/anodize/powder coat/passivation/heat-treatment assumptions where relevant, treatment purpose, tolerance impact, inspection needs, and the vendor-confirmation requirement.

No CAD draft should be labeled machinist-ready until the manufacturing release package is approved.

### Phase 4: Pilot Two Paths

**Path A: Local MVP**

Use CadQuery to generate a simple, source-backed bracket/plate/enclosure from explicit dimensions. Export STEP and STL/3MF. Attach the script and validation packet.

Local proof command:

```bash
npm run cadquery:proof
```

The proof runner writes local artifacts under `.local/cadquery-proof/`, which is intentionally ignored by Git. If CadQuery is not installed in the selected Python environment, the runner writes a validation summary and exits nonzero with an install hint instead of pretending a CAD artifact exists.

Export-contract smoke command:

```bash
npm run cad:qualification:smoke
```

This writes `docs/cad-qualification-export-smoke-evidence.json` and proves the app-level export contract carries the AI CAD gate, material treatment guidance, visual-reference boundary, and final qualified-review release language into the complete package and manufacturer quote packet shape.

**Path B: CAD-native AI pilot**

Use Zoo API/MCP to generate the same part from the same source-backed requirements. Export KCL and STEP. Compare geometry, editability, time, and reviewer confidence against the CadQuery output.

## CTO Recommendation

Do not bet the product on prompt-only CAD generation.

The practical route is:

1. Keep current image/sketch generation as a visual-reference lane.
2. Build a deterministic CadQuery-based CAD draft lane for simple parts.
3. Pilot Zoo for AI-native CAD where prompt interaction is valuable but outputs remain reviewable.
4. Use Onshape or Fusion as the professional review/export environment.
5. Route scan-heavy or high-accuracy reverse-engineering work to Backflip, Geomagic, PolyWorks, or a qualified vendor.
6. Treat material treatments as advisory assumptions until confirmed by a qualified CAD/manufacturing reviewer or vendor.

This is reversible and low-risk because it preserves the current ReversR handoff model while adding a stronger CAD layer underneath it. If Zoo or Leo proves strong in pilot, ReversR can route more work there. If not, the local CadQuery/Onshape/Fusion workflow remains durable.

## Immediate Research Tasks

1. Create a test part spec: one simple machine bracket with source-backed dimensions, material, hole pattern, tolerance class, and intended process.
2. Run CadQuery proof-of-concept locally and export STEP/STL/3MF.
3. Test Zoo Text-to-CAD/API/MCP with the same part spec and export STEP/KCL.
4. Import both outputs into Onshape or Fusion for visual and dimensional inspection.
5. Ask a machinist or CAD reviewer to score both outputs against a vendor quote checklist.
6. Decide whether ReversR should integrate Zoo first, local CadQuery first, or both behind a routing layer.

## Working Product Rule

ReversR can generate CAD drafts, not certified manufacturing truth. The product should help a user move from machine evidence to reviewable CAD and vendor packets, while keeping final fabrication authority with qualified CAD/manufacturing review.

Operational sequence:

1. AI gate.
2. CAD draft.
3. Material/treatment review.
4. Reviewer approval for vendor quote/request readiness.
5. CAD qualification.
6. Qualified human/vendor release.

Reviewer approval is stored as a local reconstruction review record. The saved record captures reviewer identity, role, notes, AI CAD gate snapshot, material/treatment snapshot, release boundary, and whether the package is approved for vendor submission. A draft approval selector is not enough to prepare a vendor request; the approval must be saved as a review record first.
