#!/usr/bin/env node

const {
  runVisualCalibrationLoop,
  writeJson,
} = require('../utils/igesVisualCalibration');

const evidenceFile = process.env.IGES_VISUAL_CALIBRATION_EVIDENCE_FILE || 'docs/iges-visual-calibration-smoke-evidence.json';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

(async () => {
  const evidence = await runVisualCalibrationLoop();

  assert(evidence.strictSeparation.sourceConfidenceUsesReferenceImage === false, 'Source confidence must not use the golden reference.');
  assert(evidence.strictSeparation.geometryModifiedByCalibration === false, 'Visual calibration must not modify IGES geometry.');
  assert(evidence.strictSeparation.visualScorePromotedToSourceConfidence === false, 'Visual fidelity must not be promoted to source confidence.');
  assert(evidence.experiments.length >= 2, 'Visual calibration must run bounded preset experiments.');
  for (const experiment of evidence.experiments) {
    assert(Number.isFinite(experiment.visual_fidelity_score), `Experiment ${experiment.id} missing visual_fidelity_score.`);
    assert(Number.isFinite(experiment.source_confidence_score), `Experiment ${experiment.id} missing source_confidence_score.`);
    assert(experiment.sourceConfidence.referenceImagesUsedForScore === false, `Experiment ${experiment.id} used reference images for source confidence.`);
  }
  assert(evidence.recommendation.productionPresetChangeApproved === false, 'Production preset changes require human approval.');
  assert(evidence.recommendation.goldenReady === false, 'Calibration smoke cannot mark output golden-ready.');

  const evidencePath = writeJson(evidenceFile, evidence);
  console.log('IGES visual calibration smoke passed.');
  console.log(`Evidence: ${evidencePath}`);
  console.log(`Best experiment: ${evidence.recommendation.bestAssetId}/${evidence.recommendation.bestExperimentId} (${evidence.recommendation.bestVisualFidelityScore})`);
})().catch(error => {
  console.error(`IGES visual calibration smoke failed: ${error.message}`);
  process.exit(1);
});
