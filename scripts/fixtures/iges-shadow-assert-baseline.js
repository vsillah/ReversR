const assert=require('assert/strict'),crypto=require('crypto');
const {loadImage}=require('../../utils/igesVisualCalibration');
module.exports=(result,baseline,key)=>{
  const image=loadImage(result.outputPath),expected=baseline.records[key];
  assert.equal(image.width,expected.width);assert.equal(image.height,expected.height);
  assert.equal(crypto.createHash('sha256').update(image.data).digest('hex'),expected.rgbaSha256,key+' decoded RGBA bytes changed');
  // PNG compression can differ across Node/zlib versions; pixels must never differ.
  if(process.versions.node===baseline.runtime.node && process.versions.zlib===baseline.runtime.zlib) assert.equal(result.sha256,expected.sha256,key+' same-runtime PNG bytes changed');
};
