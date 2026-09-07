#!/usr/bin/env python3
"""Hash-checked review panels; references never enter source evaluation here."""
import hashlib,json,math,re,sys
from pathlib import Path
from PIL import Image,ImageOps,ImageDraw,ImageFont
reportfile=Path(sys.argv[1]).resolve();assert '.local' in reportfile.parts
report=json.loads(reportfile.read_text());assert all(re.fullmatch('[a-z0-9][a-z0-9-]{0,79}',a['id']) for a in report['assets'])
anchor=Path(*reportfile.parts[:reportfile.parts.index('.local')+1]);out=reportfile.parent/'visuals'
assert out.resolve().is_relative_to(anchor),'Visual output escapes private directory';out.mkdir(exist_ok=True)
try: font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',14)
except OSError: font=ImageFont.load_default()
reporthash=hashlib.sha256(reportfile.read_bytes()).hexdigest()
for asset in report['assets']:
 base=asset.get('baseline',{}).get('render',{})
 cells=[('Baseline',base.get('outputPath'),base.get('sha256'),None,None)]
 cells += [('Candidate view '+str(i),r['render']['outputPath'],r['render']['sha256'],None,None) for i,r in enumerate(asset['renders'])]
 refs=asset.get('references',[])
 for ref in refs:cells.append(('Reference: '+ref['role'],ref['path'],ref.get('sha256'),ref.get('crop'),ref.get('decodeError')))
 if not refs:cells.append(('No reference',None,None,None,'No reference supplied'))
 rows=math.ceil(len(cells)/3);sheet=Image.new('RGB',(1200,65+rows*310),'#eef1f4');draw=ImageDraw.Draw(sheet)
 draw.text((10,6),asset['id']+' | '+report['phase']+' | '+asset['status']+' | source score '+str(asset.get('baseline',{}).get('confidence',{}).get('score','unavailable')),font=font,fill='black')
 draw.text((10,25),'Manifest '+str(report.get('manifestHash','UNVERIFIED'))[:16]+' | experiment '+str(report.get('experimentId','legacy-unregistered'))[:36]+' | report '+reporthash[:16],font=font,fill='black')
 for i,(label,file,expected,crop,error) in enumerate(cells):
  x=i%3*400;y=i//3*310+55;draw.text((x+8,y),label,font=font,fill='black')
  try:
   assert not error,error
   assert file and expected,'No recorded image/hash'
   source=Path(file);assert source.stat().st_size<=8*1024*1024,'Image exceeds byte budget'
   assert hashlib.sha256(source.read_bytes()).hexdigest()==expected,'Image checksum mismatch'
   raw=Image.open(source);assert raw.width*raw.height<=4194304,'Image exceeds pixel budget';raw=raw.convert('RGB')
   if crop is not None:
    x0,y0,w,h=(crop[k] for k in ('x','y','width','height'))
    assert all(type(v) is int for v in (x0,y0,w,h)) and min(x0,y0)>=0 and min(w,h)>0 and x0+w<=raw.width and y0+h<=raw.height,'Invalid reference crop'
    raw=raw.crop((x0,y0,x0+w,y0+h))
   im=ImageOps.contain(raw,(390,270));sheet.paste(im,(x+5+(390-im.width)//2,y+26+(270-im.height)//2))
  except Exception as exc:
   text='Unavailable: '+str(exc)
   for line,start in enumerate(range(0,min(len(text),150),45)):draw.text((x+10,y+70+line*18),text[start:start+45],font=font,fill='#6c273b')
 sheet.save(out/(asset['id']+'.png'))
print(out)
