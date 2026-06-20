const fs = require('fs');

const checks = [
  ['components/WelcomeScreen.tsx', 'Start new machine reconstruction'],
  ['components/WelcomeScreen.tsx', 'Open reconstruction history'],
  ['components/WelcomeScreen.tsx', 'Open settings'],
  ['components/PolicyPage.tsx', 'Back to ReversR Rebuild'],
  ['components/AlertModal.tsx', 'accessibilityLabel={button.text}'],
  ['components/SettingsModal.tsx', 'Close settings'],
  ['components/SettingsModal.tsx', 'Save settings'],
  ['components/SettingsModal.tsx', 'Use Gemini cloud AI provider'],
  ['components/SettingsModal.tsx', 'Save backend credential reference'],
  ['components/PhaseOne.tsx', 'Use text description mode'],
  ['components/PhaseOne.tsx', 'Use camera scan mode'],
  ['components/PhaseOne.tsx', 'Open camera to scan machine'],
  ['components/PhaseOne.tsx', 'Capture machine photo'],
  ['components/PhaseOne.tsx', 'Initiate machine scan'],
  ['components/PhaseOne.tsx', 'Sample machine'],
  ['components/PhaseOne.tsx', 'Sample'],
  ['components/PhaseOne.tsx', 'Point at a machine, model plate, or visible assembly'],
  ['components/SettingsModal.tsx', 'Choose known source'],
  ['components/SettingsModal.tsx', 'Inventory source name'],
  ['components/SettingsModal.tsx', 'Inventory connector URL'],
  ['components/SettingsModal.tsx', 'Inventory backend credential reference'],
  ['components/SettingsModal.tsx', 'Inventory admin notes'],
  ['components/PhaseTwo.tsx', 'Recheck inventory matches'],
  ['components/PhaseTwo.tsx', 'Open settings to change inventory source'],
  ['components/PhaseTwo.tsx', 'Select ${candidate.machineName} at ${candidate.matchPercent} percent match'],
  ['components/PhaseTwo.tsx', 'Restart Phase 1 scan'],
  ['components/PhaseTwo.tsx', 'Use ${selectedCandidate.machineName} and continue to design'],
  ['components/PhaseThree.tsx', 'Show 2D sketch tools'],
  ['components/PhaseThree.tsx', 'Show 3D wireframe tools'],
  ['components/PhaseThree.tsx', 'Generate 2D reconstruction sketch'],
  ['components/PhaseThree.tsx', 'Generate 3D wireframe'],
  ['components/PhaseThree.tsx', 'Export technical specifications'],
  ['components/PhaseThree.tsx', 'Continue to build phase'],
  ['components/PhaseFour.tsx', 'Generate bill of materials'],
  ['components/PhaseFour.tsx', 'Export BOM CSV'],
  ['components/PhaseFour.tsx', 'Export complete reconstruction package'],
  ['components/PhaseFour.tsx', 'Export manufacturer quote packet'],
  ['components/PhaseFour.tsx', 'Vendor quote recipient email'],
  ['components/PhaseFour.tsx', 'Admin notes for vendor quote request'],
  ['components/PhaseFour.tsx', 'Prepare vendor quote request email'],
  ['components/PhaseFour.tsx', 'Start a new reconstruction'],
  ['app/index.tsx', "Go back to ${phaseActionModal ? PHASE_LABELS[phaseActionModal - 1] : 'selected'} phase"],
  ['app/index.tsx', 'Reset and start over'],
  ['app/index.tsx', 'Cancel phase action'],
];

const failures = [];

for (const [file, expected] of checks) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes(expected)) {
    failures.push(`${file} is missing accessibility coverage marker: ${expected}`);
  }
}

if (failures.length) {
  console.error('Accessibility preflight failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Accessibility preflight passed.');
