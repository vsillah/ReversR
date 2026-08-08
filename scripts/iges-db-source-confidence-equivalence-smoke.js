#!/usr/bin/env node

const path = require('path');
const {
  assertEquivalentResults,
  buildControlledFixtureBinding,
  buildDatabaseSourceBinding,
  buildDatabaseSourceRecord,
  defaultOutputDir,
  runIgesSourcePipeline,
  writeJson,
} = require('../utils/igesSourcePipeline');

const evidenceFile = process.env.IGES_DB_CONFIDENCE_EQUIVALENCE_EVIDENCE_FILE || 'docs/iges-db-source-confidence-equivalence-smoke-evidence.json';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

(async () => {
  const fixtureBinding = buildControlledFixtureBinding();
  const dbBinding = buildDatabaseSourceBinding(buildDatabaseSourceRecord());
  assert(fixtureBinding.ok, fixtureBinding.reason || 'Controlled fixture binding failed.');
  assert(dbBinding.ok, dbBinding.reason || 'Database source binding failed.');

  const fixtureResult = await runIgesSourcePipeline({
    sourceBinding: fixtureBinding,
    outputDir: path.join(defaultOutputDir, 'fixture-confidence-equivalence'),
    includeStl: true,
  });
  const dbResult = await runIgesSourcePipeline({
    sourceBinding: dbBinding,
    outputDir: path.join(defaultOutputDir, 'db-confidence-equivalence'),
    includeStl: true,
  });
  const equivalence = assertEquivalentResults(fixtureResult, dbResult);

  assert(fixtureResult.confidence.score === dbResult.confidence.score, 'Fixture and database source confidence scores differ.');
  assert(fixtureResult.confidence.referenceImagesUsedForScore === false, 'Fixture confidence used reference images.');
  assert(dbResult.confidence.referenceImagesUsedForScore === false, 'Database confidence used reference images.');

  const evidencePath = writeJson(evidenceFile, {
    schemaVersion: 1,
    status: 'pass',
    equivalence,
    confidenceScore: fixtureResult.confidence.score,
    componentScores: fixtureResult.confidence.componentScores,
    rubricId: fixtureResult.confidence.rubricId,
    usesJpgReference: false,
  });

  console.log('IGES DB source confidence equivalence smoke passed.');
  console.log(`Evidence: ${evidencePath}`);
})().catch(error => {
  console.error(`IGES DB source confidence equivalence smoke failed: ${error.message}`);
  process.exit(1);
});
