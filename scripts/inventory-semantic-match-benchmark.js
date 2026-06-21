const traceparts = require('../public/inventory/traceparts-industrial-components.json');
const cadenas = require('../public/inventory/cadenas-industrial-components.json');
const documoto = require('../public/inventory/documoto-equipment-parts-book-phase2.json');
const { scoreInventoryRecord } = require('../server/inventoryMatcher');

const records = [
  ...traceparts.machines,
  ...cadenas.machines,
  ...documoto.machines,
];

const fail = (message) => {
  throw new Error(message);
};

const weakAnalysis = (label) => ({
  productName: label,
  rawAnalysis: `Observed ${label} in the scan step. The AI analysis is intentionally generic so raw scan text and semantic matching carry the source evidence.`,
  components: [
    { name: 'Drive assembly', description: 'Generic drive assembly.', isEssential: true },
    { name: 'Control module', description: 'Generic control module.', isEssential: true },
    { name: 'Fasteners', description: 'Generic fasteners.', isEssential: true },
  ],
  attributes: [
    { name: 'Source', value: 'inventory scan', type: 'Qualitative' },
  ],
  neighborhoodResources: ['inventory source'],
  closedWorldBoundary: 'Match only when inventory evidence is strong enough.',
});

const scoreCase = (testCase) => records
  .map(record => {
    const score = scoreInventoryRecord(weakAnalysis(testCase.label), record, testCase.scanInput);
    return {
      machineId: record.machineId,
      score: score.score,
      diagnostics: score.matchDiagnostics,
    };
  })
  .sort((left, right) => right.score - left.score);

const positiveCases = [
  {
    label: 'TraceParts paraphrased actuator',
    expectedMachineId: 'TRACEPARTS-LINEAR-ACTUATOR-MODULE',
    minScore: 0.72,
    scanInput: 'Need to rebuild a compact actuator stage with an endstop switch, motor coupling, guide rail, aluminum mounting bracket, ball screw drive, and stepper motor.',
  },
  {
    label: 'CADENAS paraphrased gantry',
    expectedMachineId: 'CADENAS-GANTRY-SWAP-KIT',
    minScore: 0.72,
    scanInput: 'Desktop CNC gantry axis using bearing blocks, belt drive, pulleys, linear rails, cable chain, gantry plate, and a stepper motor.',
  },
  {
    label: 'Documoto parts book conveyor',
    expectedMachineId: 'DOCUMOTO-PACKAGING-CONVEYOR-PARTS-BOOK',
    minScore: 0.72,
    scanInput: 'Packaging conveyor parts book record with drive roller, idler roller, gearmotor, guard panel, photoelectric sensor, control enclosure, belt section, and exploded service instructions.',
  },
];

const negativeCases = [
  {
    label: 'Centrifuge negative control',
    maxScore: 0.55,
    scanInput: 'Lab centrifuge with rotor, lid latch, vibration sensor, bucket inserts, enclosure, and speed control panel.',
  },
  {
    label: 'Generic motor negative control',
    maxScore: 0.55,
    scanInput: 'A generic repair kit with one motor, fasteners, wiring, and a control box but no distinctive rail, actuator, gantry, conveyor, or parts-book evidence.',
  },
];

for (const testCase of positiveCases) {
  const scored = scoreCase(testCase);
  const top = scored[0];
  if (top.machineId !== testCase.expectedMachineId) {
    fail(`${testCase.label}: expected ${testCase.expectedMachineId}, got ${top.machineId} (${top.score}).`);
  }
  if (top.score < testCase.minScore) {
    fail(`${testCase.label}: expected score >= ${testCase.minScore}, got ${top.score}.`);
  }
}

for (const testCase of negativeCases) {
  const scored = scoreCase(testCase);
  const top = scored[0];
  if (top.score > testCase.maxScore) {
    fail(`${testCase.label}: expected no strong match above ${testCase.maxScore}, got ${top.machineId} (${top.score}).`);
  }
}

console.log('Inventory semantic match benchmark passed.');
