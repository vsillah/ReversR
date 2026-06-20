#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'assets/welcome');
const videoOut = path.join(outputDir, 'reversr-welcome-intro.mp4');
const posterOut = path.join(outputDir, 'reversr-welcome-poster.png');

const args = process.argv.slice(2);

const usage = () => {
  console.log(`Usage:
  npm run welcome:asset:package -- <candidate.mp4> [--poster-at 0.1] [--dry-run]

Packages an approved Higgsfield/ReversR welcome-video candidate into the app asset paths:
  assets/welcome/reversr-welcome-intro.mp4
  assets/welcome/reversr-welcome-poster.png

The script validates the source, strips audio, encodes H.264/yuv420p with faststart,
and exports a poster frame from the requested timestamp.`);
};

if (args.includes('--help') || args.includes('-h')) {
  usage();
  process.exit(0);
}

const dryRun = args.includes('--dry-run');
const posterAtIndex = args.indexOf('--poster-at');
const posterAt = posterAtIndex >= 0 ? Number(args[posterAtIndex + 1]) : 6.2;
const inputArg = args.find((arg, index) => {
  if (arg.startsWith('--')) return false;
  if (index > 0 && args[index - 1] === '--poster-at') return false;
  return true;
});

if (!inputArg || Number.isNaN(posterAt)) {
  usage();
  process.exit(1);
}

const inputPath = path.resolve(process.cwd(), inputArg);

if (!fs.existsSync(inputPath)) {
  console.error(`Missing candidate video: ${inputPath}`);
  process.exit(1);
}

const run = (command, commandArgs, options = {}) => {
  const result = spawnSync(command, commandArgs, {
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });

  if (result.status !== 0) {
    if (options.capture && result.stderr) {
      console.error(result.stderr.trim());
    }
    process.exit(result.status ?? 1);
  }

  return result.stdout;
};

const probeJson = run(
  'ffprobe',
  [
    '-v',
    'error',
    '-show_streams',
    '-show_format',
    '-of',
    'json',
    inputPath,
  ],
  { capture: true },
);

let probe;
try {
  probe = JSON.parse(probeJson);
} catch (error) {
  console.error(`Could not parse ffprobe output for ${inputPath}`);
  process.exit(1);
}

const videoStream = (probe.streams || []).find((stream) => stream.codec_type === 'video');

if (!videoStream) {
  console.error(`No video stream found in ${inputPath}`);
  process.exit(1);
}

const width = Number(videoStream.width);
const height = Number(videoStream.height);
const duration = Number(probe.format?.duration || videoStream.duration || 0);
const aspect = width / height;
const targetAspect = 9 / 16;
const aspectDelta = Math.abs(aspect - targetAspect);

const failures = [];
const warnings = [];

if (!Number.isFinite(duration) || duration <= 0) {
  failures.push('duration could not be determined');
} else if (duration < 6.5 || duration > 8.5) {
  failures.push(`duration should be 7-8 seconds; found ${duration.toFixed(2)}s`);
}

if (aspectDelta > 0.035) {
  failures.push(`aspect should be 9:16; found ${width}x${height}`);
}

if (width < 1080 || height < 1920) {
  warnings.push(`source is below preferred app resolution: ${width}x${height}`);
}

if (posterAt <= 0 || (Number.isFinite(duration) && posterAt >= duration)) {
  failures.push(`poster timestamp ${posterAt}s must be inside the video duration`);
}

console.log('Candidate probe');
console.log(`- file: ${path.relative(root, inputPath)}`);
console.log(`- resolution: ${width}x${height}`);
console.log(`- duration: ${duration.toFixed(2)}s`);
console.log(`- poster frame: ${posterAt.toFixed(2)}s`);

if (warnings.length > 0) {
  console.warn('\nWarnings');
  warnings.forEach((warning) => console.warn(`- ${warning}`));
}

if (failures.length > 0) {
  console.error('\nRejected candidate');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

if (dryRun) {
  console.log('\nDry run passed. No app assets were changed.');
  process.exit(0);
}

fs.mkdirSync(outputDir, { recursive: true });

run('ffmpeg', [
  '-y',
  '-i',
  inputPath,
  '-vf',
  'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1',
  '-c:v',
  'libx264',
  '-profile:v',
  'high',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  '-an',
  '-b:v',
  '4M',
  videoOut,
]);

run('ffmpeg', [
  '-y',
  '-ss',
  String(posterAt),
  '-i',
  videoOut,
  '-frames:v',
  '1',
  '-update',
  '1',
  posterOut,
]);

console.log('\nPackaged welcome video candidate');
console.log(`- video: ${path.relative(root, videoOut)}`);
console.log(`- poster: ${path.relative(root, posterOut)}`);
