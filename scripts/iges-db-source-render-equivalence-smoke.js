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

const evidenceFile = process.env.IGES_DB_RENDER_EQUIVALENCE_EVIDENCE_FILE || 'docs/iges-db-source-render-equivalence-smoke-evidence.json';

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
    outputDir: path.join(defaultOutputDir, 'fixture-render-equivalence'),
    includeStl: false,
  });
  const dbResult = await runIgesSourcePipeline({
    sourceBinding: dbBinding,
    outputDir: path.join(defaultOutputDir, 'db-render-equivalence'),
    includeStl: false,
  });
  const equivalence = assertEquivalentResults(fixtureResult, dbResult);

  const evidencePath = writeJson(evidenceFile, {
    schemaVersion: 1,
    status: 'pass',
    equivalence,
    fixtureResolver: fixtureResult.resolverType,
    databaseResolver: dbResult.resolverType,
    sceneManifestHash: fixtureResult.sceneManifestHash,
    renderSha256: fixtureResult.render.sha256,
    confidenceScore: fixtureResult.confidence.score,
    sharedPipeline: 'resolver -> IGES ingestion -> scene assembly -> renderer -> source-only scorer',
    usesJpgReference: false,
  });

  console.log('IGES DB source render equivalence smoke passed.');
  console.log(`Evidence: ${evidencePath}`);
})().catch(error => {
  console.error(`IGES DB source render equivalence smoke failed: ${error.message}`);
  process.exit(1);
});
