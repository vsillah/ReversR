#!/usr/bin/env python3
"""Create local, aspect-preserving QA contact sheets from a calibration report.
Requires Pillow; writes only beside the report under its ignored .local directory.
"""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

report_path = Path(sys.argv[1]).resolve()
assert '.local' in report_path.parts, 'Private report must live under .local'
report = json.loads(report_path.read_text())
output = report_path.parent / 'montages'
output.mkdir(exist_ok=True)
try:
    font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 15)
except OSError:
    font = ImageFont.load_default()
for asset in report['assets']:
    rows = []
    for view in asset['views']:
        row = Image.new('RGB', (960, 290), '#eef1f5')
        draw = ImageDraw.Draw(row)
        score = view.get('best', {}).get('comparison', {}).get('visual_fidelity_score') if view.get('best') else None
        draw.text((10, 8), f"{asset['id']} / {view['id']} | heuristic {view['baselineComparison']['visual_fidelity_score']} -> {score} | human review pending", fill='#132235', font=font)
        cells = [('Untuned IGES baseline', asset['baseline']['render']['outputPath']), ('Candidate (view preset)', view['best']['render']['outputPath'] if view.get('best') else None), ('Pinned reference view', view['referenceArtifact'])]
        for index, (label, image_path) in enumerate(cells):
            x = index * 320
            draw.text((x + 10, 38), label, fill='#132235', font=font)
            draw.rectangle((x + 8, 65, x + 312, 275), fill='white', outline='#bec6d0')
            if image_path:
                with Image.open(image_path) as source:
                    resized = ImageOps.contain(source.convert('RGB'), (300, 204), Image.Resampling.LANCZOS)
                    row.paste(resized, (x + 10 + (300 - resized.width) // 2, 68 + (204 - resized.height) // 2))
        row.save(output / f"{asset['id']}-{view['id']}.png")
        rows.append(row)
    if rows:
        sheet = Image.new('RGB', (960, 290 * len(rows)), '#eef1f5')
        for index, row in enumerate(rows):
            sheet.paste(row, (0, index * 290))
        sheet.save(output / f"{asset['id']}-contact.png")
print(output)
