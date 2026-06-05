const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const WIDTH = 1080;
const HEIGHT = 1920;
const INPUTS = [
  ['android-01-welcome.png', 'google-play-phone-01-welcome.png'],
  ['android-02-scan.png', 'google-play-phone-02-scan.png'],
  ['android-03-inventory-validation.png', 'google-play-phone-03-inventory-validation.png'],
  ['android-04-design-match.png', 'google-play-phone-04-design-match.png'],
  ['android-05-build-handoff.png', 'google-play-phone-05-build-handoff.png'],
];

const sourceDir = path.join('docs', 'store-screenshots', 'native');
const outputDir = path.join('docs', 'store-screenshots', 'google-play-phone');

const readPng = (filePath) => PNG.sync.read(fs.readFileSync(filePath));
const writePng = (filePath, png) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, PNG.sync.write(png));
};

const makeCanvas = () => {
  const png = new PNG({ width: WIDTH, height: HEIGHT });
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = 10;
    png.data[index + 1] = 10;
    png.data[index + 2] = 10;
    png.data[index + 3] = 255;
  }
  return png;
};

const sampleNearest = (source, x, y) => {
  const clampedX = Math.min(source.width - 1, Math.max(0, Math.round(x)));
  const clampedY = Math.min(source.height - 1, Math.max(0, Math.round(y)));
  return (clampedY * source.width + clampedX) * 4;
};

const compositeContained = (source, canvas) => {
  const scale = Math.min(WIDTH / source.width, HEIGHT / source.height);
  const drawWidth = Math.round(source.width * scale);
  const drawHeight = Math.round(source.height * scale);
  const offsetX = Math.floor((WIDTH - drawWidth) / 2);
  const offsetY = Math.floor((HEIGHT - drawHeight) / 2);

  for (let y = 0; y < drawHeight; y += 1) {
    for (let x = 0; x < drawWidth; x += 1) {
      const sourceIndex = sampleNearest(source, x / scale, y / scale);
      const targetIndex = ((offsetY + y) * WIDTH + (offsetX + x)) * 4;
      canvas.data[targetIndex] = source.data[sourceIndex];
      canvas.data[targetIndex + 1] = source.data[sourceIndex + 1];
      canvas.data[targetIndex + 2] = source.data[sourceIndex + 2];
      canvas.data[targetIndex + 3] = 255;
    }
  }
};

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: 'pass',
  outputDirectory: outputDir,
  targetSize: {
    width: WIDTH,
    height: HEIGHT,
  },
  source: 'docs/store-screenshots/native',
  screenshots: [],
  note: 'Google Play requires phone screenshots in 16:9 or 9:16. These upload-ready screenshots preserve the full native Pixel capture inside a 1080x1920 canvas without cropping.',
};

for (const [inputName, outputName] of INPUTS) {
  const inputPath = path.join(sourceDir, inputName);
  const outputPath = path.join(outputDir, outputName);
  const source = readPng(inputPath);
  const canvas = makeCanvas();
  compositeContained(source, canvas);
  writePng(outputPath, canvas);
  manifest.screenshots.push({
    source: inputPath,
    output: outputPath,
    sourceSize: {
      width: source.width,
      height: source.height,
    },
    outputSize: {
      width: WIDTH,
      height: HEIGHT,
    },
  });
}

const manifestPath = path.join(outputDir, 'manifest.json');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Generated ${INPUTS.length} Google Play phone screenshots in ${outputDir}.`);
console.log(`Manifest: ${manifestPath}`);
