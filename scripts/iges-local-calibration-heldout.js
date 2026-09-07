#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');
const p = require('../utils/igesSourcePipeline');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
(async () => {
  const outputDir = path.resolve(process.argv[2] || '.local/iges-heldout');
  assert(outputDir.split(path.sep).includes('.local'));
  fs.mkdirSync(outputDir, { recursive: true });
  const qualityMode = process.argv.includes('--quality');
  const logicFiles = ['utils/igesSourcePipeline.js', 'utils/igesVisualCalibration.js', 'utils/igesLocalCalibration.js', 'utils/igesRenderQuality.js'];
  const freeze = Object.fromEntries(logicFiles.map(file => [file, sha(file)]));
  p.writeJson(path.join(outputDir, 'frozen-logic.json'), freeze);
  const records = ['assem-1', 'bracket-1', 'isolator-1'].map(p.buildDatabaseSourceRecord);
  const corpus = JSON.parse(fs.readFileSync('docs/iges-calibration-corpus.seed.json'));
  for (const slot of corpus.sampleSlots) if (slot.status === 'admitted') {
    const s = slot.admittedSample;
    records.push({ id: `heldout-${s.id}`, status: 'approved', sourceAssetId: s.id, sourcePath: path.resolve(s.sourcePath), approvedSha256: s.sourceSha256, expectedUnits: s.expectedUnits, expectedSubfigures: s.expectedSubfigures, renderPresetId: p.DEFAULT_RENDER_PRESET.id });
  }
  const report = { qualityMode, frozenLogic: freeze, referenceImagesRead: false, interpretation: 'Regression held out from this calibration pass; historical fixtures are not previously unseen generalization evidence', sources: [], unavailableSupplierCoverage: 'Other corpus slots remain acquisition/terms gated; no claim of 12–20 sample coverage' };
  for (const record of records) {
    const binding = p.buildDatabaseSourceBinding(record); assert(binding.ok, binding.reason);
    const root = path.join(outputDir, record.sourceAssetId);
    if (qualityMode) {
      const sourceOnly = await p.runIgesSourcePipeline({ sourceBinding: binding, outputDir: path.join(root, 'legacy-source-inspection') });
      binding.renderPreset = { ...binding.renderPreset, id: 'heldout-quality-v1', lightDirection: [0.7,-0.6,1], renderQuality: { version: 'iges-quality-v1', shading: 'occt-normals', edges: 'topology', materialModel: 'diffuse', faceForwardLighting: true, shadow: { normal: [0,0,1], offset: sourceOnly.sceneManifest.boundingBox.min[2], radiusPixels: 3, opacity: 0.22 } } };
    }
    const baseline = await p.runIgesSourcePipeline({ sourceBinding: binding, outputDir: path.join(root, 'baseline') });
    const repeated = await p.runIgesSourcePipeline({ sourceBinding: binding, outputDir: path.join(root, 'repeat') });
    p.assertEquivalentResults(baseline, repeated);
    assert.equal(baseline.render.sha256, repeated.render.sha256);
    assert.equal(baseline.stl.sha256, repeated.stl.sha256);
    const fixture = await p.runIgesSourcePipeline({ sourceBinding: { ...binding, resolverType: 'controlled_fixture', sourceRecordId: null }, outputDir: path.join(root, 'fixture') });
    const parity = p.assertEquivalentResults(fixture, baseline);
    const renamedPath = path.join(root, 'unrelated-renamed-source.IGS'); fs.copyFileSync(record.sourcePath, renamedPath);
    const renamed = await p.runIgesSourcePipeline({ sourceBinding: { ...p.buildDatabaseSourceBinding({ ...record, sourcePath: renamedPath }), renderPreset: binding.renderPreset }, outputDir: path.join(root, 'renamed') });
    assert.equal(renamed.render.sha256, baseline.render.sha256);
    assert.equal(renamed.render.meshGeometrySha256, baseline.render.meshGeometrySha256);
    assert.equal(renamed.stl.sha256, baseline.stl.sha256);
    assert.equal(renamed.confidence.score, baseline.confidence.score);
    const withoutFileName = scene => { const { sourceFileName, ...geometry } = scene; return geometry; };
    assert.deepEqual(withoutFileName(renamed.sceneManifest), withoutFileName(baseline.sceneManifest));
    if (qualityMode) {
      const relit = await p.runIgesSourcePipeline({ sourceBinding: { ...binding, renderPreset: { ...binding.renderPreset, id: 'heldout-relit-quality-v1', lightDirection: [-0.7,0.6,1] } }, outputDir: path.join(root, 'relit') });
      assert.equal(relit.sceneManifestHash, baseline.sceneManifestHash);
      assert.equal(relit.render.meshGeometrySha256, baseline.render.meshGeometrySha256);
      assert.equal(relit.stl.sha256, baseline.stl.sha256);
      assert.deepEqual(relit.render.visibleMeshPixelCounts, baseline.render.visibleMeshPixelCounts);
      assert.equal(relit.confidence.score, baseline.confidence.score);
    }
    const rotations = [];
    for (const [i, [viewDirection, upDirection]] of [ [[1,1,1],[0,1,0]], [[-1,1,1],[0,0,1]], [[1,-1,1],[1,0,0]], [[0,0,1],[0,1,0]] ].entries()) {
      const sourceBinding = { ...binding, renderPreset: { ...binding.renderPreset, id: `heldout-basis-${i}`, projection: { mode: 'basis', viewDirection, upDirection } } };
      const result = await p.runIgesSourcePipeline({ sourceBinding, outputDir: path.join(root, `basis-${i}`) });
      const repeat = await p.runIgesSourcePipeline({ sourceBinding, outputDir: path.join(root, `basis-${i}-repeat`) });
      assert.equal(result.render.sha256, repeat.render.sha256);
      assert.equal(result.stl.sha256, baseline.stl.sha256);
      assert.equal(result.sceneManifestHash, baseline.sceneManifestHash);
      assert.equal(result.render.meshGeometrySha256, baseline.render.meshGeometrySha256);
      assert(result.render.viewport.allVisibleGeometryWithinFrame);
      assert(result.render.outputCompleteness.nonEmpty);
      rotations.push({ projection: sourceBinding.renderPreset.projection, render: result.render, deterministic: true, unchangedGeometry: true });
    }
    report.sources.push({ id: record.sourceAssetId, sourceSha256: record.approvedSha256, sourceUnits: baseline.sceneManifest.sourceUnits, meshUnits: baseline.sceneManifest.meshUnits, unitConversion: baseline.sceneManifest.unitConversion, assembly: baseline.sceneManifest.assemblyResolution, meshCount: baseline.sceneManifest.totalMeshCount, triangles: baseline.sceneManifest.totalTriangles, bounds: baseline.sceneManifest.boundingBox, confidence: baseline.confidence, outputCompleteness: baseline.render.outputCompleteness, parity, deterministicRepeat: true, renameInvariant: true, renameMetadataDifference: 'Only sourceFileName and its scene manifest hash change; geometry/render/STL/confidence unchanged', rotations });
    console.log(record.sourceAssetId, 'passed', baseline.confidence.score);
  }
  assert.deepEqual(Object.fromEntries(logicFiles.map(file => [file, sha(file)])), freeze, 'Generic logic changed after freeze');
  p.writeJson(path.join(outputDir, 'report.json'), report);
  console.log('Frozen held-out regression passed; no reference images read.');
})().catch(error => { console.error(error); process.exitCode = 1; });
