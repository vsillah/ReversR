#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { runLocalCalibration } = require('../utils/igesLocalCalibration');
(async () => {
  const manifestPath = process.argv[2];
  if (!manifestPath) throw new Error('Usage: node scripts/iges-local-calibration.js <private-manifest.json>');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const outputDir = path.resolve(manifest.outputDir);
  if (!outputDir.split(path.sep).includes('.local')) throw new Error('Private calibration output must be under an ignored .local directory');
  await runLocalCalibration({ ...manifest, outputDir });
  console.log(`Review: ${path.join(outputDir, 'index.html')}`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
