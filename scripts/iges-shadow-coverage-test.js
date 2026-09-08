const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
const { p, mesh, scene, preset } = require('./fixtures/iges-shadow-scenes');
const baseline = require('./fixtures/iges-shadow-baseline-loader')();
const { loadImage } = require('../utils/igesVisualCalibration');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'iges-shadow-coverage-'));
let ordinal = 0;
function render(renderer, sourceScene, value) { return renderer.renderSceneToPng({ scene: sourceScene, sourceBinding: { sourceAsset: { id: 'generic-coverage' }, resolverType: 'synthetic', renderPreset: value }, outputDir: path.join(root, String(++ordinal)) }); }
const shadow = value => ({ ...value, renderQuality: { ...value.renderQuality, shadow: { normal: [0,0,1], offset: 0, radiusPixels: 1, opacity: .3 } } });
function checkPair(s, value) {
  const before = render(p,s,value), after = render(p,s,shadow(value));
  const a = loadImage(before.outputPath), b = loadImage(after.outputPath); let backgroundChanges = 0;
  for (let i=0;i<a.data.length;i+=4) {
    if ([0,1,2].some(k=>a.data[i+k]!==230)) assert.deepEqual([...a.data.slice(i,i+4)],[...b.data.slice(i,i+4)],'pre-existing foreground changed');
    else if ([0,1,2].some(k=>a.data[i+k]!==b.data[i+k])) backgroundChanges++;
  }
  assert(backgroundChanges>0,'shadow must remain visible');
  assert.equal(before.sha256,after.geometryOnlyArtifact.sha256);
  assert.deepEqual(before.visibleMeshPixelCounts,after.visibleMeshPixelCounts);
  return { before, after };
}
for (const [edges,mode] of [['topology','shaded'],['legacy','shaded'],['topology','wireframe'],['topology','hidden_line']]) {
  checkPair(scene(),{ ...preset,renderQuality:{...preset.renderQuality,edges},displayState:{nodeStyles:{detail:{mode,edgeOpacity:.7}}} });
}
// A real drawn outline can equal the background color. Protect coverage, not RGB.
for (const edges of ['topology','legacy']) {
  const value={...preset,renderQuality:{...preset.renderQuality,edges},displayState:{nodeStyles:{detail:{mode:'wireframe',edgeColor:[230,230,230,255],edgeLineWidth:2}}}};
  const {before,after}=checkPair(scene(),value),a=loadImage(before.outputPath),b=loadImage(after.outputPath);
  const point=p.projectPointWithDepth([-.2,-.5,0],value.projection).point;
  const x=Math.round(point[0]*before.viewport.scale+before.viewport.offsetX),y=Math.round(point[1]*before.viewport.scale+before.viewport.offsetY),index=(y*a.width+x)*4;
  assert.deepEqual([...a.data.slice(index,index+4)],[230,230,230,255]);
  assert.deepEqual([...b.data.slice(index,index+4)],[230,230,230,255],'background-colored edge lost coverage');
  const failed = baseline.records['background-' + edges];
  assert.deepEqual(failed.probePosition, [x,y], 'baseline probe moved');
  assert.notDeepEqual(failed.probe, [230,230,230,255], 'baseline must reproduce the old bug');
  assert.notEqual(after.sha256, failed.sha256, 'fixed output must differ from the old bug baseline');
}
// Detail behind the caster must remain occluded rather than acquire false coverage.
checkPair(scene(mesh([0,0,0,2,0,0,0,2,0])),{...preset,displayState:{nodeStyles:{detail:{mode:'wireframe',edgeLineWidth:3}}}});
const ordinary={...preset,renderQuality:undefined};
require('./fixtures/iges-shadow-assert-baseline')(render(p,scene(),ordinary),baseline,'ordinary');
assert.equal(ordinal, 15);
console.log(JSON.stringify({passed:true,renderInvocations:ordinal,outputDir:root,backgroundColoredEdgeProtected:true,baselineFailureVerified:true}));
