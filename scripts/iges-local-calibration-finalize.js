#!/usr/bin/env node
// Revalidate and consolidate local calibration passes without rerunning search.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');
const { PNG } = require('pngjs');
const p = require('../utils/igesSourcePipeline');
const { loadImage } = require('../utils/igesVisualCalibration');
const { cropImage, describeImage, compareImages, applyRenderGates, descriptorEvidence, resolveRequiredNodes, writeReview } = require('../utils/igesLocalCalibration');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const validateSourceReports = (manifest, reports) => {
  assert(manifest.sources.length > 0 && reports.length > 0, 'Finalization requires pinned sources and reports');
  const bindings = new Map();
  for (const source of manifest.sources) {
    assert(/^[a-z0-9][a-z0-9-]*$/.test(source.id), 'Unsafe source ID');
    assert(!bindings.has(source.id), 'Duplicate pinned source ID');
    const binding = p.buildDatabaseSourceBinding(source.record);
    assert(binding.ok, binding.reason);
    assert.equal(binding.sourceAsset.id, source.id, 'Pinned source ID mismatch');
    bindings.set(source.id, binding);
  }
  const scenes = new Map();
  for (const report of reports) for (const asset of report.assets) {
    const binding = bindings.get(asset.id);
    assert(binding, 'Missing pinned source record');
    const old = asset.baseline?.sourceAsset;
    assert(old, 'Report lacks source binding');
    for (const key of ['id', 'sha256', 'approvedSha256', 'expectedUnits']) assert.equal(old[key], binding.sourceAsset[key], `Report source ${key} mismatch`);
    assert.equal(path.resolve(old.path), path.resolve(binding.sourceAsset.path), 'Report source path mismatch');
    assert.equal(asset.baseline.sourceRecordId, binding.sourceRecordId, 'Report record binding mismatch');
    assert.deepEqual(old.expectedSubfigures, binding.sourceAsset.expectedSubfigures, 'Report assembly expectation mismatch');
    if (scenes.has(asset.id)) assert.equal(asset.baseline.sceneManifestHash, scenes.get(asset.id), 'Cross-report geometry mismatch');
    scenes.set(asset.id, asset.baseline.sceneManifestHash);
  }
  return bindings;
};
const finalize = async manifest => {
  const outputDir = path.resolve(manifest.outputDir);
  assert(outputDir.split(path.sep).includes('.local'), 'Private output requires .local directory');
  const report = { schemaVersion: 1, rubricId: 'foreground-silhouette-edge-v1', productionPresetChangeApproved: false, goldenReady: false, geometryModified: false, assets: [], trace: [], sourceReports: manifest.reportPaths };
  const reports = manifest.reportPaths.map(file => JSON.parse(fs.readFileSync(file)));
  validateSourceReports(manifest, reports);
  for (const previous of reports) {
    report.trace.push(...previous.trace);
    for (const asset of previous.assets) {
      const existing = report.assets.find(a => a.id === asset.id);
      if (!existing) report.assets.push(asset);
      else {
        for (const view of asset.views) {
          const oldIndex = existing.views.findIndex(v => v.id === view.id);
          if (oldIndex >= 0) { view.provenance.requiredVisibleNodes = resolveRequiredNodes({}, view.provenance, existing.views[oldIndex].provenance.requiredVisibleNodes); view.previousPass = existing.views[oldIndex]; existing.views[oldIndex] = view; }
          else existing.views.push(view);
        }
        if (asset.displayHypothesis) existing.displayHypothesis = asset.displayHypothesis;
      }
    }
  }
  // Commit all default baselines before reading reference bytes in this pass.
  for (const asset of report.assets) {
    const source = manifest.sources.find(s => s.id === asset.id);
    assert(source, 'Missing pinned source record');
    asset.baseline = await p.runIgesSourcePipeline({ sourceBinding: p.buildDatabaseSourceBinding(source.record), outputDir: path.join(outputDir, asset.id, 'baseline') });
    assert(asset.baseline.render.viewport.allVisibleGeometryWithinFrame);
    const fixture = await p.runIgesSourcePipeline({ sourceBinding: { ...p.buildDatabaseSourceBinding(source.record), resolverType: 'controlled_fixture', sourceRecordId: null }, outputDir: path.join(outputDir, asset.id, 'fixture') });
    asset.equivalence = p.assertEquivalentResults(fixture, asset.baseline);
    report.trace.push({ phase: 'final-baseline', id: asset.id, referenceRead: false, sha256: asset.baseline.render.sha256 });
  }
  for (const asset of report.assets) {
    const source = manifest.sources.find(s => s.id === asset.id);
    for (const view of asset.views) {
      const pinnedReference = source.references.find(reference => reference.id === view.id);
      assert(pinnedReference, 'Missing pinned reference');
      assert.equal(view.provenance.path, pinnedReference.path);
      assert.equal(view.provenance.sha256, pinnedReference.sha256);
      assert.equal(hash(pinnedReference.path), pinnedReference.sha256);
      assert(pinnedReference.kind === 'standalone_view' || (pinnedReference.kind === 'drawing_view_crop' && pinnedReference.crop && pinnedReference.mappingProvenance), 'Unreviewed drawing crop');
      const rawReference = loadImage(pinnedReference.path);
      const targetImage = cropImage(rawReference, pinnedReference.crop);
      const dest = path.join(outputDir, asset.id, `${view.id}-reference.png`);
      fs.writeFileSync(dest, PNG.sync.write(targetImage));
      view.provenance = { ...view.provenance, ...pinnedReference, requiredVisibleNodes: resolveRequiredNodes(source, pinnedReference, view.provenance.requiredVisibleNodes), mappingProvenance: pinnedReference.mappingProvenance || null, fullImageDimensions: [rawReference.width, rawReference.height], crop: pinnedReference.crop || { x: 0, y: 0, width: rawReference.width, height: rawReference.height }, mapping: pinnedReference.mappingProvenance || 'Supplier named standalone view, independent file; not inferred as a crop from drawing sheet' };
      view.referenceDescriptor = descriptorEvidence(describeImage(targetImage));
      view.referenceArtifact = dest;
      view.provenance.derivedReferenceSha256 = hash(dest);
      view.provenance.derivedReferencePolicy = 'Regenerated from pinned raw image and pinned crop in finalizer; prior derived pixels ignored';
      if (!view.best) continue;
      assert.equal(hash(view.best.render.outputPath), view.best.render.sha256, 'Prior candidate image changed');
      const result = await p.runIgesSourcePipeline({ sourceBinding: { ...p.buildDatabaseSourceBinding(source.record), renderPreset: view.best.preset }, outputDir: path.join(outputDir, asset.id, 'final') });
      assert.equal(result.sceneManifestHash, asset.baseline.sceneManifestHash);
      assert.equal(result.stl.sha256, asset.baseline.stl.sha256);
      const required = view.provenance.requiredVisibleNodes;
      const ref = describeImage(targetImage);
      const features = describeImage(loadImage(result.render.outputPath));
      const comparison = applyRenderGates(compareImages(features, ref), result.render, features, required);
      view.previousMeasuredBest = view.best;
      view.best = { ...view.best, comparison, render: result.render, source_confidence_score: result.confidence.score, sceneManifestHash: result.sceneManifestHash, stlSha256: result.stl.sha256 };
      view.provenance.requiredVisibleNodes = required;
      view.baselineComparison = compareImages(describeImage(loadImage(asset.baseline.render.outputPath)), ref);
      view.validation = { imageHashMatches: hash(result.render.outputPath) === result.render.sha256, sourceConfidenceUsesReference: result.confidence.referenceImagesUsedForScore, geometryAndStlUnchanged: true, projectedGeometryWithinFrame: result.render.viewport.allVisibleGeometryWithinFrame, foregroundTouchesCanvas: features.touchesCanvas, requiredVisibleNodePixels: Object.fromEntries(required.map(n => [typeof n === 'string' ? n : JSON.stringify(n), p.resolveNodeVisibility(result.render, n).pixels])), status: comparison.gateReasons.length || !Number.isFinite(comparison.visual_fidelity_score) ? 'blocked' : 'ready_for_human_semantic_review' };
      if (view.validation.status === 'blocked') {
        view.rejectedFinalCandidate = view.best;
        view.best = null;
        view.finalizationStatus = 'blocked_no_eligible_final_candidate';
      }
      if (source.semanticReview?.[view.id]) view.semanticReview = source.semanticReview[view.id];
      view.residualIssues = [...new Set([...view.residualIssues.filter(issue => !issue.startsWith('Final silhouette IoU')),  'No source-stored drawing/view entities; named-view cameras inferred as render experiments.', 'Ground shadows and CAD display annotations are not modeled.'])];
      console.log(asset.id, view.id, comparison.visual_fidelity_score, view.validation.status);
    }
  }
  p.writeJson(path.join(outputDir, 'report.json'), report); writeReview(report, outputDir);
  console.log(path.join(outputDir, 'index.html'));
  return report;
};
module.exports = { finalize, validateSourceReports };
if (require.main === module) finalize(JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))).catch(error => { console.error(error); process.exitCode = 1; });
