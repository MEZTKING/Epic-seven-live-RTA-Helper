# Replace real guild / player names in the owner's screenshots with made-up ones (the repository is public).
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
S = sys.argv[1]; OUT = sys.argv[2]
LAT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
CJK = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'

def smear(im, box, pad=6, dark=1.0):
    """Hide what is in the box: a heavily blurred copy of the picture around it (dark < 1: also darkened, so white
    letters drawn on it stand out as they do in the game)."""
    x0, y0, x1, y1 = box
    big = im.crop((x0 - 40, y0 - 40, x1 + 40, y1 + 40)).filter(ImageFilter.GaussianBlur(18))
    if dark < 1:
        big = big.point(lambda v: int(v * dark))
    im.paste(big.crop((40, 40, 40 + x1 - x0, 40 + y1 - y0)), (x0, y0))

def text(im, xy, s, size, font=LAT, anchor='lm', fill=(255, 255, 255), outline=(20, 20, 30), ow=2, index=0):
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype(font, size, index=index)
    d.text(xy, s, font=f, fill=fill, anchor=anchor, stroke_width=ow, stroke_fill=outline)

# 1) overview of a running war
im = Image.open(f'{S}/overview.png').convert('RGB')
smear(im, (52, 368, 176, 412)); text(im, (58, 390), 'TestHome', 23)
smear(im, (52, 778, 208, 822)); text(im, (58, 800), 'NightOwls', 23)
im.save(f'{OUT}/steam-gw-overview-war-wide.jpg', quality=90)

# 2) the VS screen
im = Image.open(f'{S}/vs.png').convert('RGB')
smear(im, (380, 708, 535, 748)); text(im, (457, 728), 'TestHome', 30, anchor='mm')
smear(im, (1445, 708, 1640, 748)); text(im, (1541, 728), 'NightOwls', 30, anchor='mm')
im.save(f'{OUT}/steam-gw-versus-wide.jpg', quality=90)

# 3) the guild hall ("Guild War in progress"): guild name, a member's name and message
im = Image.open(f'{S}/hall.png').convert('RGB')
smear(im, (60, 318, 200, 358)); text(im, (128, 338), 'TestHome', 28, anchor='mm')
smear(im, (1355, 128, 1815, 240)); text(im, (1366, 148), 'SomeMember', 26, fill=(190, 210, 230)); text(im, (1366, 196), 'A made-up guild notice', 28)
im.save(f'{OUT}/steam-gw-hall-wide.jpg', quality=88)
print('ok')

# 4) a fortress map in a small window (title bar included), enemy guild on the Japanese server: made-up names in
#    katakana, hiragana, kanji and Latin letters with digits, where the real names were
im = Image.open(f'{S}/map-small.png').convert('RGB')
NAMES = [((350, 204), 'ハナコサン'), ((880, 305), 'みどりかわ'), ((708, 397), '山田太郎'), ((276, 488), 'moonpie77'), ((506, 334), 'KeepJP1')]
for (cx, cy), s in NAMES:
    smear(im, (cx - 70, cy - 13, cx + 70, cy + 13), dark=0.72)
for (cx, cy), s in NAMES:
    text(im, (cx, cy), s, 17, font=CJK if any(ord(ch) > 0x2fff for ch in s) else LAT, anchor='mm', ow=1, outline=(40, 44, 60))
im.save(f'{OUT}/steam-gw-map-vortex-jp-window.png')
print('map ok')
