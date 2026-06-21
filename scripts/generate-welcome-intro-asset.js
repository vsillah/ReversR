#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const logo = path.join(root, 'assets/adaptive-icon.png');
const outputDir = path.join(root, 'assets/welcome');
const videoOut = path.join(outputDir, 'reversr-welcome-intro.mp4');
const posterOut = path.join(outputDir, 'reversr-welcome-poster.png');

if (!fs.existsSync(logo)) {
  console.error(`Missing logo source: ${logo}`);
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });

const filter = [
  "[1:v]drawgrid=width=108:height=108:thickness=1:color=0x28c6cf22@0.20",
  "drawbox=x=0:y=0:w=1080:h=620:color=0x04080dcc@0.76:t=fill",
  "drawbox=x=76:y=520:w=928:h=30:color=0x3b4650cc@0.52:t=fill",
  "drawbox=x=118:y=548:w=844:h=4:color=0x28c6cfcc@0.36:t=fill",
  "drawbox=x=96:y=594:w=210:h=460:color=0x111923cc@0.72:t=fill",
  "drawbox=x=132:y=626:w=138:h=156:color=0x273340cc@0.70:t=fill",
  "drawbox=x=786:y=628:w=224:h=430:color=0x111923cc@0.72:t=fill",
  "drawbox=x=820:y=660:w=148:h=150:color=0x273340cc@0.70:t=fill",
  "drawbox=x=160:y=1292:w=760:h=38:color=0x3b4650cc@0.42:t=fill",
  "drawbox=x=210:y=1332:w=660:h=4:color=0x28c6cfaa@0.34:t=fill",
  "drawbox=x='-360+min(t/1.65,1)*468':y=852:w=360:h=18:color=0xbfc7cfcc@0.58:t=fill",
  "drawbox=x='-318+min(t/1.65,1)*420':y=876:w=318:h=8:color=0x28c6cfcc@0.34:t=fill",
  "drawbox=x='-170+min(t/1.8,1)*380':y=774:w=156:h=124:color=0x1b2732cc@0.86:t=fill",
  "drawbox=x='-118+min(t/1.8,1)*380':y=890:w=54:h=86:color=0xb8c0c7cc@0.72:t=fill",
  "drawbox=x='1080-min(max(t-0.92,0)/1.65,1)*440':y=1054:w=360:h=18:color=0xbfc7cfcc@0.58:t=fill",
  "drawbox=x='1040-min(max(t-0.92,0)/1.65,1)*392':y=1078:w=318:h=8:color=0x28c6cfcc@0.34:t=fill",
  "drawbox=x='1140-min(max(t-1.05,0)/1.7,1)*372':y=984:w=124:h=154:color=0x1b2732cc@0.86:t=fill",
  "drawbox=x='1124-min(max(t-1.05,0)/1.7,1)*372':y=1026:w=42:h=90:color=0xb8c0c7cc@0.70:t=fill",
  "drawbox=x=70:y=1470:w=940:h=2:color=0x28c6cfa0@0.48:t=fill",
  "drawbox=x=260:y=1545:w=560:h=2:color=0xd8dde266@0.32:t=fill[bg]",
  "[0:v]format=rgba,scale=540:540[logo]",
  "[logo]split=6[fullSrc][glowSrc][leftSrc][topSrc][boltSrc][legSrc]",
  "[leftSrc]crop=194:362:23:97,fade=t=in:st=0.18:d=0.34:alpha=1[left]",
  "[topSrc]crop=294:178:127:65,fade=t=in:st=0.72:d=0.34:alpha=1[top]",
  "[legSrc]crop=220:232:270:259,fade=t=in:st=1.22:d=0.38:alpha=1[leg]",
  "[boltSrc]crop=186:186:174:174,loop=loop=-1:size=1:start=0,trim=duration=7.2,setpts=PTS-STARTPTS,rotate='if(lt(t,3.05),6.283185*2.8*t,6.283185*8.6*t)':c=none:ow=rotw(iw):oh=roth(ih),fade=t=in:st=2.38:d=0.22:alpha=1[bolt]",
  "[glowSrc]colorchannelmixer=rr=0:gg=0.74:bb=0.86:aa=0.62,boxblur=32:9,fade=t=in:st=4.35:d=0.50:alpha=1,fade=t=out:st=6.78:d=0.35:alpha=1[glow]",
  "[fullSrc]fade=t=in:st=4.00:d=0.58:alpha=1,fade=t=out:st=6.92:d=0.25:alpha=1[full]",
  "[bg][left]overlay=x='if(lt(t,1.45),-220+492*(t/1.45),272)':y='846-10*sin(min(t,1.45)/1.45*PI)':enable='between(t,0,6.95)'[v1]",
  "[v1][top]overlay=x='384+6*sin(t*2.4)':y='if(lt(t,0.62),-190,if(lt(t,2.0),-190+1002*((t-0.62)/1.38),812))':enable='between(t,0.62,6.95)'[v2]",
  "[v2][leg]overlay=x='if(lt(t,1.0),1118,if(lt(t,3.0),1118-612*((t-1.0)/2.0),506))':y='if(lt(t,1.0),1130,if(lt(t,3.0),1130-118*((t-1.0)/2.0),1012))':enable='between(t,1.0,6.95)'[v3]",
  "[v3][bolt]overlay=x='447+5*sin(t*10)':y='if(lt(t,2.34),720,if(lt(t,3.10),720+198*((t-2.34)/0.76),918))':enable='between(t,2.34,6.95)'[v4]",
  "[v4][glow]overlay=x=270:y=745:enable='between(t,4.35,7.15)'[v5]",
  "[v5][full]overlay=x=270:y='745+3*sin(t*2.0)':enable='between(t,4.00,7.15)'",
  "drawbox=x=210:y=1438:w=660:h=2:color=0x28c6cfa0@0.68:t=fill",
  "drawbox=x=300:y=1492:w=480:h=2:color=0xd8dde266@0.34:t=fill",
  "format=yuv420p[v]",
].join(',');

const videoArgs = [
  '-y',
  '-loop',
  '1',
  '-i',
  logo,
  '-f',
  'lavfi',
  '-i',
  'color=c=#05090f:s=1080x1920:d=7.2:r=30',
  '-filter_complex',
  filter,
  '-map',
  '[v]',
  '-t',
  '7.2',
  '-c:v',
  'libx264',
  '-preset',
  'medium',
  '-crf',
  '22',
  '-movflags',
  '+faststart',
  videoOut,
];

const posterArgs = [
  '-y',
  '-ss',
  '00:00:05.90',
  '-i',
  videoOut,
  '-frames:v',
  '1',
  '-update',
  '1',
  posterOut,
];

const run = (args) => {
  const result = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

run(videoArgs);
run(posterArgs);

console.log(`Wrote ${path.relative(root, videoOut)}`);
console.log(`Wrote ${path.relative(root, posterOut)}`);
