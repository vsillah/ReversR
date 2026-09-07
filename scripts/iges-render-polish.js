#!/usr/bin/env node
// Fixed-camera, fixed-geometry comparison of bounded rendering-only hypotheses.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const p=require('../utils/igesSourcePipeline');
const {loadImage}=require('../utils/igesVisualCalibration');
const {describeImage,compareImages,applyRenderGates}=require('../utils/igesLocalCalibration');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
(async()=>{
  const input=JSON.parse(fs.readFileSync(process.argv[2]));
  const out=path.resolve(input.outputDir);
  assert(out.split(path.sep).includes('.local')); assert(!fs.existsSync(path.join(out,'report.json')),'Use a new immutable run directory');
  const before=JSON.parse(fs.readFileSync(input.beforeReport));
  const report={renderer:'iges-source-shaded-edge-renderer-v3-opt-in',qualityVersion:'iges-quality-v1',visualRubric:'foreground-silhouette-edge-v1 unchanged',beforeReport:input.beforeReport,beforeReportSha256:hash(input.beforeReport),productionPresetPromotion:false,assets:[],experimentsPerView:4};
  for(const old of before.assets){
    const source=input.sources.find(s=>s.id===old.id); assert(source,'Pinned source record missing');
    const binding=p.buildDatabaseSourceBinding(source.record);assert(binding.ok,binding.reason);
    const asset={id:old.id,views:[],source:old.baseline.sourceAsset,sceneManifestHash:old.baseline.sceneManifestHash,stlSha256:old.baseline.stl.sha256};report.assets.push(asset);
    for(const v of old.views){
      assert.equal(hash(v.best.render.outputPath),v.best.render.sha256,'Before render changed');
      const beforeBinding={...binding,renderPreset:v.best.preset};
      const baseline=await p.runIgesSourcePipeline({sourceBinding:beforeBinding,outputDir:path.join(out,old.id,v.id,'before-repeat')});
      assert.equal(baseline.render.sha256,v.best.render.sha256,'Legacy output changed');
      const plane=source.groundPlane;
      const experiments=[
        {id:'edge-only',quality:{version:'iges-quality-v1',edges:'topology'}},
        {id:'smooth-edges',quality:{version:'iges-quality-v1',edges:'topology',shading:'occt-normals'}},
        {id:'diffuse-edges',quality:{version:'iges-quality-v1',edges:'topology',shading:'occt-normals',materialModel:'diffuse',faceForwardLighting:true},light:source.keyLight,materialSide:[145,150,169]},
        {id:'diffuse-soft-shadow',quality:{version:'iges-quality-v1',edges:'topology',shading:'occt-normals',materialModel:'diffuse',faceForwardLighting:true,shadow:{...plane,radiusPixels:5,opacity:.22}},light:source.keyLight,materialSide:[145,150,169]},
      ];
      const view={id:v.id,before:baseline.render,beforePreset:v.best.preset,reference:{path:v.provenance.path,sha256:v.provenance.sha256,crop:v.provenance.crop},experiments:[],humanQA:'pending',selectedExperiment:null};asset.views.push(view);
      for(const experiment of experiments){
        const preset={...v.best.preset,id:`polish-v1-${v.id}-${experiment.id}`,renderQuality:experiment.quality,...(experiment.light?{lightDirection:experiment.light}:{}),...(experiment.materialSide?{material:{...v.best.preset.material,side:experiment.materialSide}}:{})};
        const result=await p.runIgesSourcePipeline({sourceBinding:{...binding,renderPreset:preset},outputDir:path.join(out,old.id,v.id,experiment.id)});
        assert.equal(result.render.meshGeometrySha256,baseline.render.meshGeometrySha256);
        assert.equal(result.sceneManifestHash,asset.sceneManifestHash);assert.equal(result.stl.sha256,asset.stlSha256);
        assert.equal(result.confidence.score,baseline.confidence.score,'Rendering-only pass changed source score');
        assert.deepEqual(result.render.visibleMeshPixelCounts,baseline.render.visibleMeshPixelCounts,'Shading/shadows changed geometry ownership');
        const geometry=describeImage(loadImage(result.render.geometryOnlyArtifact.outputPath));
        assert(result.render.viewport.allVisibleGeometryWithinFrame);assert(!geometry.touchesCanvas);
        for(const name of v.provenance.requiredVisibleNodes||[])assert(result.render.visibleNodePixels[name]>0,'Required component lost');
        view.experiments.push({id:experiment.id,preset,render:result.render,source_confidence_score:result.confidence.score,geometryInvariant:true,stlInvariant:true});
      }
    }
  }
  // The source-only matrix is complete before reference bytes are loaded.
  for(const asset of report.assets)for(const view of asset.views){
    assert.equal(hash(view.reference.path),view.reference.sha256);
    const {cropImage}=require('../utils/igesLocalCalibration');
    const reference=describeImage(cropImage(loadImage(view.reference.path),view.reference.crop));
    view.beforeScore=compareImages(describeImage(loadImage(view.before.outputPath)),reference);
    for(const experiment of view.experiments){
      experiment.comparison=compareImages(describeImage(loadImage(experiment.render.outputPath)),reference);
      experiment.geometryOnlyComparison=applyRenderGates(compareImages(describeImage(loadImage(experiment.render.geometryOnlyArtifact.outputPath)),reference),experiment.render,describeImage(loadImage(experiment.render.geometryOnlyArtifact.outputPath)));
      experiment.delta=Number((experiment.comparison.visual_fidelity_score-view.beforeScore.visual_fidelity_score).toFixed(1));
    }
    console.log(asset.id,view.id,view.beforeScore.visual_fidelity_score,view.experiments.map(e=>`${e.id}:${e.comparison.visual_fidelity_score}(${e.delta})`).join(' '));
  }
  p.writeJson(path.join(out,'report.json'),report);
})().catch(e=>{console.error(e);process.exitCode=1;});
