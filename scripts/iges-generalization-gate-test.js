const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const gate=require('../utils/igesGeneralizationGate'),p=require('../utils/igesSourcePipeline');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
(async()=>{
 const root=process.env.IGES_GATE_TEST_OUTPUT?gate.privatePath(process.env.IGES_GATE_TEST_OUTPUT):path.join(fs.mkdtempSync(path.join(os.tmpdir(),'iges-gate-')),'.local');fs.mkdirSync(root,{recursive:true});
 const {createExposureStore}=require('../utils/igesExposureStore');
 const journal=path.join(root,'journal'),a=createExposureStore(journal),b=createExposureStore(journal);
 const receipt=(id,family,sha)=>({experimentId:id,phase:'holdout',sources:[{family,sourceSha256:sha}]});
 a.withLock(()=>assert.throws(()=>b.reserve(receipt('busy','b','b'.repeat(64)),true),/busy/));
 a.reserve(receipt('first','a','a'.repeat(64)),true);b.reserve(receipt('second','b','b'.repeat(64)),true);
 assert.equal(a.receipts().length,2);fs.unlinkSync(path.join(journal,'history.json'));
 assert.throws(()=>b.assertFresh([{family:'renamed',sha256:'a'.repeat(64)}]),/previously exposed/);
 assert.throws(()=>a.assertFresh([{family:'b',sha256:'c'.repeat(64)}]),/previously exposed/);
 fs.writeFileSync(path.join(journal,'freshness.lock'),'stale');assert.throws(()=>b.reserve(receipt('third','c','c'.repeat(64)),true),/busy/);fs.unlinkSync(path.join(journal,'freshness.lock'));
 const pkg=path.join(root,'decoder-package');fs.mkdirSync(path.join(pkg,'lib'),{recursive:true});fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({version:'1.0.0'}));fs.writeFileSync(path.join(pkg,'lib','decoder.js'),'original');
 const packageBefore=gate.packageFingerprint(pkg);fs.writeFileSync(path.join(pkg,'lib','decoder.js'),'changed');assert.notDeepEqual(packageBefore,gate.packageFingerprint(pkg));
 const cube=path.join(path.dirname(require.resolve('occt-import-js/package.json')),'test/testfiles/cube-10x10mm/Cube 10x10.igs');
 const source={id:'dependency-cube',family:'test-'+crypto.randomUUID(),split:'regression',origin:'dependency_regression',path:cube,sha256:hash(cube),expectedUnits:'millimeter',expectedSubfigures:[],rights:{status:'admitted',basis:'LGPL-2.1 installed dependency fixture'},references:[]};
 const manifest={version:gate.VERSION,sources:[source],preset:{...p.DEFAULT_RENDER_PRESET,width:128,height:128,margin:16},candidatePreset:{...p.DEFAULT_RENDER_PRESET,width:128,height:128,margin:16},cameras:[]};
 const freeze= (name,value=manifest) => {const dir=path.join(root,name);fs.mkdirSync(dir);const file=path.join(dir,'manifest.json'),frozen=path.join(dir,'freeze.json');fs.writeFileSync(file,JSON.stringify(value));gate.freezeGate(file,frozen);return frozen;};
 assert(gate.validateManifest(manifest));
 assert.throws(()=>gate.validateManifest({...manifest,preset:{...manifest.preset,id:'../../escape'}}),/preset ID/);
 assert.throws(()=>gate.validateManifest({...manifest,preset:{...manifest.preset,width:2049}}),/dimensions/);
 assert.throws(()=>gate.validateManifest({...manifest,sources:[source,{...source,id:'copy'}]}),/Duplicate/);
 assert.throws(()=>gate.validateManifest({...manifest,sources:[source,{...source,id:'other',split:'dev'}]}),/Family crosses/);
 assert.throws(()=>gate.validateManifest({...manifest,sources:[{...source,split:'holdout'}]}),/genuinely new/);
 assert.throws(()=>gate.validateManifest({...manifest,sources:[{...source,rights:{status:'pending'}}]}),/Admission/);
 assert.throws(()=>gate.validateManifest({...manifest,sources:[{...source,sha256:'0'.repeat(64)}]}),/checksum/);
 const outside=fs.mkdtempSync(path.join(os.tmpdir(),'iges-outside-'));fs.symlinkSync(outside,path.join(root,'escape'));assert.throws(()=>gate.privatePath(path.join(root,'escape','result')),/escapes/);
 for(const state of ['fail','unknown',null])assert.throws(()=>gate.confidenceState(state),/fail\/unknown/);
 assert.equal(gate.confidenceState('pass'),'supported');assert.equal(gate.confidenceState('warn'),'warn');
 assert.throws(()=>gate.assertForeground({},{valid:false}),/Blank/);
 const offline=gate.enforceOffline();try{for(const call of [()=>require('https').request('https://example.invalid'),()=>require('dns').lookup('example.invalid',()=>{}),()=>new(require('worker_threads').Worker)(''),()=>require('child_process').spawn('echo')])assert.throws(call,/Offline gate/);assert.equal(offline.externalRequests.length,4);}finally{offline.restore();}
 const frozen=freeze('positive');const copy=path.join(root,'copied-freeze.json');fs.copyFileSync(frozen,copy);
 // Explicitly prohibit incidental personal fixture reads while using only the cube.
 const originalRead=fs.readFileSync;fs.readFileSync=function(file,...args){assert(!String(file).includes('/Downloads/'),'Incidental personal fixture read');return originalRead.call(this,file,...args);};
 let positive;try{positive=await gate.runGate(frozen,'regression',path.join(root,'positive-run'));}finally{fs.readFileSync=originalRead;}
 assert.equal(positive.coverage.eligibleAfterGates,1);assert.equal(positive.assets[0].visualScore,null);assert.equal(positive.coverage.declaredReferences,0);assert.deepEqual(positive.externalRequests,[]);assert.equal(positive.gateAccepted,false);
 assert.equal(positive.assets[0].baseline.blockedStates,null);
 await assert.rejects(gate.runGate(copy,'regression',path.join(root,'copied-run')),/already exposed/);
 await assert.rejects(gate.runGate(copy,'holdout',path.join(root,'empty-phase')),/zero sources/);
 assert.throws(()=>gate.acceptDev(copy,'Attempted acceptance without DEV'),/No eligible/);
 const good=positive.assets[0].baseline;
 for(const mutate of [r=>r.sceneManifestHash='bad',r=>r.stl.sha256='bad',r=>r.confidence.score=0,r=>r.render.meshGeometrySha256='bad']){const bad=structuredClone(good);mutate(bad);assert.throws(()=>gate.invariant(good,bad));}
 assert.throws(()=>p.assertEquivalentResults(good,{...good,render:{...good.render,sha256:'bad'}}));
 assert.equal(p.buildDatabaseSourceBinding(null).status,'blocked_no_source');
 const record={...positive.assets[0].record,approvedSha256:'0'.repeat(64)};assert.equal(p.buildDatabaseSourceBinding(record).status,'invalid_binding');
 const tampered=JSON.parse(fs.readFileSync(frozen));tampered.logicHashes={};fs.writeFileSync(copy,JSON.stringify(tampered));assert.throws(()=>gate.loadExperiment(copy),/Exact frozen logic/);
 const modified=JSON.parse(fs.readFileSync(frozen));modified.manifest.sources[0].family='changed';fs.writeFileSync(copy,JSON.stringify(modified));assert.throws(()=>gate.loadExperiment(copy),/manifest changed/);
 const runtimeChanged=JSON.parse(fs.readFileSync(frozen));runtimeChanged.runtime.node='unknown';fs.writeFileSync(copy,JSON.stringify(runtimeChanged));assert.throws(()=>gate.loadExperiment(copy),/runtime\/importer/);
 const badRef=path.join(root,'missing.png');
 const references=[{path:good.render.outputPath,sha256:good.render.sha256,role:'verified_view'},{path:badRef,sha256:'0'.repeat(64),role:'verified_view'},{path:good.render.outputPath,sha256:'0'.repeat(64),role:'verified_view'}];
 const huge=path.join(root,'huge-header.png'),header=Buffer.from(fs.readFileSync(good.render.outputPath));header.writeUInt32BE(10000,16);header.writeUInt32BE(10000,20);fs.writeFileSync(huge,header);references.push({path:huge,sha256:hash(huge),role:'verified_view'});
 const refFreeze=freeze('mixed-refs',{...manifest,sources:[{...source,references}]});
 const mixed=await gate.runGate(refFreeze,'regression',path.join(root,'mixed-run'));assert.equal(mixed.coverage.eligibleAfterGates,1);assert.equal(mixed.coverage.scoredReferences,1);assert.equal(mixed.assets[0].references[1].visualScore,null);assert(mixed.assets[0].references[2].decodeError);assert.equal(mixed.assets[0].baseline.confidence.score,good.confidence.score);assert.match(mixed.assets[0].references[3].decodeError,/pixel budget/);
 assert.throws(()=>gate.validateManifest({...manifest,sources:[{...source,references:Array(5).fill(references[0])}]}),/four references/);
 const partialFreeze=freeze('partial',{...manifest,sources:[{...source,references:[references[0]]}],cameras:[{mode:'basis',viewDirection:[0,1,0],upDirection:[0,1,0]}]});
 const partial=await gate.runGate(partialFreeze,'regression',path.join(root,'partial-run'));assert.equal(partial.assets[0].renders.length,1);assert.equal(partial.coverage.eligibleAfterGates,0);assert.equal(partial.coverage.scoredReferences,0);
 const jpeg=require('jpeg-js'),{PNG}=require('pngjs');const jpegPath=path.join(root,'valid.jpg'),oversizedJpeg=path.join(root,'oversized.jpg');
 const {loadImage}=require('../utils/igesVisualCalibration');const bounds={maxBytes:8192,maxPixels:1,maxMemoryUsageInMB:8};
 const tiny=PNG.sync.write(new PNG({width:1,height:1})),wide=PNG.sync.write(new PNG({width:2,height:1}));
 const adversarial=path.join(root,'duplicate-ihdr.png'),truncated=path.join(root,'truncated.png');fs.writeFileSync(adversarial,Buffer.concat([tiny.subarray(0,33),wide.subarray(8)]));fs.writeFileSync(truncated,tiny.subarray(0,tiny.length-2));
 const decodeOriginal=PNG.sync.read;let decoderCalled=false;PNG.sync.read=(...args)=>{decoderCalled=true;return decodeOriginal(...args);};
 try{assert.throws(()=>loadImage(adversarial,bounds),/Duplicate/);assert.throws(()=>loadImage(truncated,bounds),/Truncated|bounds/);assert.equal(decoderCalled,false);}finally{PNG.sync.read=decodeOriginal;}
 const decoderChanged=JSON.parse(fs.readFileSync(frozen));decoderChanged.runtime.pngDecoder=gate.packageFingerprint(pkg);fs.writeFileSync(copy,JSON.stringify(decoderChanged));assert.throws(()=>gate.loadExperiment(copy),/runtime\/importer/);
 const decoded=PNG.sync.read(fs.readFileSync(good.render.outputPath));fs.writeFileSync(jpegPath,jpeg.encode(decoded,85).data);const oversized=Buffer.from(fs.readFileSync(jpegPath));const sof=oversized.indexOf(Buffer.from([255,192]));assert(sof>0);oversized.writeUInt16BE(10000,sof+5);oversized.writeUInt16BE(10000,sof+7);fs.writeFileSync(oversizedJpeg,oversized);
 const jpegFreeze=freeze('bounded-jpeg',{...manifest,sources:[{...source,references:[jpegPath,oversizedJpeg].map(file=>({path:file,sha256:hash(file),role:'verified_view'}))}]});const jpegReport=await gate.runGate(jpegFreeze,'regression',path.join(root,'jpeg-run'));assert.equal(jpegReport.coverage.scoredReferences,1);assert.match(jpegReport.assets[0].references[1].decodeError,/maxResolutionInMP/);assert.equal(jpegReport.assets[0].baseline.confidence.score,good.confidence.score);
 const derivative=path.join(root,'synthetic-derivative.igs');fs.writeFileSync(derivative,Buffer.concat([fs.readFileSync(cube),Buffer.from('\n')]));const otherPhase={...source,id:'other-phase',family:'other-'+crypto.randomUUID(),path:derivative,sha256:hash(derivative),origin:'synthetic',split:'synthetic',references:[{path:badRef,sha256:'0'.repeat(64),role:'verified_view'}]};const phaseFreeze=freeze('phase-local-refs',{...manifest,sources:[source,otherPhase]});const phaseReport=await gate.runGate(phaseFreeze,'regression',path.join(root,'phase-only-run'));assert.equal(phaseReport.coverage.eligibleAfterGates,1);assert.equal(phaseReport.coverage.declaredReferences,0);
 for(const report of [mixed,jpegReport,phaseReport]){gate.invariant(good,report.assets[0].baseline);p.assertEquivalentResults(good,report.assets[0].baseline);}
 const invalidFile=path.join(root,'unsafe-manifest.json');fs.writeFileSync(invalidFile,JSON.stringify({...manifest,preset:{...manifest.preset,id:'../../escaped'}}));assert.throws(()=>gate.freezeGate(invalidFile,path.join(root,'unsafe-output','freeze.json')),/preset ID/);assert(!fs.existsSync(path.join(root,'unsafe-output')));
 const devManifest={...manifest,sources:[{...source,split:'dev'}]};const devFreeze=freeze('bounded-dev',devManifest);
 const cp=require('child_process');const child=cp.spawnSync(process.execPath,['scripts/iges-generalization-gate.js','run',devFreeze,'dev',path.join(root,'bounded-dev-run')],{encoding:'utf8',timeout:125000});assert.equal(child.status,0,child.stderr);
 gate.acceptDev(devFreeze,'Test-only DEV review acceptance with eligible bounded source');assert(gate.loadExperiment(devFreeze).ledger.devAccepted);
 const blankManifest={...devManifest,preset:{...manifest.preset,displayState:{opacity:0,edgeOpacity:0}},candidatePreset:{...manifest.candidatePreset,displayState:{opacity:0,edgeOpacity:0}}};const blankFreeze=freeze('all-blocked',blankManifest);const blank=await gate.runGate(blankFreeze,'dev',path.join(root,'blank-run'));assert.equal(blank.coverage.eligibleAfterGates,0);assert.equal(blank.gateAccepted,false);assert.throws(()=>gate.acceptDev(blankFreeze,'Do not accept zero eligible source cases'),/No eligible/);
 fs.writeFileSync(path.join(root,'paired-evidence.json'),JSON.stringify({noReference:p.comparablePipelineResult(good),png:p.comparablePipelineResult(mixed.assets[0].baseline),jpeg:p.comparablePipelineResult(jpegReport.assets[0].baseline),missingOtherPhaseReference:p.comparablePipelineResult(phaseReport.assets[0].baseline)},null,2));
 console.log('Generalization integrity tests passed; paired evidence: '+path.join(root,'paired-evidence.json'));
})().catch(error=>{console.error(error);process.exitCode=1;});
