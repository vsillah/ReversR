// Explicit maintenance command only. Never called by the test suite or CI.
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),assert=require('assert/strict');
const c=require('./fixtures/iges-shadow-scenes'),o=require('./fixtures/iges-shadow-overlay-scenes');
const {loadImage}=require('../utils/igesVisualCalibration');
const output=process.argv[2];assert(output,'provide a new output JSON path');assert(!fs.existsSync(output),'refuse to overwrite a baseline');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
assert.equal(hash(path.join(__dirname,'../utils/igesSourcePipeline.js')),'848553cbc09f22c3dc38fba7cde8060f9210357f84a3e9124a566a0f0d7d6305','baseline generation requires pinned unmodified main renderer');
assert.equal(hash(path.join(__dirname,'../utils/igesRenderQuality.js')),'4b7624d6bc69635455b1a8bc3f35c0a03ca46cb6d1feae8cb291c84f4d20414f','baseline generation requires pinned quality module');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'iges-shadow-baseline-'));let count=0;
function render(s,preset,id){return c.p.renderSceneToPng({scene:s,sourceBinding:{sourceAsset:{id},resolverType:'synthetic',renderPreset:preset},outputDir:path.join(root,String(++count))});}
const records={};
function record(result){const image=loadImage(result.outputPath);return {sha256:result.sha256,rgbaSha256:crypto.createHash('sha256').update(image.data).digest('hex'),width:image.width,height:image.height};}
for(const edges of ['topology','legacy']){
 const preset={...c.preset,renderQuality:{...c.preset.renderQuality,edges,shadow:{normal:[0,0,1],offset:0,radiusPixels:1,opacity:.3}},displayState:{nodeStyles:{detail:{mode:'wireframe',edgeColor:[230,230,230,255],edgeLineWidth:2}}}};
 const result=render(c.scene(),preset,'generic-coverage'),image=loadImage(result.outputPath),point=c.p.projectPointWithDepth([-.2,-.5,0],preset.projection).point;
 const x=Math.round(point[0]*result.viewport.scale+result.viewport.offsetX),y=Math.round(point[1]*result.viewport.scale+result.viewport.offsetY),probe=[...image.data.slice((y*image.width+x)*4,(y*image.width+x)*4+4)];
 assert.notDeepEqual(probe,[230,230,230,255],'unmodified baseline must exhibit the coverage bug');
 records['background-'+edges]={...record(result),probe,probePosition:[x,y]};
}
records.ordinary=record(render(c.scene(),{...c.preset,renderQuality:undefined},'generic-coverage'));
records.legacyHiddenLine=record(render(o.scene(false),{...o.base,displayState:{mode:'hidden_line',edgeOpacity:1},renderQuality:{version:'iges-quality-v1',edges:'legacy'}},'generic-overlay'));
assert.equal(count,4);
fs.writeFileSync(output,JSON.stringify({version:1,runtime:{node:process.versions.node,zlib:process.versions.zlib},commit:'88322d764f516045c0f2f6032554410a409434d8',rendererSha256:'848553cbc09f22c3dc38fba7cde8060f9210357f84a3e9124a566a0f0d7d6305',qualitySha256:'4b7624d6bc69635455b1a8bc3f35c0a03ca46cb6d1feae8cb291c84f4d20414f',records},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,renderInvocations:count}));
