import {
  BillOfMaterials,
  InnovationResult,
  SceneObject,
  TechnicalSpec,
  ThreeDSceneDescriptor,
} from '../hooks/useGemini';
import {
  AiCadGate,
  MaterialTreatmentGuidance,
  buildAiCadGate,
  buildMaterialTreatmentGuidance,
  inferCadExpectedEnvironment,
} from './cadQualification';

export type ManufacturingEnvelope = {
  widthMm: number;
  depthMm: number;
  heightMm: number;
  source: string;
};

export type ManufacturingPartMeasurement = {
  partNumber: string;
  partName: string;
  quantity: number;
  material: string;
  nominalDimensionsMm: {
    length: number;
    width: number;
    height: number;
  };
  process: string;
  toleranceClass: string;
  datumReferences: string[];
  inspectionNotes: string;
};

export type ManufacturingSceneMeasurement = {
  objectId: string;
  label: string;
  nominalDimensionsMm: {
    length: number;
    width: number;
    height: number;
  };
  positionMm: {
    x: number;
    y: number;
    z: number;
  };
  materialMode: string;
};

export type ManufacturingHandoff = {
  packetType: 'manufacturing_review_handoff';
  packetVersion: string;
  generatedAt: string;
  humanReviewRequired: true;
  safetyBoundary: string;
  envelope: ManufacturingEnvelope;
  datumScheme: Array<{
    datum: string;
    reference: string;
    purpose: string;
  }>;
  partMeasurements: ManufacturingPartMeasurement[];
  sceneMeasurements: ManufacturingSceneMeasurement[];
  criticalFeatures: Array<{
    feature: string;
    nominalRequirement: string;
    tolerance: string;
    inspectionMethod: string;
  }>;
  aiCadGate: AiCadGate;
  materialTreatmentGuidance: MaterialTreatmentGuidance[];
  drawingPackage: {
    requiredFiles: string[];
    availableReferences: string[];
    missingBeforeMachining: string[];
  };
  processPlan: Array<{
    stage: string;
    output: string;
    acceptanceGate: string;
  }>;
  reviewChecklist: string[];
  sourceSummary: {
    machineId?: string;
    machineName?: string;
    inventorySource?: string;
    matchConfidence?: number;
    technicalSpecDigest: string;
  };
};

const roundMm = (value: number) => Math.max(1, Math.round(value));

const includesAny = (value: string, terms: string[]) => terms.some(term => value.includes(term));

const inferEnvelope = (
  innovation: InnovationResult,
  scene: ThreeDSceneDescriptor | null
): ManufacturingEnvelope => {
  const name = `${innovation.machineName || ''} ${innovation.conceptName || ''}`.toLowerCase();
  if (includesAny(name, ['farmbot', 'gantry farming', 'cnc farming'])) {
    return { widthMm: 3000, depthMm: 1500, heightMm: 650, source: 'public FarmBot-class machine envelope' };
  }
  if (includesAny(name, ['fdm', '3d printer', 'filament printer'])) {
    return { widthMm: 420, depthMm: 420, heightMm: 520, source: 'desktop FDM printer nominal envelope' };
  }
  if (includesAny(name, ['cnc', 'router', 'mill'])) {
    return { widthMm: 760, depthMm: 620, heightMm: 420, source: 'desktop CNC router nominal envelope' };
  }

  const objects = scene?.objects || [];
  if (objects.length > 0) {
    const spans = getSceneSpans(objects);
    return {
      widthMm: roundMm(Math.max(spans.x * 140, 300)),
      depthMm: roundMm(Math.max(spans.z * 140, 240)),
      heightMm: roundMm(Math.max(spans.y * 140, 240)),
      source: 'scaled from generated 3D scene bounds',
    };
  }

  return { widthMm: 500, depthMm: 400, heightMm: 400, source: 'generic reconstruction review envelope' };
};

const getSceneSpans = (objects: SceneObject[]) => {
  if (objects.length === 0) return { x: 1, y: 1, z: 1 };

  const bounds = objects.reduce((acc, object) => {
    const [x, y, z] = object.position;
    const [sx, sy, sz] = object.scale;
    return {
      minX: Math.min(acc.minX, x - sx / 2),
      maxX: Math.max(acc.maxX, x + sx / 2),
      minY: Math.min(acc.minY, y - sy / 2),
      maxY: Math.max(acc.maxY, y + sy / 2),
      minZ: Math.min(acc.minZ, z - sz / 2),
      maxZ: Math.max(acc.maxZ, z + sz / 2),
    };
  }, {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
  });

  return {
    x: Math.max(bounds.maxX - bounds.minX, 1),
    y: Math.max(bounds.maxY - bounds.minY, 1),
    z: Math.max(bounds.maxZ - bounds.minZ, 1),
  };
};

const inferPartDimensions = (
  partName: string,
  index: number,
  envelope: ManufacturingEnvelope
) => {
  const name = partName.toLowerCase();
  if (includesAny(name, ['frame', 'extrusion', 'rail', 'gantry'])) {
    return {
      length: roundMm(envelope.widthMm * (index % 2 === 0 ? 0.85 : 0.55)),
      width: 40,
      height: 40,
    };
  }
  if (includesAny(name, ['bed', 'platform', 'wasteboard', 'plate', 'platen'])) {
    return {
      length: roundMm(envelope.widthMm * 0.72),
      width: roundMm(envelope.depthMm * 0.62),
      height: 8,
    };
  }
  if (includesAny(name, ['motor', 'stepper', 'spindle', 'pump'])) {
    return { length: 56, width: 56, height: 78 };
  }
  if (includesAny(name, ['board', 'controller', 'display', 'power supply'])) {
    return { length: 110, width: 75, height: 32 };
  }
  if (includesAny(name, ['belt', 'chain', 'cable'])) {
    return { length: roundMm(envelope.widthMm * 0.92), width: 10, height: 6 };
  }
  if (includesAny(name, ['bearing', 'wheel', 'pulley', 'nozzle', 'shaft'])) {
    return { length: 24, width: 24, height: 12 };
  }
  return {
    length: roundMm(Math.max(envelope.widthMm * 0.18, 65 + index * 8)),
    width: roundMm(Math.max(envelope.depthMm * 0.12, 36)),
    height: roundMm(Math.max(envelope.heightMm * 0.08, 24)),
  };
};

const inferProcess = (partName: string, material: string) => {
  const value = `${partName} ${material}`.toLowerCase();
  if (includesAny(value, ['frame', 'extrusion', 'rail', 'plate', 'gantry', 'aluminum', 'steel'])) {
    return 'CNC machining, extrusion cut-to-length, or sheet/plate fabrication';
  }
  if (includesAny(value, ['housing', 'mount', 'cover', 'plastic', 'polycarbonate'])) {
    return 'SLS/MJF print or CNC plastic machining after DfM review';
  }
  if (includesAny(value, ['board', 'display', 'power', 'motor', 'sensor'])) {
    return 'Commercial off-the-shelf sourcing; verify vendor datasheet envelope';
  }
  return 'Manufacturer-selected process after material and tolerance review';
};

const inferTolerance = (partName: string, material: string) => {
  const value = `${partName} ${material}`.toLowerCase();
  if (includesAny(value, ['rail', 'shaft', 'bearing', 'pulley', 'lead screw', 'spindle'])) {
    return '+/-0.05 mm critical fit; confirm bearing/rail class';
  }
  if (includesAny(value, ['frame', 'plate', 'gantry', 'aluminum', 'steel'])) {
    return '+/-0.10 mm machined faces; +/-0.50 mm cut length';
  }
  if (includesAny(value, ['plastic', 'housing', 'mount', 'polycarbonate'])) {
    return '+/-0.25 mm printed or plastic machined features';
  }
  if (includesAny(value, ['board', 'display', 'power', 'motor', 'sensor'])) {
    return 'manufacturer datasheet tolerance';
  }
  return '+/-0.20 mm unless revised by manufacturing review';
};

const buildPartMeasurements = (
  bom: BillOfMaterials | null,
  innovation: InnovationResult,
  envelope: ManufacturingEnvelope
): ManufacturingPartMeasurement[] => {
  const fallbackParts = Array.from(new Set((innovation.assemblySteps || []).flatMap(step => step.parts || [])))
    .slice(0, 10)
    .map((partName, index) => ({
      partNumber: `${innovation.machineId || 'PART'}-${String(index + 1).padStart(3, '0')}`,
      partName,
      quantity: 1,
      material: 'inventory-approved material',
    }));

  const sourceItems = bom?.items?.length
    ? bom.items.map(item => ({
        partNumber: item.partNumber,
        partName: item.partName,
        quantity: item.quantity,
        material: item.material,
      }))
    : fallbackParts;

  return sourceItems.slice(0, 14).map((item, index) => ({
    partNumber: item.partNumber,
    partName: item.partName,
    quantity: item.quantity,
    material: item.material,
    nominalDimensionsMm: inferPartDimensions(item.partName, index, envelope),
    process: inferProcess(item.partName, item.material),
    toleranceClass: inferTolerance(item.partName, item.material),
    datumReferences: index < 3 ? ['A', 'B', 'C'] : ['A', index % 2 === 0 ? 'B' : 'C'],
    inspectionNotes: 'Confirm against source CAD, revision drawing, or physical first article before machining production parts.',
  }));
};

const buildSceneMeasurements = (
  scene: ThreeDSceneDescriptor | null,
  envelope: ManufacturingEnvelope
): ManufacturingSceneMeasurement[] => {
  const objects = scene?.objects || [];
  if (objects.length === 0) return [];

  const spans = getSceneSpans(objects);
  const scaleX = envelope.widthMm / spans.x;
  const scaleY = envelope.heightMm / spans.y;
  const scaleZ = envelope.depthMm / spans.z;

  return objects.map(object => ({
    objectId: object.id,
    label: object.name || object.id,
    nominalDimensionsMm: {
      length: roundMm(Math.abs(object.scale[0] * scaleX)),
      width: roundMm(Math.abs(object.scale[2] * scaleZ)),
      height: roundMm(Math.abs(object.scale[1] * scaleY)),
    },
    positionMm: {
      x: roundMm(object.position[0] * scaleX),
      y: roundMm(object.position[1] * scaleY),
      z: roundMm(object.position[2] * scaleZ),
    },
    materialMode: object.material,
  }));
};

const buildCriticalFeatures = (innovation: InnovationResult) => {
  const name = `${innovation.machineName || ''} ${innovation.conceptName || ''}`.toLowerCase();
  const motionFeature = includesAny(name, ['farmbot', 'cnc', 'router', 'printer'])
    ? 'linear motion rails and gantry travel'
    : 'primary motion interfaces';
  return [
    {
      feature: 'datum mounting plane',
      nominalRequirement: 'Datum A remains flat across all frame and base mounting points.',
      tolerance: 'flatness <=0.20 mm across local mounting zones',
      inspectionMethod: 'surface plate, straightedge, or CMM first-article check',
    },
    {
      feature: motionFeature,
      nominalRequirement: 'Parallel rails, belts, shafts, or gantry members align without binding through full travel.',
      tolerance: 'parallelism <=0.15 mm per 300 mm travel unless source drawing is stricter',
      inspectionMethod: 'dial indicator sweep and manual travel verification',
    },
    {
      feature: 'fastener and service-hole pattern',
      nominalRequirement: 'Holes and slots match the matched inventory revision and vendor-selected fastener class.',
      tolerance: 'hole position +/-0.10 mm for precision mounts; +/-0.25 mm general assembly',
      inspectionMethod: 'go/no-go pins, caliper inspection, or template overlay',
    },
    {
      feature: 'power and control clearances',
      nominalRequirement: 'Electronics, wiring, hoses, and moving components maintain service clearance.',
      tolerance: '>=5 mm static clearance; >=10 mm dynamic clearance',
      inspectionMethod: 'assembly fit check and powered dry-run without load',
    },
  ];
};

export const buildManufacturingHandoff = ({
  innovation,
  spec,
  bom,
  scene,
  has2D,
  angleLabels,
}: {
  innovation: InnovationResult;
  spec: TechnicalSpec;
  bom: BillOfMaterials | null;
  scene: ThreeDSceneDescriptor | null;
  has2D: boolean;
  angleLabels: string[];
}): ManufacturingHandoff => {
  const envelope = inferEnvelope(innovation, scene);
  const partMeasurements = buildPartMeasurements(bom, innovation, envelope);
  const sceneMeasurements = buildSceneMeasurements(scene, envelope);
  const expectedEnvironment = inferCadExpectedEnvironment(innovation);
  const materialTreatmentGuidance = buildMaterialTreatmentGuidance(partMeasurements, expectedEnvironment);
  const aiCadGate = buildAiCadGate({
    innovation,
    spec,
    bom,
    partMeasurements,
    referenceImages: innovation.referenceImages,
    sourceLinks: innovation.sourceLinks,
    has3DScene: !!scene,
    envelopeSource: envelope.source,
    expectedEnvironment,
    materialTreatmentGuidance,
  });

  return {
    packetType: 'manufacturing_review_handoff',
    packetVersion: '0.3-review',
    generatedAt: new Date().toISOString(),
    humanReviewRequired: true,
    safetyBoundary: 'AI may draft, route, inspect, and reject CAD readiness. Nominal dimensions, tolerances, material treatments, and process notes are for manufacturer review. Qualified CAD, DfM, safety, and first-article inspection signoff are required before machining, printing, vendor submission, ordering, or machine operation.',
    envelope,
    datumScheme: [
      { datum: 'A', reference: 'base or primary mounting plane', purpose: 'sets vertical stack-up and flatness inspection' },
      { datum: 'B', reference: 'left rail/frame longitudinal reference', purpose: 'controls motion-axis alignment and hole-pattern origin' },
      { datum: 'C', reference: 'front cross member or operator-facing edge', purpose: 'controls depth, service clearance, and assembly orientation' },
    ],
    partMeasurements,
    sceneMeasurements,
    criticalFeatures: buildCriticalFeatures(innovation),
    aiCadGate,
    materialTreatmentGuidance,
    drawingPackage: {
      requiredFiles: ['CAD draft source or KCL/CadQuery script', 'STEP assembly', 'native CAD or Parasolid export', 'PDF detail drawings', 'BOM CSV', 'material treatment notes', 'inspection plan', 'quote packet JSON'],
      availableReferences: [
        has2D ? `2D views: ${angleLabels.length ? angleLabels.join(', ') : 'single generated view'}` : '2D views pending',
        scene?.sourceRender ? `Source-backed 3D render: ${scene.sourceRender.renderProvider || scene.sourceRender.sourceProvider || 'provider catalog'}${scene.sourceRender.cadFormats?.length ? ` (${scene.sourceRender.cadFormats.join(', ')})` : ''}` : scene ? `3D scene descriptor with ${scene.objects.length} visual-reference objects` : '3D scene pending',
        bom ? `BOM v${bom.version} with ${bom.items.length} line items` : 'BOM pending',
        `AI CAD gate: ${aiCadGate.status}`,
      ],
      missingBeforeMachining: ['source CAD dimensions verified against inventory revision', 'CAD draft qualified in CAD software', 'material treatment compatibility confirmed by vendor', 'material certificates where required', 'critical-to-function tolerance approval after treatment', 'first-article inspection signoff'],
    },
    processPlan: [
      { stage: 'AI CAD readiness gate', output: 'draft, reject, or route recommendation for CAD work', acceptanceGate: 'AI gate has source evidence, missing inputs, risk flags, and recommended lane' },
      { stage: 'CAD draft', output: 'CadQuery/Zoo/vendor draft source plus STEP/STL/3MF where available', acceptanceGate: 'draft dimensions, units, material, and treatment assumptions are present' },
      { stage: 'CAD qualification', output: 'validated STEP/native assembly and per-part drawings', acceptanceGate: 'qualified reviewer confirms machine ID, revision, source dimensions, and CAD editability' },
      { stage: 'Material and treatment review', output: 'confirmed base material, finish, coating/plating/anodize/passivation/heat-treatment plan', acceptanceGate: 'vendor confirms treatment compatibility, tolerance impact, inspection method, and lead time' },
      { stage: 'DfM review', output: 'process, material, tolerance, treatment, and quote assumptions', acceptanceGate: 'manufacturer flags missing files, impossible tolerances, or treatment conflicts' },
      { stage: 'prototype fabrication', output: 'first article or fit-check batch', acceptanceGate: 'critical features pass inspection plan' },
      { stage: 'assembly and calibration', output: 'reconstructed machine with calibration evidence', acceptanceGate: 'functional and safety checks pass before operation' },
    ],
    reviewChecklist: [
      'Confirm the scanned machine and inventory record are the same revision.',
      'Replace nominal dimensions with source CAD or measured dimensions before machining.',
      'Confirm material grade, surface finish, and any heat treatment, coating, plating, anodize, powder coat, passivation, UV treatment, or post-processing.',
      'Confirm treatment effects on fit surfaces, holes, flatness, corrosion resistance, wear resistance, and lead time.',
      'Confirm safety-critical loads, motion limits, electrical ratings, and guarding.',
      'Request manufacturer DfM feedback before ordering production quantities.',
      'Attach inspection evidence to the final reconstruction packet.',
    ],
    sourceSummary: {
      machineId: innovation.machineId,
      machineName: innovation.machineName || innovation.conceptName,
      inventorySource: innovation.inventorySource,
      matchConfidence: innovation.confidenceScore,
      technicalSpecDigest: [spec.promptLogic, spec.componentStructure, spec.implementationNotes]
        .join(' ')
        .slice(0, 420),
    },
  };
};
