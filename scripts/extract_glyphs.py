#!/usr/bin/env python3
"""Extract pirate-letter glyphs from docs/art/font-sheet.jpg.

Outputs one PNG per character (A-Z, 1-12) plus manifest.json into
public/assets/font/.  The sheet is 4 rows: A-I, J-R, S-Z, 1-12
("10"/"11"/"12" are single two-digit glyphs).  Decorations (compass,
skull, ship silhouette, palms, UI chrome) are excluded by slot bounds.

Strategy: the gold letters are much brighter and more saturated than the
dark parchment.  Seed a mask with bright+saturated pixels, close it to
absorb the dark engraving inside each letter, then alpha = not-exterior
(flood fill from the slot border), feathered ~1.5 px.
"""
import json
from PIL import Image, ImageFilter

SRC = "docs/art/font-sheet.jpg"
OUT = "public/assets/font"
PAD = 6

im = Image.open(SRC).convert("RGB")
px = im.load()
W, H = im.size

# row bands (y0, y1) found by profiling the sheet
# (y0, y1, merge-gap) — J's detached flourish is merged explicitly below
BANDS = {
    "ABCDEFGHI": (48, 160, 10),
    "JKLMNOPQR": (166, 270, 10),
    "STUVWXYZ": (281, 390, 10),
    "123456789DDD": (396, 488, 17),  # digits; D = two-digit glyph
}
DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]


def gold(x, y):
    r, g, b = px[x, y]
    mx, mn = max(r, g, b), min(r, g, b)
    return mx > 140 and (mx - mn) > 50


def x_runs(y0, y1, min_c=3, gap=40):
    cnt = [sum(1 for y in range(y0, y1) if gold(x, y)) for x in range(W)]
    runs, start = [], None
    for x, c in enumerate(cnt):
        if c > min_c and start is None:
            start = x
        if c <= min_c and start is not None:
            if x - start > 4:
                runs.append([start, x])
            start = None
    if start is not None:
        runs.append([start, W])
    merged = [runs[0]]
    for r in runs[1:]:
        if r[0] - merged[-1][1] < gap:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    return merged


def extract_slot(x0, x1, y0, y1):
    """Alpha from 'not exterior': seed bright gold, close, flood exterior."""
    sw, sh = x1 - x0, y1 - y0
    seed = bytearray(sw * sh)
    for y in range(sh):
        for x in range(sw):
            if gold(x0 + x, y0 + y):
                seed[y * sw + x] = 1
    # morphological close (dilate then erode) with radius ~4 to absorb
    # the dark engraving lines inside the letter bodies
    def dilate(m):
        out = bytearray(sw * sh)
        R = 4
        for y in range(sh):
            for x in range(sw):
                hit = 0
                for dy in range(-R, R + 1):
                    yy = y + dy
                    if yy < 0 or yy >= sh:
                        continue
                    for dx in range(-R, R + 1):
                        xx = x + dx
                        if 0 <= xx < sw and dx * dx + dy * dy <= R * R and m[yy * sw + xx]:
                            hit = 1
                            break
                    if hit:
                        break
                if hit:
                    out[y * sw + x] = 1
        return out
    def erode(m):
        out = bytearray(sw * sh)
        R = 4
        for y in range(sh):
            for x in range(sw):
                full = 1
                for dy in range(-R, R + 1):
                    yy = y + dy
                    if yy < 0 or yy >= sh:
                        continue
                    for dx in range(-R, R + 1):
                        xx = x + dx
                        if 0 <= xx < sw and dx * dx + dy * dy <= R * R and not m[yy * sw + xx]:
                            full = 0
                            break
                    if not full:
                        break
                if full:
                    out[y * sw + x] = 1
        return out
    closed = erode(dilate(seed))
    # flood the exterior (non-glyph area) from the border
    exterior = bytearray(sw * sh)
    stack = []
    for x in range(sw):
        for y in (0, sh - 1):
            if not closed[y * sw + x]:
                stack.append((x, y))
    for y in range(sh):
        for x in (0, sw - 1):
            if not closed[y * sw + x]:
                stack.append((x, y))
    while stack:
        x, y = stack.pop()
        i = y * sw + x
        if exterior[i] or closed[i]:
            continue
        exterior[i] = 1
        for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
            if 0 <= nx < sw and 0 <= ny < sh:
                stack.append((nx, ny))
    # alpha: not-exterior, but interior pixels that match the parchment
    # (dark, neutral counters/background) stay transparent; the gold
    # engraving is warm even where it's dark, so r-b separates them
    alpha = Image.new("L", (sw, sh))
    ad = alpha.load()
    for y in range(sh):
        for x in range(sw):
            i = y * sw + x
            if exterior[i] or not closed[i]:
                ad[x, y] = 0
            else:
                r, g, b = px[x0 + x, y0 + y]
                warm = (r - b) > 25 or (r + g + b) / 3 > 110
                ad[x, y] = 255 if warm else 0
    alpha = alpha.filter(ImageFilter.GaussianBlur(1.4))
    crop = im.crop((x0, y0, x1, y1))
    out = Image.new("RGBA", (sw, sh))
    out.paste(crop, (0, 0))
    out.putalpha(alpha)
    return out


manifest = {}
for row, (y0, y1, gap) in BANDS.items():
    slots = x_runs(y0, y1, gap=gap)
    if row == "JKLMNOPQR":
        # J's hook is a detached sliver at the far left of the band
        slots = [[slots[0][0], slots[1][1]]] + slots[2:]
    names = DIGITS if row == "123456789DDD" else list(row)
    if len(slots) != len(names):
        raise SystemExit(f"row {row}: {len(slots)} slots for {len(names)} glyphs {slots}")
    bottoms = []
    imgs = []
    for (x0, x1), name in zip(slots, names):
        g = extract_slot(x0, x1, y0, y1)
        bbox = g.getbbox()
        if bbox is None:
            raise SystemExit(f"{name}: empty slot {x0},{x1}")
        g = g.crop(bbox)
        imgs.append((name, g))
        bottoms.append(bbox[3])
    # band baseline = median glyph bottom (descenders are rare)
    sb = sorted(bottoms)
    baseline = sb[len(sb) // 2]
    for (name, g), bottom in zip(imgs, bottoms):
        w, h = g.size
        canvas = Image.new("RGBA", (w + PAD * 2, h + PAD * 2), (0, 0, 0, 0))
        canvas.paste(g, (PAD, PAD))
        canvas.save(f"{OUT}/{name}.png")
        manifest[name] = {
            "w": w + PAD * 2,
            "h": h + PAD * 2,
            "baseline": bottom + PAD,          # baseline offset from top
            "descender": bottom - baseline,     # >0 for J/Q/Y-style tails
        }
        print(f"{name}: {w}x{h} base={bottom} desc={bottom - baseline}")

json.dump(manifest, open(f"{OUT}/manifest.json", "w"), indent=1)
print("wrote manifest.json")
