const p = require('../../utils/igesSourcePipeline');
const mesh=positions=>({attributes:{position:{array:positions},normal:{array:[0,0,1,0,0,1,0,0,1]}},index:{array:[0,1,2]},brep_faces:[{first:0,last:0}]});
const caster=mesh([0,0,2,2,0,2,0,2,2]),frame=mesh([-2,-2,0,2,-2,0,-2,2,0]),transparent=mesh([-.75,-.5,0,.25,-.5,0,-.75,.25,0]),occluded=mesh([.25,.25,1,1.25,.25,1,.25,1.25,1]);
function scene(overlays){const meshes=overlays?[caster,frame,transparent,transparent,occluded]:[caster,frame];return {importResult:{meshes},sceneManifest:{nodes:meshes.map((_,i)=>({name:['caster','frame','zero','quantized','occluded'][i],meshes:[i]}))}};}
const base={...p.DEFAULT_RENDER_PRESET,width:160,height:160,margin:25,backgroundGradient:null,background:[230,230,230,255],projection:{mode:'basis',viewDirection:[0,0,1],upDirection:[0,1,0]},lightDirection:[1,1,2],displayState:{nodeStyles:{frame:{mode:'wireframe'},zero:{mode:'wireframe',opacity:0,edgeOpacity:0},quantized:{mode:'wireframe',opacity:0,edgeOpacity:.001},occluded:{mode:'wireframe',edgeOpacity:1,edgeLineWidth:2}}}};

module.exports = { p, scene, base };
