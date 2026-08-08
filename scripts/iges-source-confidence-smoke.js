#!/usr/bin/env node

const path = require('path');
const {
  buildControlledFixtureBinding,
  defaultOutputDir,
  runIgesSourcePipeline,
  writeJson,
} = require('../utils/igesSourcePipeline');

const evidenceFile = process.env.IGES_SOURCE_CONFIDENCE_EVIDENCE_FILE || 'docs/iges-source-confidence-smoke-evidence.json';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

(async () => {
  const binding = buildControlledFixtureBinding();
  assert(binding.ok, binding.reason || 'Controlled fixture binding failed.');
  const result = await runIgesSourcePipeline({
    sourceBinding: binding,
    outputDir: path.join(defaultOutputDir, 'source-confidence'),
    includeStl: true,
  });

  assert(result.confidence.rubricId === 'iges-source-confidence-v1', 'Unexpected source confidence rubric.');
  assert(result.confidence.score >= 70, `Source confidence score is below warning threshold: ${result.confidence.score}.`);
  assert(result.confidence.referenceImagesUsedForScore === false, 'Source confidence must not use reference images.');
  assert(result.confidence.componentScores.length >= 6, 'Source confidence is missing component evidence.');
  assert(result.confidence.sceneManifestHash === result.sceneManifestHash, 'Confidence evidence must carry the scene manifest hash.');

  const evidencePath = writeJson(evidenceFile, {
    schemaVersion: 1,
    status: 'pass',
    confidence: result.confidence,
    sceneManifestHash: result.sceneManifestHash,
    renderSha256: result.render.sha256,
    stlSha256: result.stl.sha256,
    usesJpgReference: false,
  });

  console.log('IGES source confidence smoke passed.');
  console.log(`Evidence: ${evidencePath}`);
})().catch(error => {
  console.error(`IGES source confidence smoke failed: ${error.message}`);
  process.exit(1);
});
