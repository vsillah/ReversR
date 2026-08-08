#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  buildControlledFixtureBinding,
  defaultOutputDir,
  runIgesSourcePipeline,
  writeJson,
} = require('../utils/igesSourcePipeline');

const evidenceFile = process.env.IGES_STL_EXPORT_EVIDENCE_FILE || 'docs/iges-stl-export-smoke-evidence.json';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

(async () => {
  const binding = buildControlledFixtureBinding();
  assert(binding.ok, binding.reason || 'Controlled fixture binding failed.');
  const result = await runIgesSourcePipeline({
    sourceBinding: binding,
    outputDir: path.join(defaultOutputDir, 'stl-export'),
    includeStl: true,
  });

  assert(fs.existsSync(result.stl.outputPath), 'STL output was not written.');
  assert(fs.statSync(result.stl.outputPath).size > 84, 'STL output is empty.');
  assert(result.stl.mimeType === 'model/stl', `Expected model/stl, found ${result.stl.mimeType}.`);
  assert(result.stl.fileType === 'binary_stl', `Expected binary_stl, found ${result.stl.fileType}.`);
  assert(result.stl.integrity.nonEmptyMesh, 'STL mesh is empty.');
  assert(result.stl.integrity.finiteCoordinates, 'STL contains non-finite coordinates.');
  assert(result.stl.integrity.triangleCountBounds.withinBounds, 'STL triangle count is outside bounds.');
  assert(result.stl.integrity.byteLengthMatchesTriangleCount, 'STL byte length does not match triangle count.');
  assert(result.stl.units === 'millimeter', `Expected millimeter STL units metadata, found ${result.stl.units}.`);
  assert(result.stl.noSilentRepair && result.stl.noSilentRescale, 'STL export must record no silent repair/rescale policy.');
  assert(result.stl.usesJpgReference === false, 'STL export must not use JPG/reference images.');

  const evidencePath = writeJson(evidenceFile, {
    schemaVersion: 1,
    status: 'pass',
    sourceAsset: result.sourceAsset,
    stl: result.stl,
    meshIntegrity: result.meshIntegrity,
    confidence: result.confidence,
    usesJpgReference: false,
  });

  console.log('IGES STL export smoke passed.');
  console.log(`Evidence: ${evidencePath}`);
})().catch(error => {
  console.error(`IGES STL export smoke failed: ${error.message}`);
  process.exit(1);
});
