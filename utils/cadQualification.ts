import {
  BillOfMaterials,
  InnovationResult,
  ReferenceImage,
  TechnicalSpec,
} from '../hooks/useGemini';

export type AiCadGateStatus =
  | 'ready_for_cad_draft'
  | 'needs_dimensions'
  | 'route_to_scan_to_cad_vendor'
  | 'visual_reference_only'
  | 'blocked_safety_review';

export type RecommendedCadLane =
  | 'cadquery'
  | 'zoo'
  | 'onshape_or_fusion_review'
  | 'scan_to_cad_vendor'
  | 'visual_reference';

export type MaterialTreatmentGuidance = {
  partNumber: string;
  partName: string;
  baseMaterial: string;
  expectedEnvironment: string;
  surfaceFinish: string;
  treatment: string;
  treatmentPurpose: string;
  toleranceImpact: string;
  vendorConfirmationRequired: true;
  inspectionNotes: string[];
};

export type AiCadGate = {
  status: AiCadGateStatus;
  confidence: 'low' | 'medium' | 'high';
  recommendedCadLane: RecommendedCadLane;
  sourceEvidence: string[];
  missingInputs: string[];
  riskFlags: string[];
  reviewerActions: string[];
  materialTreatmentNotes: string[];
  finalReleaseBoundary: string;
};

type PartForCadGate = {
  partNumber: string;
  partName: string;
  material: string;
  nominalDimensionsMm?: {
    length: number;
    width: number;
    height: number;
  };
  process?: string;
  toleranceClass?: string;
};

type BuildAiCadGateInput = {
  innovation: InnovationResult;
  spec: TechnicalSpec;
  bom: BillOfMaterials | null;
  partMeasurements: PartForCadGate[];
  referenceImages?: ReferenceImage[];
  sourceLinks?: Record<string, string>;
  has3DScene: boolean;
  envelopeSource: string;
  expectedEnvironment: string;
  materialTreatmentGuidance: MaterialTreatmentGuidance[];
};

const includesAny = (value: string, terms: string[]) => terms.some(term => value.includes(term));

const normalizeText = (value: unknown) => String(value || '').trim();

const isPositiveDimension = (value: unknown) => Number(value) > 0;

const getReferenceCount = (referenceImages?: ReferenceImage[]) =>
  (referenceImages || []).filter(image => normalizeText(image.url)).length;

const getSourceLinkCount = (sourceLinks?: Record<string, string>) =>
  Object.values(sourceLinks || {}).filter(value => /^https?:\/\//i.test(normalizeText(value))).length;

const hasUsableDimensions = (part: PartForCadGate) => (
  isPositiveDimension(part.nominalDimensionsMm?.length) &&
  isPositiveDimension(part.nominalDimensionsMm?.width) &&
  isPositiveDimension(part.nominalDimensionsMm?.height)
);

const inferExpectedEnvironment = (innovation: InnovationResult) => {
  const value = [
    innovation.machineName,
    innovation.conceptName,
    innovation.conceptDescription,
    innovation.constraint,
  ].join(' ').toLowerCase();

  if (includesAny(value, ['farmbot', 'farm', 'garden', 'outdoor', 'greenhouse'])) {
    return 'outdoor agricultural exposure with moisture, soil, UV, and washdown risk';
  }
  if (includesAny(value, ['printer', 'electronics', 'control board', 'display'])) {
    return 'indoor electronics-adjacent service with heat cycling and ESD handling risk';
  }
  if (includesAny(value, ['cnc', 'router', 'mill', 'spindle'])) {
    return 'shop-floor service with chips, coolant mist, vibration, and sliding wear';
  }

  return 'general prototype service; vendor must confirm operating environment before fabrication';
};

export const inferCadExpectedEnvironment = inferExpectedEnvironment;

export const buildMaterialTreatmentGuidance = (
  parts: PartForCadGate[],
  expectedEnvironment: string
): MaterialTreatmentGuidance[] => parts.slice(0, 14).map(part => {
  const material = normalizeText(part.material) || 'inventory-approved material';
  const value = `${part.partName} ${material} ${expectedEnvironment}`.toLowerCase();
  const outdoor = includesAny(value, ['outdoor', 'farm', 'garden', 'greenhouse', 'moisture', 'washdown']);

  let surfaceFinish = 'vendor-selected finish after DfM review';
  let treatment = 'none specified until material and process are confirmed';
  let treatmentPurpose = 'avoid over-specifying finish before source dimensions and process are reviewed';
  let toleranceImpact = 'confirm final dimensions after any coating, plating, heat treatment, or post-processing';

  if (includesAny(value, ['rail', 'shaft', 'bearing', 'lead screw', 'spindle'])) {
    surfaceFinish = 'precision ground or vendor datasheet finish';
    treatment = 'case hardening, nitriding, or vendor-standard hardened finish when required';
    treatmentPurpose = 'wear resistance and stable motion alignment';
    toleranceImpact = 'treatment must be compatible with precision fit class and straightness requirements';
  } else if (includesAny(value, ['aluminum', '6061', '7075', 'extrusion'])) {
    surfaceFinish = 'deburr and machined or bead-blasted finish';
    treatment = outdoor ? 'Type II anodize or powder coat' : 'clear or black anodize if wear/corrosion protection is needed';
    treatmentPurpose = 'corrosion resistance, wear protection, and cleaner handling surfaces';
  } else if (includesAny(value, ['stainless', 'ss304', 'ss316'])) {
    surfaceFinish = 'deburred machined finish';
    treatment = 'passivation after machining';
    treatmentPurpose = 'restore corrosion resistance after cutting, drilling, or welding';
  } else if (includesAny(value, ['steel', 'carbon steel', 'mild steel'])) {
    surfaceFinish = 'deburr and remove scale at fit surfaces';
    treatment = outdoor ? 'zinc plating, e-coat, or powder coat' : 'black oxide, zinc plating, or oil finish by vendor recommendation';
    treatmentPurpose = 'corrosion control and wear reduction for exposed steel';
  } else if (includesAny(value, ['plastic', 'polycarbonate', 'abs', 'nylon', 'petg', 'pla'])) {
    surfaceFinish = 'deburr, remove support artifacts, and smooth contact edges';
    treatment = outdoor ? 'UV-stable material or UV-resistant coating' : 'no heat treatment; optional dye or vapor smoothing only after fit review';
    treatmentPurpose = 'surface cleanup, UV durability where needed, and safer handling';
  } else if (includesAny(value, ['board', 'display', 'power supply', 'sensor', 'controller'])) {
    surfaceFinish = 'manufacturer datasheet finish';
    treatment = 'no ReversR-specified treatment; preserve OEM finish and ESD controls';
    treatmentPurpose = 'avoid modifying certified or vendor-supplied electronics';
    toleranceImpact = 'use vendor datasheet envelope and mounting tolerances';
  }

  return {
    partNumber: normalizeText(part.partNumber) || 'PART-PENDING',
    partName: normalizeText(part.partName) || 'Unnamed part',
    baseMaterial: material,
    expectedEnvironment,
    surfaceFinish,
    treatment,
    treatmentPurpose,
    toleranceImpact,
    vendorConfirmationRequired: true,
    inspectionNotes: [
      'Confirm material grade and treatment compatibility before quoting.',
      'Confirm whether treatment changes hole size, fit surfaces, flatness, or lead time.',
      'Inspect critical dimensions after treatment or post-processing.',
    ],
  };
});

export const buildAiCadGate = ({
  innovation,
  spec,
  bom,
  partMeasurements,
  referenceImages,
  sourceLinks,
  has3DScene,
  envelopeSource,
  expectedEnvironment,
  materialTreatmentGuidance,
}: BuildAiCadGateInput): AiCadGate => {
  const sourceEvidence: string[] = [];
  const missingInputs: string[] = [];
  const riskFlags: string[] = [];
  const reviewerActions: string[] = [];
  const materialTreatmentNotes = materialTreatmentGuidance.slice(0, 5).map(item =>
    `${item.partName}: ${item.treatment} (${item.treatmentPurpose})`
  );

  const referenceCount = getReferenceCount(referenceImages);
  const sourceLinkCount = getSourceLinkCount(sourceLinks);
  const confidenceScore = Number(innovation.confidenceScore || 0);
  const partsWithDimensions = partMeasurements.filter(hasUsableDimensions).length;
  const partsWithMaterials = partMeasurements.filter(part => normalizeText(part.material)).length;
  const fitCriticalPart = partMeasurements.some(part => includesAny(
    `${part.partName} ${part.process || ''} ${part.toleranceClass || ''}`.toLowerCase(),
    ['rail', 'shaft', 'bearing', 'lead screw', 'spindle', 'motion', '+/-0.05', 'critical fit']
  ));

  if (innovation.machineId) sourceEvidence.push(`Machine ID: ${innovation.machineId}`);
  else missingInputs.push('machine ID');

  if (innovation.machineName) sourceEvidence.push(`Machine name: ${innovation.machineName}`);
  if (innovation.inventorySource) sourceEvidence.push(`Inventory source: ${innovation.inventorySource}`);
  else missingInputs.push('approved inventory source');

  if (confidenceScore > 0) sourceEvidence.push(`AI match confidence: ${Math.round(confidenceScore * 100)}%`);
  else missingInputs.push('machine match confidence');

  if (referenceCount > 0) sourceEvidence.push(`${referenceCount} reference image(s)`);
  if (sourceLinkCount > 0) sourceEvidence.push(`${sourceLinkCount} approved source link(s)`);
  if (bom?.items?.length) sourceEvidence.push(`BOM v${bom.version} with ${bom.items.length} line items`);
  else missingInputs.push('BOM line items');

  if (partMeasurements.length) sourceEvidence.push(`${partMeasurements.length} generated part measurement line(s)`);
  else missingInputs.push('part measurement table');

  if (partsWithDimensions < Math.min(partMeasurements.length, 1)) {
    missingInputs.push('positive nominal dimensions');
  }
  if (partsWithMaterials < Math.min(partMeasurements.length, 1)) {
    missingInputs.push('base material per drafted part');
  }
  if (referenceCount + sourceLinkCount === 0) {
    missingInputs.push('reference images or approved source links');
  }
  if (envelopeSource.includes('generic') || envelopeSource.includes('generated 3D scene')) {
    riskFlags.push(`Envelope source needs verification: ${envelopeSource}`);
  } else {
    sourceEvidence.push(`Envelope basis: ${envelopeSource}`);
  }

  if (fitCriticalPart) {
    riskFlags.push('Fit-critical or motion-control part requires CAD/manufacturing review before fabrication.');
  }
  if (confidenceScore > 0 && confidenceScore < 0.8) {
    riskFlags.push('Machine match confidence is below the preferred CAD drafting threshold.');
  }
  if (has3DScene) {
    sourceEvidence.push('3D scene descriptor available as visual reference only');
  }
  if (expectedEnvironment.includes('outdoor') || expectedEnvironment.includes('shop-floor')) {
    riskFlags.push(`Environment affects treatment choice: ${expectedEnvironment}`);
  }

  reviewerActions.push(
    'Confirm source dimensions against CAD, datasheet, measured part, or approved inventory revision.',
    'Confirm material grade, surface finish, and treatment before vendor submission.',
    'Confirm treatment impact on tolerances, hole sizes, fit surfaces, flatness, and lead time.',
    'Release only after CAD review, DfM review, and first-article inspection plan are accepted.'
  );

  let status: AiCadGateStatus = 'ready_for_cad_draft';
  let recommendedCadLane: RecommendedCadLane = 'cadquery';

  if (!innovation.machineId || !innovation.inventorySource) {
    status = 'visual_reference_only';
    recommendedCadLane = 'visual_reference';
  } else if (fitCriticalPart && confidenceScore > 0 && confidenceScore < 0.75) {
    status = 'blocked_safety_review';
    recommendedCadLane = 'onshape_or_fusion_review';
  } else if (partsWithDimensions === 0 || partsWithMaterials === 0 || !bom?.items?.length) {
    status = 'needs_dimensions';
    recommendedCadLane = 'cadquery';
  } else if (referenceCount + sourceLinkCount === 0) {
    status = has3DScene ? 'route_to_scan_to_cad_vendor' : 'needs_dimensions';
    recommendedCadLane = has3DScene ? 'scan_to_cad_vendor' : 'cadquery';
  } else if (fitCriticalPart) {
    recommendedCadLane = 'onshape_or_fusion_review';
  }

  const confidence = status === 'ready_for_cad_draft' && riskFlags.length === 0
    ? 'high'
    : status === 'visual_reference_only' || status === 'blocked_safety_review'
      ? 'low'
      : 'medium';

  const specDigest = [spec.promptLogic, spec.componentStructure, spec.implementationNotes]
    .join(' ')
    .slice(0, 220);
  if (specDigest) sourceEvidence.push(`Technical spec digest: ${specDigest}`);

  return {
    status,
    confidence,
    recommendedCadLane,
    sourceEvidence,
    missingInputs: Array.from(new Set(missingInputs)),
    riskFlags: Array.from(new Set(riskFlags)),
    reviewerActions,
    materialTreatmentNotes,
    finalReleaseBoundary: 'AI may draft, route, inspect, and reject CAD readiness. Qualified CAD/manufacturing review is required before fabrication, vendor submission, production ordering, or machine operation.',
  };
};
