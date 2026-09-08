const p = require('../../utils/igesSourcePipeline');
const mesh = positions => ({ attributes: { position: { array: positions }, normal: { array: [0,0,1,0,0,1,0,0,1] } }, index: { array: [0,1,2] }, brep_faces: [{ first: 0, last: 0 }] });
const caster = mesh([0,0,2,2,0,2,0,2,2]);
const line = mesh([-.8,-.5,0,.4,-.5,0,-.8,.4,0]);
const scene = (extra = line) => ({ importResult: { meshes: [caster,extra] }, sceneManifest: { nodes: [{ name: 'caster', meshes: [0] }, { name: 'detail', meshes: [1] }] } });
const preset = { ...p.DEFAULT_RENDER_PRESET, width: 160, height: 160, margin: 25, backgroundGradient: null, background: [230,230,230,255], projection: { mode: 'basis', viewDirection: [0,0,1], upDirection: [0,1,0] }, lightDirection: [1,1,2], renderQuality: { version: 'iges-quality-v1', edges: 'topology' } };

module.exports = { p, mesh, scene, preset };
