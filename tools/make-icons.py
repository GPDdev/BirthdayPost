from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
canvas = Image.new("RGB", (1024, 1024), "#963b37")
ink = "#fff3df"
draw = ImageDraw.Draw(canvas)
for x in range(78, 964, 56):
    for y in (70, 930):
        draw.ellipse((x, y, x+16, y+16), fill=ink)
for y in range(126, 915, 56):
    for x in (78, 934):
        draw.ellipse((x, y, x+16, y+16), fill=ink)
draw.rounded_rectangle((195, 395, 829, 755), radius=16, outline=ink, width=28)
draw.line([(205, 408), (512, 618), (818, 408)], fill=ink, width=28, joint="curve")
for x, y in [(380, 304), (451, 230)]:
    draw.rounded_rectangle((x, y, 1024-x, y+23), radius=11, fill=ink)
canvas.save(root / "assets/postmark.ico", sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
icons = root / "ios/BirthdayPost/Assets.xcassets/AppIcon.appiconset"
icons.mkdir(parents=True, exist_ok=True)
canvas.save(icons / "AppIcon.png")
