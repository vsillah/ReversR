const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');
const {
  DEFAULT_RENDER_PRESET,
  buildControlledFixtureBinding,
  defaultOutputDir,
  runIgesSourcePipeline,
  writeJson,
} = require('./igesSourcePipeline');

const VISUAL_CALIBRATION_RUBRIC_ID = 'iges-post-render-visual-calibration-v1';

const APPROVED_GOLDEN_REFERENCES = Object.freeze({
  'assem-1': {
    id: 'assem-1-solidworks-jpg-golden-v1',
    path: '/Users/vambahsillah/Downloads/Assem-1.JPG',
    sha256: '7dbc28dc5e066c2ced4b617ca2d6765ed613493674f02574d6adf9fed3563948',
    role: 'post_render_visual_calibration_only',
    expectedDisplaySemantics: [
      'SolidWorks-style assembly view may use hidden-line or ghosted component emphasis.',
      'Bracket/isolator relationship should be visually inspectable without treating the JPG as source geometry.',
    ],
    excludedFrom: [
      'IGES ingestion',
      'scene assembly',
      'renderer source data',
      'STL export',
      'source confidence score',
    ],
  },
  'bracket-1': {
    id: 'bracket-1-solidworks-jpg-golden-v1',
    path: '/Users/vambahsillah/Downloads/bracket-1.JPG',
    sha256: 'b850d8b3f26dc642c9f30147a71cdf13bb63802c05bbbd8adf0f3f2459759c6c',
    role: 'post_render_visual_calibration_only',
    expectedDisplaySemantics: [
      'Holed flange should read as the lower/front base plate in the approved reference view.',
      'Upright wall should remain visually dominant but should not hide the base-flange relationship.',
    ],
    excludedFrom: [
      'IGES ingestion',
      'scene assembly',
      'renderer source data',
      'STL export',
      'source confidence score',
    ],
  },
  'isolator-1': {
    id: 'isolator-1-solidworks-jpg-golden-v1',
    path: '/Users/vambahsillah/Downloads/isolator-1.JPG',
    sha256: '9e0edf6957677fdc505ad871401115a54948e3bd33386085522b8287a514dd62',
    role: 'post_render_visual_calibration_only',
    expectedDisplaySemantics: [
      'Rectangular block should read as a shaded SolidWorks-style part with clean outlines.',
    ],
    excludedFrom: [
      'IGES ingestion',
      'scene assembly',
      'renderer source data',
      'STL export',
      'source confidence score',
    ],
  },
});

const CALIBRATION_EXPERIMENTS = Object.freeze([
  {
    id: 'baseline-source-render',
    label: 'Current source-only render preset',
    hypothesis: 'Baseline shaded source render proves source geometry but may differ from the SolidWorks golden view in camera, line treatment, and background.',
    preset: {},
  },
  {
    id: 'golden-aspect-shaded-cad',
    label: 'Match golden aspect and shaded CAD material',
    hypothesis: 'Using the golden image aspect ratio, grey gradient background, blue-grey material, and crease-only black edges should improve SolidWorks-style similarity without changing geometry.',
    preset: {
      id: 'source-iges-visual-calibration-shaded-cad-v1',
      width: 1486,
      height: 854,
      material: {
        base: [88, 93, 109, 255],
        top: [195, 203, 224, 255],
        side: [130, 136, 154, 255],
      },
      edgeColor: [8, 8, 8, 255],
      margin: 34,
    },
  },
  {
    id: 'side-isometric-camera',
    label: 'Side/isometric camera hypothesis',
    hypothesis: 'Changing only the projection preset may better align the assembly silhouette and placement with the golden CAD viewport.',
    preset: {
      id: 'source-iges-visual-calibration-side-isometric-v1',
      width: 1486,
      height: 854,
      material: {
        base: [88, 93, 109, 255],
        top: [195, 203, 224, 255],
        side: [130, 136, 154, 255],
      },
      edgeColor: [8, 8, 8, 255],
      margin: 28,
      projection: {
        ySkew: 0.12,
        zLift: 0.82,
        xyLift: 0.52,
      },
    },
  },
  {
    id: 'tall-upright-camera',
    label: 'Upright bracket emphasis hypothesis',
    hypothesis: 'Increasing vertical lift may better emphasize the upright bracket panel seen in the golden reference.',
    preset: {
      id: 'source-iges-visual-calibration-upright-v1',
      width: 1486,
      height: 854,
      material: {
        base: [88, 93, 109, 255],
        top: [195, 203, 224, 255],
        side: [130, 136, 154, 255],
      },
      edgeColor: [8, 8, 8, 255],
      margin: 30,
      projection: {
        ySkew: 0.4,
        zLift: 1.35,
        xyLift: 0.38,
      },
    },
  },
  {
    id: 'solidworks-trimetric-a',
    label: 'SolidWorks trimetric camera A',
    hypothesis: 'A bounded Euler camera hypothesis may better match the SolidWorks reference orientation while keeping IGES geometry unchanged.',
    preset: {
      id: 'source-iges-visual-calibration-trimetric-a-v1',
      material: {
        base: [88, 93, 109, 255],
        top: [196, 204, 225, 255],
        side: [128, 134, 152, 255],
      },
      edgeColor: [8, 8, 8, 255],
      margin: 44,
      projection: {
        mode: 'euler',
        yawDeg: -34,
        pitchDeg: 0,
        rollDeg: -24,
      },
    },
  },
  {
    id: 'solidworks-trimetric-b',
    label: 'SolidWorks trimetric camera B',
    hypothesis: 'Mirroring the horizontal camera direction may close the bracket/isolator orientation gap visible against the part references.',
    preset: {
      id: 'source-iges-visual-calibration-trimetric-b-v1',
      material: {
        base: [88, 93, 109, 255],
        top: [196, 204, 225, 255],
        side: [128, 134, 152, 255],
      },
      edgeColor: [8, 8, 8, 255],
      margin: 44,
      projection: {
        mode: 'euler',
        yawDeg: 34,
        pitchDeg: 0,
        rollDeg: -24,
      },
    },
  },
  {
    id: 'solidworks-trimetric-c',
    label: 'SolidWorks trimetric camera C',
    hypothesis: 'A steeper vertical camera angle may better match the tall bracket wall in the assembly and part references.',
    preset: {
      id: 'source-iges-visual-calibration-trimetric-c-v1',
      material: {
        base: [88, 93, 109, 255],
        top: [196, 204, 225, 255],
        side: [128, 134, 152, 255],
      },
      edgeColor: [8, 8, 8, 255],
      margin: 44,
      projection: {
        mode: 'euler',
        yawDeg: -24,
        pitchDeg: 0,
        rollDeg: -34,
      },
    },
  },
  {
    id: 'solidworks-trimetric-d',
    label: 'SolidWorks trimetric camera D',
    hypothesis: 'A lower, longer side camera may improve isolator block alignment while preserving source geometry.',
    preset: {
      id: 'source-iges-visual-calibration-trimetric-d-v1',
      material: {
        base: [88, 93, 109, 255],
        top: [196, 204, 225, 255],
        side: [128, 134, 152, 255],
      },
      edgeColor: [8, 8, 8, 255],
      margin: 44,
      projection: {
        mode: 'euler',
        yawDeg: 24,
        pitchDeg: 0,
        rollDeg: -18,
      },
    },
  },
  {
    id: 'axis-remap-base-holes-a',
    label: 'CAD axis remap: holed plate horizontal A',
    hypothesis: 'A render-only axis remap may match the SolidWorks reference frame where the holed bracket plate reads as the horizontal base.',
    preset: {
      id: 'source-iges-visual-calibration-axis-remap-base-holes-a-v1',
      material: {
        base: [88, 93, 109, 255],
        top: [196, 204, 225, 255],
        side: [128, 134, 152, 255],
      },
      edgeColor: [8, 8, 8, 255],
      margin: 44,
      projection: {
        modelPitchDeg: 90,
        ySkew: 0.55,
        zLift: 0.42,
        xyLift: 0.2,
      },
    },
  },
  {
    id: 'axis-remap-base-holes-b',
    label: 'CAD axis remap: holed plate horizontal B',
    hypothesis: 'The opposite render-only pitch remap tests whether the IGES axis convention is inverted relative to the SolidWorks golden viewport.',
    preset: {
      id: 'source-iges-visual-calibration-axis-remap-base-holes-b-v1',
      material: {
        base: [88, 93, 109, 255],
        top: [196, 204, 225, 255],
        side: [128, 134, 152, 255],
      },
      edgeColor: [8, 8, 8, 255],
      margin: 44,
      projection: {
        modelPitchDeg: -90,
        ySkew: 0.55,
        zLift: 0.42,
        xyLift: 0.2,
      },
    },
  },
  {
    id: 'axis-remap-base-holes-c',
    label: 'CAD axis remap: holed plate horizontal C',
    hypothesis: 'A render-only roll remap tests another likely CAD axis convention without changing source geometry.',
    preset: {
      id: 'source-iges-visual-calibration-axis-remap-base-holes-c-v1',
      material: {
        base: [88, 93, 109, 255],
        top: [196, 204, 225, 255],
        side: [128, 134, 152, 255],
      },
      edgeColor: [8, 8, 8, 255],
      margin: 44,
      projection: {
        modelRollDeg: 90,
        ySkew: 0.55,
        zLift: 0.42,
        xyLift: 0.2,
      },
    },
  },
  {
    id: 'axis-remap-base-holes-d',
    label: 'CAD axis remap: holed plate horizontal D',
    hypothesis: 'The opposite render-only roll remap tests the mirrored SolidWorks viewport frame for the bracket and assembly.',
    preset: {
      id: 'source-iges-visual-calibration-axis-remap-base-holes-d-v1',
      material: {
        base: [88, 93, 109, 255],
        top: [196, 204, 225, 255],
        side: [128, 134, 152, 255],
      },
      edgeColor: [8, 8, 8, 255],
      margin: 44,
      projection: {
        modelRollDeg: -90,
        ySkew: 0.55,
        zLift: 0.42,
        xyLift: 0.2,
      },
    },
  },
  {
    id: 'assembly-bracket-shaded-isolator-hidden-line',
    label: 'Assembly display state: bracket shaded, isolator hidden-line',
    hypothesis: 'The assembly reference appears closer to a SolidWorks display-state view than a fully shaded render; render the bracket as shaded and the isolator as faint hidden-line through-geometry.',
    preset: {
      id: 'source-iges-visual-calibration-assembly-display-state-v1',
      material: {
        base: [88, 93, 109, 255],
        top: [196, 204, 225, 255],
        side: [128, 134, 152, 255],
      },
      edgeColor: [8, 8, 8, 255],
      margin: 44,
      projection: {
        mode: 'euler',
        yawDeg: -34,
        pitchDeg: 0,
        rollDeg: -24,
      },
      displayState: {
        mode: 'shaded',
        opacity: 1,
        edgeOpacity: 1,
        nodeStyles: {
          'bracket-1': {
            mode: 'shaded',
            opacity: 1,
            edgeOpacity: 1,
          },
          'isolator-1': {
            mode: 'hidden_line',
            edgeMode: 'all',
            edgeOpacity: 0.16,
            edgeColor: [142, 148, 158, 255],
            edgeLineWidth: 1,
            visibleThrough: true,
          },
        },
      },
    },
  },
  {
    id: 'global-hidden-line-cad',
    label: 'Global hidden-line CAD display',
    hypothesis: 'A hidden-line display-state preset may better match wire/outline-heavy SolidWorks exports without changing source geometry.',
    preset: {
      id: 'source-iges-visual-calibration-global-hidden-line-v1',
      edgeColor: [8, 8, 8, 255],
      margin: 44,
      projection: {
        mode: 'euler',
        yawDeg: -34,
        pitchDeg: 0,
        rollDeg: -24,
      },
      displayState: {
        mode: 'hidden_line',
        edgeMode: 'all',
        edgeOpacity: 0.82,
        edgeLineWidth: 1,
        visibleThrough: true,
      },
    },
  },
]);

const sha256File = filePath => {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const loadImage = filePath => {
  const buffer = fs.readFileSync(filePath);
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.png') {
    const decoded = PNG.sync.read(buffer);
    return {
      width: decoded.width,
      height: decoded.height,
      data: decoded.data,
      format: 'png',
    };
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    const decoded = jpeg.decode(buffer, { useTArray: true });
    return {
      width: decoded.width,
      height: decoded.height,
      data: decoded.data,
      format: 'jpeg',
    };
  }
  throw new Error(`Unsupported visual calibration image type: ${filePath}`);
};

const getGray = (image, x, y) => {
  const clampedX = Math.max(0, Math.min(image.width - 1, x));
  const clampedY = Math.max(0, Math.min(image.height - 1, y));
  const index = (clampedY * image.width + clampedX) * 4;
  return image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114;
};

const sampleGray = (image, width = 160, height = 92) => {
  const samples = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.round((y / Math.max(1, height - 1)) * (image.height - 1));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.round((x / Math.max(1, width - 1)) * (image.width - 1));
      samples[y * width + x] = getGray(image, sourceX, sourceY);
    }
  }
  return { width, height, samples };
};

const imageFeatures = image => {
  const sampled = sampleGray(image);
  const edges = new Uint8Array(sampled.width * sampled.height);
  const threshold = 18;
  let edgeCount = 0;
  let sumX = 0;
  let sumY = 0;
  let weightedX = 0;
  let weightedY = 0;
  const bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };

  for (let y = 1; y < sampled.height - 1; y += 1) {
    for (let x = 1; x < sampled.width - 1; x += 1) {
      const i = y * sampled.width + x;
      const gx = sampled.samples[i + 1] - sampled.samples[i - 1];
      const gy = sampled.samples[i + sampled.width] - sampled.samples[i - sampled.width];
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      if (magnitude >= threshold) {
        edges[i] = 1;
        edgeCount += 1;
        sumX += x;
        sumY += y;
        weightedX += x * magnitude;
        weightedY += y * magnitude;
        bounds.minX = Math.min(bounds.minX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.maxY = Math.max(bounds.maxY, y);
      }
    }
  }

  const hasEdges = edgeCount > 0;
  const bbox = hasEdges ? {
    x: round(bounds.minX / sampled.width),
    y: round(bounds.minY / sampled.height),
    width: round((bounds.maxX - bounds.minX + 1) / sampled.width),
    height: round((bounds.maxY - bounds.minY + 1) / sampled.height),
  } : null;
  const aspect = bbox ? round(bbox.width / Math.max(0.0001, bbox.height), 4) : null;
  const centroid = hasEdges ? {
    x: round((sumX / edgeCount) / sampled.width),
    y: round((sumY / edgeCount) / sampled.height),
  } : null;
  const weightedCentroid = hasEdges ? {
    x: round((weightedX / Math.max(1, weightedX / Math.max(1, sumX))) / sampled.width),
    y: round((weightedY / Math.max(1, weightedY / Math.max(1, sumY))) / sampled.height),
  } : null;

  return {
    width: image.width,
    height: image.height,
    aspectRatio: round(image.width / image.height, 4),
    edgeCount,
    edgeRatio: round(edgeCount / edges.length, 6),
    edgeBoundingBox: bbox,
    edgeAspectRatio: aspect,
    edgeCentroid: centroid,
    weightedCentroid,
    edgeMask: edges,
    sampleWidth: sampled.width,
    sampleHeight: sampled.height,
    meanLuminance: round(mean(sampled.samples), 3),
    luminanceStdDev: round(stdDev(sampled.samples), 3),
  };
};

const compareFeatureSets = (renderFeatures, referenceFeatures, context = {}) => {
  const iou = maskIou(renderFeatures.edgeMask, referenceFeatures.edgeMask);
  const bboxDelta = bboxDistance(renderFeatures.edgeBoundingBox, referenceFeatures.edgeBoundingBox);
  const centroidDelta = pointDistance(renderFeatures.edgeCentroid, referenceFeatures.edgeCentroid);
  const aspectDelta = Math.abs((renderFeatures.edgeAspectRatio || 0) - (referenceFeatures.edgeAspectRatio || 0));
  const resolutionDelta = Math.abs(renderFeatures.aspectRatio - referenceFeatures.aspectRatio);
  const lineDensityDelta = Math.abs(renderFeatures.edgeRatio - referenceFeatures.edgeRatio);
  const lightingDelta = Math.min(1, Math.abs(renderFeatures.meanLuminance - referenceFeatures.meanLuminance) / 255);
  const contrastDelta = Math.min(1, Math.abs(renderFeatures.luminanceStdDev - referenceFeatures.luminanceStdDev) / 128);

  const cameraScore = clampScore(100 * (1 - (bboxDelta * 0.45 + centroidDelta * 0.35 + Math.min(1, resolutionDelta) * 0.2)));
  const placementScore = clampScore(100 * (1 - (centroidDelta * 0.7 + bboxDelta * 0.3)));
  const silhouetteScore = clampScore(100 * (iou * 0.65 + (1 - Math.min(1, aspectDelta)) * 0.35));
  const lightingMaterialScore = clampScore(100 * (1 - (lightingDelta * 0.5 + contrastDelta * 0.5)));
  const lineTreatmentScore = clampScore(100 * (1 - Math.min(1, lineDensityDelta * 10)));
  const resolutionScore = clampScore(100 * (1 - Math.min(1, resolutionDelta)));

  const componentScores = [
    { id: 'camera_framing', score: cameraScore, inputs: { bboxDelta, centroidDelta, resolutionDelta } },
    { id: 'object_placement_orientation', score: placementScore, inputs: { centroidDelta, bboxDelta } },
    { id: 'silhouette_alignment', score: silhouetteScore, inputs: { edgeMaskIou: iou, aspectDelta } },
    { id: 'lighting_material_background', score: lightingMaterialScore, inputs: { lightingDelta, contrastDelta } },
    { id: 'line_edge_treatment', score: lineTreatmentScore, inputs: { lineDensityDelta } },
    { id: 'resolution_aspect', score: resolutionScore, inputs: { renderAspect: renderFeatures.aspectRatio, referenceAspect: referenceFeatures.aspectRatio } },
  ];

  const visualFidelityScore = Math.round(componentScores.reduce((sum, item) => sum + item.score, 0) / componentScores.length);
  const semanticVisualFlags = buildSemanticVisualFlags({
    ...context,
    componentScores,
    visualFidelityScore,
    renderFeatures,
    referenceFeatures,
  });

  return {
    visual_fidelity_score: visualFidelityScore,
    componentScores,
    semanticVisualFlags,
    semanticGate: {
      status: semanticVisualFlags.some(flag => flag.blocksGoldenReady) ? 'blocked_human_semantic_review' : 'clear_for_human_visual_review',
      blocksGoldenReady: semanticVisualFlags.some(flag => flag.blocksGoldenReady),
    },
    differences: describeDifferences(componentScores, renderFeatures, referenceFeatures),
  };
};

const buildSemanticVisualFlags = ({
  assetId,
  experiment,
  componentScores,
  visualFidelityScore,
}) => {
  const flags = [];
  const experimentId = experiment?.id || '';
  const preset = experiment?.preset || {};
  const displayState = preset.displayState || {};
  const hasNodeDisplayState = displayState.nodeStyles && Object.keys(displayState.nodeStyles).length > 0;
  const scoreById = id => componentScores.find(item => item.id === id)?.score ?? 0;

  if (assetId === 'assem-1' && !hasNodeDisplayState) {
    flags.push({
      id: 'assembly_display_state_not_modeled',
      severity: 'warning',
      category: 'display-state',
      message: 'Assembly candidate uses a normal global display state; golden reference appears to need component emphasis, ghosting, or hidden-line handling.',
      blocksGoldenReady: visualFidelityScore >= 80,
    });
  }

  if (assetId === 'assem-1' && hasNodeDisplayState && scoreById('silhouette_alignment') < 75) {
    flags.push({
      id: 'assembly_display_state_needs_camera_followup',
      severity: 'warning',
      category: 'display-state',
      message: 'Assembly display-state preset is present, but silhouette alignment remains low; continue camera/display-state calibration before production promotion.',
      blocksGoldenReady: true,
    });
  }

  if (assetId === 'bracket-1') {
    flags.push({
      id: 'bracket_plate_orientation_requires_human_review',
      severity: 'blocking',
      category: 'object placement/orientation',
      message: 'Bracket reference expects the holed flange to read as the lower/front base plate. Current scorer cannot certify that semantic orientation from edge metrics alone.',
      blocksGoldenReady: true,
    });
  }

  if (experimentId.startsWith('axis-remap')) {
    flags.push({
      id: 'render_axis_remap_experiment',
      severity: 'info',
      category: 'camera/framing',
      message: 'This candidate uses a render-only axis remap. It is allowed for calibration, but requires explicit human approval before any production preset change.',
      blocksGoldenReady: false,
    });
  }

  if (displayState.mode === 'hidden_line' || hasNodeDisplayState) {
    flags.push({
      id: 'display_state_experiment',
      severity: 'info',
      category: 'display-state',
      message: 'This candidate changes render display state only. It does not alter IGES ingestion, scene geometry, source confidence, or STL output.',
      blocksGoldenReady: false,
    });
  }

  return flags;
};

const describeDifferences = (componentScores, renderFeatures, referenceFeatures) => {
  const differences = [];
  const addIf = (condition, category, message, priority) => {
    if (condition) differences.push({ category, message, priority });
  };
  const scoreById = id => componentScores.find(item => item.id === id)?.score ?? 0;

  addIf(scoreById('camera_framing') < 80, 'camera/framing', 'Rendered camera/framing does not yet match the golden CAD viewport. Tune projection, margin, and output aspect before considering golden-ready.', 1);
  addIf(scoreById('object_placement_orientation') < 80, 'object placement/orientation', 'Object centroid or bounding box differs from the golden reference. Prioritize camera preset hypotheses over geometry edits.', 1);
  addIf(scoreById('silhouette_alignment') < 70, 'silhouette', 'Silhouette edge overlap is low. This is a visual preset issue unless source assembly evidence also fails.', 1);
  addIf(scoreById('lighting_material_background') < 85, 'lighting/material/background', 'Background and luminance profile differ from the golden grey SolidWorks-style output.', 2);
  addIf(scoreById('line_edge_treatment') < 85, 'line/edge treatment', 'Line density and edge styling differ from the golden reference; consider monochrome thin-outline preset and hidden-line treatment in a later renderer.', 2);
  addIf(scoreById('resolution_aspect') < 95, 'resolution', 'Output aspect ratio differs from the golden reference dimensions.', 3);

  return {
    summary: differences.length
      ? 'Visual calibration found differences between the source render and golden JPG reference. These do not affect source confidence.'
      : 'Visual calibration found no major differences at the current rubric threshold.',
    renderDescriptor: stripMask(renderFeatures),
    referenceDescriptor: stripMask(referenceFeatures),
    differences,
  };
};

const stripMask = features => {
  const { edgeMask, ...rest } = features;
  return rest;
};

const buildHypotheses = experiments => experiments
  .map(experiment => ({
    experimentId: experiment.id,
    label: experiment.label,
    hypothesis: experiment.hypothesis,
    visual_fidelity_score: experiment.comparison.visual_fidelity_score,
    source_confidence_score: experiment.result.confidence.score,
    semanticGateStatus: experiment.comparison.semanticGate.status,
    semanticVisualFlags: experiment.comparison.semanticVisualFlags,
    priority: experiment.comparison.semanticGate.blocksGoldenReady
      ? 'semantic_human_review_required'
      : experiment.comparison.visual_fidelity_score >= 80 ? 'review_for_human_approval' : 'needs_more_preset_work',
    recommendedNextAction: experiment.comparison.semanticGate.blocksGoldenReady
      ? 'Do not promote this preset yet; resolve or explicitly approve the semantic visual flags first.'
      : experiment.comparison.visual_fidelity_score >= 80
        ? 'Human reviewer may inspect this preset candidate before any production preset change.'
        : 'Continue bounded camera/line/background preset experiments; do not alter IGES geometry.',
  }))
  .sort((a, b) => b.visual_fidelity_score - a.visual_fidelity_score);

const runVisualCalibrationForAsset = async ({
  assetId,
  outputDir,
  goldenReference,
}) => {
  assert(fs.existsSync(goldenReference.path), `Golden reference is missing: ${goldenReference.path}`);
  const actualReferenceHash = sha256File(goldenReference.path);
  assert(actualReferenceHash === goldenReference.sha256, `Golden reference checksum does not match approved binding for ${assetId}.`);

  const referenceImage = loadImage(goldenReference.path);
  const referenceFeatures = imageFeatures(referenceImage);
  const baseBinding = buildControlledFixtureBinding(assetId);
  assert(baseBinding.ok, baseBinding.reason || `Controlled fixture binding failed for ${assetId}.`);

  const experiments = [];
  for (const experiment of CALIBRATION_EXPERIMENTS) {
    const referenceSizedPreset = {
      ...(experiment.preset || {}),
      width: referenceImage.width,
      height: referenceImage.height,
    };
    const sourceBinding = {
      ...baseBinding,
      renderPreset: mergePreset(baseBinding.renderPreset, referenceSizedPreset),
    };
    const result = await runIgesSourcePipeline({
      sourceBinding,
      outputDir: path.join(outputDir, assetId, experiment.id),
      includeStl: false,
    });
    const renderImage = loadImage(result.render.outputPath);
    const renderFeatures = imageFeatures(renderImage);
    const comparison = compareFeatureSets(renderFeatures, referenceFeatures, { assetId, experiment });
    experiments.push({
      id: experiment.id,
      label: experiment.label,
      hypothesis: experiment.hypothesis,
      preset: sourceBinding.renderPreset,
      renderArtifact: result.render,
      source_confidence_score: result.confidence.score,
      sourceConfidence: {
        score: result.confidence.score,
        rubricId: result.confidence.rubricId,
        sourceSha256: result.confidence.sourceSha256,
        sceneManifestHash: result.confidence.sceneManifestHash,
        referenceImagesUsedForScore: result.confidence.referenceImagesUsedForScore,
      },
      comparison,
      result,
    });
  }

  const rankedHypotheses = buildHypotheses(experiments);
  const best = rankedHypotheses[0];
  return {
    assetId,
    goldenReference: {
      id: goldenReference.id,
      path: goldenReference.path,
      sha256: actualReferenceHash,
      role: goldenReference.role,
      expectedDisplaySemantics: goldenReference.expectedDisplaySemantics,
      excludedFrom: goldenReference.excludedFrom,
      descriptor: stripMask(referenceFeatures),
    },
    experiments: experiments.map(experiment => ({
      id: experiment.id,
      label: experiment.label,
      hypothesis: experiment.hypothesis,
      preset: experiment.preset,
      renderArtifact: experiment.renderArtifact,
      source_confidence_score: experiment.source_confidence_score,
      sourceConfidence: experiment.sourceConfidence,
      visual_fidelity_score: experiment.comparison.visual_fidelity_score,
      visualCalibration: experiment.comparison,
    })),
    rankedHypotheses,
    recommendation: {
      bestExperimentId: best?.experimentId || null,
      bestVisualFidelityScore: best?.visual_fidelity_score ?? null,
      bestSemanticGateStatus: best?.semanticGateStatus || null,
      productionPresetChangeApproved: false,
      goldenReady: false,
      nextHumanGate: 'Human approval is required before changing a production preset or calling any output golden-ready.',
    },
  };
};

const runVisualCalibrationLoop = async ({
  outputDir = path.join(defaultOutputDir, 'visual-calibration'),
  assetIds = Object.keys(APPROVED_GOLDEN_REFERENCES),
} = {}) => {
  const assetReports = [];
  for (const assetId of assetIds) {
    const goldenReference = APPROVED_GOLDEN_REFERENCES[assetId];
    assert(goldenReference, `No approved golden reference configured for ${assetId}.`);
    assetReports.push(await runVisualCalibrationForAsset({ assetId, outputDir, goldenReference }));
  }

  const allHypotheses = assetReports.flatMap(report => report.rankedHypotheses.map(item => ({
    ...item,
    assetId: report.assetId,
  }))).sort((a, b) => b.visual_fidelity_score - a.visual_fidelity_score);
  const best = allHypotheses[0];

  return {
    schemaVersion: 1,
    packetType: 'iges_post_render_visual_calibration',
    rubricId: VISUAL_CALIBRATION_RUBRIC_ID,
    status: 'human_approval_required',
    generatedAt: new Date().toISOString(),
    strictSeparation: {
      sourceConfidenceRule: 'IGES-only source confidence remains source/geometry/render health only.',
      visualCalibrationRule: 'Golden JPG is used only by this downstream visual QA/calibration loop.',
      sourceConfidenceUsesReferenceImage: false,
      geometryModifiedByCalibration: false,
      visualScorePromotedToSourceConfidence: false,
    },
    assetReports,
    experiments: assetReports.flatMap(report => report.experiments.map(experiment => ({
      ...experiment,
      assetId: report.assetId,
    }))),
    rankedHypotheses: allHypotheses,
    recommendation: {
      bestAssetId: best?.assetId || null,
      bestExperimentId: best?.experimentId || null,
      bestVisualFidelityScore: best?.visual_fidelity_score ?? null,
      bestSemanticGateStatus: best?.semanticGateStatus || null,
      productionPresetChangeApproved: false,
      goldenReady: false,
      nextHumanGate: 'Human approval is required before changing a production preset or calling any output golden-ready.',
    },
  };
};

const mergePreset = (base, override) => ({
  ...base,
  ...override,
  projection: {
    ...(base.projection || {}),
    ...(override.projection || {}),
  },
});

const maskIou = (a, b) => {
  let intersection = 0;
  let union = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    if (a[i] && b[i]) intersection += 1;
    if (a[i] || b[i]) union += 1;
  }
  return union > 0 ? round(intersection / union, 6) : 0;
};

const bboxDistance = (a, b) => {
  if (!a || !b) return 1;
  return Math.min(1, (
    Math.abs(a.x - b.x) +
    Math.abs(a.y - b.y) +
    Math.abs(a.width - b.width) +
    Math.abs(a.height - b.height)
  ) / 4);
};

const pointDistance = (a, b) => {
  if (!a || !b) return 1;
  return Math.min(1, Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2));
};

const clampScore = value => Math.max(0, Math.min(100, Math.round(value)));
const round = (value, digits = 6) => Number(Number(value).toFixed(digits));
const mean = values => {
  let sum = 0;
  for (const value of values) sum += value;
  return values.length ? sum / values.length : 0;
};
const stdDev = values => {
  const avg = mean(values);
  let sum = 0;
  for (const value of values) sum += (value - avg) ** 2;
  return values.length ? Math.sqrt(sum / values.length) : 0;
};

module.exports = {
  APPROVED_GOLDEN_REFERENCES,
  VISUAL_CALIBRATION_RUBRIC_ID,
  CALIBRATION_EXPERIMENTS,
  runVisualCalibrationLoop,
  writeJson,
};
