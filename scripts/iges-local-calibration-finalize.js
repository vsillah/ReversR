#!/usr/bin/env node
// Revalidate and consolidate local calibration passes without rerunning search.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');
const { PNG } = require('pngjs');
const p = require('../utils/igesSourcePipeline');
const { loadImage } = require('../utils/igesVisualCalibration');
const { cropImage, describeImage, compareImages, applyRenderGates, writeReview } = require('../utils/igesLocalCalibration');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
(async () => {
  const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const outputDir = path.resolve(manifest.outputDir);
  assert(outputDir.split(path.sep).includes('.local'), 'Private output requires .local directory');
  const report = { schemaVersion: 1, rubricId: 'foreground-silhouette-edge-v1', productionPresetChangeApproved: false, goldenReady: false, geometryModified: false, assets: [], trace: [], sourceReports: manifest.reportPaths };
  for (const file of manifest.reportPaths) {
    const previous = JSON.parse(fs.readFileSync(file));
    report.trace.push(...previous.trace);
    for (const asset of previous.assets) {
      const existing = report.assets.find(a => a.id === asset.id);
      if (!existing) report.assets.push(asset);
      else {
        for (const view of asset.views) {
          const oldIndex = existing.views.findIndex(v => v.id === view.id);
          if (oldIndex >= 0) { view.previousPass = existing.views[oldIndex]; existing.views[oldIndex] = view; }
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
      view.referenceArtifact = dest;
      view.provenance.derivedReferenceSha256 = hash(dest);
      view.provenance.derivedReferencePolicy = 'Regenerated from pinned raw image and pinned crop in finalizer; prior derived pixels ignored';
      if (!view.best) continue;
      assert.equal(hash(view.best.render.outputPath), view.best.render.sha256, 'Prior candidate image changed');
      const result = await p.runIgesSourcePipeline({ sourceBinding: { ...p.buildDatabaseSourceBinding(source.record), renderPreset: view.best.preset }, outputDir: path.join(outputDir, asset.id, 'final') });
      assert.equal(result.sceneManifestHash, asset.baseline.sceneManifestHash);
      assert.equal(result.stl.sha256, asset.baseline.stl.sha256);
      const required = source.requiredVisibleNodes?.[view.id] || [];
      const ref = describeImage(targetImage);
      const features = describeImage(loadImage(result.render.outputPath));
      const comparison = applyRenderGates(compareImages(features, ref), result.render, features, required);
      view.previousMeasuredBest = view.best;
      view.best = { ...view.best, comparison, render: result.render, source_confidence_score: result.confidence.score, sceneManifestHash: result.sceneManifestHash, stlSha256: result.stl.sha256 };
      view.provenance.requiredVisibleNodes = required;
      view.baselineComparison = compareImages(describeImage(loadImage(asset.baseline.render.outputPath)), ref);
      view.validation = { imageHashMatches: hash(result.render.outputPath) === result.render.sha256, sourceConfidenceUsesReference: result.confidence.referenceImagesUsedForScore, geometryAndStlUnchanged: true, projectedGeometryWithinFrame: result.render.viewport.allVisibleGeometryWithinFrame, foregroundTouchesCanvas: features.touchesCanvas, requiredVisibleNodePixels: Object.fromEntries(required.map(n => [n, result.render.visibleNodePixels[n]])), status: comparison.gateReasons.length || !Number.isFinite(comparison.visual_fidelity_score) ? 'blocked' : 'ready_for_human_semantic_review' };
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
})().catch(error => { console.error(error); process.exitCode = 1; });
