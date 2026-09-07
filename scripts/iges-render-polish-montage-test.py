#!/usr/bin/env python3
"""Source-free crop/target regression; only synthetic colors are written."""
import json, subprocess, sys, tempfile
from pathlib import Path
from PIL import Image
with tempfile.TemporaryDirectory(prefix='iges-montage-') as tmp:
 root=Path(tmp)/'.local';root.mkdir()
 raw=Image.new('RGB',(100,100),'blue')
 raw.paste('red',(40,40,60,60));raw.save(root/'reference.png')
 Image.new('RGB',(100,100),'white').save(root/'render.png')
 view={'id':'crop','beforeScore':{'visual_fidelity_score':0},'before':{'outputPath':str(root/'render.png')},'reference':{'path':str(root/'reference.png'),'crop':{'x':40,'y':40,'width':20,'height':20}},'experiments':[{'id':str(i),'comparison':{'visual_fidelity_score':0},'render':{'outputPath':str(root/'render.png')}} for i in range(4)]}
 report={'assets':[{'id':'synthetic','views':[view]}]};file=root/'report.json';file.write_text(json.dumps(report))
 command=[sys.executable,str(Path(__file__).with_name('iges-render-polish-montage.py')),str(file)]
 subprocess.run(command,check=True,capture_output=True)
 sheet=Image.open(root/'montages/synthetic-crop.png')
 assert sheet.getpixel((1000,500)) == (255,0,0)
 assert (0,0,255) not in {sheet.getpixel((x,y)) for x in range(805,1195) for y in range(367,627)}, 'Raw sheet pixels leaked outside scored crop'
 view['reference']['crop']['width']=120;file.write_text(json.dumps(report))
 assert subprocess.run(command,capture_output=True).returncode != 0
 print('Montage crop target and invalid-crop regressions passed.')
