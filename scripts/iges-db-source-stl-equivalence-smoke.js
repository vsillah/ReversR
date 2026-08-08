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

const evidenceFile = process.env.IGES_DB_STL_EQUIVALENCE_EVIDENCE_FILE || 'docs/iges-db-source-stl-equivalence-smoke-evidence.json';

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
    outputDir: path.join(defaultOutputDir, 'fixture-stl-equivalence'),
    includeStl: true,
  });
  const dbResult = await runIgesSourcePipeline({
    sourceBinding: dbBinding,
    outputDir: path.join(defaultOutputDir, 'db-stl-equivalence'),
    includeStl: true,
  });
  const equivalence = assertEquivalentResults(fixtureResult, dbResult);

  const evidencePath = writeJson(evidenceFile, {
    schemaVersion: 1,
    status: 'pass',
    equivalence,
    stlTriangleCount: fixtureResult.stl.triangleCount,
    stlUnits: fixtureResult.stl.units,
    stlScalingPolicy: fixtureResult.stl.scalingPolicy,
    connectedComponentCount: fixtureResult.stl.connectedComponentCount,
    manifoldReport: fixtureResult.stl.manifoldReport,
    usesJpgReference: false,
  });

  console.log('IGES DB source STL equivalence smoke passed.');
  console.log(`Evidence: ${evidencePath}`);
})().catch(error => {
  console.error(`IGES DB source STL equivalence smoke failed: ${error.message}`);
  process.exit(1);
});
