#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  DEFAULT_RENDER_PRESET,
  defaultOutputDir,
  runIgesSourcePipeline,
  writeJson,
} = require('../utils/igesSourcePipeline');

const repoRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(repoRoot, 'docs', 'iges-calibration-corpus.seed.json');
const evidencePath = path.join(repoRoot, 'docs', 'iges-calibration-corpus-smoke-evidence.json');
const outputDir = path.join(defaultOutputDir, 'calibration-corpus');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const sha256File = filePath => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
const resolveRepoPath = value => path.isAbsolute(value) ? value : path.join(repoRoot, value);
const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const buildCorpusBinding = sample => {
  const sourcePath = resolveRepoPath(sample.sourcePath);
  assert(/\.(igs|iges)$/i.test(sourcePath), `Corpus sample ${sample.id} must bind an IGES source.`);
  assert(fs.existsSync(sourcePath), `Corpus sample ${sample.id} source file is missing.`);
  const actualSha256 = sha256File(sourcePath);
  assert(actualSha256 === sample.sourceSha256, `Corpus sample ${sample.id} source checksum mismatch.`);

  if (sample.referenceImage?.path) {
    const referencePath = resolveRepoPath(sample.referenceImage.path);
    assert(fs.existsSync(referencePath), `Corpus sample ${sample.id} reference image is missing.`);
    assert(sample.referenceImage.role === 'post_render_visual_calibration_only', `Corpus sample ${sample.id} reference image has invalid role.`);
    assert(sample.referenceImage.excludedFromSourceConfidence === true, `Corpus sample ${sample.id} reference image must be excluded from source confidence.`);
    assert(sha256File(referencePath) === sample.referenceImage.sha256, `Corpus sample ${sample.id} reference checksum mismatch.`);
  }

  return {
    ok: true,
    resolverType: 'calibration_corpus_fixture',
    sourceRecordId: null,
    sourceAsset: {
      id: sample.id,
      path: sourcePath,
      fileName: path.basename(sourcePath),
      fileType: 'model/iges',
      sha256: actualSha256,
      approvedSha256: sample.sourceSha256,
      expectedUnits: sample.expectedUnits || 'millimeter',
      expectedSubfigures: [...(sample.expectedSubfigures || [])],
    },
    renderPreset: { ...DEFAULT_RENDER_PRESET },
    stlExportPreset: {
      id: 'source-iges-binary-stl-v1',
      format: 'binary',
      mimeType: 'model/stl',
      scalingPolicy: 'no_rescale_source_units_recorded_as_millimeters',
    },
  };
};

(async () => {
  const manifest = readJson(manifestPath);
  const admittedSamples = manifest.sampleSlots
    .filter(slot => slot.status === 'admitted' && slot.admittedSample)
    .map(slot => ({
      slotId: slot.id,
      category: slot.category,
      ...slot.admittedSample,
    }));

  assert(admittedSamples.length >= 1, 'Expected at least one admitted calibration sample.');

  const results = [];
  for (const sample of admittedSamples) {
    const sourceBinding = buildCorpusBinding(sample);
    const result = await runIgesSourcePipeline({
      sourceBinding,
      outputDir,
      includeStl: true,
    });

    assert(result.sceneManifest.usesJpgReference === false, `Corpus sample ${sample.id} used a reference image in scene manifest.`);
    assert(result.confidence.referenceImagesUsedForScore === false, `Corpus sample ${sample.id} used a reference image for source confidence.`);
    assert(result.confidence.score >= 90, `Corpus sample ${sample.id} source confidence below expected smoke threshold.`);
    assert(result.meshIntegrity.nonEmptyMesh === true, `Corpus sample ${sample.id} produced an empty mesh.`);
    assert(result.stl.integrity.nonEmptyMesh === true, `Corpus sample ${sample.id} produced an empty STL.`);

    results.push({
      slotId: sample.slotId,
      sampleId: sample.id,
      category: sample.category,
      sourcePackage: sample.sourcePackage || null,
      sourcePackageVersion: sample.sourcePackageVersion || null,
      sourcePackageLicense: sample.sourcePackageLicense || null,
      sourceSha256: result.sourceAsset.sha256,
      referenceImageRole: sample.referenceImage?.role || null,
      referenceImageUsedForSourceConfidence: result.confidence.referenceImagesUsedForScore,
      sourceConfidenceScore: result.confidence.score,
      sceneManifestHash: result.sceneManifestHash,
      sourceUnits: result.sceneManifest.sourceUnits,
      totalTriangles: result.sceneManifest.totalTriangles,
      boundingBox: result.sceneManifest.boundingBox,
      renderOutput: path.relative(repoRoot, result.render.outputPath),
      stlOutput: path.relative(repoRoot, result.stl.outputPath),
      stlIntegrity: result.stl.integrity,
    });
  }

  writeJson(evidencePath, {
    schemaVersion: 1,
    status: 'pass',
    manifest: path.relative(repoRoot, manifestPath),
    outputDir: path.relative(repoRoot, outputDir),
    admittedSampleCount: results.length,
    results,
    sourceBoundary: manifest.sourceBoundary,
  });

  console.log('IGES calibration corpus smoke passed.');
  console.log(`Evidence: ${path.relative(repoRoot, evidencePath)}`);
  console.log(`Admitted samples rendered: ${results.length}`);
})().catch(error => {
  console.error(`IGES calibration corpus smoke failed: ${error.message}`);
  process.exit(1);
});
