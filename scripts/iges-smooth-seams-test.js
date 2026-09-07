const assert=require('assert/strict'),p=require('../utils/igesSourcePipeline'),q=require('../utils/igesRenderQuality');
const preset={...p.DEFAULT_RENDER_PRESET,projection:{mode:'basis',viewDirection:[0,0,1],upDirection:[0,1,0]},renderQuality:{version:q.VERSION,edges:'topology',seamPolicy:'smooth-manifold-v1'}};
const flat={attributes:{position:{array:[0,0,0,1,0,0,1,1,0,0,0,0,1,1,0,0,1,0]},normal:{array:Array(6).fill([0,0,1]).flat()}},index:{array:[0,1,2,3,4,5]},brep_faces:[{first:0,last:0},{first:1,last:1}]};
const edges=(m,pr=preset)=>p.buildRenderableEdges([m],pr,new Map(),v=>v,1);
assert.equal(edges(flat).length,4);assert.equal(edges(flat).seamEvidence.suppressed,1);
assert.equal(edges(flat,{...preset,renderQuality:{version:q.VERSION,edges:'topology'}}).length,5);
const same=structuredClone(flat);same.brep_faces=[{first:0,last:1}];assert.equal(edges(same).length,4);assert.equal(edges(same).seamEvidence.suppressed,0);
const curved=structuredClone(flat);curved.attributes.position.array[5]=.05;curved.attributes.normal.array=[0,0,1,0,-.05,1,0,0,1,0,0,1,0,0,1,.05,0,1];assert.equal(edges(curved).seamEvidence.suppressed,1);
const crease=structuredClone(flat);crease.attributes.position.array[17]=2;assert.equal(edges(crease).seamEvidence.suppressed,0);assert(edges(crease).some(e=>e.classification.isCrease));
const missing=structuredClone(flat);delete missing.attributes.normal;assert.equal(edges(missing).length,5);
const normals=structuredClone(flat);normals.attributes.normal.array[9]=1;assert.equal(edges(normals).length,5);
const almost=structuredClone(flat);almost.attributes.position.array[9]=.000001;assert.equal(edges(almost).seamEvidence.suppressed,0,'Quantized coincidence is not exact topology');
const nonmanifold=structuredClone(flat);nonmanifold.index.array.push(0,2,5);nonmanifold.brep_faces.push({first:2,last:2});assert(edges(nonmanifold).some(e=>e.classification.isNonManifold));
const silhouettePreset={...preset,projection:{mode:'basis',viewDirection:[1,0,.001],upDirection:[0,0,1]}};assert.equal(edges(curved,silhouettePreset).seamEvidence.suppressed,0);assert(edges(curved,silhouettePreset).some(e=>e.classification.silhouette));
// Outer and hole loops of a planar ring remain boundaries; every split face join is smooth.
const ring={attributes:{position:{array:[-2,-2,0,2,-2,0,2,2,0,-2,2,0,-1,-1,0,1,-1,0,1,1,0,-1,1,0]},normal:{array:Array(8).fill([0,0,1]).flat()}},index:{array:[0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]},brep_faces:Array.from({length:8},(_,i)=>({first:i,last:i}))};
assert.equal(edges(ring).filter(e=>e.classification.isBoundary).length,8);assert.equal(edges(ring).length,8);
assert.throws(()=>q.validateQuality({version:q.VERSION,edges:'legacy',seamPolicy:'smooth-manifold-v1'}),/requires topology/);
assert.throws(()=>q.validateQuality({version:q.VERSION,edges:'topology',seamPolicy:'unknown'}),/requires topology/);
assert.equal(q.smoothManifoldJoin([{face:0,points:'same',normals:[[1],[1]]},{face:1,points:'same',normals:[[1],[1]]}]),false);
console.log('Smooth seam cases pass: planar split, curved join, crease, open/hole boundaries, duplicate vertices, missing normals, near-coincidence, nonmanifold and view-dependent silhouette.');
const duplicate=structuredClone(flat);duplicate.attributes.position.array=duplicate.attributes.position.array.slice(0,9).concat(duplicate.attributes.position.array.slice(0,9));assert.equal(edges(duplicate).length,3,'Same-winding duplicate faces stay visible');assert.equal(edges(duplicate).seamEvidence.suppressed,0);
const reverseDuplicate=structuredClone(duplicate);reverseDuplicate.index.array=[0,1,2,5,4,3];assert.equal(edges(reverseDuplicate).seamEvidence.suppressed,0);
const tangent=structuredClone(flat);tangent.attributes.position.array[17]=.1;tangent.attributes.normal.array=Array(6).fill([1,1,0]).flat();assert.equal(edges(tangent).length,5,'Tangent normals cannot erase shallow crease');
const overlap=structuredClone(flat);overlap.brep_faces=[{first:0,last:0},{first:0,last:1}];assert.equal(edges(overlap).length,5,'Overlapping face ownership stays visible');
for(const faces of [[{first:-1,last:1}],[{first:0,last:2}],[{first:1,last:0}],[{first:0.5,last:1}]]){const bad=structuredClone(flat);bad.brep_faces=faces;assert.equal(q.uniqueFaceOwnership(bad),null);assert.equal(edges(bad).seamEvidence.suppressed,0);}
console.log('Captain adversarial cases pass: oriented duplicate incidence, tangent normals, overlapping and malformed face ownership.');
