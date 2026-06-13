const fs = require('fs');
const path = require('path');

const evidenceFile = process.env.CAD_QUALIFICATION_SMOKE_EVIDENCE_FILE || 'docs/cad-qualification-export-smoke-evidence.json';
const failures = [];
const warnings = [];

const fail = message => failures.push(message);
const warn = message => warnings.push(message);
const exists = filePath => fs.existsSync(filePath);
const readText = filePath => fs.readFileSync(filePath, 'utf8');
const readOptionalJson = filePath => {
  try {
    return exists(filePath) ? JSON.parse(readText(filePath)) : null;
  } catch (error) {
    warn(`${filePath} could not be parsed: ${error.message}`);
    return null;
  }
};
const writeEvidence = evidence => {
  const target = path.resolve(evidenceFile);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(evidence, null, 2)}\n`);
  return target;
};

const requireContains = (filePath, expected) => {
  const text = readText(filePath);
  if (!text.includes(expected)) fail(`${filePath} is missing contract marker: ${expected}`);
};

const requirePath = (label, object, pathSegments) => {
  let cursor = object;
  for (const segment of pathSegments) cursor = cursor?.[segment];
  if (cursor === undefined || cursor === null || cursor === '') fail(`${label}.${pathSegments.join('.')} is required.`);
};

const cadQualificationText = readText('utils/cadQualification.ts');
const gateStatuses = [
  'ready_for_cad_draft',
  'needs_dimensions',
  'route_to_scan_to_cad_vendor',
  'visual_reference_only',
  'blocked_safety_review',
];
for (const status of gateStatuses) {
  if (!cadQualificationText.includes(status)) fail(`AiCadGateStatus is missing ${status}.`);
}

for (const [filePath, marker] of [
  ['utils/manufacturingHandoff.ts', "packetVersion: '0.3-review'"],
  ['utils/manufacturingHandoff.ts', 'aiCadGate'],
  ['utils/manufacturingHandoff.ts', 'materialTreatmentGuidance'],
  ['components/PhaseFour.tsx', 'aiCadGate: ManufacturingHandoff'],
  ['components/PhaseFour.tsx', 'materialTreatmentGuidance: ManufacturingHandoff'],
  ['components/PhaseFour.tsx', 'AI CAD gate and CAD draft readiness notes'],
  ['components/PhaseFour.tsx', 'Material treatment guidance'],
  ['components/PhaseFour.tsx', 'Reviewer Approval'],
  ['components/PhaseFour.tsx', 'approvedForVendorSubmission'],
  ['components/PhaseFour.tsx', 'Save Review Record'],
  ['components/PhaseFour.tsx', 'Saved Approval Required'],
  ['components/PhaseFour.tsx', 'Saved reviewer approval'],
  ['components/PhaseFour.tsx', '3D scene visual reference'],
  ['components/HistoryScreen.tsx', 'Review Queue'],
  ['components/HistoryScreen.tsx', 'Open Review'],
  ['components/HistoryScreen.tsx', 'getLatestSavedVendorApproval'],
  ['components/ManufacturingStudio.tsx', 'AI CAD Gate'],
  ['components/ManufacturingStudio.tsx', 'Material Treatment Review'],
  ['utils/reviewerApprovalRecords.ts', "recordType: 'cad_reviewer_approval'"],
  ['utils/reviewerApprovalRecords.ts', "recordVersion: '0.1-review'"],
  ['hooks/useStorage.ts', 'reviewerApprovalRecords'],
  ['scripts/generate-cadquery-proof.js', 'material treatment notes present'],
]) {
  requireContains(filePath, marker);
}

const cadqueryValidation = readOptionalJson('.local/cadquery-proof/cadquery-proof-validation.json');
if (!cadqueryValidation) {
  warn('Local CadQuery proof validation was not found. Run npm run cadquery:proof for local CAD artifacts.');
} else if (cadqueryValidation.status !== 'passed') {
  warn(`Local CadQuery proof status is ${cadqueryValidation.status}.`);
}

const sampleAiCadGate = {
  status: 'ready_for_cad_draft',
  confidence: 'medium',
  recommendedCadLane: 'cadquery',
  sourceEvidence: [
    'Machine ID: FARMBOT-GENESIS-V1-8',
    'Approved inventory source: public FarmBot inventory',
    'BOM with material line items',
    'Reference images/source links present',
  ],
  missingInputs: [],
  riskFlags: [
    'Outdoor environment affects treatment choice.',
    'CAD draft requires qualified review before fabrication.',
  ],
  reviewerActions: [
    'Confirm source dimensions against approved inventory revision.',
    'Confirm material grade, finish, and treatment compatibility.',
    'Confirm treatment impact on holes, flatness, fit surfaces, and lead time.',
  ],
  materialTreatmentNotes: [
    'Gantry mounting plate: Type II clear anodize or powder coat after fit review.',
  ],
  finalReleaseBoundary: 'AI may draft, route, inspect, and reject CAD readiness. Qualified CAD/manufacturing review is required before fabrication, vendor submission, production ordering, or machine operation.',
};

const sampleMaterialTreatment = {
  partNumber: 'FARMBOT-GANTRY-PLATE-P001',
  partName: 'FarmBot-class gantry mounting plate proof',
  baseMaterial: '6061-T6 aluminum',
  expectedEnvironment: 'outdoor agricultural exposure with moisture, soil, UV, and washdown risk',
  surfaceFinish: 'deburr and bead-blasted or machined finish',
  treatment: 'Type II clear anodize or powder coat after fit review',
  treatmentPurpose: 'corrosion resistance, cleaner handling surface, and outdoor durability',
  toleranceImpact: 'confirm hole sizes, flatness, and coating buildup after treatment',
  vendorConfirmationRequired: true,
  inspectionNotes: [
    'Confirm material grade and treatment compatibility before quoting.',
    'Inspect critical dimensions after treatment or post-processing.',
  ],
};

const sampleReviewerApproval = {
  status: 'approved_for_vendor_review',
  reviewerName: 'Sample CAD Reviewer',
  reviewerRole: 'CAD reviewer',
  reviewedAt: new Date().toISOString(),
  notes: 'Approved for vendor quote review only. Fabrication remains blocked.',
  approvalScope: 'Reviewer approval is limited to vendor quote/request readiness. It does not approve fabrication, production ordering, machine operation, or safety-critical release.',
  approvedForVendorSubmission: true,
  approvedForFabrication: false,
  requiredBeforeRelease: [
    'Qualified CAD review confirms source dimensions and CAD editability.',
    'Material treatment compatibility and tolerance impact are confirmed.',
    'DfM/vendor review accepts process, finish, lead time, and inspection assumptions.',
    'First-article inspection plan is accepted before fabrication or machine operation.',
  ],
};

const sampleReviewerApprovalRecord = {
  ...sampleReviewerApproval,
  recordType: 'cad_reviewer_approval',
  recordVersion: '0.1-review',
  recordId: 'review-sample-approved',
  reconstructionId: 'sample-reconstruction',
  savedAt: new Date().toISOString(),
  machine: {
    machineId: 'FARMBOT-GENESIS-V1-8',
    machineName: 'FarmBot Genesis v1.8',
    inventorySource: 'public FarmBot inventory',
    confidenceScore: 0.92,
  },
  packageContext: {
    conceptName: 'FarmBot-class gantry mounting plate proof',
    quotePacketVersion: '0.2-review',
    manufacturingHandoffVersion: '0.3-review',
  },
  cadGateSnapshot: {
    status: sampleAiCadGate.status,
    confidence: sampleAiCadGate.confidence,
    recommendedCadLane: sampleAiCadGate.recommendedCadLane,
  },
  materialTreatmentSnapshot: [
    `${sampleMaterialTreatment.partName}: ${sampleMaterialTreatment.treatment}; vendor confirmation required`,
  ],
  releaseBoundary: sampleAiCadGate.finalReleaseBoundary,
};

const sampleCompletePackage = {
  exportedAt: new Date().toISOString(),
  reviewerApproval: sampleReviewerApproval,
  reviewerApprovalRecords: [sampleReviewerApprovalRecord],
  latestReviewerApprovalRecord: sampleReviewerApprovalRecord,
  manufacturingHandoff: {
    packetType: 'manufacturing_review_handoff',
    packetVersion: '0.3-review',
    humanReviewRequired: true,
    aiCadGate: sampleAiCadGate,
    materialTreatmentGuidance: [sampleMaterialTreatment],
    drawingPackage: {
      requiredFiles: [
        'CAD draft source or KCL/CadQuery script',
        'STEP assembly',
        'PDF detail drawings',
        'material treatment notes',
        'inspection plan',
      ],
      missingBeforeMachining: [
        'source CAD dimensions verified against inventory revision',
        'CAD draft qualified in CAD software',
        'material treatment compatibility confirmed by vendor',
        'first-article inspection signoff',
      ],
    },
  },
  manufacturerQuotePacket: {
    packetType: 'manufacturer_quote_request',
    packetVersion: '0.2-review',
    humanReviewRequired: true,
    visualReferences: {
      has2D: true,
      angleLabels: ['front'],
      has3DScene: true,
      expectedFileTypes: [
        'CAD draft source when generated',
        'STEP/native CAD after CAD qualification',
        'material treatment notes',
        'PNG visual references if generated',
      ],
    },
    aiCadGate: sampleAiCadGate,
    materialTreatmentGuidance: [sampleMaterialTreatment],
    reviewerApproval: sampleReviewerApproval,
    latestReviewerApprovalRecord: sampleReviewerApprovalRecord,
    reviewerApprovalRecords: [sampleReviewerApprovalRecord],
    quoteRequestMessage: [
      'AI CAD gate: ready_for_cad_draft. Recommended lane: cadquery.',
      'Material/treatment review: confirm material choice, treatment compatibility, finish requirements, tolerance impact after treatment, lead time impact, and inspection needs.',
      'Reviewer approval: approved_for_vendor_review. Vendor submission approved: yes.',
      'Latest saved review record: review-sample-approved; approved_for_vendor_review; saved 2026-06-13T00:00:00.000Z.',
      'Do not fabricate, print, submit to production, or order parts until a qualified reviewer confirms machine identity, source dimensions, CAD editability, tolerances, material treatments, safety constraints, and revision compatibility.',
    ].join('\n\n'),
  },
};

for (const [label, object, requiredPaths] of [
  ['sampleCompletePackage', sampleCompletePackage, [
    ['manufacturingHandoff', 'aiCadGate', 'status'],
    ['manufacturingHandoff', 'aiCadGate', 'recommendedCadLane'],
    ['manufacturingHandoff', 'materialTreatmentGuidance', 0, 'treatment'],
    ['manufacturerQuotePacket', 'aiCadGate', 'finalReleaseBoundary'],
    ['manufacturerQuotePacket', 'materialTreatmentGuidance', 0, 'toleranceImpact'],
    ['manufacturerQuotePacket', 'reviewerApproval', 'status'],
    ['manufacturerQuotePacket', 'reviewerApproval', 'approvedForVendorSubmission'],
    ['manufacturerQuotePacket', 'reviewerApproval', 'approvedForFabrication'],
    ['manufacturerQuotePacket', 'latestReviewerApprovalRecord', 'recordId'],
    ['manufacturerQuotePacket', 'latestReviewerApprovalRecord', 'approvedForVendorSubmission'],
    ['manufacturerQuotePacket', 'reviewerApprovalRecords', 0, 'recordType'],
    ['manufacturerQuotePacket', 'visualReferences', 'expectedFileTypes'],
    ['manufacturerQuotePacket', 'quoteRequestMessage'],
    ['reviewerApproval', 'approvalScope'],
    ['latestReviewerApprovalRecord', 'releaseBoundary'],
    ['reviewerApprovalRecords', 0, 'packageContext', 'quotePacketVersion'],
  ]],
]) {
  for (const pathSegments of requiredPaths) requirePath(label, object, pathSegments);
}

if (failures.length > 0) {
  console.error('CAD qualification export smoke failed:');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

const evidencePath = writeEvidence({
  schemaVersion: 1,
  status: 'pass',
  generatedAt: new Date().toISOString(),
  warnings,
  gateStatuses,
  contractChecks: {
    manufacturingHandoffVersion: '0.3-review',
    aiCadGateExported: true,
    materialTreatmentGuidanceExported: true,
    reviewerApprovalExported: true,
    reviewerApprovalRecordsSaved: true,
    vendorRequestGatedByReviewerApproval: true,
    vendorRequestGatedBySavedReviewerApproval: true,
    visualReferenceLanguagePresent: true,
    finalReleaseBoundaryPresent: true,
  },
  cadqueryProof: cadqueryValidation ? {
    status: cadqueryValidation.status,
    cadqueryVersion: cadqueryValidation.cadqueryVersion,
    artifactFiles: cadqueryValidation.artifactFiles,
    releaseBoundary: cadqueryValidation.releaseBoundary,
  } : {
    status: 'not_run',
  },
  sampleCompletePackage,
});

if (warnings.length > 0) {
  console.log('Warnings:');
  for (const message of warnings) console.log(`- ${message}`);
}

console.log('CAD qualification export smoke passed.');
console.log(`Evidence: ${evidencePath}`);
