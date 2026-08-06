#!/usr/bin/env python3
"""
Generates the PWA icon set into public/icons/ from a single vector-ish drawing.

We have no SVG rasteriser in this environment, so the brand mark (an angular
"flow" glyph echoing public/favicon.svg) is drawn directly with Pillow at high
supersampling and downscaled for clean edges. Colours come from the brand:
purple #863bff on a light card, white glyph.

Run:  python3 scripts/gen-icons.py
"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
os.makedirs(OUT, exist_ok=True)

BRAND = (134, 59, 255, 255)     # #863bff
WHITE = (255, 255, 255, 255)
SS = 4                          # supersample factor


def rounded(size, radius, fill):
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=fill)
    return im


def draw_mark(im, cx, cy, scale):
    """Angular twin-parallelogram 'flow' glyph, centred on (cx, cy)."""
    d = ImageDraw.Draw(im)
    u = scale
    # top parallelogram
    top = [(cx - 1.7 * u, cy - 2.2 * u), (cx + 1.9 * u, cy - 2.2 * u),
           (cx + 0.2 * u, cy - 0.1 * u), (cx - 3.4 * u, cy - 0.1 * u)]
    # bottom parallelogram, offset for the interlocking look
    bot = [(cx - 0.2 * u, cy + 0.1 * u), (cx + 3.4 * u, cy + 0.1 * u),
           (cx + 1.7 * u, cy + 2.2 * u), (cx - 1.9 * u, cy + 2.2 * u)]
    d.polygon(top, fill=WHITE)
    d.polygon(bot, fill=WHITE)


def make(size, maskable=False, bg=BRAND, apple=False):
    big = size * SS
    im = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    if maskable or apple:
        # full-bleed background so any mask (or the opaque iOS tile) is safe
        base = Image.new("RGBA", (big, big), bg)
        im.alpha_composite(base)
        glyph_scale = big * (0.085 if maskable else 0.11)
    else:
        radius = int(big * 0.22)
        im.alpha_composite(rounded(big, radius, bg))
        glyph_scale = big * 0.11
    draw_mark(im, big / 2, big / 2, glyph_scale)
    im = im.resize((size, size), Image.LANCZOS)
    if apple:
        im = im.convert("RGB")  # iOS tiles are opaque
    return im


def save(im, name):
    p = os.path.join(OUT, name)
    im.save(p)
    print("wrote", os.path.relpath(p))


save(make(192), "icon-192.png")
save(make(512), "icon-512.png")
save(make(512, maskable=True), "icon-512-maskable.png")
save(make(180, apple=True), "apple-touch-icon.png")
print("done")
