// Offline evaluation orchestration only; geometry always uses igesSourcePipeline.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');
const p = require('./igesSourcePipeline');
const {loadImage} = require('./igesVisualCalibration');
const {describeImage, compareImages, cropImage, applyRenderGates} = require('./igesLocalCalibration');
const VERSION = 'iges-generalization-v2';
const logicFiles = ['utils/igesGeneralizationGate.js','utils/igesExposureStore.js','utils/igesSourcePipeline.js','utils/igesLocalCalibration.js','utils/igesRenderQuality.js','utils/igesVisualCalibration.js','scripts/iges-generalization-gate.js','scripts/iges-generalization-montage.py'];
const repoRoot=path.resolve(__dirname,'..');
const registryRoot=path.join(repoRoot,'.local','iges-generalization-experiments');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const nearestReal = file => {let existing=file;while(!fs.existsSync(existing))existing=path.dirname(existing);return path.resolve(fs.realpathSync(existing),path.relative(existing,file));};
const privatePath = file => {
  const resolved=path.resolve(file),parts=resolved.split(path.sep),index=parts.indexOf('.local');
  assert(index>=0,'Use ignored .local output');const anchor=parts.slice(0,index+1).join(path.sep);
  assert(!fs.existsSync(anchor)||!fs.lstatSync(anchor).isSymbolicLink(),'Private root cannot be a symlink');
  const realAnchor=nearestReal(anchor),real=nearestReal(resolved),relative=path.relative(realAnchor,real);
  assert(relative!== '..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative),'Output escapes private root through symlink');return real;
};
const writeOnce = (file,value) => {file=privatePath(file);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});};
const safeId = id => typeof id==='string'&&/^[a-z0-9][a-z0-9-]{0,79}$/.test(id);
const packageFingerprint = base => {
  const entries=[];
  const walk=(dir,prefix='')=>{for(const name of fs.readdirSync(dir).sort()){const file=path.join(dir,name),relative=prefix+name;if(fs.statSync(file).isDirectory())walk(file,relative+'/');else entries.push([relative,hash(file)]);}};
  entries.push(['package.json',hash(path.join(base,'package.json'))]);
  if(fs.existsSync(path.join(base,'index.js')))entries.push(['index.js',hash(path.join(base,'index.js'))]);
  walk(path.join(base,'lib'),'lib/');entries.sort((a,b)=>a[0].localeCompare(b[0]));
  return {version:JSON.parse(fs.readFileSync(path.join(base,'package.json'))).version,implementationHash:digest(entries),files:entries};
};
const runtimeIdentity = () => {
  const base=path.dirname(require.resolve('occt-import-js/package.json'));
  return {node:process.version,platform:process.platform,arch:process.arch,importer:require('occt-import-js/package.json').version,pngDecoder:packageFingerprint(path.dirname(require.resolve('pngjs/package.json'))),jpegDecoder:packageFingerprint(path.dirname(require.resolve('jpeg-js/package.json'))),packageHash:hash(path.join(base,'package.json')),javascriptHash:hash(path.join(base,'dist/occt-import-js.js')),wasmHash:hash(path.join(base,'dist/occt-import-js.wasm'))};
};
const exposureStore=require('./igesExposureStore').createExposureStore(registryRoot);
const validateManifest = manifest => {
  assert.equal(manifest.version,VERSION);assert(manifest.sources.length>0&&manifest.sources.length<=20,'Bounded 1-20 source gate');
  assert(manifest.preset&&manifest.candidatePreset&&Array.isArray(manifest.cameras)&&manifest.cameras.length<=4,'Frozen render presets required');
  for(const preset of [manifest.preset,manifest.candidatePreset]){assert(safeId(preset.id),'Unsafe preset ID');assert([preset.width,preset.height].every(v=>Number.isInteger(v)&&v>=64&&v<=2048),'Bounded image dimensions required');}
  const ids=new Set(),families=new Map(),hashes=new Set();
  for(const source of manifest.sources){
    assert(safeId(source.id)&&!ids.has(source.id),'Unique safe ID required');ids.add(source.id);
    assert(['dev','holdout','regression','synthetic'].includes(source.split),'Invalid split');
    assert(source.family&&source.rights?.status==='admitted'&&source.rights.basis,'Admission required');
    assert(['independent_archival','dependency_regression','historical_regression','synthetic'].includes(source.origin),'Explicit source origin required');
    if(source.split==='holdout')assert(source.origin==='independent_archival'&&source.priorExposure===false,'Holdout must be genuinely new independent family');
    if(source.origin==='synthetic')assert.equal(source.split,'synthetic');
    if(families.has(source.family))assert.equal(families.get(source.family),source.split,'Family crosses development/holdout split');families.set(source.family,source.split);
    assert(/^[a-f0-9]{64}$/.test(source.sha256)&&!hashes.has(source.sha256),'Duplicate/invalid source hash');hashes.add(source.sha256);
    assert(fs.statSync(source.path).size<=20*1024*1024,'Source exceeds 20MiB gate budget');assert.equal(hash(source.path),source.sha256,'Source checksum mismatch');
    if(source.rights.licensePath&&source.rights.documentSha256)assert.equal(hash(source.rights.licensePath),source.rights.documentSha256,'Rights document changed');
    assert(typeof source.expectedUnits==='string','Explicit unit expectation required');
    assert((source.references||[]).length<=4,'At most four references per source');
    for(const reference of source.references||[]){assert(['verified_view','related_native_preview_context_only'].includes(reference.role),'Explicit reference role required');assert(typeof reference.path==='string'&&/^[a-f0-9]{64}$/.test(reference.sha256),'Reference provenance required');}
  }
  return true;
};
const freezeGate = (manifestFile, outputFile) => {
  const manifest=JSON.parse(fs.readFileSync(manifestFile));validateManifest(manifest);outputFile=privatePath(outputFile);
  const fresh=manifest.sources.filter(s=>s.split==='holdout');
  const frozen={version:VERSION,experimentId:crypto.randomUUID(),manifest,manifestHash:digest(manifest),logicHashes:Object.fromEntries(logicFiles.map(f=>[f,hash(path.join(repoRoot,f))])),runtime:runtimeIdentity(),createdAt:new Date().toISOString(),improvementCycles:0};
  assert(!fs.existsSync(outputFile),'Freeze already exists');
  exposureStore.withLock(()=>{if(fresh.length)exposureStore.assertFreshUnlocked(fresh);writeOnce(path.join(registryRoot,frozen.experimentId+'.json'),{experimentId:frozen.experimentId,freezeHash:digest(frozen),manifestHash:frozen.manifestHash,events:[],devAccepted:false});});
  writeOnce(outputFile,frozen);return frozen;
};
const loadExperiment = freezeFile => {
  const frozen=JSON.parse(fs.readFileSync(freezeFile));assert.equal(frozen.version,VERSION,'Unsupported freeze schema');assert(/^[a-f0-9-]{36}$/.test(frozen.experimentId),'Invalid experiment identity');
  assert.equal(digest(frozen.manifest),frozen.manifestHash,'Frozen manifest changed');
  assert.deepEqual(Object.keys(frozen.logicHashes||{}).sort(),[...logicFiles].sort(),'Exact frozen logic keys required');
  for(const file of logicFiles)assert.equal(hash(path.join(repoRoot,file)),frozen.logicHashes[file],'Frozen logic changed');
  assert.deepEqual(frozen.runtime,runtimeIdentity(),'Frozen runtime/importer changed');
  const ledgerPath=privatePath(path.join(registryRoot,frozen.experimentId+'.json')),ledger=JSON.parse(fs.readFileSync(ledgerPath));
  assert.equal(ledger.experimentId,frozen.experimentId);assert.equal(ledger.freezeHash,digest(frozen),'Freeze differs from canonical experiment');
  validateManifest(frozen.manifest);return {frozen,ledger,ledgerPath};
};
const acceptDev = (freezeFile,reason) => {
  const {ledger,ledgerPath}=loadExperiment(freezeFile);assert(typeof reason==='string'&&reason.trim().length>=10,'Explicit DEV review reason required');
  assert(ledger.events.some(e=>e.phase==='dev'&&e.status==='complete'&&e.eligible>0&&e.count>0&&e.resourceBounded),'No eligible bounded DEV evaluation to accept');
  assert(!ledger.events.some(e=>e.phase==='holdout'),'Holdout already exposed');ledger.devAccepted={at:new Date().toISOString(),reason};p.writeJson(ledgerPath,ledger);
};
const reconcileHistory = receiptFile => {
  const receipt=JSON.parse(fs.readFileSync(privatePath(receiptFile)));assert(receipt.reason&&Array.isArray(receipt.attempts));
  const sources=[];
  for(const attempt of receipt.attempts){
    assert.equal(hash(attempt.freezePath),attempt.freezeSha256);assert.equal(hash(attempt.ledgerPath),attempt.ledgerSha256);
    for(const evidence of attempt.evidence||[])assert.equal(hash(evidence.path),evidence.sha256,'Reconciliation evidence changed');
    const old=JSON.parse(fs.readFileSync(attempt.freezePath)),ledger=JSON.parse(fs.readFileSync(attempt.ledgerPath));
    for(const event of ledger.events)for(const source of old.manifest.sources.filter(s=>s.split===event.phase))sources.push({family:source.family,sourceSha256:source.sha256,phase:event.phase,originalStatus:event.status,reconciledStatus:attempt.reconciledStatus||event.status});
  }
  return exposureStore.reconcile({sources,reason:receipt.reason,receiptPath:privatePath(receiptFile),receiptSha256:hash(receiptFile),attempts:receipt.attempts,supersedes:receipt.supersedes||[]});
};
const enforceOffline = () => {
  const externalRequests=[],restore=[];
  const replace=(object,key)=>{const original=object[key];if(typeof original!=='function')return;object[key]=function(){externalRequests.push({api:key,blocked:true});throw new Error('Offline gate blocked network/process access: '+key);};restore.push(()=>object[key]=original);};
  for(const name of ['http','https'])for(const key of ['request','get'])replace(require(name),key);
  replace(require('net').Socket.prototype,'connect');replace(require('tls'),'connect');replace(require('dgram'),'createSocket');
  for(const key of ['exec','execFile','spawn','fork','execSync','execFileSync','spawnSync'])replace(require('child_process'),key);
  for(const target of [require('dns'),require('dns').promises])for(const key of Object.keys(target))if(key==='lookup'||key==='lookupService'||key.startsWith('resolve')||key==='reverse'||key==='Resolver')replace(target,key);
  replace(require('worker_threads'),'Worker');
  replace(globalThis,'fetch');replace(globalThis,'WebSocket');
  return {externalRequests,restore:()=>restore.reverse().forEach(fn=>fn())};
};
const invariant = (a,b) => {
  assert.equal(a.sceneManifestHash,b.sceneManifestHash,'Scene changed');assert.equal(a.stl.sha256,b.stl.sha256,'STL changed');
  assert.equal(a.render.meshGeometrySha256,b.render.meshGeometrySha256,'Mesh changed');
  assert.equal(a.confidence.score,b.confidence.score,'Source score changed');assert.deepEqual(a.confidence.componentScores,b.confidence.componentScores,'Source evidence changed');
};
const confidenceState = status => {assert(['pass','warn'].includes(status),'Source confidence fail/unknown');return status==='pass'?'supported':'warn';};
const assertForeground = (render,features,required=[]) => {assert(features.valid===true,'Blank/invalid foreground');const gate=applyRenderGates({visual_fidelity_score:null},render,features,required);assert.equal(gate.gateReasons.length,0,gate.gateReasons.join(';'));};
const fixtureBinding = source => {
  // Independently construct an approved local fixture binding from frozen bytes,
  // not a live database nor the legacy personal-fixture registry.
  assert.equal(hash(source.path),source.sha256,'Fixture checksum mismatch');
  return {ok:true,resolverType:'controlled_fixture',sourceRecordId:null,sourceAsset:{id:source.id,path:source.path,fileName:path.basename(source.path),fileType:'model/iges',sha256:hash(source.path),approvedSha256:source.sha256,expectedUnits:source.expectedUnits,expectedSubfigures:source.expectedSubfigures||[]},renderPreset:p.DEFAULT_RENDER_PRESET,stlExportPreset:{id:'source-iges-binary-stl-v1',format:'binary',mimeType:'model/stl',scalingPolicy:'no_rescale_source_units_recorded_as_millimeters'}};
};
const runGate = async (freezeFile,phase,outputDir,{resourceBounded=false}={}) => {
  assert(['dev','holdout','regression','synthetic'].includes(phase));outputDir=privatePath(outputDir);
  const {frozen,ledger,ledgerPath}=loadExperiment(freezeFile);
  const inputs=frozen.manifest.sources.filter(s=>s.split===phase);assert(inputs.length>0,'Requested phase has zero sources');
  assert(!ledger.events.some(e=>e.phase===phase),'Phase already exposed; copied freeze cannot reset exposure');
  if(phase==='holdout')assert(ledger.devAccepted,'Explicit DEV acceptance required');
  assert(!fs.existsSync(outputDir),'Use a new output directory');
  exposureStore.reserve({experimentId:frozen.experimentId,phase,sources:inputs.map(s=>({family:s.family,sourceSha256:s.sha256})),at:new Date().toISOString()},phase==='holdout');
  fs.mkdirSync(outputDir,{recursive:true});
  const event={phase,status:'started',count:inputs.length,resourceBounded,at:new Date().toISOString(),logicHashes:frozen.logicHashes};ledger.events.push(event);p.writeJson(ledgerPath,ledger);
  const offline=enforceOffline();
  const report={version:VERSION,phase,runKind:phase==='holdout'?'first_declared_holdout':phase==='regression'?'exposed_replay':'development_or_synthetic',experimentId:frozen.experimentId,manifestHash:frozen.manifestHash,logicHashes:frozen.logicHashes,sourceRubric:'unchanged shared pipeline',visualRubric:'foreground-silhouette-edge-v1',productionPresetPromotion:false,improvementCycles:0,gateAccepted:false,resourceIsolation:resourceBounded?'CLI subprocess timeout 120s and heap cap 1536MiB':'unavailable in-process; not acceptable for holdout admission',externalRequests:offline.externalRequests,assets:[],trace:[]};
  try {
    // Complete every source-only baseline before any reference decoding/scoring.
    for(const source of inputs){
      const row={id:source.id,family:source.family,origin:source.origin,priorExposure:source.priorExposure===true,originalSplit:source.originalSplit||source.split,sourceSha256:source.sha256,status:'blocked',reasons:[],visualScore:null,visualStatus:'unavailable_no_verified_reference',renders:[],references:(source.references||[]).map(r=>({...r,visualScore:null,visualStatus:'not_evaluated'}))};report.assets.push(row);
      try {
        const content=fs.readFileSync(source.path,'utf8');row.inputDiagnostics={global:p.inspectIgesGlobal(content),entityTypeCounts:content.split(/\r?\n/).filter(l=>l[72]==='D'&&Number(l.slice(73))%2===1).reduce((counts,l)=>{const type=Number(l.slice(0,8));counts[type]=(counts[type]||0)+1;return counts;},{})};
        const record={id:'gate-'+source.id,status:'approved',sourceAssetId:source.id,sourcePath:source.path,approvedSha256:source.sha256,expectedUnits:source.expectedUnits,expectedSubfigures:source.expectedSubfigures||[],renderPresetId:p.DEFAULT_RENDER_PRESET.id};
        const binding=p.buildDatabaseSourceBinding(record);assert(binding.ok,binding.reason);
        row.record=record;row.fixtureResolver='independent frozen local binding; no live database';
        const baseline=await p.runIgesSourcePipeline({sourceBinding:{...binding,renderPreset:frozen.manifest.preset},outputDir:path.join(outputDir,source.id,'baseline')});row.baseline=baseline;
        assert(baseline.sceneManifest.finiteCoordinates&&baseline.sceneManifest.totalTriangles>0,'Nonfinite/empty geometry');
        assert(baseline.render.outputCompleteness.nonEmpty&&baseline.render.viewport.allVisibleGeometryWithinFrame,'Empty/clipped baseline');
        assert.equal(baseline.sceneManifest.sourceUnits,source.expectedUnits);assert.equal(baseline.confidence.referenceImagesUsedForScore,false);
        assert.equal(baseline.sceneManifest.assemblyResolution.missing.length,0,'Unresolved declared assembly');
        const fixture=await p.runIgesSourcePipeline({sourceBinding:{...fixtureBinding(source),renderPreset:frozen.manifest.preset},outputDir:path.join(outputDir,source.id,'fixture')});row.parity=p.assertEquivalentResults(fixture,baseline);invariant(baseline,fixture);assert.equal(fixture.render.sha256,baseline.render.sha256);
        const repeat=await p.runIgesSourcePipeline({sourceBinding:{...binding,renderPreset:frozen.manifest.preset},outputDir:path.join(outputDir,source.id,'baseline-repeat')});invariant(baseline,repeat);assert.equal(repeat.render.sha256,baseline.render.sha256);row.deterministic=true;
        row.status=confidenceState(baseline.confidence.status);
        assertForeground(baseline.render,describeImage(loadImage(baseline.render.outputPath)));
        row.reasons.push(...(baseline.confidence.reasons||[]));
        if(Object.keys(baseline.sceneManifest.entityTypeCounts).some(t=>![100,102,104,108,110,112,114,116,118,120,122,124,126,128,140,142,144,186,308,314,402,406,408,502,504,508,510,514].includes(Number(t)))){row.status='warn';row.reasons.push('Entity types outside gate-reviewed subset: coverage not certified; no repair performed');}
        row.capabilities={unitConversion:baseline.sceneManifest.unitConversion,entityTypeCounts:baseline.sceneManifest.entityTypeCounts,assembly:baseline.sceneManifest.assemblyResolution,transformVerification:'OCCT resolution only; no independent source transform oracle',duplicateLabels:baseline.render.ambiguousNodeNames,missingReferenceDoesNotBlockSource:true};
        report.trace.push({source:source.id,phase:'baseline-complete',referenceDecoded:false});
      }catch(error){row.reasons.push(error.message);row.status='blocked';}
    }
    for(const row of report.assets){if(!row.baseline||row.status==='blocked')continue;const source=inputs.find(s=>s.id===row.id),binding=p.buildDatabaseSourceBinding(row.record);
      try{
        for(const [i,projection] of [frozen.manifest.preset.projection,...frozen.manifest.cameras].entries()){
          const preset={...frozen.manifest.candidatePreset,projection,id:'generalization-quality-'+i};
          const result=await p.runIgesSourcePipeline({sourceBinding:{...binding,renderPreset:preset},outputDir:path.join(outputDir,row.id,'candidate-'+i)});
          invariant(row.baseline,result);assert(result.render.viewport.allVisibleGeometryWithinFrame&&result.render.outputCompleteness.nonEmpty,'Candidate clipped/empty');
          const repeat=await p.runIgesSourcePipeline({sourceBinding:{...binding,renderPreset:preset},outputDir:path.join(outputDir,row.id,'candidate-'+i+'-repeat')});invariant(result,repeat);assert.equal(result.render.sha256,repeat.render.sha256);
          const features=describeImage(loadImage(result.render.geometryOnlyArtifact?.outputPath||result.render.outputPath));
          confidenceState(result.confidence.status);assertForeground(result.render,features,source.requiredVisibleNodes||[]);
          row.renders.push({preset,render:result.render,sourceScore:result.confidence.score,invariants:true});
        }
        const seen=new Set(row.renders.flatMap(r=>Object.entries(r.render.visibleMeshPixelCounts).filter(([,pixels])=>pixels>0).map(([index])=>index)));row.componentCoverage={meshes:row.baseline.sceneManifest.totalMeshCount,seenAcrossFrozenViews:seen.size,unseenMeshIndices:row.baseline.sceneManifest.meshStats.filter(m=>!seen.has(String(m.meshIndex))).map(m=>m.meshIndex)};
        if(row.componentCoverage.unseenMeshIndices.length){row.status='warn';row.reasons.push('Some imported meshes occluded across frozen views; semantic coverage unverified');}
      }catch(error){row.status='blocked';row.reasons.push(error.message);}
    }
    p.writeJson(path.join(outputDir,'source-only-report.json'),report);
    // Availability checks and decoding are phase-local and occur after source work.
    for(const row of report.assets)for(const reference of row.references){
      try {
        assert(fs.statSync(reference.path).size<=8*1024*1024,'Reference exceeds 8MiB budget');assert.equal(hash(reference.path),reference.sha256,'Reference checksum mismatch');
        report.trace.push({source:row.id,phase:'reference-decode',allBaselinesAttempted:true});
        const image=cropImage(loadImage(reference.path,{maxBytes:8*1024*1024,maxPixels:4194304,maxMemoryUsageInMB:64}),reference.crop);reference.dimensions=[image.width,image.height];reference.decoded=true;reference.visualStatus='context_only_unverified';
        if(reference.role==='verified_view'&&row.status!=='blocked'&&row.renders.length){const target=describeImage(image);reference.visualScore=compareImages(describeImage(loadImage(row.renders[0].render.outputPath)),target);reference.visualStatus=Number.isFinite(reference.visualScore.visual_fidelity_score)?'scored_downstream_human_review_required':'unscorable_reference';}
        else if(row.status==='blocked')reference.visualStatus='blocked_source_or_candidate_gate';
      }catch(error){reference.decodeStatus='unavailable_reference';reference.decodeError=error.message;reference.visualStatus='unavailable_reference';reference.visualScore=null;}
    }
    for(const row of report.assets){row.visualScore=null;row.visualStatus=row.status==='blocked'?'blocked_source_or_candidate_gate':'per_reference_results_only';}
    report.coverage={freshHoldoutFiles:phase==='holdout'?inputs.length:0,independentFiles:inputs.filter(s=>s.origin==='independent_archival').length,independentFamilies:new Set(inputs.filter(s=>s.origin==='independent_archival').map(s=>s.family)).size,syntheticFiles:inputs.filter(s=>s.origin==='synthetic').length,successfulSourceImports:report.assets.filter(a=>a.baseline).length,eligibleAfterGates:report.assets.filter(a=>a.status!=='blocked').length,declaredReferences:inputs.flatMap(s=>s.references||[]).length,decodedReferences:report.assets.flatMap(a=>a.references).filter(r=>r.decoded).length,scoredReferences:report.assets.flatMap(a=>a.references).filter(r=>Number.isFinite(r.visualScore?.visual_fidelity_score)).length};
    assert.equal(offline.externalRequests.length,0,'Unexpected external access');event.status='complete';event.eligible=report.coverage.eligibleAfterGates;report.executionStatus=event.eligible?'complete_with_findings':'complete_no_eligible_sources';
    p.writeJson(path.join(outputDir,'report.json'),report);return report;
  }catch(error){event.status='failed';event.error=error.message;report.executionError=error.message;p.writeJson(path.join(outputDir,'failure-report.json'),report);throw error;}finally{offline.restore();event.finishedAt=new Date().toISOString();p.writeJson(ledgerPath,ledger);}
};
module.exports={VERSION,validateManifest,freezeGate,runGate,enforceOffline,privatePath,packageFingerprint,loadExperiment,acceptDev,reconcileHistory,invariant,confidenceState,assertForeground,fixtureBinding};
