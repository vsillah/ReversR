const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const crypto = require('crypto');
module.exports = () => {
  const raw = fs.readFileSync(path.join(__dirname, 'iges-shadow-baseline.json'));
  assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), '7cc78b22229645b97ded99f455ad22ab801ddb01c4786bedb4f38226eec2e85f', 'invalid shadow baseline bytes');
  const value = JSON.parse(raw);
  assert.equal(value.version, 1);
  assert.equal(value.commit, '88322d764f516045c0f2f6032554410a409434d8');
  for (const key of ['background-topology','background-legacy','ordinary','legacyHiddenLine']) {
    assert.match(value.records[key].sha256, /^[a-f0-9]{64}$/);
    assert.match(value.records[key].rgbaSha256, /^[a-f0-9]{64}$/);
    assert.equal(value.records[key].width,160);
    assert.equal(value.records[key].height,160);
  }
  for (const key of ['background-topology','background-legacy']) {
    assert.equal(value.records[key].probe.length, 4);
    assert(value.records[key].probe.every(v => Number.isInteger(v) && v >= 0 && v <= 255));
  }
  return value;
};
