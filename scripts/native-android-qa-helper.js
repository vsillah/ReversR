const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const args = process.argv.slice(2);
const evidencePath = process.env.NATIVE_QA_EVIDENCE_FILE || 'docs/native-qa-evidence.json';
const probePath = process.env.NATIVE_ANDROID_PROBE_FILE || 'docs/native-android-device-probe.json';
const packageName = 'com.vsillah.reversrrebuild';

const screenshotFiles = {
  welcome: 'android-01-welcome.png',
  scan: 'android-02-scan.png',
  'inventory-validation': 'android-03-inventory-validation.png',
  'design-match': 'android-04-design-match.png',
  'build-handoff': 'android-05-build-handoff.png',
};

const usage = () => {
  console.log(`Native Android QA helper

Usage:
  node scripts/native-android-qa-helper.js --probe
  node scripts/native-android-qa-helper.js --launch
  node scripts/native-android-qa-helper.js --capture <${Object.keys(screenshotFiles).join('|')}>

Environment:
  NATIVE_QA_TESTER=Name used when updating docs/native-qa-evidence.json
  NATIVE_QA_EVIDENCE_FILE=alternate evidence JSON path
  NATIVE_ANDROID_PROBE_FILE=alternate probe JSON output path
`);
};

const run = (command, commandArgs, options = {}) => {
  const result = spawnSync(command, commandArgs, {
    encoding: options.encoding || 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`);
  }
  return result.stdout;
};

const runBuffer = (command, commandArgs) => execFileSync(command, commandArgs, { maxBuffer: 10 * 1024 * 1024 });

const now = () => new Date().toISOString();
const mkdirFor = (filePath) => fs.mkdirSync(path.dirname(filePath), { recursive: true });
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJson = (filePath, value) => {
  mkdirFor(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const parseDevices = (output) => output
  .split('\n')
  .slice(1)
  .map(line => line.trim())
  .filter(Boolean)
  .map(line => {
    const [serial, state, ...details] = line.split(/\s+/);
    return { serial, state, details: details.join(' ') };
  });

const getDevice = () => {
  const adbPath = run('which', ['adb']).trim();
  const devices = parseDevices(run(adbPath, ['devices', '-l']));
  const requestedSerial = process.env.ANDROID_SERIAL;
  const readyDevices = devices.filter(device => (
    device.state === 'device' &&
    (!requestedSerial || device.serial === requestedSerial)
  ));
  if (readyDevices.length !== 1) {
    const serialHint = requestedSerial ? ` for ANDROID_SERIAL=${requestedSerial}` : '';
    throw new Error(`Expected exactly one adb device${serialHint}, found ${readyDevices.length}. adb devices: ${JSON.stringify(devices)}`);
  }
  return { adbPath, device: readyDevices[0], devices };
};

const getProp = (adbPath, serial, prop) => run(adbPath, ['-s', serial, 'shell', 'getprop', prop]).trim();

const getDeviceSummary = () => {
  const { adbPath, device, devices } = getDevice();
  const model = getProp(adbPath, device.serial, 'ro.product.model');
  const manufacturer = getProp(adbPath, device.serial, 'ro.product.manufacturer');
  const osVersion = getProp(adbPath, device.serial, 'ro.build.version.release');
  return {
    checkedAt: now(),
    adbPath,
    devices,
    selectedDevice: {
      serial: device.serial,
      state: device.state,
      details: device.details,
      manufacturer,
      model,
      osVersion,
      label: [manufacturer, model, `Android ${osVersion}`].filter(Boolean).join(' '),
    },
  };
};

const updateAndroidBuildEvidence = (summary) => {
  const evidence = readJson(evidencePath);
  updateAndroidBuildFields(evidence, summary);
  writeJson(evidencePath, evidence);
};

const updateAndroidBuildFields = (evidence, summary) => {
  const androidPreview = evidence.builds?.androidPreview;
  if (androidPreview) {
    androidPreview.device = summary.selectedDevice.label;
    androidPreview.osVersion = summary.selectedDevice.osVersion;
    androidPreview.tester = process.env.NATIVE_QA_TESTER || process.env.USER || '';
    const note = `Android device probe captured at ${summary.checkedAt}.`;
    if (!androidPreview.notes.includes(note)) {
      androidPreview.notes = `${androidPreview.notes} ${note}`.trim();
    }
  }
};

const probe = () => {
  const summary = getDeviceSummary();
  writeJson(probePath, summary);
  updateAndroidBuildEvidence(summary);
  console.log(`Android device probe written: ${path.resolve(probePath)}`);
  console.log(`Native QA evidence updated: ${path.resolve(evidencePath)}`);
};

const launch = () => {
  const summary = getDeviceSummary();
  run(summary.adbPath, ['-s', summary.selectedDevice.serial, 'shell', 'monkey', '-p', packageName, '1']);
  writeJson(probePath, summary);
  console.log(`Launched ${packageName} on ${summary.selectedDevice.label}.`);
};

const capture = (id) => {
  if (!screenshotFiles[id]) {
    throw new Error(`Unknown screenshot id "${id}". Expected one of: ${Object.keys(screenshotFiles).join(', ')}`);
  }
  const summary = getDeviceSummary();
  const outPath = path.join('docs', 'store-screenshots', 'native', screenshotFiles[id]);
  mkdirFor(outPath);
  const png = runBuffer(summary.adbPath, ['-s', summary.selectedDevice.serial, 'exec-out', 'screencap', '-p']);
  fs.writeFileSync(outPath, png);

  const evidence = readJson(evidencePath);
  const screenshot = (evidence.screenshots || []).find(item => item.id === id);
  if (!screenshot?.android) {
    throw new Error(`Could not find android screenshot evidence entry for "${id}".`);
  }
  updateAndroidBuildFields(evidence, summary);
  screenshot.android.status = 'pass';
  screenshot.android.file = outPath;
  screenshot.android.device = summary.selectedDevice.label;
  screenshot.android.capturedAt = summary.checkedAt;
  screenshot.android.notes = `Captured from connected Android preview build with adb screencap.`;
  writeJson(evidencePath, evidence);
  writeJson(probePath, summary);
  console.log(`Captured ${id}: ${path.resolve(outPath)}`);
  console.log(`Native QA evidence updated: ${path.resolve(evidencePath)}`);
};

try {
  if (args.length === 0 || args.includes('--help')) {
    usage();
  } else if (args[0] === '--probe') {
    probe();
  } else if (args[0] === '--launch') {
    launch();
  } else if (args[0] === '--capture') {
    capture(args[1]);
  } else {
    throw new Error(`Unknown command: ${args.join(' ')}`);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
