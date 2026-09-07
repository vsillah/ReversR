import hashlib,json,subprocess,sys,tempfile
from pathlib import Path
from PIL import Image
with tempfile.TemporaryDirectory(prefix='generalization-montage-') as tmp:
 root=Path(tmp)/'.local';root.mkdir()
 raw=Image.new('RGB',(100,100),'blue');raw.paste('red',(40,40,60,60));raw.save(root/'reference.png')
 Image.new('RGB',(100,100),'white').save(root/'render.png')
 sha=lambda file:hashlib.sha256(file.read_bytes()).hexdigest()
 ref={'role':'verified_view','path':str(root/'reference.png'),'sha256':sha(root/'reference.png'),'crop':{'x':40,'y':40,'width':20,'height':20}}
 render={'outputPath':str(root/'render.png'),'sha256':sha(root/'render.png')}
 asset={'id':'synthetic','status':'warn','baseline':{'render':render},'renders':[{'render':render} for i in range(5)],'references':[ref]}
 file=root/'report.json';report={'phase':'synthetic','manifestHash':'a'*64,'experimentId':'test','assets':[asset]}
 command=[sys.executable,str(Path(__file__).with_name('iges-generalization-montage.py')),str(file)]
 def run():
  file.write_text(json.dumps(report));subprocess.run(command,check=True,capture_output=True);return Image.open(root/'visuals/synthetic.png')
 image=run();assert image.height>=980,'Seventh panel clipped';assert image.getpixel((200,820))==(255,0,0)
 assert (0,0,255) not in {image.getpixel((x,y)) for x in range(5,395) for y in range(730,940)}
 Image.new('RGB',(100,100),'blue').save(root/'render.png');image=run()
 assert image.getpixel((200,180))!=(0,0,255),'Tampered render displayed as valid'
 ref['crop']['width']=120;image=run();assert image.getpixel((200,820))!=(255,0,0),'Invalid crop displayed'
 (root/'reference.png').unlink();image=run();assert image.getpixel((200,820))!=(255,0,0),'Missing image not reported unavailable'
 print('Montage integrity passed: image hashes, crop, missing/tamper states and seven panels.')
