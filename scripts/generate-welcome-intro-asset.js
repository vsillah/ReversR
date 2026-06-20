#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const logo = path.join(root, 'assets/logo-transparent.png');
const outputDir = path.join(root, 'assets/welcome');
const videoOut = path.join(outputDir, 'reversr-welcome-intro.mp4');
const posterOut = path.join(outputDir, 'reversr-welcome-poster.png');

if (!fs.existsSync(logo)) {
  console.error(`Missing logo source: ${logo}`);
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });

const filter = [
  "[1:v]drawbox=x=0:y=0:w=1080:h=1920:color=0x04070dcc@0.38:t=fill",
  "drawbox=x=0:y=1120:w=1080:h=800:color=0x03060bd9@0.82:t=fill",
  "drawbox=x=0:y=0:w=1080:h=360:color=0x050911ee@0.52:t=fill",
  "drawbox=x=100:y=392:w=880:h=20:color=0x303a45cc@0.64:t=fill",
  "drawbox=x=144:y=421:w=792:h=3:color=0x28c6cfcc@0.18:t=fill",
  "drawbox=x=104:y=482:w=872:h=72:color=0x111923cc@0.62:t=fill",
  "drawbox=x=156:y=512:w=768:h=6:color=0xaeb7c1cc@0.18:t=fill",
  "drawbox=x=120:y=632:w=840:h=560:color=0x0b1119cc@0.44:t=fill",
  "drawbox=x=190:y=692:w=700:h=410:color=0x14202bcc@0.44:t=fill",
  "drawbox=x=184:y=1132:w=712:h=24:color=0x303a45cc@0.40:t=fill",
  "drawbox=x=250:y=1156:w=580:h=4:color=0x28c6cfaa@0.22:t=fill",
  "drawbox=x=92:y=604:w=164:h=566:color=0x101820ee@0.76:t=fill",
  "drawbox=x=128:y=642:w=92:h=178:color=0x263441cc@0.70:t=fill",
  "drawbox=x=824:y=604:w=164:h=566:color=0x101820ee@0.76:t=fill",
  "drawbox=x=860:y=642:w=92:h=178:color=0x263441cc@0.70:t=fill",
  "drawbox=x=498:y=438:w=84:h='if(lt(t,2.55),120+190*min(t/2.55,1),310)':color=0xb7c0c9cc@0.26:t=fill",
  "drawbox=x=516:y='if(lt(t,3.06),456+318*min(t/3.06,1),774)':w=48:h=132:color=0xc7d0d8cc@0.52:t=fill",
  "drawbox=x=424:y='if(lt(t,3.16),520+286*min(t/3.16,1),806)':w=232:h=32:color=0x202b36cc@0.90:t=fill",
  "drawbox=x='-368+min(t/1.42,1)*472':y=838:w=368:h=18:color=0xc8d0d8cc@0.58:t=fill",
  "drawbox=x='-304+min(t/1.42,1)*408':y=864:w=304:h=8:color=0x28c6cfcc@0.25:t=fill",
  "drawbox=x='-148+min(t/1.62,1)*338':y=748:w=148:h=138:color=0x17212bcc@0.88:t=fill",
  "drawbox=x='1080-min(max(t-0.76,0)/1.48,1)*452':y=960:w=360:h=18:color=0xc8d0d8cc@0.50:t=fill",
  "drawbox=x='1016-min(max(t-0.76,0)/1.48,1)*388':y=986:w=304:h=8:color=0x28c6cfcc@0.24:t=fill",
  "drawbox=x='1120-min(max(t-0.98,0)/1.58,1)*332':y=902:w=124:h=154:color=0x17212bcc@0.88:t=fill",
  "drawbox=x=0:y=1320:w=1080:h=600:color=0x03060bea@0.88:t=fill",
  "vignette=PI/4:0.72[bg]",
  "[0:v]format=rgba,scale=560:560[logo]",
  "[logo]split=6[fullSrc][glowSrc][leftSrc][topSrc][boltSrc][legSrc]",
  "[leftSrc]crop=201:375:24:101,fade=t=in:st=0.22:d=0.30:alpha=1[left]",
  "[topSrc]crop=305:185:132:67,fade=t=in:st=0.70:d=0.32:alpha=1[top]",
  "[legSrc]crop=228:241:280:268,fade=t=in:st=1.24:d=0.34:alpha=1[leg]",
  "[boltSrc]crop=193:193:180:180,loop=loop=-1:size=1:start=0,trim=duration=7.2,setpts=PTS-STARTPTS,rotate='if(lt(t,3.1),6.283185*2.0*t,6.283185*7.0*t)':c=none:ow=rotw(iw):oh=roth(ih),fade=t=in:st=2.28:d=0.22:alpha=1[bolt]",
  "[glowSrc]colorchannelmixer=rr=0:gg=0.78:bb=0.88:aa=0.55,boxblur=36:12,fade=t=in:st=4.12:d=0.40:alpha=1,fade=t=out:st=6.86:d=0.28:alpha=1[glow]",
  "[fullSrc]fade=t=in:st=3.86:d=0.50:alpha=1,fade=t=out:st=6.96:d=0.20:alpha=1[full]",
  "[bg][left]overlay=x='if(lt(t,1.38),-210+488*(t/1.38),278)':y='702-8*sin(min(t,1.38)/1.38*PI)':enable='between(t,0,6.95)'[v1]",
  "[v1][top]overlay=x='392+4*sin(t*2.2)':y='if(lt(t,0.66),-190,if(lt(t,1.92),-190+852*((t-0.66)/1.26),662))':enable='between(t,0.66,6.95)'[v2]",
  "[v2][leg]overlay=x='if(lt(t,1.05),1120,if(lt(t,2.86),1120-596*((t-1.05)/1.81),524))':y='if(lt(t,1.05),1024,if(lt(t,2.86),1024-174*((t-1.05)/1.81),850))':enable='between(t,1.05,6.95)'[v3]",
  "[v3][bolt]overlay=x='443+3*sin(t*9)':y='if(lt(t,2.22),574,if(lt(t,3.08),574+198*((t-2.22)/0.86),772))':enable='between(t,2.22,6.95)'[v4]",
  "[v4][glow]overlay=x=260:y=576:enable='between(t,4.12,7.15)'[v5]",
  "[v5][full]overlay=x=260:y='576+2*sin(t*1.8)':enable='between(t,3.86,7.15)'",
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
  '20',
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
