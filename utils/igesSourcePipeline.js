const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const repoRoot = path.resolve(__dirname, '..');
const defaultOutputDir = path.join(repoRoot, '.local', 'iges-source-pipeline');

const OCCT_PARAMS = Object.freeze({
  linearUnit: 'millimeter',
  linearDeflectionType: 'bounding_box_ratio',
  linearDeflection: 0.001,
  angularDeflection: 0.5,
});

const DEFAULT_RENDER_PRESET = Object.freeze({
  id: 'source-iges-isometric-v1',
  width: 1024,
  height: 768,
  camera: 'isometric-front-top',
  lighting: 'matte-source-wire',
  background: [247, 250, 252, 255],
  foreground: [15, 23, 42, 255],
  accent: [0, 143, 143, 255],
  margin: 60,
});

const APPROVED_FIXTURE_PACKAGE = Object.freeze({
  id: 'solidworks-assem-1-bracket-isolator',
  units: 'millimeter',
  assembly: {
    id: 'assem-1',
    path: '/Users/vambahsillah/Downloads/Assem-1.IGS',
    sha256: '28a15d323c764878e7b41398bf51a46efb1ec98108c00f42e41072681e2fcf68',
    expectedSubfigures: ['isolator-1', 'bracket-1'],
  },
  parts: [
    {
      id: 'bracket-1',
      path: '/Users/vambahsillah/Downloads/bracket-1.IGS',
      sha256: '8f3e4ee04f897c133c0c81f5091b4bcff0216c40ee00102352ebb91f1a7dd5fb',
    },
    {
      id: 'isolator-1',
      path: '/Users/vambahsillah/Downloads/isolator-1.IGS',
      sha256: '66872bcfc8e20ebc1de6e6116ac37b8c3bc532873d6ffefdad32ac4c0df5b55e',
    },
  ],
});

let occtPromise;

const ensureDir = dir => fs.mkdirSync(dir, { recursive: true });

const writeJson = (filePath, value) => {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
};

const sha256Buffer = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const sha256File = filePath => sha256Buffer(fs.readFileSync(filePath));
const sha256Text = value => crypto.createHash('sha256').update(String(value)).digest('hex');

const round = (value, digits = 6) => Number(Number(value).toFixed(digits));
const isFiniteNumber = value => Number.isFinite(value);

const assertNonJpgSource = filePath => {
  const extension = path.extname(filePath || '').toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(extension)) {
    throw new Error(`Invalid source binding: ${filePath} is an image. IGES source geometry is required.`);
  }
};

const getOcct = () => {
  if (!occtPromise) occtPromise = require('occt-import-js')();
  return occtPromise;
};

const detectIgesUnits = content => {
  const globalSection = content
    .split(/\r?\n/)
    .filter(line => line.charAt(72) === 'G' || /G\s*\d+\s*$/.test(line))
    .map(line => line.slice(0, 72))
    .join('');

  if (/,2HMM,/.test(globalSection) || /2HMM/.test(globalSection)) return 'millimeter';
  if (/,2HIN,/.test(globalSection) || /2HIN/.test(globalSection)) return 'inch';
  if (/,1HM,/.test(globalSection) || /1HM/.test(globalSection)) return 'meter';
  return 'unknown';
};

const extractIgesSubfigureNames = content => {
  const names = new Set();
  const regex = /\d+H([^,;]+?)(?=,)/g;
  for (const match of content.matchAll(regex)) {
    const name = String(match[1] || '').trim();
    if (/^(assem|bracket|isolator)-?\d*$/i.test(name)) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
};

const buildControlledFixtureBinding = () => {
  const sourcePath = APPROVED_FIXTURE_PACKAGE.assembly.path;
  assertNonJpgSource(sourcePath);
  if (!fs.existsSync(sourcePath)) {
    return {
      ok: false,
      status: 'blocked_no_source',
      reason: `Controlled fixture source is missing: ${sourcePath}`,
    };
  }

  const actualHash = sha256File(sourcePath);
  if (actualHash !== APPROVED_FIXTURE_PACKAGE.assembly.sha256) {
    return {
      ok: false,
      status: 'invalid_binding',
      reason: 'Controlled fixture checksum does not match the approved Assem-1.IGS binding.',
      expectedSha256: APPROVED_FIXTURE_PACKAGE.assembly.sha256,
      actualSha256: actualHash,
    };
  }

  return {
    ok: true,
    resolverType: 'controlled_fixture',
    sourceRecordId: null,
    sourceAsset: {
      id: APPROVED_FIXTURE_PACKAGE.assembly.id,
      path: sourcePath,
      fileName: path.basename(sourcePath),
      fileType: 'model/iges',
      sha256: actualHash,
      approvedSha256: APPROVED_FIXTURE_PACKAGE.assembly.sha256,
      expectedUnits: APPROVED_FIXTURE_PACKAGE.units,
      expectedSubfigures: [...APPROVED_FIXTURE_PACKAGE.assembly.expectedSubfigures],
    },
    renderPreset: { ...DEFAULT_RENDER_PRESET },
    stlExportPreset: {
      id: 'source-iges-binary-stl-v1',
      format: 'binary',
      mimeType: 'model/stl',
      scalingPolicy: 'no_rescale_source_units_recorded_as_millimeters',
    },
  };
};

const buildDatabaseSourceRecord = () => ({
  id: 'db-source-assem-1-approved',
  status: 'approved',
  sourceType: 'iges',
  sourceAssetId: APPROVED_FIXTURE_PACKAGE.assembly.id,
  sourcePath: APPROVED_FIXTURE_PACKAGE.assembly.path,
  approvedSha256: APPROVED_FIXTURE_PACKAGE.assembly.sha256,
  expectedUnits: APPROVED_FIXTURE_PACKAGE.units,
  expectedSubfigures: [...APPROVED_FIXTURE_PACKAGE.assembly.expectedSubfigures],
  renderPresetId: DEFAULT_RENDER_PRESET.id,
  stlExportPresetId: 'source-iges-binary-stl-v1',
});

const buildDatabaseSourceBinding = record => {
  if (!record) {
    return {
      ok: false,
      status: 'blocked_no_source',
      reason: 'No database source record was supplied.',
    };
  }

  if (record.status !== 'approved') {
    return {
      ok: false,
      status: 'invalid_binding',
      reason: `Source record ${record.id || '(unknown)'} is not approved.`,
      sourceRecordId: record.id || null,
    };
  }

  if (!record.sourcePath) {
    return {
      ok: false,
      status: 'blocked_no_source',
      reason: `Source record ${record.id || '(unknown)'} has no sourcePath binding.`,
      sourceRecordId: record.id || null,
    };
  }

  try {
    assertNonJpgSource(record.sourcePath);
  } catch (error) {
    return {
      ok: false,
      status: 'invalid_binding',
      reason: error.message,
      sourceRecordId: record.id || null,
      sourcePath: record.sourcePath,
    };
  }

  if (!/\.(igs|iges)$/i.test(record.sourcePath)) {
    return {
      ok: false,
      status: 'invalid_binding',
      reason: `Source record ${record.id || '(unknown)'} points to an unsupported file type.`,
      sourceRecordId: record.id || null,
      sourcePath: record.sourcePath,
    };
  }

  if (!fs.existsSync(record.sourcePath)) {
    return {
      ok: false,
      status: 'blocked_no_source',
      reason: `Source record ${record.id || '(unknown)'} points to a missing file.`,
      sourceRecordId: record.id || null,
      sourcePath: record.sourcePath,
    };
  }

  if (!record.renderPresetId || record.renderPresetId !== DEFAULT_RENDER_PRESET.id) {
    return {
      ok: false,
      status: 'invalid_binding',
      reason: `Source record ${record.id || '(unknown)'} lacks the approved render preset.`,
      sourceRecordId: record.id || null,
      renderPresetId: record.renderPresetId || null,
    };
  }

  const actualHash = sha256File(record.sourcePath);
  if (actualHash !== record.approvedSha256) {
    return {
      ok: false,
      status: 'invalid_binding',
      reason: `Source record ${record.id || '(unknown)'} checksum does not match its approved binding.`,
      sourceRecordId: record.id || null,
      expectedSha256: record.approvedSha256,
      actualSha256: actualHash,
    };
  }

  return {
    ok: true,
    resolverType: 'database_source_record',
    sourceRecordId: record.id,
    sourceAsset: {
      id: record.sourceAssetId || path.basename(record.sourcePath, path.extname(record.sourcePath)),
      path: record.sourcePath,
      fileName: path.basename(record.sourcePath),
      fileType: 'model/iges',
      sha256: actualHash,
      approvedSha256: record.approvedSha256,
      expectedUnits: record.expectedUnits || 'millimeter',
      expectedSubfigures: [...(record.expectedSubfigures || [])],
    },
    renderPreset: { ...DEFAULT_RENDER_PRESET },
    stlExportPreset: {
      id: record.stlExportPresetId || 'source-iges-binary-stl-v1',
      format: 'binary',
      mimeType: 'model/stl',
      scalingPolicy: 'no_rescale_source_units_recorded_as_millimeters',
    },
  };
};

const flattenNodes = (node, nodes = [], parentPath = '') => {
  const nodePath = parentPath ? `${parentPath}/${node.name || 'unnamed'}` : (node.name || 'root');
  nodes.push({
    name: node.name || '',
    path: nodePath,
    meshes: [...(node.meshes || [])],
    childCount: (node.children || []).length,
  });
  for (const child of node.children || []) flattenNodes(child, nodes, nodePath);
  return nodes;
};

const collectMeshStats = meshes => {
  const stats = [];
  let totalTriangles = 0;
  let totalVertices = 0;
  let finite = true;
  let degenerateTriangles = 0;
  const bounds = emptyBounds();

  for (const [index, mesh] of meshes.entries()) {
    const positions = Array.from(mesh.attributes?.position?.array || []);
    const indices = Array.from(mesh.index?.array || []);
    const triangleCount = indices.length > 0 ? Math.floor(indices.length / 3) : Math.floor(positions.length / 9);
    const vertexCount = Math.floor(positions.length / 3);
    const meshBounds = emptyBounds();
    let meshFinite = true;

    for (let i = 0; i < positions.length; i += 3) {
      const point = [positions[i], positions[i + 1], positions[i + 2]];
      if (!point.every(isFiniteNumber)) {
        finite = false;
        meshFinite = false;
        continue;
      }
      includePoint(bounds, point);
      includePoint(meshBounds, point);
    }

    const triangles = triangleIterator(mesh);
    for (const triangle of triangles) {
      if (triangleArea(triangle) <= 1e-9) degenerateTriangles += 1;
    }

    totalTriangles += triangleCount;
    totalVertices += vertexCount;
    stats.push({
      meshIndex: index,
      name: mesh.name || '',
      vertexCount,
      triangleCount,
      finiteCoordinates: meshFinite,
      boundingBox: finalizeBounds(meshBounds),
      brepFaceCount: Array.isArray(mesh.brep_faces) ? mesh.brep_faces.length : 0,
    });
  }

  return {
    meshStats: stats,
    totalTriangles,
    totalVertices,
    finiteCoordinates: finite,
    degenerateTriangles,
    boundingBox: finalizeBounds(bounds),
  };
};

const emptyBounds = () => ({
  min: [Infinity, Infinity, Infinity],
  max: [-Infinity, -Infinity, -Infinity],
});

const includePoint = (bounds, point) => {
  for (let i = 0; i < 3; i += 1) {
    bounds.min[i] = Math.min(bounds.min[i], point[i]);
    bounds.max[i] = Math.max(bounds.max[i], point[i]);
  }
};

const finalizeBounds = bounds => {
  const valid = bounds.min.every(Number.isFinite) && bounds.max.every(Number.isFinite);
  if (!valid) return null;
  return {
    min: bounds.min.map(value => round(value)),
    max: bounds.max.map(value => round(value)),
    size: bounds.max.map((value, index) => round(value - bounds.min[index])),
    center: bounds.max.map((value, index) => round((value + bounds.min[index]) / 2)),
  };
};

const triangleIterator = function* (mesh) {
  const positions = Array.from(mesh.attributes?.position?.array || []);
  const indices = Array.from(mesh.index?.array || []);
  if (indices.length > 0) {
    for (let i = 0; i + 2 < indices.length; i += 3) {
      yield [indices[i], indices[i + 1], indices[i + 2]].map(vertexIndex => [
        positions[vertexIndex * 3],
        positions[vertexIndex * 3 + 1],
        positions[vertexIndex * 3 + 2],
      ]);
    }
    return;
  }
  for (let i = 0; i + 8 < positions.length; i += 9) {
    yield [
      [positions[i], positions[i + 1], positions[i + 2]],
      [positions[i + 3], positions[i + 4], positions[i + 5]],
      [positions[i + 6], positions[i + 7], positions[i + 8]],
    ];
  }
};

const triangleArea = triangle => {
  const [a, b, c] = triangle;
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cross = crossProduct(ab, ac);
  return Math.sqrt(dotProduct(cross, cross)) / 2;
};

const crossProduct = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const dotProduct = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const normalizeVector = vector => {
  const length = Math.sqrt(dotProduct(vector, vector));
  if (!Number.isFinite(length) || length <= 0) return [0, 0, 0];
  return vector.map(value => value / length);
};

const inspectIgesSource = sourceBinding => {
  const content = fs.readFileSync(sourceBinding.sourceAsset.path, 'utf8');
  return {
    detectedUnits: detectIgesUnits(content),
    subfigureNames: extractIgesSubfigureNames(content),
    lineCount: content.split(/\r?\n/).length,
    usesJpgReference: false,
  };
};

const ingestIgesScene = async sourceBinding => {
  const fileBuffer = fs.readFileSync(sourceBinding.sourceAsset.path);
  const sourceInspection = inspectIgesSource(sourceBinding);
  const occt = await getOcct();
  const importResult = occt.ReadIgesFile(fileBuffer, OCCT_PARAMS);

  if (!importResult.success) {
    throw new Error(`OCCT IGES import failed: ${importResult.error || 'unknown error'}`);
  }

  const meshes = importResult.meshes || [];
  const nodes = flattenNodes(importResult.root || { name: '', meshes: [], children: [] });
  const meshStats = collectMeshStats(meshes);
  const assemblySubfigures = nodes
    .map(node => node.name)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const sceneManifest = {
    schemaVersion: 'iges-scene-manifest-v1',
    sourceAssetId: sourceBinding.sourceAsset.id,
    sourceSha256: sourceBinding.sourceAsset.sha256,
    sourceFileName: sourceBinding.sourceAsset.fileName,
    sourceUnits: sourceInspection.detectedUnits,
    expectedUnits: sourceBinding.sourceAsset.expectedUnits,
    occtParams: { ...OCCT_PARAMS },
    rootName: importResult.root?.name || '',
    assemblySubfigures,
    sourceSubfigureNames: sourceInspection.subfigureNames,
    nodes,
    meshStats: meshStats.meshStats,
    totalMeshCount: meshes.length,
    totalVertices: meshStats.totalVertices,
    totalTriangles: meshStats.totalTriangles,
    boundingBox: meshStats.boundingBox,
    finiteCoordinates: meshStats.finiteCoordinates,
    degenerateTriangles: meshStats.degenerateTriangles,
    usesJpgReference: false,
  };

  return {
    sourceInspection,
    importResult,
    sceneManifest,
    sceneManifestHash: sha256Text(stableStringify(sceneManifest)),
    meshIntegrity: buildMeshIntegrityReport(meshes, meshStats),
  };
};

const buildMeshIntegrityReport = (meshes, meshStats) => {
  const edgeReport = buildEdgeReport(meshes);
  return {
    nonEmptyMesh: meshStats.totalTriangles > 0 && meshStats.totalVertices > 0,
    finiteCoordinates: meshStats.finiteCoordinates,
    triangleCount: meshStats.totalTriangles,
    vertexCount: meshStats.totalVertices,
    triangleCountBounds: {
      min: 1,
      max: 200000,
      withinBounds: meshStats.totalTriangles >= 1 && meshStats.totalTriangles <= 200000,
    },
    boundingBox: meshStats.boundingBox,
    connectedComponentCount: meshes.length,
    degenerateTriangles: meshStats.degenerateTriangles,
    manifoldReport: edgeReport,
  };
};

const vertexKey = point => point.map(value => round(value, 5)).join(',');
const edgeKey = (a, b) => [a, b].sort().join('|');

const buildEdgeReport = meshes => {
  const meshReports = [];
  let totalBoundaryEdges = 0;
  let totalNonManifoldEdges = 0;

  for (const [meshIndex, mesh] of meshes.entries()) {
    const edgeCounts = new Map();
    for (const triangle of triangleIterator(mesh)) {
      const keys = triangle.map(vertexKey);
      for (const [a, b] of [[keys[0], keys[1]], [keys[1], keys[2]], [keys[2], keys[0]]]) {
        const key = edgeKey(a, b);
        edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
      }
    }

    let boundaryEdges = 0;
    let nonManifoldEdges = 0;
    for (const count of edgeCounts.values()) {
      if (count === 1) boundaryEdges += 1;
      if (count > 2) nonManifoldEdges += 1;
    }
    totalBoundaryEdges += boundaryEdges;
    totalNonManifoldEdges += nonManifoldEdges;
    meshReports.push({
      meshIndex,
      boundaryEdges,
      nonManifoldEdges,
      watertight: boundaryEdges === 0 && nonManifoldEdges === 0,
    });
  }

  return {
    applicable: true,
    meshReports,
    boundaryEdges: totalBoundaryEdges,
    nonManifoldEdges: totalNonManifoldEdges,
    watertight: totalBoundaryEdges === 0 && totalNonManifoldEdges === 0,
  };
};

const projectPoint = point => {
  const [x, y, z] = point;
  return [
    x - y * 0.55,
    -z + (x + y) * 0.28,
  ];
};

const renderSceneToPng = ({ scene, sourceBinding, outputDir }) => {
  const preset = sourceBinding.renderPreset;
  const width = preset.width;
  const height = preset.height;
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = preset.background[0];
    pixels[i + 1] = preset.background[1];
    pixels[i + 2] = preset.background[2];
    pixels[i + 3] = preset.background[3];
  }

  const projected = [];
  for (const mesh of scene.importResult.meshes || []) {
    const positions = Array.from(mesh.attributes?.position?.array || []);
    for (let i = 0; i < positions.length; i += 3) {
      projected.push(projectPoint([positions[i], positions[i + 1], positions[i + 2]]));
    }
  }

  const bounds2d = projected.reduce((bounds, point) => {
    bounds.min[0] = Math.min(bounds.min[0], point[0]);
    bounds.min[1] = Math.min(bounds.min[1], point[1]);
    bounds.max[0] = Math.max(bounds.max[0], point[0]);
    bounds.max[1] = Math.max(bounds.max[1], point[1]);
    return bounds;
  }, { min: [Infinity, Infinity], max: [-Infinity, -Infinity] });

  const spanX = Math.max(bounds2d.max[0] - bounds2d.min[0], 1e-6);
  const spanY = Math.max(bounds2d.max[1] - bounds2d.min[1], 1e-6);
  const scale = Math.min((width - preset.margin * 2) / spanX, (height - preset.margin * 2) / spanY);
  const offsetX = (width - spanX * scale) / 2 - bounds2d.min[0] * scale;
  const offsetY = (height - spanY * scale) / 2 - bounds2d.min[1] * scale;
  const toScreen = point => {
    const projectedPoint = projectPoint(point);
    return [
      Math.round(projectedPoint[0] * scale + offsetX),
      Math.round(projectedPoint[1] * scale + offsetY),
    ];
  };

  const triangles = [];
  for (const mesh of scene.importResult.meshes || []) {
    for (const triangle of triangleIterator(mesh)) {
      const centerDepth = triangle.reduce((sum, point) => sum + point[0] + point[1] + point[2], 0) / 3;
      triangles.push({ triangle, centerDepth });
    }
  }
  triangles.sort((a, b) => a.centerDepth - b.centerDepth);

  for (const { triangle } of triangles) {
    const points = triangle.map(toScreen);
    drawLine(pixels, width, height, points[0], points[1], preset.foreground);
    drawLine(pixels, width, height, points[1], points[2], preset.foreground);
    drawLine(pixels, width, height, points[2], points[0], preset.accent);
  }

  const nonBackground = countNonBackgroundPixels(pixels, preset.background);
  const pngBuffer = encodePng(width, height, pixels);
  const outputPath = path.join(outputDir, `${sourceBinding.sourceAsset.id}-${sourceBinding.resolverType}-${preset.id}.png`);
  ensureDir(path.dirname(outputPath));
  fs.writeFileSync(outputPath, pngBuffer);

  return {
    outputPath,
    mimeType: 'image/png',
    width,
    height,
    sha256: sha256Buffer(pngBuffer),
    renderPresetId: preset.id,
    rendererVersion: 'iges-source-png-wire-renderer-v1',
    deterministic: true,
    outputCompleteness: {
      nonBackgroundPixels: nonBackground,
      nonBackgroundRatio: round(nonBackground / (width * height), 6),
      nonEmpty: nonBackground > 0,
    },
    usesJpgReference: false,
  };
};

const drawLine = (pixels, width, height, a, b, color) => {
  let [x0, y0] = a;
  const [x1, y1] = b;
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;

  for (;;) {
    drawPoint(pixels, width, height, x0, y0, color);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
};

const drawPoint = (pixels, width, height, x, y, color) => {
  for (let yy = y - 1; yy <= y + 1; yy += 1) {
    for (let xx = x - 1; xx <= x + 1; xx += 1) {
      if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
      const index = (yy * width + xx) * 4;
      pixels[index] = color[0];
      pixels[index + 1] = color[1];
      pixels[index + 2] = color[2];
      pixels[index + 3] = color[3];
    }
  }
};

const countNonBackgroundPixels = (pixels, background) => {
  let count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (
      pixels[i] !== background[0] ||
      pixels[i + 1] !== background[1] ||
      pixels[i + 2] !== background[2] ||
      pixels[i + 3] !== background[3]
    ) count += 1;
  }
  return count;
};

const encodePng = (width, height, rgba) => {
  const scanlineLength = width * 4 + 1;
  const raw = Buffer.alloc(scanlineLength * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * scanlineLength] = 0;
    rgba.copy(raw, y * scanlineLength + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', Buffer.concat([
      uint32be(width),
      uint32be(height),
      Buffer.from([8, 6, 0, 0, 0]),
    ])),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
};

const uint32be = value => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
};

const pngChunk = (type, data) => {
  const typeBuffer = Buffer.from(type);
  return Buffer.concat([
    uint32be(data.length),
    typeBuffer,
    data,
    uint32be(crc32(Buffer.concat([typeBuffer, data]))),
  ]);
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = buffer => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const exportSceneToBinaryStl = ({ scene, sourceBinding, outputDir }) => {
  const triangles = [];
  for (const mesh of scene.importResult.meshes || []) {
    for (const triangle of triangleIterator(mesh)) triangles.push(triangle);
  }

  const header = Buffer.alloc(80, ' ');
  header.write('ReversR source IGES STL export; units=millimeter; no silent repair/rescale', 0, 'ascii');
  const count = Buffer.alloc(4);
  count.writeUInt32LE(triangles.length, 0);
  const records = [];
  for (const triangle of triangles) {
    const normal = normalizeVector(crossProduct(
      [triangle[1][0] - triangle[0][0], triangle[1][1] - triangle[0][1], triangle[1][2] - triangle[0][2]],
      [triangle[2][0] - triangle[0][0], triangle[2][1] - triangle[0][1], triangle[2][2] - triangle[0][2]],
    ));
    const record = Buffer.alloc(50);
    [...normal, ...triangle[0], ...triangle[1], ...triangle[2]].forEach((value, index) => {
      record.writeFloatLE(Number.isFinite(value) ? value : 0, index * 4);
    });
    record.writeUInt16LE(0, 48);
    records.push(record);
  }

  const stlBuffer = Buffer.concat([header, count, ...records]);
  const outputPath = path.join(outputDir, `${sourceBinding.sourceAsset.id}-${sourceBinding.resolverType}-${sourceBinding.stlExportPreset.id}.stl`);
  ensureDir(path.dirname(outputPath));
  fs.writeFileSync(outputPath, stlBuffer);

  const metadata = {
    outputPath,
    mimeType: sourceBinding.stlExportPreset.mimeType,
    fileType: 'binary_stl',
    stlFormat: 'binary',
    sha256: sha256Buffer(stlBuffer),
    sourceSha256: sourceBinding.sourceAsset.sha256,
    units: scene.sceneManifest.sourceUnits,
    scalingPolicy: sourceBinding.stlExportPreset.scalingPolicy,
    exportPresetId: sourceBinding.stlExportPreset.id,
    triangleCount: triangles.length,
    expectedByteLength: 84 + triangles.length * 50,
    actualByteLength: stlBuffer.length,
    noSilentRepair: true,
    noSilentRescale: true,
    boundingBox: scene.meshIntegrity.boundingBox,
    connectedComponentCount: scene.meshIntegrity.connectedComponentCount,
    manifoldReport: scene.meshIntegrity.manifoldReport,
    integrity: {
      nonEmptyMesh: triangles.length > 0,
      finiteCoordinates: scene.meshIntegrity.finiteCoordinates,
      triangleCountBounds: scene.meshIntegrity.triangleCountBounds,
      degenerateTriangles: scene.meshIntegrity.degenerateTriangles,
      byteLengthMatchesTriangleCount: stlBuffer.length === 84 + triangles.length * 50,
    },
    usesJpgReference: false,
  };

  return metadata;
};

const scoreComponent = (id, maxScore, passed, warnings = [], failures = []) => {
  let score = passed ? maxScore : 0;
  if (passed && warnings.length > 0) score = Math.max(0, maxScore - warnings.length * 2);
  return {
    id,
    maxScore,
    score,
    status: failures.length > 0 ? 'fail' : warnings.length > 0 ? 'warn' : 'pass',
    warnings,
    failures,
  };
};

const computeSourceOnlyConfidence = ({ sourceBinding, scene, render, stl }) => {
  const expectedSubfigures = sourceBinding.sourceAsset.expectedSubfigures || [];
  const actualSubfigures = scene.sceneManifest.assemblySubfigures || [];
  const missingSubfigures = expectedSubfigures.filter(name => !actualSubfigures.includes(name));
  const components = [
    scoreComponent(
      'source_binding_checksum',
      18,
      sourceBinding.ok && sourceBinding.sourceAsset.sha256 === sourceBinding.sourceAsset.approvedSha256,
      [],
      sourceBinding.ok ? [] : ['source binding failed'],
    ),
    scoreComponent(
      'parse_and_assembly_resolution',
      18,
      scene.sceneManifest.totalMeshCount > 0 && missingSubfigures.length === 0,
      missingSubfigures.length > 0 ? [`missing expected subfigures: ${missingSubfigures.join(', ')}`] : [],
      scene.sceneManifest.totalMeshCount > 0 ? [] : ['IGES parse produced no meshes'],
    ),
    scoreComponent(
      'units_transforms_scene_validity',
      16,
      scene.sceneManifest.sourceUnits === sourceBinding.sourceAsset.expectedUnits && Boolean(scene.sceneManifest.boundingBox),
      [],
      scene.sceneManifest.sourceUnits === sourceBinding.sourceAsset.expectedUnits ? [] : [`expected ${sourceBinding.sourceAsset.expectedUnits}, found ${scene.sceneManifest.sourceUnits}`],
    ),
    scoreComponent(
      'geometry_mesh_integrity',
      18,
      scene.meshIntegrity.nonEmptyMesh && scene.meshIntegrity.finiteCoordinates && scene.meshIntegrity.triangleCountBounds.withinBounds,
      scene.meshIntegrity.manifoldReport.watertight ? [] : ['mesh is not fully watertight; report retained for reviewer'],
      [
        ...(!scene.meshIntegrity.nonEmptyMesh ? ['empty mesh'] : []),
        ...(!scene.meshIntegrity.finiteCoordinates ? ['non-finite coordinates'] : []),
        ...(!scene.meshIntegrity.triangleCountBounds.withinBounds ? ['triangle count outside bounds'] : []),
      ],
    ),
    scoreComponent(
      'renderer_determinism_output',
      18,
      render.deterministic && render.outputCompleteness.nonEmpty && render.width === sourceBinding.renderPreset.width && render.height === sourceBinding.renderPreset.height,
      [],
      render.outputCompleteness.nonEmpty ? [] : ['render output is empty'],
    ),
  ];

  if (stl) {
    components.push(scoreComponent(
      'stl_conversion_integrity',
      12,
      stl.integrity.nonEmptyMesh &&
        stl.integrity.finiteCoordinates &&
        stl.integrity.triangleCountBounds.withinBounds &&
        stl.integrity.byteLengthMatchesTriangleCount &&
        stl.noSilentRepair &&
        stl.noSilentRescale,
      stl.manifoldReport.watertight ? [] : ['STL mesh is not fully watertight; report retained for reviewer'],
      [
        ...(!stl.integrity.nonEmptyMesh ? ['STL mesh is empty'] : []),
        ...(!stl.integrity.finiteCoordinates ? ['STL has non-finite coordinates'] : []),
        ...(!stl.integrity.byteLengthMatchesTriangleCount ? ['STL byte length does not match triangle count'] : []),
      ],
    ));
  }

  const totalScore = components.reduce((sum, component) => sum + component.score, 0);
  const maxScore = components.reduce((sum, component) => sum + component.maxScore, 0);
  const score = Math.round((totalScore / maxScore) * 100);
  const flags = components.flatMap(component => [
    ...component.warnings.map(message => ({ severity: 'warning', component: component.id, message })),
    ...component.failures.map(message => ({ severity: 'failure', component: component.id, message })),
  ]);

  return {
    rubricId: 'iges-source-confidence-v1',
    status: flags.some(flag => flag.severity === 'failure') ? 'fail' : flags.length > 0 ? 'warn' : 'pass',
    score,
    maxScore: 100,
    componentScores: components,
    thresholds: {
      pass: 90,
      warn: 70,
      failBelow: 70,
    },
    sourceAssetId: sourceBinding.sourceAsset.id,
    sourceSha256: sourceBinding.sourceAsset.sha256,
    sceneManifestHash: scene.sceneManifestHash,
    renderPresetId: sourceBinding.renderPreset.id,
    rendererVersion: render.rendererVersion,
    reasons: flags,
    referenceImagesUsedForScore: false,
    note: 'Source-only QA confidence. This is not engineering certification, CAD qualification, dimensional inspection, or manufacturing approval.',
  };
};

const runIgesSourcePipeline = async ({ sourceBinding, outputDir = defaultOutputDir, includeStl = true }) => {
  if (!sourceBinding.ok) return sourceBinding;
  ensureDir(outputDir);

  const scene = await ingestIgesScene(sourceBinding);
  const render = renderSceneToPng({ scene, sourceBinding, outputDir });
  const stl = includeStl ? exportSceneToBinaryStl({ scene, sourceBinding, outputDir }) : null;
  const confidence = computeSourceOnlyConfidence({ sourceBinding, scene, render, stl });

  return {
    ok: true,
    status: 'passed',
    resolverType: sourceBinding.resolverType,
    sourceRecordId: sourceBinding.sourceRecordId,
    sourceAsset: sourceBinding.sourceAsset,
    renderPreset: sourceBinding.renderPreset,
    stlExportPreset: sourceBinding.stlExportPreset,
    sceneManifest: scene.sceneManifest,
    sceneManifestHash: scene.sceneManifestHash,
    meshIntegrity: scene.meshIntegrity,
    render,
    stl,
    confidence,
    blockedStates: buildBlockedStateExamples(),
    generatedAt: new Date().toISOString(),
  };
};

const buildBlockedStateExamples = () => ({
  noSourceRecord: buildDatabaseSourceBinding(null),
  missingAsset: buildDatabaseSourceBinding({
    ...buildDatabaseSourceRecord(),
    id: 'db-source-missing-asset',
    sourcePath: '/tmp/reversr-missing-source.IGS',
  }),
  invalidHash: buildDatabaseSourceBinding({
    ...buildDatabaseSourceRecord(),
    id: 'db-source-invalid-hash',
    approvedSha256: '0'.repeat(64),
  }),
  unsupportedFileType: buildDatabaseSourceBinding({
    ...buildDatabaseSourceRecord(),
    id: 'db-source-invalid-type',
    sourcePath: '/Users/vambahsillah/Downloads/Assem-1.JPG',
  }),
  missingRenderPreset: buildDatabaseSourceBinding({
    ...buildDatabaseSourceRecord(),
    id: 'db-source-missing-render-preset',
    renderPresetId: '',
  }),
});

const stableStringify = value => JSON.stringify(sortKeys(value));
const sortKeys = value => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((object, key) => {
    object[key] = sortKeys(value[key]);
    return object;
  }, {});
};

const comparablePipelineResult = result => ({
  sourceAssetId: result.sourceAsset.id,
  sourceSha256: result.sourceAsset.sha256,
  renderPresetId: result.renderPreset.id,
  stlExportPresetId: result.stlExportPreset.id,
  sceneManifest: {
    ...result.sceneManifest,
  },
  sceneManifestHash: result.sceneManifestHash,
  meshIntegrity: result.meshIntegrity,
  render: {
    width: result.render.width,
    height: result.render.height,
    sha256: result.render.sha256,
    renderPresetId: result.render.renderPresetId,
    rendererVersion: result.render.rendererVersion,
    outputCompleteness: result.render.outputCompleteness,
  },
  stl: result.stl ? {
    fileType: result.stl.fileType,
    stlFormat: result.stl.stlFormat,
    sourceSha256: result.stl.sourceSha256,
    units: result.stl.units,
    scalingPolicy: result.stl.scalingPolicy,
    exportPresetId: result.stl.exportPresetId,
    triangleCount: result.stl.triangleCount,
    expectedByteLength: result.stl.expectedByteLength,
    actualByteLength: result.stl.actualByteLength,
    boundingBox: result.stl.boundingBox,
    connectedComponentCount: result.stl.connectedComponentCount,
    manifoldReport: result.stl.manifoldReport,
    integrity: result.stl.integrity,
  } : null,
  confidence: {
    rubricId: result.confidence.rubricId,
    status: result.confidence.status,
    score: result.confidence.score,
    componentScores: result.confidence.componentScores,
    thresholds: result.confidence.thresholds,
    sourceSha256: result.confidence.sourceSha256,
    sceneManifestHash: result.confidence.sceneManifestHash,
    renderPresetId: result.confidence.renderPresetId,
    rendererVersion: result.confidence.rendererVersion,
    reasons: result.confidence.reasons,
    referenceImagesUsedForScore: result.confidence.referenceImagesUsedForScore,
  },
});

const assertEquivalentResults = (fixtureResult, databaseResult) => {
  const fixtureComparable = comparablePipelineResult(fixtureResult);
  const databaseComparable = comparablePipelineResult(databaseResult);
  const fixtureJson = stableStringify(fixtureComparable);
  const databaseJson = stableStringify(databaseComparable);
  if (fixtureJson !== databaseJson) {
    throw new Error(`Fixture and database source-record pipeline results diverged.
Fixture hash: ${sha256Text(fixtureJson)}
Database hash: ${sha256Text(databaseJson)}`);
  }
  return {
    equivalent: true,
    comparableHash: sha256Text(fixtureJson),
  };
};

module.exports = {
  APPROVED_FIXTURE_PACKAGE,
  DEFAULT_RENDER_PRESET,
  defaultOutputDir,
  writeJson,
  buildControlledFixtureBinding,
  buildDatabaseSourceRecord,
  buildDatabaseSourceBinding,
  runIgesSourcePipeline,
  assertEquivalentResults,
  comparablePipelineResult,
};
