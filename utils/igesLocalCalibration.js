const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');
const { PNG } = require('pngjs');
const pipeline = require('./igesSourcePipeline');
const { loadImage, mergePreset } = require('./igesVisualCalibration');

const hashFile = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const safeId = id => { assert(/^[a-z0-9][a-z0-9-]*$/.test(id), 'Unsafe artifact ID'); return id; };
const gray = (image, x, y) => { const i = (y * image.width + x) * 4; return (image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3; };

// Explicit pixel crop only. A whole drawing sheet must provide a reviewed view
// crop; this module never guesses a projection from title blocks or dimensions.
const cropImage = (image, crop) => {
  if (!crop) return image;
  const { x, y, width, height } = crop;
  assert([x, y, width, height].every(Number.isInteger) && x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= image.width && y + height <= image.height, 'Invalid view crop');
  const data = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row++) Buffer.from(image.data).copy(data, row * width * 4, ((y + row) * image.width + x) * 4, ((y + row) * image.width + x + width) * 4);
  return { width, height, data };
};

// Background is estimated independently for each scanline from both borders.
// Dark model pixels dominate over soft ground shadows. Normalization preserves
// aspect; masks are never stretched to force a match.
const describeImage = image => {
  const w = image.width, h = image.height;
  const mask = new Uint8Array(w * h);
  let minX = w, minY = h, maxX = -1, maxY = -1, count = 0;
  for (let y = 0; y < h; y++) {
    const bg = (gray(image, 0, y) + gray(image, w - 1, y)) / 2;
    for (let x = 0; x < w; x++) if (bg - gray(image, x, y) > 42) {
      mask[y * w + x] = 1; count++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  const valid = count >= 32 && maxX > minX && maxY > minY && count / (w * h) < 0.95;
  const size = 160, normalized = new Uint8Array(size * size), edges = new Uint8Array(size * size);
  if (!valid) return { valid: false, count, mask: normalized, edges, reason: 'Missing, blank, or unsegmentable foreground' };
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const scale = (size - 8) / Math.max(bw, bh), ox = (size - bw * scale) / 2, oy = (size - bh * scale) / 2;
  let luminance = 0, samples = 0;
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    const sx = Math.floor((x - ox) / scale + minX), sy = Math.floor((y - oy) / scale + minY);
    if (sx < minX || sy < minY || sx > maxX || sy > maxY) continue;
    const i = y * size + x; normalized[i] = mask[sy * w + sx];
    if (normalized[i]) { luminance += gray(image, sx, sy); samples++; }
    const d = Math.max(1, Math.round(1 / scale));
    const l = gray(image, Math.max(0, sx - d), sy), r = gray(image, Math.min(w - 1, sx + d), sy);
    const t = gray(image, sx, Math.max(0, sy - d)), b = gray(image, sx, Math.min(h - 1, sy + d));
    if (Math.abs(l - r) + Math.abs(t - b) > 35) edges[i] = 1;
  }
  return { valid, count, touchesCanvas: minX <= 0 || minY <= 0 || maxX >= w - 1 || maxY >= h - 1, mask: normalized, edges, boundingBox: { x: minX, y: minY, width: bw, height: bh }, width: w, height: h, foregroundFraction: count / (w * h), luminance: luminance / Math.max(1, samples), normalization: { method: 'independent foreground bounds, aspect-preserving letterbox', size, scale, offset: [ox, oy], foregroundThreshold: 42, source: 'image border per scanline' } };
};
const overlap = (a, b) => { let i = 0, u = 0; for (let n = 0; n < a.length; n++) { if (a[n] && b[n]) i++; if (a[n] || b[n]) u++; } return u ? i / u : 0; };
const edgeRecall = (a, b) => { let total = 0, matched = 0; for (let i = 0; i < a.length; i++) if (a[i]) { total++; const x = i % 160, y = Math.floor(i / 160); let hit = false; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && x + dx < 160 && y + dy >= 0 && y + dy < 160 && b[(y + dy) * 160 + x + dx]) hit = true; if (hit) matched++; } return total ? matched / total : 0; };
const compareImages = (a, b) => {
  if (!a.valid || !b.valid) return { visual_fidelity_score: null, status: 'unscorable', reason: 'Both images require nonblank foreground' };
  const silhouette = overlap(a.mask, b.mask), edge = (edgeRecall(a.edges, b.edges) + edgeRecall(b.edges, a.edges)) / 2;
  const framing = Math.max(0, 1 - Math.abs(a.foregroundFraction - b.foregroundFraction));
  const lighting = Math.max(0, 1 - Math.abs(a.luminance - b.luminance) / 255);
  return { visual_fidelity_score: Math.round(1000 * (silhouette * 0.65 + edge * 0.3 + framing * 0.03 + lighting * 0.02)) / 10, status: 'heuristic_human_review_required', components: { silhouetteIoU: silhouette, internalAndBoundaryEdgeAgreement: edge, framing, lightingMaterial: lighting, resolutionAspectDelta: Math.abs(a.width / a.height - b.width / b.height) }, uncertainty: ['Image silhouette and edges cannot certify engineering geometry or component identity.', 'Soft shadows, CAD selection marks and annotations can affect segmentation.', 'Foreground alignment removes translation and uniform image scale only; original framing is reported separately.'] };
};
const descriptorEvidence = ({ mask, edges, ...rest }) => rest;

const cameraPresets = () => {
  const result = [], seen = new Set();
  // Six axis views, four image-plane rotations each, then bounded isometric
  // candidates. View names carry no assumed relation to IGES coordinate axes.
  for (const yaw of [0, 90, 180, 270]) for (const pitch of [0, 90, -90, 180]) for (const roll of [0, 90, 180, 270]) {
    const key = `${yaw}-${pitch}-${roll}`;
    if (seen.has(key)) continue; seen.add(key);
    result.push({ id: `orthographic-${key}`, projection: { mode: 'euler', yawDeg: yaw, pitchDeg: pitch, rollDeg: roll } });
  }
  for (const yaw of [45, 135, 225, 315]) for (const pitch of [35, -35, 145, -145]) for (const roll of [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]) result.push({ id: `isometric-${yaw}-${pitch}-${roll}`, projection: { mode: 'euler', yawDeg: yaw, pitchDeg: pitch, rollDeg: roll } });
  return result;
};
const applyRenderGates = (comparison, render, features, requiredVisibleNodes = []) => {
  const reasons = [];
  if (!render.viewport.allVisibleGeometryWithinFrame || features.touchesCanvas) reasons.push('Visible geometry or foreground touches/exceeds canvas');
  for (const name of requiredVisibleNodes) if (!(render.visibleNodePixels[name] > 0)) reasons.push(`Required source component has no visible face pixels: ${name}`);
  return reasons.length ? { ...comparison, rejectedHeuristicScore: comparison.visual_fidelity_score, visual_fidelity_score: null, status: 'blocked_render_semantics', gateReasons: reasons } : { ...comparison, gateReasons: [], visibleComponentCheck: requiredVisibleNodes.length ? 'source node face pixels verified; human semantic review still required' : 'no component-specific pixel gate supplied' };
};
const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const writeReview = (report, outputDir) => {
  const url = p => encodeURI(path.relative(outputDir, p)).replace(/#/g, '%23').replace(/'/g, '%27');
  const image = (label, p) => `<figure><figcaption>${escapeHtml(label)}</figcaption><a href="${url(p)}"><img src="${url(p)}" alt="${escapeHtml(label)}"></a></figure>`;
  const rows = report.assets.map(a => `<section><h2>${escapeHtml(a.id)}</h2><p>Source confidence ${a.baseline.confidence.score} (${escapeHtml(a.baseline.confidence.status)}). Source ${a.baseline.sceneManifest.sourceUnits}; mesh/STL millimeter; conversion factor ${a.baseline.sceneManifest.unitConversion.factor}. No geometry edits.</p><p>Display hypothesis: ${escapeHtml(JSON.stringify(a.displayHypothesis || { mode: 'all source components visible' }))}</p><p>Integrity: raw mesh boundaries ${a.baseline.meshIntegrity.manifoldReport.boundaryEdges}; face meshes ${a.baseline.sceneManifest.totalMeshCount}. This is not a welded-solid topology assessment.</p>${a.views.map(v => `<article><h3>${escapeHtml(v.id)}</h3><p>Heuristic alignment: baseline ${v.baselineComparison.visual_fidelity_score ?? 'unscorable'} → candidate ${v.best?.comparison.visual_fidelity_score ?? 'unscorable'}. ${escapeHtml(v.best?.id || 'No candidate')}</p><div class="grid">${image('Untuned IGES-only baseline', a.baseline.render.outputPath)}${v.best ? image('Best measured candidate — human review pending', v.best.render.outputPath) : ''}${image('Reference view (local QA only)', v.referenceArtifact)}</div><p>Residual issues: ${escapeHtml(v.residualIssues.join(' '))}</p><details><summary>View mapping, metrics and experiment trace</summary><pre>${escapeHtml(JSON.stringify(v, null, 2))}</pre></details></article>`).join('')}<details><summary>Unmatched drawings / limitations</summary><pre>${escapeHtml(JSON.stringify(a.unmatchedReferences, null, 2))}</pre></details></section>`).join('');
  fs.writeFileSync(path.join(outputDir, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local IGES calibration review</title><style>body{font:16px system-ui;margin:24px;background:#f5f6f8;color:#17202d}section{padding:16px 0;margin:16px 0}article{padding:20px 0;border-top:1px solid #ccd3dd}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}figure{margin:0}img{width:100%;height:300px;object-fit:contain}figcaption{min-height:44px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}a{color:#135897}@media(max-width:800px){.grid{grid-template-columns:1fr}body{margin:8px}}</style><h1>Local IGES calibration review</h1><p>All default source-only baselines completed before reference images loaded. Geometry and STL remain source-derived. Candidates are experiments; no production promotion or golden-ready claim.</p><p>Scores emphasize silhouette (65%) and internal/boundary edges (30%); framing (3%) and lighting (2%) cannot hide a blank model. Whole drawing sheets and photos remain unmatched until explicit view crops are reviewed. Percentages are heuristic image alignment, not exact pixel agreement or engineering certification.</p><a href="report.json">Complete evidence JSON</a>${rows}</html>`);
};

const runLocalCalibration = async ({ sources, outputDir, candidateLimit = 256 }) => {
  assert(Number.isInteger(candidateLimit) && candidateLimit >= 1 && candidateLimit <= 256, 'Candidate limit must be 1–256');
  assert(sources.length > 0 && sources.length <= 20, 'Provide 1–20 approved sources');
  let estimatedExperiments = 0;
  for (const source of sources) {
    assert((source.references || []).length <= 24, 'At most 24 reference views per source');
    estimatedExperiments += (source.references || []).length ? candidateLimit + (source.cameraHypotheses || []).length + source.references.length * 31 : 0;
  }
  assert(estimatedExperiments <= 4096, 'Total experiment budget exceeds 4096');
  fs.mkdirSync(outputDir, { recursive: true });
  const referenceDescriptors = new Map();
  const report = { schemaVersion: 1, rubricId: 'foreground-silhouette-edge-v1', baselinePolicy: 'all default baselines before any reference read', geometryModified: false, productionPresetChangeApproved: false, assets: [], trace: [] };
  for (const source of sources) {
    const id = safeId(source.id), binding = pipeline.buildDatabaseSourceBinding(source.record);
    assert(binding.ok, binding.reason); assert.equal(binding.sourceAsset.id, id, 'Source ID must match output ID'); assert(source.record.expectedUnits, 'Explicit source units required');
    const baseline = await pipeline.runIgesSourcePipeline({ sourceBinding: binding, outputDir: path.join(outputDir, id, 'baseline') });
    assert.equal(baseline.sceneManifest.sourceUnits, source.record.expectedUnits, 'Source unit mismatch');
    const fixture = await pipeline.runIgesSourcePipeline({ sourceBinding: { ...binding, resolverType: 'controlled_fixture', sourceRecordId: null }, outputDir: path.join(outputDir, id, 'fixture-equivalence') });
    const equivalence = pipeline.assertEquivalentResults(fixture, baseline);
    report.assets.push({ id, baseline, equivalence, views: [], unmatchedReferences: source.unmatchedReferences || [] });
    report.trace.push({ phase: 'baseline', id, completedAt: new Date().toISOString(), referenceImagesRead: false, pngSha256: baseline.render.sha256 });
  }
  pipeline.writeJson(path.join(outputDir, 'baselines.json'), report);
  for (const [index, source] of sources.entries()) {
    const asset = report.assets[index], binding = pipeline.buildDatabaseSourceBinding(source.record);
    if (source.displayHypothesis) {
      assert(source.displayHypothesis.reason && source.displayHypothesis.visibleNodes?.length, 'Display subset requires provenance and named visible nodes');
      const names = asset.baseline.sceneManifest.nodes.map(n => n.name).filter(Boolean);
      assert(source.displayHypothesis.visibleNodes.every(name => names.includes(name)), 'Unknown display component');
      binding.renderPreset = { ...binding.renderPreset, displayState: { ...binding.renderPreset.displayState, nodeStyles: Object.fromEntries(names.map(name => [name, { visible: source.displayHypothesis.visibleNodes.includes(name) }])) } };
      asset.displayHypothesis = { ...source.displayHypothesis, hiddenNodes: names.filter(n => !source.displayHypothesis.visibleNodes.includes(n)), sourceSceneAndStlUnchanged: true, humanConfirmationRequired: true };
    }
    for (const reference of source.references || []) {
      safeId(reference.id); assert.equal(hashFile(reference.path), reference.sha256, 'Reference checksum mismatch');
      assert(reference.kind === 'standalone_view' || (reference.kind === 'drawing_view_crop' && reference.crop && reference.mappingProvenance), 'Whole sheets require explicit reviewed crop mapping');
      const sheet = loadImage(reference.path), target = cropImage(sheet, reference.crop);
      const refPath = path.join(outputDir, asset.id, `${reference.id}-reference.png`);
      fs.writeFileSync(refPath, PNG.sync.write(target));
      const features = describeImage(target), baselineComparison = compareImages(describeImage(loadImage(asset.baseline.render.outputPath)), features);
      referenceDescriptors.set(`${asset.id}/${reference.id}`, features);
      asset.views.push({ id: reference.id, referenceArtifact: refPath, provenance: { ...reference, fullImageDimensions: [sheet.width, sheet.height], crop: reference.crop || { x: 0, y: 0, width: sheet.width, height: sheet.height }, mapping: reference.mappingProvenance || 'Supplier named standalone view, independent file; not inferred as a crop from drawing sheet' }, referenceDescriptor: descriptorEvidence(features), baselineComparison, experiments: [], best: null, residualIssues: ['Camera and component identity require visual confirmation.', 'Shadows, CAD selection marks and ruler graduations are not recreated from JPEG.', 'Patch-border lines and occlusion can differ from the source CAD viewport.'] });
    }
    if (!asset.views.length) {
      asset.visual_fidelity_score = null;
      asset.visualAssessment = 'not_assessed_no_reference';
      report.trace.push({ phase: 'source-only-complete', id: asset.id, candidateCount: 0 });
      pipeline.writeJson(path.join(outputDir, 'report.json'), report); writeReview(report, outputDir);
      continue;
    }
    const extraCameras = source.cameraHypotheses || [];
    assert(extraCameras.length <= 32, 'At most 32 explicit source-derived camera hypotheses');
    for (const camera of extraCameras) safeId(camera.id);
    const presets = [...cameraPresets().slice(0, candidateLimit), ...extraCameras];
    for (const preset of presets) {
      const candidateBinding = { ...binding, renderPreset: mergePreset(binding.renderPreset, { ...preset, width: 800, height: 600, margin: 60 }) };
      const result = await pipeline.runIgesSourcePipeline({ sourceBinding: candidateBinding, outputDir: path.join(outputDir, asset.id, 'candidates'), includeStl: true });
      assert.equal(result.sceneManifestHash, asset.baseline.sceneManifestHash, 'Camera search changed scene');
      assert.equal(result.stl.sha256, asset.baseline.stl.sha256, 'Camera search changed STL');
      const features = describeImage(loadImage(result.render.outputPath));
      for (const view of asset.views) {
        const comparison = applyRenderGates(compareImages(features, referenceDescriptors.get(`${asset.id}/${view.id}`)), result.render, features, view.provenance.requiredVisibleNodes);
        const experiment = { id: preset.id, preset: candidateBinding.renderPreset, comparison, render: result.render, source_confidence_score: result.confidence.score, sceneManifestHash: result.sceneManifestHash, stlSha256: result.stl.sha256 };
        view.experiments.push(experiment);
        if (comparison.visual_fidelity_score !== null && (!view.best || comparison.visual_fidelity_score > view.best.comparison.visual_fidelity_score)) view.best = { ...experiment, renderDescriptor: descriptorEvidence(features) };
      }
    }
    await refineViews(asset, binding, outputDir, referenceDescriptors);
    report.trace.push({ phase: 'calibration', id: asset.id, completedAt: new Date().toISOString(), candidateCount: presets.length });
    pipeline.writeJson(path.join(outputDir, 'report.json'), report); writeReview(report, outputDir);
    console.log(`${asset.id}: ${asset.views.map(v => `${v.id} ${v.baselineComparison.visual_fidelity_score}->${v.best?.comparison.visual_fidelity_score}`).join(', ')}`);
  }
  return report;
};
const selectEligibleFinal = (current, candidate) => {
  if (!Number.isFinite(candidate?.comparison?.visual_fidelity_score) || candidate.comparison.gateReasons?.length) return current;
  return !current || candidate.comparison.visual_fidelity_score > current.comparison.visual_fidelity_score ? candidate : current;
};
// At most 27 local angle trials per isometric view, then one framing fit and
// three light-direction hypotheses. Output framing never changes source units.
const refineViews = async (asset, binding, outputDir, descriptors) => {
  const evaluate = async (view, preset, phase) => {
    const result = await pipeline.runIgesSourcePipeline({ sourceBinding: { ...binding, renderPreset: preset }, outputDir: path.join(outputDir, asset.id, 'refined'), includeStl: true });
    assert.equal(result.sceneManifestHash, asset.baseline.sceneManifestHash);
    assert.equal(result.stl.sha256, asset.baseline.stl.sha256);
    const features = describeImage(loadImage(result.render.outputPath));
    const comparison = applyRenderGates(compareImages(features, descriptors.get(`${asset.id}/${view.id}`)), result.render, features, view.provenance.requiredVisibleNodes);
    const experiment = { id: preset.id, phase, preset, comparison, render: result.render, renderDescriptor: descriptorEvidence(features), source_confidence_score: result.confidence.score, sceneManifestHash: result.sceneManifestHash, stlSha256: result.stl.sha256 };
    view.experiments.push(experiment);
    return experiment;
  };
  for (const view of asset.views) {
    if (!view.best) continue;
    const coarse = view.best;
    if (coarse.id.startsWith('isometric')) {
      for (const yaw of [-8, 0, 8]) for (const pitch of [-8, 0, 8]) for (const roll of [-8, 0, 8]) {
        const preset = { ...coarse.preset, id: `${view.id}-fine-${yaw}-${pitch}-${roll}`, projection: { ...coarse.preset.projection, yawDeg: coarse.preset.projection.yawDeg + yaw, pitchDeg: coarse.preset.projection.pitchDeg + pitch, rollDeg: coarse.preset.projection.rollDeg + roll } };
        const experiment = await evaluate(view, preset, 'bounded-camera-refinement');
        if (Number.isFinite(experiment.comparison.visual_fidelity_score) && experiment.comparison.visual_fidelity_score > view.best.comparison.visual_fidelity_score) view.best = experiment;
      }
    }
    const target = descriptors.get(`${asset.id}/${view.id}`);
    if (!target.valid) continue;
    const sized = await evaluate(view, { ...view.best.preset, id: `${view.id}-reference-sized`, width: target.width, height: target.height }, 'reference-resolution');
    if (!sized.renderDescriptor.valid) continue;
    const b = sized.renderDescriptor.boundingBox, t = target.boundingBox;
    const framing = { scale: Math.min(t.width / b.width, t.height / b.height), offsetX: (t.x + t.width / 2) / target.width - 0.5, offsetY: (t.y + t.height / 2) / target.height - 0.5 };
    view.framingProvenance = { method: 'uniform viewport fit to independently segmented target foreground; normalized center offset', inputRenderBounds: b, targetBounds: t, framing, geometryRescale: false };
    let final = null;
    for (const [i, lightDirection] of [[-0.35, -0.45, 0.82], [0.35, 0.8, 0.45], [-0.7, 0.5, 0.5]].entries()) {
      const experiment = await evaluate(view, { ...sized.preset, id: `${view.id}-final-light-${i}`, framing, lightDirection }, 'framing-lighting');
      final = selectEligibleFinal(final, experiment);
    }
    view.bestNormalizedCandidate = view.best;
    if (!final) {
      view.finalizationStatus = 'blocked_all_final_trials_rejected';
      view.residualIssues.push('Every final framing/lighting trial failed validity gates; last eligible candidate retained for diagnostic review only.');
      continue;
    }
    view.finalizationStatus = 'eligible_final_candidate';
    view.best = final;
    view.residualIssues.push(`Final silhouette IoU ${(final.comparison.components.silhouetteIoU * 100).toFixed(1)}%; edge agreement ${(final.comparison.components.internalAndBoundaryEdgeAgreement * 100).toFixed(1)}%. Remaining gaps require human review.`);
  }
};
module.exports = { selectEligibleFinal, applyRenderGates, refineViews, runLocalCalibration, cropImage, describeImage, compareImages, cameraPresets, writeReview };
