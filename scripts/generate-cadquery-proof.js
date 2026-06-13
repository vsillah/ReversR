#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const outputDir = path.resolve(process.env.CADQUERY_PROOF_OUT || path.join(repoRoot, '.local', 'cadquery-proof'));
const localVenvPython = path.join(repoRoot, '.local', 'cadquery-venv', 'bin', 'python');
const pythonBin = process.env.PYTHON || (fs.existsSync(localVenvPython) ? localVenvPython : 'python3');

const sampleSpec = {
  specVersion: '0.1-cadquery-proof',
  partNumber: 'FARMBOT-GANTRY-PLATE-P001',
  partName: 'FarmBot-class gantry mounting plate proof',
  units: 'mm',
  material: '6061-T6 aluminum',
  intendedProcess: 'CNC machining or waterjet plate fabrication followed by deburr',
  expectedEnvironment: 'outdoor agricultural exposure with moisture, soil, UV, and washdown risk',
  materialTreatment: {
    surfaceFinish: 'deburr and bead-blasted or machined finish',
    treatment: 'Type II clear anodize or powder coat after fit review',
    purpose: 'corrosion resistance, cleaner handling surface, and outdoor durability',
    toleranceImpact: 'confirm hole sizes, flatness, and coating buildup after treatment',
    vendorConfirmationRequired: true,
  },
  dimensions: {
    length: 180,
    width: 72,
    thickness: 6,
    holeDiameter: 6.6,
    holeSpacing: 132,
    cornerRadius: 4,
  },
  sourceEvidence: [
    'Derived from ReversR FarmBot-class machine envelope as a local CAD proof.',
    'Dimensions are explicit sample inputs for CAD pipeline validation, not production release dimensions.',
  ],
  releaseBoundary: 'CAD proof output requires qualified CAD/manufacturing review before fabrication or vendor submission.',
};

const requiredSpecFields = [
  ['units', sampleSpec.units],
  ['material', sampleSpec.material],
  ['intendedProcess', sampleSpec.intendedProcess],
  ['expectedEnvironment', sampleSpec.expectedEnvironment],
  ['materialTreatment.treatment', sampleSpec.materialTreatment.treatment],
  ['materialTreatment.toleranceImpact', sampleSpec.materialTreatment.toleranceImpact],
  ['dimensions.length', sampleSpec.dimensions.length],
  ['dimensions.width', sampleSpec.dimensions.width],
  ['dimensions.thickness', sampleSpec.dimensions.thickness],
  ['dimensions.holeDiameter', sampleSpec.dimensions.holeDiameter],
  ['dimensions.holeSpacing', sampleSpec.dimensions.holeSpacing],
];

const ensureDir = dir => fs.mkdirSync(dir, { recursive: true });

const writeJson = (filePath, data) => {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
};

const validationPath = path.join(outputDir, 'cadquery-proof-validation.json');

const fail = (message, extra = {}) => {
  writeJson(validationPath, {
    status: 'failed',
    generatedAt: new Date().toISOString(),
    message,
    outputDir,
    ...extra,
  });
  console.error(message);
  process.exit(1);
};

ensureDir(outputDir);

const missingFields = requiredSpecFields
  .filter(([, value]) => value === undefined || value === null || value === '' || Number(value) <= 0 && typeof value === 'number')
  .map(([field]) => field);

if (missingFields.length > 0) {
  fail('CadQuery proof spec is missing required dimensions, units, material, or treatment notes.', { missingFields });
}

const specPath = path.join(outputDir, 'sample-bracket-spec.json');
const sourcePath = path.join(outputDir, 'sample-bracket.cq.py');
const stepPath = path.join(outputDir, 'sample-bracket.step');
const stlPath = path.join(outputDir, 'sample-bracket.stl');
const optional3mfPath = path.join(outputDir, 'sample-bracket.3mf');
const previewPath = path.join(outputDir, 'sample-bracket-preview.json');

writeJson(specPath, sampleSpec);

const pythonSource = `import json
from pathlib import Path
import cadquery as cq
from cadquery import exporters

OUT = Path(__file__).resolve().parent
SPEC = json.loads((OUT / "sample-bracket-spec.json").read_text())
D = SPEC["dimensions"]

plate = (
    cq.Workplane("XY")
    .box(D["length"], D["width"], D["thickness"])
    .edges("|Z")
    .fillet(D["cornerRadius"])
    .faces(">Z")
    .workplane()
    .pushPoints([(-D["holeSpacing"] / 2, 0), (D["holeSpacing"] / 2, 0)])
    .hole(D["holeDiameter"])
)

exporters.export(plate, str(OUT / "sample-bracket.step"))
exporters.export(plate, str(OUT / "sample-bracket.stl"), tolerance=0.05, angularTolerance=0.1)

try:
    exporters.export(plate, str(OUT / "sample-bracket.3mf"))
    has_3mf = True
except Exception:
    has_3mf = False

preview = {
    "partNumber": SPEC["partNumber"],
    "partName": SPEC["partName"],
    "units": SPEC["units"],
    "boundingBoxMm": {
        "length": D["length"],
        "width": D["width"],
        "height": D["thickness"]
    },
    "holePattern": {
        "holeDiameter": D["holeDiameter"],
        "holeSpacing": D["holeSpacing"],
        "holeCount": 2
    },
    "material": SPEC["material"],
    "intendedProcess": SPEC["intendedProcess"],
    "materialTreatment": SPEC["materialTreatment"],
    "artifactFiles": {
        "cadquerySource": str(OUT / "sample-bracket.cq.py"),
        "step": str(OUT / "sample-bracket.step"),
        "stl": str(OUT / "sample-bracket.stl"),
        "threeMf": str(OUT / "sample-bracket.3mf") if has_3mf else None
    },
    "releaseBoundary": SPEC["releaseBoundary"]
}

(OUT / "sample-bracket-preview.json").write_text(json.dumps(preview, indent=2) + "\\n")
`;

fs.writeFileSync(sourcePath, pythonSource);

const availability = spawnSync(pythonBin, ['-c', 'import cadquery as cq; print(getattr(cq, "__version__", "unknown"))'], {
  encoding: 'utf8',
});

if (availability.status !== 0) {
  fail('CadQuery is not installed in the selected Python environment. Install cadquery in a local Python environment, then rerun npm run cadquery:proof.', {
    pythonBin,
    specPath,
    sourcePath,
    stderr: availability.stderr.trim(),
    stdout: availability.stdout.trim(),
    installHint: 'python3 -m venv .local/cadquery-venv && .local/cadquery-venv/bin/python -m pip install cadquery',
  });
}

const run = spawnSync(pythonBin, [sourcePath], {
  encoding: 'utf8',
});

if (run.status !== 0) {
  fail('CadQuery proof generation failed.', {
    pythonBin,
    specPath,
    sourcePath,
    stderr: run.stderr.trim(),
    stdout: run.stdout.trim(),
  });
}

const requiredArtifacts = [sourcePath, specPath, stepPath, stlPath, previewPath];
const missingArtifacts = requiredArtifacts.filter(filePath => !fs.existsSync(filePath) || fs.statSync(filePath).size === 0);

if (missingArtifacts.length > 0) {
  fail('CadQuery proof did not produce all required artifact paths.', {
    missingArtifacts,
    requiredArtifacts,
  });
}

const artifactFiles = {
  spec: specPath,
  cadquerySource: sourcePath,
  step: stepPath,
  stl: stlPath,
  threeMf: fs.existsSync(optional3mfPath) && fs.statSync(optional3mfPath).size > 0 ? optional3mfPath : null,
  preview: previewPath,
};

writeJson(validationPath, {
  status: 'passed',
  generatedAt: new Date().toISOString(),
  cadqueryVersion: availability.stdout.trim(),
  outputDir,
  artifactFiles,
  checks: [
    'dimensions present',
    'units present',
    'material present',
    'material treatment notes present',
    'STEP generated',
    'STL generated',
    'preview metadata generated',
  ],
  releaseBoundary: sampleSpec.releaseBoundary,
});

console.log('CadQuery proof generated.');
console.log(`Output: ${outputDir}`);
console.log(`Validation: ${validationPath}`);
