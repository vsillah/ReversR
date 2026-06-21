const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'into',
  'is', 'it', 'of', 'on', 'or', 'the', 'to', 'with', 'without', 'source', 'backed',
  'provider', 'hosted', 'catalog', 'professional', 'sample', 'metadata',
]);

const SYNONYM_GROUPS = [
  ['limit switch', 'endstop switch', 'end stop switch'],
  ['linear guide rail', 'linear rail', 'linear rails', 'guide rail', 'profile rail guide', 'rail guide'],
  ['flexible coupling', 'motor coupling', 'coupling'],
  ['bearing carriage', 'bearing block', 'bearing blocks'],
  ['timing belt', 'belt drive', 'belts', 'belt'],
  ['pulley set', 'pulleys', 'pulley'],
  ['gantry plate', 'aluminum plate', 'plate'],
  ['stepper motor', 'nema stepper motor', 'nema stepper motors', 'motion motor'],
  ['fastener kit', 'fasteners', 'stainless fasteners', 'mounting hardware'],
  ['ball screw actuator', 'linear actuator', 'actuator module', 'motion module', 'actuator rebuild assembly'],
  ['control board', 'controller', 'control module', 'motion controller'],
  ['power supply', 'power module'],
  ['frame', 'machine frame', 'aluminum frame', 'aluminum extrusion frame'],
  ['rail', 'rails', 'steel rail', 'steel rails'],
];

const normalizeName = (value = '') => String(value).trim().replace(/\s+/g, ' ');

const normalizeToken = (value = '') => normalizeName(value)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const stemToken = (token = '') => {
  if (token.length <= 3) return token;
  if (token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.endsWith('sses')) return token.slice(0, -2);
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
};

const tokenize = (value = '') => normalizeToken(value)
  .split(' ')
  .map(stemToken)
  .filter(token => token && !STOP_WORDS.has(token));

const buildNgrams = (tokens = [], max = 4) => {
  const ngrams = new Set();
  for (let size = 1; size <= max; size += 1) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      ngrams.add(tokens.slice(index, index + size).join(' '));
    }
  }
  return ngrams;
};

const synonymVariantToCanonical = new Map();
for (const group of SYNONYM_GROUPS) {
  const canonical = normalizeToken(group[0]);
  for (const variant of group) {
    synonymVariantToCanonical.set(normalizeToken(variant), canonical);
  }
}

const getSynonymCanonicalsForText = (value = '') => {
  const normalized = normalizeToken(value);
  const tokens = tokenize(value);
  const ngrams = buildNgrams(tokens, 5);
  const canonicals = new Set();

  for (const [variant, canonical] of synonymVariantToCanonical.entries()) {
    const variantTokens = tokenize(variant);
    const variantKey = variantTokens.join(' ');
    if (
      normalized.includes(variant)
      || ngrams.has(variant)
      || (variantKey && ngrams.has(variantKey))
    ) {
      canonicals.add(canonical);
    }
  }

  return canonicals;
};

const collectQueryText = (analysis = {}, scanInput = '') => [
  scanInput,
  analysis?.productName,
  analysis?.rawAnalysis,
  analysis?.closedWorldBoundary,
  ...(analysis?.components || []).flatMap(component => [component.name, component.description]),
  ...(analysis?.attributes || []).flatMap(attribute => [attribute.name, attribute.value]),
  ...(analysis?.neighborhoodResources || []),
].filter(Boolean).join(' ');

const collectRecordText = (record = {}) => [
  record.machineName,
  record.revision,
  ...(record.aliases || []),
  ...(record.parts || []),
  ...(record.materials || []),
  record.sourceProvider,
  record.sourceRecordId,
  record.manufacturer,
  record.manufacturerPartNumber,
  record.renderProvider,
  record.renderKind,
  record.renderProvenance,
  record.notes,
  ...(record.assemblySteps || []).flatMap(step => [
    step.title,
    step.instructions,
    step.qualityCheck,
    ...(step.parts || []),
  ]),
].filter(Boolean).join(' ');

const buildMatchDocument = (record = {}) => {
  const text = collectRecordText(record);
  const tokens = tokenize(text);
  return {
    text,
    normalizedText: normalizeToken(text),
    tokens: new Set(tokens),
    ngrams: buildNgrams(tokens, 5),
    synonymCanonicals: getSynonymCanonicalsForText(text),
  };
};

const buildQueryDocument = (analysis = {}, scanInput = '') => {
  const text = collectQueryText(analysis, scanInput);
  const tokens = tokenize(text);
  return {
    text,
    normalizedText: normalizeToken(text),
    tokens: new Set(tokens),
    ngrams: buildNgrams(tokens, 5),
    synonymCanonicals: getSynonymCanonicalsForText(text),
  };
};

const tokenOverlapRatio = (signalTokens, queryTokens) => {
  const uniqueSignalTokens = Array.from(new Set(signalTokens));
  if (uniqueSignalTokens.length === 0) return 0;
  const hits = uniqueSignalTokens.filter(token => queryTokens.has(token));
  return hits.length / uniqueSignalTokens.length;
};

const evaluateSignal = (label, queryDoc) => {
  const normalized = normalizeToken(label);
  const signalTokens = tokenize(label);
  const signalKey = signalTokens.join(' ');
  const signalCanonicals = getSynonymCanonicalsForText(label);
  const exact = Boolean(normalized && queryDoc.normalizedText.includes(normalized));
  const phrase = Boolean(signalKey && queryDoc.ngrams.has(signalKey));
  const overlapRatio = tokenOverlapRatio(signalTokens, queryDoc.tokens);
  const synonym = Array.from(signalCanonicals).some(canonical => queryDoc.synonymCanonicals.has(canonical));

  return {
    label: normalizeName(label),
    normalized,
    exact,
    phrase,
    synonym,
    tokenOverlap: Number(overlapRatio.toFixed(2)),
    matched: exact || phrase || synonym || overlapRatio >= 0.75,
    weight: exact || phrase
      ? 1
      : synonym
        ? 0.85
        : overlapRatio >= 0.75
          ? 0.7
          : 0,
  };
};

const scoreSignalList = (labels = [], queryDoc, maxSignals = 6) => {
  const evaluations = labels.map(label => evaluateSignal(label, queryDoc));
  const matched = evaluations.filter(item => item.matched);
  const weightedHits = matched.reduce((sum, item) => sum + item.weight, 0);
  const denominator = Math.max(Math.min(labels.length || 1, maxSignals), 1);

  return {
    evaluations,
    matched,
    coverage: Math.min(weightedHits / denominator, 1),
    labels: matched.map(item => item.label),
    exactHits: matched.filter(item => item.exact).map(item => item.label),
    phraseHits: matched.filter(item => item.phrase || item.tokenOverlap >= 0.75).map(item => item.label),
    synonymHits: matched.filter(item => item.synonym && !item.exact && !item.phrase).map(item => item.label),
    missing: evaluations.filter(item => !item.matched).map(item => item.label),
  };
};

const scoreDocumentOverlap = (queryDoc, recordDoc) => {
  const recordTokens = Array.from(recordDoc.tokens);
  const overlap = recordTokens.filter(token => queryDoc.tokens.has(token));
  const meaningfulOverlap = overlap.filter(token => !STOP_WORDS.has(token));
  return Math.min(meaningfulOverlap.length / 10, 1);
};

const scoreInventoryRecord = (analysis, record, scanInput = '') => {
  const queryDoc = buildQueryDocument(analysis, scanInput);
  const recordDoc = buildMatchDocument(record);
  const aliasSignals = scoreSignalList([record.machineName, ...(record.aliases || [])], queryDoc, 3);
  const partSignals = scoreSignalList(record.parts || [], queryDoc, 6);
  const materialSignals = scoreSignalList(record.materials || [], queryDoc, 4);
  const providerSignals = scoreSignalList([
    record.sourceProvider,
    record.renderProvider,
    record.manufacturerPartNumber,
    record.sourceRecordId,
  ].filter(Boolean), queryDoc, 2);
  const exactMachineName = evaluateSignal(record.machineName, queryDoc);
  const documentOverlap = scoreDocumentOverlap(queryDoc, recordDoc);

  const scoreBreakdown = {
    alias: aliasSignals.coverage * 0.35,
    parts: partSignals.coverage * 0.35,
    materials: materialSignals.coverage * 0.1,
    provider: providerSignals.coverage * 0.05,
    document: documentOverlap * 0.1,
    exact: exactMachineName.exact ? 0.05 : 0,
  };
  const rawScore = Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0);
  const score = Math.min(1, rawScore);

  const exactHits = [
    ...aliasSignals.exactHits,
    ...partSignals.exactHits,
    ...materialSignals.exactHits,
  ];
  const phraseHits = [
    ...aliasSignals.phraseHits,
    ...partSignals.phraseHits,
    ...materialSignals.phraseHits,
  ];
  const synonymHits = [
    ...aliasSignals.synonymHits,
    ...partSignals.synonymHits,
    ...materialSignals.synonymHits,
  ];

  return {
    score: Number(score.toFixed(2)),
    partHits: partSignals.labels,
    aliasHits: aliasSignals.labels,
    materialHits: materialSignals.labels,
    providerHits: providerSignals.labels,
    exactHits,
    phraseHits,
    synonymHits,
    matchDiagnostics: {
      scoreBreakdown: Object.fromEntries(
        Object.entries(scoreBreakdown).map(([key, value]) => [key, Number(value.toFixed(3))])
      ),
      exactHits,
      phraseHits,
      synonymHits,
      missingHighValueTerms: [
        ...aliasSignals.missing.slice(0, 3),
        ...partSignals.missing.slice(0, 6),
      ],
      queryTokenCount: queryDoc.tokens.size,
      recordTokenCount: recordDoc.tokens.size,
    },
  };
};

const buildMatchEvidence = (match = {}) => {
  const evidence = [
    match.aliasHits?.length ? `name/alias: ${match.aliasHits.join(', ')}` : '',
    match.partHits?.length ? `parts: ${match.partHits.join(', ')}` : '',
    match.materialHits?.length ? `materials: ${match.materialHits.join(', ')}` : '',
    match.synonymHits?.length ? `semantic equivalents: ${match.synonymHits.join(', ')}` : '',
  ].filter(Boolean);
  return evidence.join('; ') || 'No strong inventory signals matched the scan.';
};

const MIN_MATCH_CANDIDATE_SCORE = 0.72;

module.exports = {
  MIN_MATCH_CANDIDATE_SCORE,
  buildMatchDocument,
  buildMatchEvidence,
  buildQueryDocument,
  normalizeToken,
  scoreInventoryRecord,
};
