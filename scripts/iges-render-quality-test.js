const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const q=require('../utils/igesRenderQuality');
const p=require('../utils/igesSourcePipeline');
const norm=v=>{const l=Math.hypot(...v);return v.map(n=>n/l);};
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'iges-quality-test-'));
const flat={attributes:{position:{array:[-2,-2,2,2,-2,2,2,2,2,-2,2,2]},normal:{array:[0,0,1,0,0,1,0,0,1,0,0,1]}},index:{array:[0,1,2,0,2,3]},brep_faces:[{first:0,last:1}]};
const scene={importResult:{meshes:[flat]},sceneManifest:{nodes:[{name:'plate',meshes:[0]}]}};
const binding={sourceAsset:{id:'generic-plate'},resolverType:'test',renderPreset:{...p.DEFAULT_RENDER_PRESET,width:128,height:128,margin:30,projection:{mode:'basis',viewDirection:[1,1,1],upDirection:[0,0,1]},lightDirection:[1,1,2],renderQuality:{version:q.VERSION,edges:'topology',shading:'occt-normals'}}};
const before=p.renderSceneToPng({scene,sourceBinding:binding,outputDir:path.join(root,'no-shadow')});
const shadowBinding={...binding,renderPreset:{...binding.renderPreset,renderQuality:{...binding.renderPreset.renderQuality,shadow:{normal:[0,0,1],offset:0,radiusPixels:2,opacity:.22}}}};
const after=p.renderSceneToPng({scene,sourceBinding:shadowBinding,outputDir:path.join(root,'shadow')});
const repeated=p.renderSceneToPng({scene,sourceBinding:shadowBinding,outputDir:path.join(root,'repeat')});
assert.equal(after.sha256,repeated.sha256);
assert.equal(before.geometryOnlyArtifact.sha256,after.geometryOnlyArtifact.sha256);
assert.deepEqual(before.visibleMeshPixelCounts,after.visibleMeshPixelCounts);
assert(after.shadowEvidence.affectedBackgroundPixels>0);
assert.equal(after.shadowEvidence.contributesToGeometryCoverage,false);
assert.equal(after.shadowEvidence.contributesToComponentVisibility,false);
assert.throws(()=>p.renderSceneToPng({scene,sourceBinding:{...shadowBinding,renderPreset:{...shadowBinding.renderPreset,displayState:{visible:false}}},outputDir:path.join(root,'hidden')}),/No visible geometry/);
assert.throws(()=>p.renderSceneToPng({scene:{importResult:{meshes:[]},sceneManifest:{nodes:[]}},sourceBinding:shadowBinding,outputDir:path.join(root,'empty')}),/No visible geometry/);
assert.throws(()=>p.renderSceneToPng({scene,sourceBinding:{...shadowBinding,renderPreset:{...shadowBinding.renderPreset,displayState:{opacity:0,edgeOpacity:0}}},outputDir:path.join(root,'transparent')}),/No visible geometry/);
const edges=p.buildRenderableEdges([flat],binding.renderPreset,new Map(),v=>[v[0],v[1],v[2]],1);
assert.equal(edges.length,4,'Flat-face diagonal must not become an edge');
// A shared edge between perpendicular faces must survive the crease classifier.
const crease={attributes:{position:{array:[0,0,0,1,0,0,0,1,0,0,0,1]}},index:{array:[0,1,2,1,0,3]},brep_faces:[{first:0,last:0},{first:1,last:1}]};
const creases=p.buildRenderableEdges([crease],binding.renderPreset,new Map(),v=>v,1);
assert(creases.some(e=>e.classification.isCrease&&e.classification.brepBoundary));
const curved={attributes:{normal:{array:[0,0,1,.4,0,.916515,0,.4,.916515]}},index:{array:[0,1,2]}};
const normals=q.shadingNormals(curved,0,[0,0,1]);assert.notDeepEqual(normals[0],normals[1]);
assert.deepEqual(q.shadingNormals(flat,0,[0,0,1]),[[0,0,1],[0,0,1],[0,0,1]]);
const pixels=Buffer.alloc(32*32*4),depth=new Float64Array(32*32);depth.fill(10);
const blend=(buf,i,c)=>{buf[i]=c[0];buf[i+3]=c[3];};
const line={pixels,width:32,height:32,start:[4,16,0],end:[28,16,0],color:[255,0,0,255],zBuffer:depth,tolerance:.5,blend};
assert.equal(q.rasterLine(line),0,'Occluded line must stay hidden');
const thin=q.rasterLine({...line,start:[4,16,10],end:[28,16,10],lineWidth:1});
const thick=q.rasterLine({...line,start:[4,16,10],end:[28,16,10],lineWidth:3});assert(thick>thin,'Line width must affect coverage');
assert.throws(()=>q.rasterLine({...line,lineWidth:20}),/line width/);
// Rotation identity: transformed normal dot display light == source normal dot
// inverse-transformed light. Basis-camera changes cannot alter this world light.
const axes=[[0,1,0],[-1,0,0],[0,0,1]],light=norm([1,2,3]),n=norm([2,3,4]);
const rotated=[-n[1],n[0],n[2]],sourceLight=q.sourceLight(light,axes);
assert(Math.abs(dot(rotated,light)-dot(n,sourceLight))<1e-12);
const rotatedCamera=p.renderSceneToPng({scene,sourceBinding:{...shadowBinding,renderPreset:{...shadowBinding.renderPreset,projection:{mode:'basis',viewDirection:[-1,1,1],upDirection:[0,0,1]}}},outputDir:path.join(root,'rotated-camera')});
assert.deepEqual(after.shadowEvidence.sourceLightDirection,rotatedCamera.shadowEvidence.sourceLightDirection);
const modelRotated=p.renderSceneToPng({scene,sourceBinding:{...shadowBinding,renderPreset:{...shadowBinding.renderPreset,projection:{...shadowBinding.renderPreset.projection,modelYawDeg:90}}},outputDir:path.join(root,'rotated-model')});
assert(Math.abs(modelRotated.shadowEvidence.sourceLightDirection[0]-1)<1e-12);
assert(Math.abs(modelRotated.shadowEvidence.sourceLightDirection[1]+1)<1e-12);
assert.throws(()=>q.validateQuality({version:q.VERSION,shadow:{normal:[0,0,1],offset:0,radiusPixels:40,opacity:.2}}),/limits/);
assert.throws(()=>q.shadowMask({triangles:[[[0,0,-1],[1,0,-1],[0,1,-1]]],toScreen:v=>v,width:16,height:16,settings:{normal:[0,0,1],offset:0,radiusPixels:1},lightDirection:[0,0,1]}),/intersects/);
const { PNG }=require('pngjs');
const forwardPreset={...binding.renderPreset,renderQuality:{...binding.renderPreset.renderQuality,materialModel:'diffuse',faceForwardLighting:true}};
const faceA=p.renderSceneToPng({scene,sourceBinding:{...binding,renderPreset:forwardPreset},outputDir:path.join(root,'face-a')});
const reversed={...flat,index:{array:[2,1,0,3,2,0]}};
const faceB=p.renderSceneToPng({scene:{...scene,importResult:{meshes:[reversed]}},sourceBinding:{...binding,renderPreset:forwardPreset},outputDir:path.join(root,'face-b')});
const aPixels=PNG.sync.read(fs.readFileSync(faceA.outputPath)).data,bPixels=PNG.sync.read(fs.readFileSync(faceB.outputPath)).data;
const center=(64*128+64)*4;
assert.deepEqual(aPixels.slice(center,center+4),bPixels.slice(center,center+4),'Two-sided shader must light visible reversed faces consistently');
assert.deepEqual(reversed.index.array,[2,1,0,3,2,0],'Shading must never repair source winding');
console.log('Quality tests passed: flat/curved normals, creases, occlusion, widths, world light, shadows, empty/hidden gates and repeatability.');
// Oblique screen nullspace differs from the depth-order gradient.
for (const projection of [p.DEFAULT_RENDER_PRESET.projection, {...p.DEFAULT_RENDER_PRESET.projection,modelYawDeg:31}, {mode:'basis',viewDirection:[1,2,3],upDirection:[0,0,1]}, {mode:'euler',yawDeg:22,pitchDeg:37}]) {
  const ray=p.cameraViewRay(projection),a=p.projectPointWithDepth([0,0,0],projection),b=p.projectPointWithDepth(ray,projection);
  assert(Math.hypot(b.point[0]-a.point[0],b.point[1]-a.point[1])<1e-12);
  assert(b.depth>a.depth);
}
const skewRay=p.cameraViewRay(p.DEFAULT_RENDER_PRESET.projection);
assert(dot([1,-.8,0],skewRay)<0);assert(dot([1,-.8,0],[1,1,1])>0);
// Zero-effective-alpha faces must neither own pixels nor occlude other meshes.
const {applyRenderGates}=require('../utils/igesLocalCalibration');
for(const quality of [undefined,binding.renderPreset.renderQuality]) {
 const transparentPreset={...binding.renderPreset,renderQuality:quality,displayState:{opacity:0,edgeOpacity:.001}};
 const invisible=p.renderSceneToPng({scene,sourceBinding:{...binding,renderPreset:transparentPreset},outputDir:path.join(root,'zero-'+!!quality)});
 assert.deepEqual(invisible.visibleMeshPixelCounts,{});assert.equal(invisible.outputCompleteness.nonEmpty,false);
 assert.equal(applyRenderGates({visual_fidelity_score:99},invisible,{touchesCanvas:false},['plate']).visual_fidelity_score,null);
 const mixedScene={importResult:{meshes:[flat,flat]},sceneManifest:{nodes:[{name:'solid',meshes:[0]},{name:'transparent',meshes:[1]}]}};
 const mixed=p.renderSceneToPng({scene:mixedScene,sourceBinding:{...binding,renderPreset:{...binding.renderPreset,renderQuality:quality,displayState:{nodeStyles:{transparent:{opacity:0,edgeOpacity:0}}}}},outputDir:path.join(root,'mixed-'+!!quality)});
 assert(mixed.visibleMeshPixelCounts[0]>0);assert(!mixed.visibleMeshPixelCounts[1]);
 const recovered=p.renderSceneToPng({scene,sourceBinding:{...binding,renderPreset:{...transparentPreset,displayState:{opacity:.5,edgeOpacity:0}}},outputDir:path.join(root,'recovered-'+!!quality)});
 assert(recovered.visibleMeshPixelCounts[0]>0);
}
for(const nodes of [[{name:'part',path:'root/part',meshes:[0]},{name:'part',path:'root/part',meshes:[1]}],[{name:'part',path:'root/part',meshes:[1]},{name:'part',path:'root/part',meshes:[0]}]]) {
 const visibility=p.nodeVisibility(nodes,{0:2304});
 const render={...visibility,viewport:{allVisibleGeometryWithinFrame:true}};
 assert(!Object.hasOwn(render.visibleNodePixels,'part'));
 assert.equal(applyRenderGates({visual_fidelity_score:99},render,{touchesCanvas:false},['part']).visual_fidelity_score,null);
 assert(p.resolveNodeVisibility(render,{path:'root/part'}).ambiguous);
 const visibleId=visibility.nodeVisibility.find(n=>n.pixels>0).nodeId;
 assert.equal(applyRenderGates({visual_fidelity_score:99},render,{touchesCanvas:false},[{nodeId:visibleId}]).visual_fidelity_score,99);
}
console.log('Review regressions passed: skew/basis/euler rays, zero alpha in legacy/quality, mixed opacity recovery, duplicate labels and explicit selectors.');
const skewCrease={attributes:{position:{array:[0,0,0,0,0,1,-.8,-1,0,0,1,0]}},index:{array:[0,1,2,1,0,3]},brep_faces:[{first:0,last:1}]};
const skewEdges=p.buildRenderableEdges([skewCrease],{...binding.renderPreset,projection:p.DEFAULT_RENDER_PRESET.projection,creaseAngleDeg:180},new Map(),v=>v,1);
assert(skewEdges.some(e=>e.classification.silhouette&&!e.classification.isBoundary&&!e.classification.isCrease),'Oblique viewing ray must reveal silhouette missed by depth gradient');
