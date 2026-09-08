const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict');
const {p,scene,base}=require('./fixtures/iges-shadow-overlay-scenes');
const {loadImage}=require('../utils/igesVisualCalibration');
const baseline=require('./fixtures/iges-shadow-baseline-loader')();
const root=fs.mkdtempSync(path.join(os.tmpdir(),'iges-shadow-overlay-'));
let count=0;
function render(renderer,s,preset){return renderer.renderSceneToPng({scene:s,sourceBinding:{sourceAsset:{id:'generic-overlay'},resolverType:'synthetic',renderPreset:preset},outputDir:path.join(root,String(++count))});}
for(const edges of ['topology','legacy']){
 const preset={...base,renderQuality:{version:'iges-quality-v1',edges,shadow:{normal:[0,0,1],offset:0,radiusPixels:1,opacity:.3}}};
 const control=render(p,scene(false),preset),added=render(p,scene(true),preset);assert.equal(control.sha256,added.sha256,'rejected/transparent overlays must not block any part of the shadow');assert(control.shadowEvidence.affectedBackgroundPixels>0);
 const point=p.projectPointWithDepth([-.25,-.5,0],preset.projection).point,x=Math.round(point[0]*control.viewport.scale+control.viewport.offsetX),y=Math.round(point[1]*control.viewport.scale+control.viewport.offsetY),img=loadImage(added.outputPath),index=(y*img.width+x)*4;
 assert([0,1,2].every(k=>img.data[index+k]<230),'real shadow must survive at transparent overlay edge location');
}
const hidden={...base,displayState:{mode:'hidden_line',edgeOpacity:1},renderQuality:{version:'iges-quality-v1',edges:'legacy'}};
const after=render(p,scene(false),hidden);require('./fixtures/iges-shadow-assert-baseline')(after,baseline,'legacyHiddenLine');const image=loadImage(after.outputPath);assert(image.data.some((v,i)=>i%4!==3&&v!==230),'hidden-line parity must contain visible edges');
assert.equal(count,5);console.log(JSON.stringify({passed:true,renderInvocations:count,outputDir:root,transparentAndQuantizedAndOccludedOverlaysExact:true,legacyHiddenLineParity:true}));
