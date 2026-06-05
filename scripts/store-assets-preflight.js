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
    label: 'Google Play app icon',
    path: 'docs/store-assets/google-play-icon.png',
    width: 512,
    height: 512,
    requireNoAlpha: false,
  },
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

const phoneScreenshotPaths = [
  'docs/store-screenshots/google-play-phone/google-play-phone-01-welcome.png',
  'docs/store-screenshots/google-play-phone/google-play-phone-02-scan.png',
  'docs/store-screenshots/google-play-phone/google-play-phone-03-inventory-validation.png',
  'docs/store-screenshots/google-play-phone/google-play-phone-04-design-match.png',
  'docs/store-screenshots/google-play-phone/google-play-phone-05-build-handoff.png',
];

const validPhoneScreenshots = phoneScreenshotPaths.filter((screenshotPath) => {
  if (!exists(screenshotPath)) {
    fail(`Missing Google Play phone screenshot candidate: ${screenshotPath}`);
    return false;
  }
  try {
    const image = readPng(screenshotPath);
    const minSide = Math.min(image.width, image.height);
    const maxSide = Math.max(image.width, image.height);
    const ratio = maxSide / minSide;
    const validRatio = Math.abs(ratio - (16 / 9)) < 0.08;
    if (minSide < 320 || maxSide > 3840 || !validRatio) {
      fail(`${screenshotPath} must be a Play phone screenshot in 16:9 or 9:16 with each side from 320px to 3840px; found ${image.width}x${image.height}.`);
      return false;
    }
    return true;
  } catch (error) {
    fail(error.message);
    return false;
  }
});

if (validPhoneScreenshots.length < 2) {
  fail(`Google Play requires 2-8 phone screenshots; found ${validPhoneScreenshots.length} valid candidates.`);
}
if (validPhoneScreenshots.length < 4) {
  fail(`Google Play promotion eligibility expects at least 4 high-resolution phone screenshots; found ${validPhoneScreenshots.length}.`);
}

if (failures.length > 0) {
  console.error('Store assets preflight failed:');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log('Store assets preflight passed.');
