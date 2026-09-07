#!/usr/bin/env python3
"""Private fixed-camera rendering review: before, each experiment, reference."""
import json,sys
from pathlib import Path
from PIL import Image,ImageOps,ImageDraw,ImageFont
source=Path(sys.argv[1]).resolve()
assert '.local' in source.parts
report=json.loads(source.read_text()); out=source.parent/'montages'; out.mkdir(exist_ok=True)
try: font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',16)
except OSError: font=ImageFont.load_default()
for asset in report['assets']:
 for view in asset['views']:
  cells=[('Before / '+str(view['beforeScore']['visual_fidelity_score']),view['before']['outputPath'])]
  cells += [(e['id']+' / '+str(e['comparison']['visual_fidelity_score']),e['render']['outputPath']) for e in view['experiments']]
  cells += [('Supplied reference',view['reference']['path'])]
  sheet=Image.new('RGB',(1200,650),'#edf0f4');d=ImageDraw.Draw(sheet);d.text((10,8),asset['id']+' / '+view['id']+' — fixed geometry, camera and dimensions',font=font,fill='black')
  for index,(label,file) in enumerate(cells):
   x=index%3*400;y=index//3*305+30;d.text((x+10,y+4),label,font=font,fill='black')
   im=ImageOps.contain(Image.open(file).convert('RGB'),(390,260));sheet.paste(im,(x+5+(390-im.width)//2,y+32+(260-im.height)//2))
  sheet.save(out/(asset['id']+'-'+view['id']+'.png'))
print(out)
