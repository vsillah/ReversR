const fs = require('fs');

const failures = [];
const fail = (message) => failures.push(message);
const exists = (path) => fs.existsSync(path);

const readPng = (path) => {
  const buffer = fs.readFileSync(path);
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error(`${path} is not a PNG file.`);
  }
  const colorType = buffer[25];
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colorType,
    hasAlpha: colorType === 4 || colorType === 6,
  };
};

const requiredAssets = [
  {
    label: 'Google Play feature graphic',
    path: 'docs/store-assets/google-play-feature-graphic.png',
    width: 1024,
    height: 500,
    requireNoAlpha: true,
  },
];

for (const asset of requiredAssets) {
  if (!exists(asset.path)) {
    fail(`Missing ${asset.label}: ${asset.path}. Run npm run store:assets:generate.`);
    continue;
  }

  try {
    const image = readPng(asset.path);
    if (image.width !== asset.width || image.height !== asset.height) {
      fail(`${asset.label} must be ${asset.width}x${asset.height}; found ${image.width}x${image.height}.`);
    }
    if (image.bitDepth !== 8) {
      fail(`${asset.label} must use 8-bit RGB channels; found bit depth ${image.bitDepth}.`);
    }
    if (asset.requireNoAlpha && image.hasAlpha) {
      fail(`${asset.label} must not include an alpha channel.`);
    }
  } catch (error) {
    fail(error.message);
  }
}

if (failures.length > 0) {
  console.error('Store assets preflight failed:');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log('Store assets preflight passed.');
