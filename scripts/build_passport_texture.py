# /// script
# requires-python = ">=3.10"
# dependencies = ["Pillow==11.3.0"]
# ///
"""Bake passport cover and reading spreads from public profile / supplied travel data."""
from pathlib import Path
import json
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/blender/textures'
OUTPUT = ROOT / 'public/textures/passport'
CONTENT = json.loads((ROOT / 'src/passport-content.json').read_text())
W, H = 1024, 1360
NAVY, GOLD, INK = '#142439', '#c8ad6d', '#263b4c'
# Public-domain US emblem, rasterized from Wikimedia's Great Seal (obverse).
# https://upload.wikimedia.org/wikipedia/commons/5/5c/Great_Seal_of_the_United_States_%28obverse%29.svg
SEAL = Image.open(SOURCE / 'us-seal.png').convert('RGB')


def font(size):
    return ImageFont.load_default(size=size)


def text(draw, xy, value, size=36, fill=INK, anchor=None):
    draw.text(xy, value, font=font(size), fill=fill, anchor=anchor)


def paragraph(draw, value, y, size=36, width=1156):
    line = ''
    for word in value.split():
        candidate = f'{line} {word}'.strip()
        if draw.textlength(candidate, font=font(size)) > width and line:
            text(draw, (102, y), line, size)
            y += size * 1.4
            line = word
        else:
            line = candidate
    text(draw, (102, y), line, size)
    return y + size * 1.4


def paper(folio, side):
    W, H = 1360, 1024
    image = Image.new('RGB', (W, H), '#e9ecdc')
    draw = ImageDraw.Draw(image)
    # Fine security-paper linework; gentle contrast keeps real text legible.
    for base in range(-100, H + 100, 15):
        points = [(x, base + 23 * math.sin(x / 53) + 12 * math.cos(x / 117))
                  for x in range(0, W + 1, 4)]
        draw.line(points, fill='#cedaca', width=1)
    for r in range(140, 370, 9):
        draw.ellipse((W/2-r, H/2-r, W/2+r, H/2+r), outline='#d5d9c7', width=1)
    gutter_y = 0 if side == 'right' else H - 1
    for y in range(35):
        shade = round(175 + y * 1.7)
        draw.line((0, abs(gutter_y-y), W, abs(gutter_y-y)), fill=(shade, shade+4, shade-6))
    text(draw, (W/2, 930), 'PERSONAL PORTFOLIO · NOT A TRAVEL DOCUMENT', 22, anchor='mm')
    text(draw, (W/2, 975), str(folio).zfill(2), 25, anchor='mm')
    return image, draw


def save_page(image, spread, side):
    # The booklet rotates clockwise into its horizontal-hinge reading position.
    image.transpose(Image.Transpose.ROTATE_90).save(
        OUTPUT / f'{spread}-{side}.jpg', quality=92, optimize=True)


def build():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    cover = Image.new('RGB', (W, H), NAVY)
    draw = ImageDraw.Draw(cover)
    text(draw, (W/2, 200), 'PASSPORT', 86, GOLD, 'mm')
    text(draw, (W/2, 1010), 'UNITED STATES', 54, GOLD, 'mm')
    text(draw, (W/2, 1090), 'OF AMERICA', 54, GOLD, 'mm')
    # Retain the sourced eagle's linework in a single foil ink.
    edges = ImageOps.grayscale(SEAL).filter(ImageFilter.FIND_EDGES)
    edges = edges.point(lambda p: min(255, p * 3)).resize((510, 510), Image.Resampling.LANCZOS)
    cover.paste(Image.new('RGB', edges.size, GOLD), (257, 390), edges)
    draw.rectangle((445, 1180, 579, 1260), outline=GOLD, width=5)
    draw.ellipse((488, 1197, 536, 1245), outline=GOLD, width=5)
    draw.line((446, 1220, 488, 1220), fill=GOLD, width=5)
    draw.line((536, 1220, 578, 1220), fill=GOLD, width=5)
    cover.save(SOURCE / 'passport-cover-color.jpg', quality=95, optimize=True)

    image, draw = paper(2, 'right')
    text(draw, (680, 115), 'UNITED STATES OF AMERICA', 48, anchor='mm')
    text(draw, (680, 180), 'PERSONAL PASSPORT', 28, anchor='mm')
    portrait = ImageOps.fit(Image.open(SOURCE / 'github-profile.jpg').convert('RGB'),
                            (360, 440), Image.Resampling.LANCZOS, centering=(.5, .35))
    image.paste(portrait, (102, 275))
    text(draw, (530, 280), 'NAME', 28)
    text(draw, (530, 330), CONTENT['name'], 58)
    text(draw, (530, 440), 'GENDER', 28)
    text(draw, (530, 490), CONTENT['gender'], 54)
    text(draw, (530, 610), 'PROFILE', 28)
    text(draw, (530, 660), CONTENT['profile'].removeprefix('https://'), 40)
    text(draw, (102, 825), 'A little about me. A record of where I go.', 36)
    save_page(image, 0, 'right')

    image, draw = paper(1, 'left')
    text(draw, (102, 120), 'Hello, I’m Adam.', 64)
    y = 260
    for value in CONTENT['biography']:
        y = paragraph(draw, value, y, 42) + 45
    text(draw, (102, 840), 'Turn the page for travel stamps.', 34)
    save_page(image, 0, 'left')

    stamps = CONTENT['stamps']
    for spread in range(max(1, math.ceil(len(stamps) / 4))):
        for side_index, side in enumerate(('left', 'right')):
            image, draw = paper(spread * 2 + side_index + 3, side)
            text(draw, (680, 140), 'VISAS', 60, anchor='mm')
            text(draw, (680, 205), 'TRAVEL STAMPS', 28, anchor='mm')
            page_stamps = stamps[spread*4+side_index*2:spread*4+side_index*2+2]
            for index, stamp in enumerate(page_stamps):
                x, y = 90 + index * 620, 350
                color = '#354f68' if index == 0 else '#79514b'
                draw.rounded_rectangle((x, y, x+560, y+330), radius=30, outline=color, width=6)
                text(draw, (x+280, y+85), stamp['country'].upper(), 38, color, 'mm')
                text(draw, (x+280, y+165), stamp['place'], 34, color, 'mm')
                text(draw, (x+280, y+250), stamp['date'], 32, color, 'mm')
            if not stamps and side == 'left':
                text(draw, (680, 540), 'No travel stamps added yet.', 38, anchor='mm')
            save_page(image, spread+1, side)
    print(f'PASSPORT ARTWORK: cover and {2 + max(1, math.ceil(len(stamps) / 4))*2} pages')


if __name__ == '__main__':
    build()
