#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(repoRoot, 'docs', 'iges-calibration-corpus.seed.json');
const evidencePath = path.join(repoRoot, 'docs', 'iges-calibration-corpus-preflight-evidence.json');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const countBy = (items, key) => items.reduce((acc, item) => {
  const value = item[key] || 'unknown';
  acc[value] = (acc[value] || 0) + 1;
  return acc;
}, {});

const validate = manifest => {
  assert(manifest.schemaVersion === 1, 'Expected schemaVersion 1.');
  assert(manifest.sourceBoundary.productionInput === 'IGES_ONLY', 'Production input must remain IGES_ONLY.');
  assert(manifest.sourceBoundary.referenceImageRole === 'post_render_visual_calibration_only', 'Reference images must be visual-calibration-only.');
  assert(manifest.sourceBoundary.visualFidelityIsSeparateFromSourceConfidence === true, 'Visual fidelity must remain separate from source confidence.');
  assert(manifest.sourceBoundary.referenceImagesExcludedFrom.includes('source confidence score'), 'Reference images must be excluded from source confidence.');
  assert(Array.isArray(manifest.candidateSources) && manifest.candidateSources.length >= 5, 'Expected at least five candidate sources.');
  assert(Array.isArray(manifest.sampleSlots) && manifest.sampleSlots.length >= manifest.targetMix.minimumSamples, 'Sample slots do not meet target minimum.');

  const sourceIds = new Set(manifest.candidateSources.map(source => source.id));
  for (const source of manifest.candidateSources) {
    assert(/^https:\/\//.test(source.url), `Candidate source ${source.id} must use an HTTPS URL.`);
    assert(source.termsStatus && source.termsStatus !== 'approved_by_default', `Candidate source ${source.id} must require explicit terms/provenance review.`);
    assert(source.acquisitionMode !== 'automated_bulk_scrape', `Candidate source ${source.id} must not use automated bulk scraping.`);
  }

  const categoryCounts = countBy(manifest.sampleSlots, 'category');
  for (const category of manifest.targetMix.categories) {
    assert((categoryCounts[category.id] || 0) >= category.minimum, `Category ${category.id} has fewer than ${category.minimum} sample slots.`);
  }

  for (const slot of manifest.sampleSlots) {
    assert(slot.status === 'pending_acquisition' || slot.status === 'admitted' || slot.status === 'blocked', `Sample slot ${slot.id} has unsupported status ${slot.status}.`);
    assert(Array.isArray(slot.preferredSources) && slot.preferredSources.length > 0, `Sample slot ${slot.id} needs preferred sources.`);
    for (const preferredSource of slot.preferredSources) {
      assert(sourceIds.has(preferredSource), `Sample slot ${slot.id} references unknown source ${preferredSource}.`);
    }
  }

  for (const blockedState of ['image_only_source', 'reference_promoted_to_source_confidence', 'db_route_not_equivalent_to_fixture_route']) {
    assert(manifest.blockedStates.includes(blockedState), `Missing blocked state ${blockedState}.`);
  }

  return {
    schemaVersion: 1,
    status: 'pass',
    manifest: path.relative(repoRoot, manifestPath),
    candidateSourceCount: manifest.candidateSources.length,
    sampleSlotCount: manifest.sampleSlots.length,
    categoryCounts,
    sourceBoundary: manifest.sourceBoundary,
    blockedStates: manifest.blockedStates,
  };
};

try {
  const manifest = readJson(manifestPath);
  const evidence = validate(manifest);
  writeJson(evidencePath, evidence);
  console.log('IGES calibration corpus preflight passed.');
  console.log(`Evidence: ${path.relative(repoRoot, evidencePath)}`);
} catch (error) {
  console.error(`IGES calibration corpus preflight failed: ${error.message}`);
  process.exit(1);
}
