# /// script
# requires-python = ">=3.10"
# dependencies = ["Pillow==11.3.0"]
# ///
"""Bake original cutting-mat artwork; build_desk.py invokes this through uv."""
from pathlib import Path
import math

from PIL import Image, ImageDraw, ImageFont

OUTPUT = Path(__file__).resolve().parents[1] / 'assets/blender/textures'
GREEN = '#0c775d'
INK = '#e2eee3'
HALF_INK = '#aecfbd'
GUIDE_INK = '#c8dfcd'


def build(name, width, height, columns, rows):
    # Two-times supersampling keeps numerals and oblique strokes clean in mipmaps.
    scale = 320
    size = (round(width * scale), round(height * scale))
    image = Image.new('RGB', size, GREEN)
    draw = ImageDraw.Draw(image)
    cell = min((width - .6) / columns, (height - .6) / rows)
    left = (width - columns * cell) / 2
    bottom = (height - rows * cell) / 2
    right, top = width - left, height - bottom
    font = ImageFont.load_default(size=round(.185 * scale))
    angle_font = ImageFont.load_default(size=round(.135 * scale))

    def point(x, y):
        return (round(x * scale), round((height - y) * scale))

    def line(a, b, color=INK, weight=.009):
        draw.line((point(*a), point(*b)), fill=color, width=max(1, round(weight * scale)))

    def label(text, x, y, small=False, knockout=False):
        xy = point(x, y)
        face = angle_font if small else font
        if knockout:
            bounds = draw.textbbox(xy, text, font=face, anchor='mm')
            pad = round(.035 * scale)
            draw.rectangle((bounds[0]-pad, bounds[1]-pad, bounds[2]+pad, bounds[3]+pad), fill=GREEN)
        draw.text(xy, text, fill=INK, font=face, anchor='mm')

    def dashed(a, b):
        dx, dy = b[0]-a[0], b[1]-a[1]
        length = math.hypot(dx, dy)
        start = 0
        while start < length:
            end = min(start + cell * .095, length)
            line((a[0]+dx*start/length, a[1]+dy*start/length),
                 (a[0]+dx*end/length, a[1]+dy*end/length), HALF_INK, .0055)
            start += cell * .17

    for column in range(columns):
        x = left + (column + .5) * cell
        dashed((x, bottom), (x, top))
    for row in range(rows):
        y = bottom + (row + .5) * cell
        dashed((left, y), (right, y))
    for column in range(columns + 1):
        x = left + column * cell
        line((x, bottom), (x, top))
    for row in range(rows + 1):
        y = bottom + row * cell
        line((left, y), (right, y))

    # Guides are measured in the same physical coordinate system as the grid.
    origin = (left, bottom)
    for angle in (15, 30, 45, 60, 75):
        radians = math.radians(angle)
        dx, dy = math.cos(radians), math.sin(radians)
        length = min((right-left)/dx, (top-bottom)/dy)
        end = (left+length*dx, bottom+length*dy)
        line(origin, end, GUIDE_INK, .008)
        label(f'{angle}°', left+(length-.42)*dx, bottom+(length-.42)*dy,
              small=True, knockout=True)

    # Descending bias guide and its measured intersections with the angle fan.
    start = max(0, columns-rows-1)
    span = min(rows, columns-start)
    line((left+start*cell, top), (left+(start+span)*cell, top-span*cell), GUIDE_INK, .009)
    for offset in (1, 2):
        shifted = start+offset
        span = min(rows, columns-shifted)
        dashed((left+shifted*cell, top), (left+(shifted+span)*cell, top-span*cell))
    for angle in (15, 30, 45):
        radians = math.radians(angle)
        u = (start+rows)/(1+math.tan(radians))
        v = u*math.tan(radians)
        if not (0 < u < columns and 0 < v < rows):
            continue
        x, y = left+u*cell, bottom+v*cell
        arc = [point(x+.40*cell*math.cos(math.radians(a)),
                     y+.40*cell*math.sin(math.radians(a)))
               for a in range(angle, 136)]
        draw.line(arc, fill=GUIDE_INK, width=round(.008*scale))
        middle = math.radians((angle+135)/2)
        label(f'{135-angle}°', x+.62*cell*math.cos(middle),
              y+.62*cell*math.sin(middle), small=True, knockout=True)
    label('INCH', right-.45*cell, top-.48*cell, small=True, knockout=True)

    # A genuine quarter-circle protractor, not an ellipse on the portrait mat.
    radius = cell * 4.0
    for r in (radius-.14, radius):
        arc = [point(left+r*math.cos(math.radians(step/2)),
                     bottom+r*math.sin(math.radians(step/2))) for step in range(181)]
        draw.line(arc, fill=GUIDE_INK, width=round(.009*scale))
    for angle in range(91):
        radians = math.radians(angle)
        tick = .14 if angle % 5 == 0 else .055
        line((left+(radius-tick)*math.cos(radians), bottom+(radius-tick)*math.sin(radians)),
             (left+radius*math.cos(radians), bottom+radius*math.sin(radians)), GUIDE_INK, .006)
        if angle % 10 == 0 and 0 < angle < 90:
            label(str(angle), left+(radius+.14)*math.cos(radians),
                  bottom+(radius+.14)*math.sin(radians), small=True, knockout=True)
            label(str(180-angle), left+(radius-.29)*math.cos(radians),
                  bottom+(radius-.29)*math.sin(radians), small=True, knockout=True)

    # Screenprint reset into the mat so interaction state cannot hide the artwork.
    patch_right, patch_bottom = left + cell, top - cell
    draw.rectangle((point(left, top), point(patch_right, patch_bottom)), fill=GREEN)
    line((left, patch_bottom), (patch_right, patch_bottom))
    line((patch_right, patch_bottom), (patch_right, top))
    def icon_point(x, y):
        return point(left + x * cell / 512, top - y * cell / 512)

    stroke = max(1, round(19 * cell * scale / 512))
    arc = [icon_point(256 + 124 * math.cos(a), 256 + 124 * math.sin(a))
           for a in [-math.pi * .75 + math.pi * 1.67 * i / 180 for i in range(181)]]
    arrow = [icon_point(x, y) for x, y in [(168, 106), (168, 168), (230, 168)]]
    for path in (arc, arrow):
        draw.line(path, fill=INK, width=stroke, joint='curve')
        for x, y in (path[0], path[-1]):
            r = stroke / 2
            draw.ellipse((x-r, y-r, x+r, y+r), fill=INK)

    # Four rulers: horizontal values increase left-to-right; vertical bottom-to-top.
    # Subdivisions are eighth-inches, confined to the outer border, not a dense grid.
    for index in range(columns * 8 + 1):
        x = left + index * cell / 8
        tick = .11 if index % 8 == 0 else .075 if index % 4 == 0 else .04
        for y, sign in ((bottom, -1), (top, 1)):
            line((x, y), (x, y + sign*tick), INK, .006)
    for index in range(rows * 8 + 1):
        y = bottom + index * cell / 8
        tick = .11 if index % 8 == 0 else .075 if index % 4 == 0 else .04
        for x, sign in ((left, -1), (right, 1)):
            line((x, y), (x + sign*tick, y), INK, .006)
    for column in range(columns + 1):
        x = left + column * cell
        label(str(column), x, bottom / 2 - .01)
        label(str(column), x, height - bottom / 2 + .01)
    for row in range(rows + 1):
        y = bottom + row * cell
        label(str(row), left / 2 - .01, y)
        label(str(row), width - left / 2 + .01, y)
    for a, b in (((left,bottom),(right,bottom)), ((right,bottom),(right,top)),
                 ((right,top),(left,top)), ((left,top),(left,bottom))):
        line(a, b, INK, .014)

    image = image.resize((size[0] // 2, size[1] // 2), Image.Resampling.LANCZOS)
    destination = OUTPUT / f'{name}-color.png'
    image.save(destination, optimize=True)
    print(f'MAT ARTWORK {destination.name}: {image.width} x {image.height}')


if __name__ == '__main__':
    OUTPUT.mkdir(parents=True, exist_ok=True)
    build('mat', 15, 10, 17, 11)
    build('mat-mobile', 8, 12, 9, 14)
