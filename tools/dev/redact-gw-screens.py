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

# ---------------------------------------------------------------------------------------------- DEVLOG #56
import json, os, subprocess, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))

def name_boxes(im):
    """The boxes around the player names of a fortress map, found by the app's own code (tools/dev/name-boxes.js)."""
    with tempfile.NamedTemporaryFile(suffix='.rgba', delete=False) as f:
        f.write(im.convert('RGBA').tobytes())
    try:
        return json.loads(subprocess.check_output(['node', os.path.join(HERE, 'name-boxes.js'), f.name, str(im.width), str(im.height)]))
    finally:
        os.unlink(f.name)

def is_cjk(s):
    return any(ord(ch) > 0x2fff for ch in s)

# 5) a maximized fortress map of a guild on the Japanese server whose names are in five kinds of writing: made-up
#    names of the same kinds where the real ones were, in the order the app finds them (badges, then the keep).
#    Simplified Chinese characters (龙, 乐) need the font's SC face (index 2).
if os.path.exists(f'{S}/map-wide.png'):
    im = Image.open(f'{S}/map-wide.png').convert('RGB')
    MADE_UP = ['りょうちゃん', 'ミカちゃま', 'sukiyaki2417', '和也', 'さくら', 'ティーナ', '龙猫乐乐']
    boxes = name_boxes(im)
    assert len(boxes) == len(MADE_UP), (len(boxes), 'names found on the map')
    for b in boxes:
        smear(im, (b['x0'] - 12, b['y0'] - 8, b['x1'] + 12, b['y1'] + 8), dark=0.72)
    for b, s in zip(boxes, MADE_UP):
        text(im, ((b['x0'] + b['x1']) // 2, (b['y0'] + b['y1']) // 2), s, 25 if is_cjk(s) else 24, font=CJK if is_cjk(s) else LAT, anchor='mm', ow=2, outline=(40, 44, 60), index=2 if s == '龙猫乐乐' else 0)
    im.save(f'{OUT}/steam-gw-map-mixed-scripts-wide.jpg', quality=92)
    print('mixed map ok')

# 6) an enemy STRONGHOLD screen (the banner "One of the two Defense Towers must be destroyed first…" pushes the teams
#    down): the player's name (Chinese characters), the small name over the season log and the six names in the log
if os.path.exists(f'{S}/enemy-cjk.png'):
    im = Image.open(f'{S}/enemy-cjk.png').convert('RGB')
    smear(im, (218, 228, 430, 266)); text(im, (224, 247), '龙猫乐乐', 27, font=CJK, ow=0, index=2)
    smear(im, (1350, 110, 1470, 140)); text(im, (1357, 126), '龙猫乐乐', 20, font=CJK, ow=0, index=2, fill=(170, 180, 200))
    for y, s in zip([246, 381, 516, 650, 784, 918], ['Rowan12', 'Birchwood', 'Rowan12', 'CedarFox', 'maple777', 'elm#4kq']):
        smear(im, (1698, y - 20, 1896, y + 18)); text(im, (1706, y), s, 25, ow=0)
    im.save(f'{OUT}/steam-gw-stronghold-cjk-wide.jpg', quality=92)
    print('stronghold ok')

# 7) the two check-in windows of a new day (nothing may be read from them): the guild one has a member's name and
#    message behind it; the daily one shows no names
if os.path.exists(f'{S}/guild-checkin.png'):
    im = Image.open(f'{S}/guild-checkin.png').convert('RGB')
    smear(im, (1340, 118, 1996, 188))
    im.save(f'{OUT}/steam-guild-checkin-wide.jpg', quality=88)
    Image.open(f'{S}/checkin.png').convert('RGB').save(f'{OUT}/steam-daily-checkin.jpg', quality=88)
    print('check-ins ok')
