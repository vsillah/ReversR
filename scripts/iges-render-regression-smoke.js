#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  buildControlledFixtureBinding,
  defaultOutputDir,
  runIgesSourcePipeline,
  writeJson,
} = require('../utils/igesSourcePipeline');

const evidenceFile = process.env.IGES_RENDER_REGRESSION_EVIDENCE_FILE || 'docs/iges-render-regression-smoke-evidence.json';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

(async () => {
  const binding = buildControlledFixtureBinding();
  assert(binding.ok, binding.reason || 'Controlled fixture binding failed.');

  const first = await runIgesSourcePipeline({
    sourceBinding: binding,
    outputDir: path.join(defaultOutputDir, 'render-regression-first'),
    includeStl: false,
  });
  const second = await runIgesSourcePipeline({
    sourceBinding: binding,
    outputDir: path.join(defaultOutputDir, 'render-regression-second'),
    includeStl: false,
  });

  assert(fs.existsSync(first.render.outputPath), 'First render output was not written.');
  assert(fs.statSync(first.render.outputPath).size > 0, 'First render output is empty.');
  assert(first.render.mimeType === 'image/png', `Expected image/png, found ${first.render.mimeType}.`);
  assert(first.render.width === binding.renderPreset.width, 'Render width does not match preset.');
  assert(first.render.height === binding.renderPreset.height, 'Render height does not match preset.');
  assert(first.render.outputCompleteness.nonEmpty, 'Render output is visually empty.');
  assert(first.render.sha256 === second.render.sha256, 'Deterministic render hash changed between identical fixture runs.');
  assert(first.confidence.referenceImagesUsedForScore === false, 'Render confidence must not use JPG/reference images.');

  const evidencePath = writeJson(evidenceFile, {
    schemaVersion: 1,
    status: 'pass',
    render: first.render,
    repeatedRenderSha256: second.render.sha256,
    sceneManifestHash: first.sceneManifestHash,
    confidence: first.confidence,
    usesJpgReference: false,
  });

  console.log('IGES render regression smoke passed.');
  console.log(`Evidence: ${evidencePath}`);
})().catch(error => {
  console.error(`IGES render regression smoke failed: ${error.message}`);
  process.exit(1);
});
