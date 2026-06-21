const fs = require('fs');

const args = process.argv.slice(2);
const requireSource2D = args.includes('--require-source-2d');
const requireProviderReady = args.includes('--require-provider-ready');
const jsonOutput = args.includes('--json');
const sourcePaths = args.filter(arg => !arg.startsWith('--'));

const defaultSources = [
  'public/inventory/traceparts-industrial-components.json',
  'public/inventory/cadenas-industrial-components.json',
  'public/inventory/documoto-equipment-parts-book-phase2.json',
  'public/inventory/source-backed-2d-proof.json',
];

const files = sourcePaths.length > 0 ? sourcePaths : defaultSources;
const imageExtensionPattern = /\.(png|jpe?g|webp|gif|svg)(\?|#|$)/i;
const candidate2DFormatPattern = /(^|[^a-z0-9])(2d|dwg|dxf|svg|drawing|diagram|exploded|pdf)([^a-z0-9]|$)/i;
const non2DFormatPattern = /(^|[^a-z0-9])3d\s+pdf([^a-z0-9]|$)/i;

const splitList = (value) => {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  if (value == null) return [];
  return String(value)
    .split(/[|;,]/)
    .map(item => item.trim())
    .filter(Boolean);
};

const recordsFromJson = (payload) => {
  if (Array.isArray(payload)) return payload;
  for (const key of ['machines', 'items', 'records', 'data']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
};

const normalizeReferenceImages = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return [{
    id: 'single-reference-image',
    label: 'Single reference image',
    url: String(value),
  }];
};

const normalizeProvider2DExport = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    status: String(value.status || '').trim(),
    provider: String(value.provider || '').trim(),
    documentation: splitList(value.documentation),
    availabilityEndpoint: String(value.availabilityEndpoint || '').trim(),
    requestEndpoint: String(value.requestEndpoint || '').trim(),
    fileUrlEndpoint: String(value.fileUrlEndpoint || '').trim(),
    credentialRefs: splitList(value.credentialRefs),
    requiredRecordFields: splitList(value.requiredRecordFields),
    candidate2DFormats: splitList(value.candidate2DFormats),
    nextAction: String(value.nextAction || '').trim(),
  };
};

const getCredentialReadiness = (provider2DExport) => {
  if (!provider2DExport?.credentialRefs?.length) {
    return {
      required: [],
      configured: [],
      missing: [],
      status: provider2DExport ? 'no_credentials_declared' : 'not_applicable',
    };
  }

  const configured = provider2DExport.credentialRefs.filter(ref => Boolean(process.env[ref]));
  const missing = provider2DExport.credentialRefs.filter(ref => !process.env[ref]);

  return {
    required: provider2DExport.credentialRefs,
    configured,
    missing,
    status: missing.length === 0 ? 'configured' : 'missing_credentials',
  };
};

const getProviderReadinessStatus = ({ hasSource2D, provider2DExport, credentialReadiness }) => {
  if (hasSource2D) return 'ready_direct_source_2d';
  if (!provider2DExport) return 'no_provider_export_plan';
  if (credentialReadiness.status === 'configured') return 'provider_export_credentials_configured';
  if (credentialReadiness.status === 'missing_credentials') return 'waiting_for_provider_credentials';
  return provider2DExport.status || 'provider_export_plan_incomplete';
};

const safeFetchContentType = async (url) => {
  if (!/^https?:\/\//i.test(url)) return { status: 'not_fetchable', contentType: '' };

  try {
    let response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: {
        Accept: 'image/*,text/html,*/*;q=0.8',
        'User-Agent': 'ReversR-Rebuild/1.0 source-backed-2d-audit',
      },
    });

    if (response.status === 405 || response.status === 403 || response.status === 404) {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          Accept: 'image/*,text/html,*/*;q=0.8',
          'User-Agent': 'ReversR-Rebuild/1.0 source-backed-2d-audit',
        },
      });
    }

    return {
      status: String(response.status),
      contentType: response.headers.get('content-type') || '',
      finalUrl: response.url || url,
    };
  } catch (error) {
    return {
      status: 'fetch_failed',
      contentType: '',
      error: error.message,
    };
  }
};

const auditReference = async (reference) => {
  const url = String(reference?.url || '').trim();
  const contentType = String(reference?.contentType || '').trim().toLowerCase();

  if (!url) {
    return {
      id: reference?.id || '',
      label: reference?.label || '',
      status: 'missing_url',
      sourceType: reference?.sourceType || reference?.kind || '',
    };
  }

  if (url.startsWith('data:image/')) {
    const match = url.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    return {
      id: reference?.id || '',
      label: reference?.label || '',
      urlKind: 'data_image',
      contentType: match?.[1] || contentType || 'image/*',
      status: match?.[2] ? 'source_2d_available' : 'invalid_data_image',
      sourceType: reference?.sourceType || reference?.kind || '',
      licenseNote: reference?.licenseNote || '',
    };
  }

  const directByMetadata = imageExtensionPattern.test(url) || contentType.startsWith('image/');
  const fetched = await safeFetchContentType(url);
  const fetchedImage = String(fetched.contentType || '').toLowerCase().startsWith('image/');

  return {
    id: reference?.id || '',
    label: reference?.label || '',
    url,
    urlKind: /^https?:\/\//i.test(url) ? 'remote_url' : 'non_http_url',
    directByMetadata,
    fetchedStatus: fetched.status,
    fetchedContentType: fetched.contentType,
    finalUrl: fetched.finalUrl,
    status: directByMetadata || fetchedImage ? 'source_2d_available' : 'not_direct_2d_image',
    sourceType: reference?.sourceType || reference?.kind || '',
    licenseNote: reference?.licenseNote || '',
    error: fetched.error,
  };
};

const classifyRecord = async (record, file) => {
  const references = normalizeReferenceImages(record.referenceImages || record.referenceImage || record.imageUrl || record.images);
  const referenceAudit = [];
  for (const reference of references) {
    referenceAudit.push(await auditReference(reference));
  }

  const cadFormats = splitList(record.cadFormats || record.availableFormats);
  const provider2DExport = normalizeProvider2DExport(record.provider2DExport);
  const credentialReadiness = getCredentialReadiness(provider2DExport);
  const candidate2DFormats = cadFormats.filter(format => candidate2DFormatPattern.test(format) && !non2DFormatPattern.test(format));
  const providerCandidate2DFormats = provider2DExport?.candidate2DFormats || [];
  const hasSource2D = referenceAudit.some(reference => reference.status === 'source_2d_available');
  const has3DOrCadLink = Boolean(record.renderUrl || record.viewerUrl || record.cadModelUrl || record.cadUrl);
  const hasProviderReference = references.some(reference => /provider|catalog|parts-book/i.test(`${reference.kind || ''} ${reference.label || ''}`));
  const requiresProviderAuth = !hasSource2D && (hasProviderReference || has3DOrCadLink);

  let status = 'not_verified';
  if (hasSource2D) {
    status = 'source_2d_available';
  } else if (candidate2DFormats.length > 0) {
    status = 'source_2d_export_possible';
  } else if (requiresProviderAuth) {
    status = 'requires_provider_auth_or_direct_asset';
  } else if (has3DOrCadLink) {
    status = 'source_3d_only';
  }

  return {
    file,
    machineId: record.machineId || record.id || '',
    machineName: record.machineName || record.name || '',
    sourceProvider: record.sourceProvider || record.provider || '',
    sourceRecordId: record.sourceRecordId || '',
    status,
    providerReadinessStatus: getProviderReadinessStatus({ hasSource2D, provider2DExport, credentialReadiness }),
    hasSourceBacked2DImage: hasSource2D,
    candidate2DFormats: Array.from(new Set([...candidate2DFormats, ...providerCandidate2DFormats])),
    has3DOrCadLink,
    provider2DExport,
    credentialReadiness,
    referenceAudit,
  };
};

const run = async () => {
  const results = [];
  const failures = [];

  for (const file of files) {
    if (!fs.existsSync(file)) {
      failures.push(`Inventory file does not exist: ${file}`);
      continue;
    }

    let records = [];
    try {
      records = recordsFromJson(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (error) {
      failures.push(`Could not parse ${file}: ${error.message}`);
      continue;
    }

    if (records.length === 0) {
      failures.push(`Inventory file has no records: ${file}`);
      continue;
    }

    for (const record of records) {
      const result = await classifyRecord(record, file);
      results.push(result);
      if (requireSource2D && !result.hasSourceBacked2DImage) {
        failures.push(`${result.machineId || result.machineName || file} does not have a verified source-backed 2D image.`);
      }
      if (
        requireProviderReady
        && !result.hasSourceBacked2DImage
        && result.providerReadinessStatus !== 'provider_export_credentials_configured'
      ) {
        failures.push(`${result.machineId || result.machineName || file} is not ready for real provider 2D export (${result.providerReadinessStatus}).`);
      }
    }
  }

  if (jsonOutput) {
    console.log(JSON.stringify({ results, failures }, null, 2));
  } else {
    for (const result of results) {
      console.log(`${result.status}: ${result.machineId} (${result.sourceProvider || 'unknown provider'})`);
      if (result.candidate2DFormats.length > 0) {
        console.log(`  candidate 2D/CAD formats: ${result.candidate2DFormats.join(', ')}`);
      }
      console.log(`  provider readiness: ${result.providerReadinessStatus}`);
      if (result.credentialReadiness?.missing?.length > 0) {
        console.log(`  missing credentials: ${result.credentialReadiness.missing.join(', ')}`);
      }
      if (result.provider2DExport?.nextAction) {
        console.log(`  next action: ${result.provider2DExport.nextAction}`);
      }
      for (const reference of result.referenceAudit) {
        const detail = reference.url || reference.urlKind || reference.contentType || 'reference';
        console.log(`  - ${reference.status}: ${reference.id || reference.label || detail}${reference.fetchedContentType ? ` [${reference.fetchedContentType}]` : ''}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error('Source-backed 2D audit failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
};

run().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
