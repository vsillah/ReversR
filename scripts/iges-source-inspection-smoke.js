#!/usr/bin/env node

const path = require('path');
const {
  buildControlledFixtureBinding,
  defaultOutputDir,
  runIgesSourcePipeline,
  writeJson,
} = require('../utils/igesSourcePipeline');

const evidenceFile = process.env.IGES_SOURCE_INSPECTION_EVIDENCE_FILE || 'docs/iges-source-inspection-smoke-evidence.json';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

(async () => {
  const binding = buildControlledFixtureBinding();
  assert(binding.ok, binding.reason || 'Controlled fixture binding failed.');

  const result = await runIgesSourcePipeline({
    sourceBinding: binding,
    outputDir: path.join(defaultOutputDir, 'source-inspection'),
    includeStl: false,
  });

  assert(result.sceneManifest.sourceUnits === 'millimeter', `Expected millimeter units, found ${result.sceneManifest.sourceUnits}.`);
  assert(result.sceneManifest.totalMeshCount >= 1, 'IGES import produced no meshes.');
  assert(result.sceneManifest.totalTriangles > 0, 'IGES import produced no triangles.');
  for (const expected of binding.sourceAsset.expectedSubfigures) {
    assert(result.sceneManifest.assemblySubfigures.includes(expected), `Missing assembly subfigure ${expected}.`);
  }
  assert(result.sceneManifest.usesJpgReference === false, 'JPG references must not be used by source inspection.');

  const evidencePath = writeJson(evidenceFile, {
    schemaVersion: 1,
    status: 'pass',
    sourceAsset: result.sourceAsset,
    sceneManifestHash: result.sceneManifestHash,
    sourceUnits: result.sceneManifest.sourceUnits,
    assemblySubfigures: result.sceneManifest.assemblySubfigures,
    meshIntegrity: result.meshIntegrity,
    usesJpgReference: false,
  });

  console.log('IGES source inspection smoke passed.');
  console.log(`Evidence: ${evidencePath}`);
})().catch(error => {
  console.error(`IGES source inspection smoke failed: ${error.message}`);
  process.exit(1);
});
