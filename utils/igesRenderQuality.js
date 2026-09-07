// Opt-in display-only helpers. Never mutate OCCT positions, indices or topology.
const VERSION = 'iges-quality-v1';
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const normalize = v => { const n = Math.hypot(...v); return n > 1e-12 && Number.isFinite(n) ? v.map(x => x/n) : [0,0,0]; };
const validateQuality = quality => {
  if (!quality) return;
  if (quality.version !== VERSION) throw new Error('Unsupported render quality version');
  if (quality.shading && !['occt-normals', 'flat'].includes(quality.shading)) throw new Error('Unsupported quality shading');
  if (quality.materialModel && quality.materialModel !== 'diffuse') throw new Error('Unsupported quality material model');
  if (quality.edges && !['topology', 'legacy'].includes(quality.edges)) throw new Error('Unsupported quality edges');
  if (quality.shadow) {
    const s = quality.shadow;
    if (!Array.isArray(s.normal) || s.normal.length !== 3 || !s.normal.every(Number.isFinite) || Math.hypot(...s.normal) < 1e-9 || !Number.isFinite(s.offset)) throw new Error('Shadow requires explicit finite source-space ground plane');
    if (!Number.isFinite(s.opacity) || s.opacity < 0 || s.opacity > 0.4 || !Number.isInteger(s.radiusPixels) || s.radiusPixels < 0 || s.radiusPixels > 24) throw new Error('Shadow opacity/radius outside bounded limits');
  }
};
const faceId = (mesh, triangleIndex) => (mesh.brep_faces || []).findIndex(face => triangleIndex >= face.first && triangleIndex <= face.last);
const shadingNormals = (mesh, triangleIndex, fallback) => {
  const normals = mesh.attributes?.normal?.array;
  const indices = mesh.index?.array;
  const result = [0,1,2].map(i => {
    const vertex = indices?.length ? indices[triangleIndex*3+i] : triangleIndex*3+i;
    const n = normals && [normals[vertex*3], normals[vertex*3+1], normals[vertex*3+2]];
    if (!n || !n.every(Number.isFinite) || Math.hypot(...n) < 1e-9) return fallback;
    const unit = normalize(n), alignment = dot(unit, fallback);
    // Reject ambiguous/near-tangent normals; preserve flat fallback instead of
    // smoothing across an unverified crease or changing mesh data.
    if (Math.abs(alignment) < 0.2) return fallback;
    return alignment < 0 ? unit.map(x => -x) : unit;
  });
  return result;
};
const diffuseColor = (normal, preset) => {
  const light = normalize(preset.lightDirection || [-0.35,-0.45,0.82]);
  const albedo = preset.material?.side || preset.foreground;
  const amount = 0.55 + 0.65 * Math.max(0, dot(normalize(normal), light));
  return [0,1,2].map(i => Math.round(Math.min(255, albedo[i]*amount))).concat(255);
};

// Depth changes across a single pixel on an adjacent triangle bound the small
// bias needed when a continuous edge is sampled onto integer raster pixels.
const depthSlope = triangle => {
  const [a,b,c] = triangle, dx1=b[0]-a[0], dy1=b[1]-a[1], dx2=c[0]-a[0], dy2=c[1]-a[1];
  const determinant=dx1*dy2-dx2*dy1;
  if (Math.abs(determinant)<1e-8) return 0;
  const z1=b[2]-a[2],z2=c[2]-a[2];
  return Math.hypot((z1*dy2-z2*dy1)/determinant,(dx1*z2-dx2*z1)/determinant);
};
const rasterLine = ({ pixels, width, height, start, end, color, zBuffer, tolerance = 0, lineWidth = 1, blend }) => {
  if (!Number.isFinite(lineWidth) || lineWidth <= 0 || lineWidth > 8) throw new Error('Quality line width must be in (0,8] pixels');
  const radius = lineWidth / 2 + 0.5, neighborhood = Math.ceil(radius);
  const dx=end[0]-start[0],dy=end[1]-start[1],length2=dx*dx+dy*dy;
  const steps=Math.max(1,Math.ceil(Math.sqrt(length2)*2)), seen=new Set();
  let covered=0;
  for(let k=0;k<=steps;k++) {
    const x=start[0]+dx*k/steps,y=start[1]+dy*k/steps;
    for(let oy=-neighborhood;oy<=neighborhood;oy++) for(let ox=-neighborhood;ox<=neighborhood;ox++) {
      const px=Math.floor(x)+ox,py=Math.floor(y)+oy;
      if(px<0||py<0||px>=width||py>=height) continue;
      const index=py*width+px;
      if(seen.has(index)) continue; seen.add(index);
      const t=length2 ? Math.max(0,Math.min(1,((px+0.5-start[0])*dx+(py+0.5-start[1])*dy)/length2)):0;
      const distance=Math.hypot(px+0.5-(start[0]+dx*t),py+0.5-(start[1]+dy*t));
      if(distance>=radius) continue;
      const depth=start[2]+(end[2]-start[2])*t;
      if(zBuffer && depth<zBuffer[index]-tolerance) continue;
      const alpha = Math.round(color[3]*Math.min(1,radius-distance));
      if (alpha <= 0) continue;
      blend(pixels,index*4,[...color.slice(0,3),alpha]); covered++;
    }
  }
  return covered;
};
const blurPass = (input, width, height, radius, horizontal) => {
  const out=new Float32Array(input.length), major=horizontal?height:width, minor=horizontal?width:height;
  const at=(m,n)=>horizontal?m*width+n:n*width+m;
  for(let m=0;m<major;m++) {
    let sum=0;
    for(let n=0;n<=radius&&n<minor;n++) sum+=input[at(m,n)];
    for(let n=0;n<minor;n++) {
      out[at(m,n)]=sum/(radius*2+1);
      if(n-radius>=0)sum-=input[at(m,n-radius)];
      if(n+radius+1<minor)sum+=input[at(m,n+radius+1)];
    }
  }
  return out;
};
const shadowMask = ({ triangles, toScreen, width, height, settings, lightDirection }) => {
  const normal=normalize(settings.normal), light=normalize(lightDirection), incidence=dot(normal,light);
  const mask=new Float32Array(width*height);
  if(incidence<=0.1) return { mask, status:'not_rendered_light_below_or_parallel_to_plane' };
  let outsideGround=0;
  for(const triangle of triangles) {
    const projected=triangle.map(point=>{
      const elevation=dot(normal,point)-settings.offset;
      if(elevation < -1e-5) outsideGround++;
      return toScreen(point.map((v,i)=>v-light[i]*elevation/incidence));
    });
    const [a,b,c]=projected, denominator=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
    if(Math.abs(denominator)<1e-8)continue;
    const minX=Math.max(0,Math.floor(Math.min(...projected.map(p=>p[0])))),maxX=Math.min(width-1,Math.ceil(Math.max(...projected.map(p=>p[0]))));
    const minY=Math.max(0,Math.floor(Math.min(...projected.map(p=>p[1])))),maxY=Math.min(height-1,Math.ceil(Math.max(...projected.map(p=>p[1]))));
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++) {
      const u=((b[1]-c[1])*(x+0.5-c[0])+(c[0]-b[0])*(y+0.5-c[1]))/denominator;
      const v=((c[1]-a[1])*(x+0.5-c[0])+(a[0]-c[0])*(y+0.5-c[1]))/denominator;
      if(u>=0&&v>=0&&u+v<=1)mask[y*width+x]=1;
    }
  }
  if(outsideGround)throw new Error('Shadow ground plane intersects visible source geometry');
  let blurred=mask;
  for(let pass=0;pass<3;pass++)for(const horizontal of [true,false])blurred=blurPass(blurred,width,height,settings.radiusPixels,horizontal);
  return { mask:blurred,status:mask.some(v=>v>0)?'rendered':'not_rendered_edge_on_ground',method:'directional triangle projection plus three separable box-blur passes' };
};
// Inverse of an orthonormal model rotation: columns are transformed source axes.
const sourceLight = (displayLight, transformedSourceAxes) => transformedSourceAxes.map(axis => dot(axis, displayLight));
module.exports={ sourceLight, VERSION,validateQuality,faceId,shadingNormals,diffuseColor,depthSlope,rasterLine,shadowMask,blurPass };
