#!/usr/bin/env python3
"""Extract top-down ship sprites from docs/art/ships/sheet-*.jpg.

Produces public/assets/ships/{colour}/{ship}.png (RGBA, bow facing +x,
trimmed + 4px padding) plus public/assets/ships/manifest.json with each
sprite's pixel size and the hull-length fraction of its width.

Run:  python3 scripts/extract_ships.py   (needs Pillow)
"""
import json
import math
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "art" / "ships"
OUT = ROOT / "public" / "assets" / "ships"

COLORS = ["blue", "red", "green", "black"]

# Crop boxes as fractions of (W, H). Same layout on every sheet: all five
# ships are vertical, bow DOWN (pennants on the top mast, bowsprit at the
# bottom). Left is the tall carrier; top-middle battleship; top-right
# cruiser; bottom-middle submarine (wide — the long axis is still
# vertical; the horizontal spars are yards); bottom-right destroyer.
BOXES = {
    "carrier":    (0.105, 0.025, 0.335, 0.885),
    "battleship": (0.415, 0.015, 0.600, 0.640),
    "cruiser":    (0.660, 0.030, 0.875, 0.660),
    "submarine":  (0.310, 0.620, 0.640, 0.990),
    "destroyer":  (0.645, 0.620, 0.865, 0.990),
}
# rotate 90° CCW so the downward-pointing bow faces +x
ROTATE = {s: 90 for s in BOXES}

# UI chrome: "Edit" pill bottom-left + share icon bottom-right on the
# blue/green/black sheets; a "Preview" pill at top-right on the red
# sheet. Painted over with the background before flood fill, as
# fractions of each CROP. Crops are placed to avoid them anyway; these
# are belt-and-braces. Keyed (color, ship).
UI_MASKS = {
    ("red", "cruiser"): [(0.72, 0.0, 1.0, 0.15)],   # Preview pill
    ("*", "submarine"): [(0.0, 0.85, 0.16, 1.0)],    # Edit pill
    ("*", "destroyer"): [(0.86, 0.80, 1.0, 1.0)],    # share icon
}

PAD = 4
TOL = 42  # background flood-fill tolerance (Manhattan in RGB)


def bg_color(im):
    """Median-ish background colour from the four corner strips."""
    w, h = im.size
    px = im.load()
    samples = []
    for cx, cy in [(8, 8), (w - 16, 8), (8, h - 16), (w - 16, h - 16)]:
        for y in range(cy, cy + 8):
            for x in range(cx, cx + 8):
                samples.append(px[x, y])
    n = len(samples)
    return tuple(sorted(c[i] for c in samples)[n // 2] for i in range(3))


def near_bg(p, bg, tol=TOL):
    return abs(p[0] - bg[0]) + abs(p[1] - bg[1]) + abs(p[2] - bg[2]) <= tol


def shadowish(p, bg, lo=0.38, hi=0.97, dev=0.18):
    """Drop-shadow pixels: roughly bg × k — all channels darker than bg by
    a similar ratio. Ship paint either saturates unevenly or (black sails)
    is far darker than the translucent shadow, so it survives when the
    ratio band is tightened per sheet."""
    rs = []
    for i in range(3):
        if bg[i] <= 0:
            return False
        rs.append(p[i] / bg[i])
    m = sum(rs) / 3
    if not lo < m < hi:
        return False
    return all(abs(r - m) < dev for r in rs)


# per-sheet shadow band: black sails sit near the shadow's brightness, so
# the black sheet uses a narrow mid band (shadow ~bg×0.55–0.95, sails lower)
SHADOW_BAND = {
    # (lo, hi, dev, layers-or-None) — None = BFS flood of shadowish
    # pixels from cleared bg; a number = peel that many layers. Black
    # sails are DARKER than the shadow (ratio ~0.25), so a band starting
    # at 0.45 floods the shadow without touching them.
    "blue": (0.16, 0.97, 0.15, None),
    "red": (0.16, 0.97, 0.15, None),
    "green": (0.16, 0.97, 0.15, None),
    "black": (0.45, 0.96, 0.08, None),
}

def remove_bg(im, bg, band, remove_shadow=True):
    lo, hi, dev, max_layers = band
    """Flood-fill background from the borders, optionally erode the thin
    shadow ring, then drop stray specks. Black-fleet sheets keep their
    soft shadow: their hulls are as dark as it is."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            q.append((x, y))
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        p = px[x, y]
        if not near_bg(p, bg):
            continue
        px[x, y] = (p[0], p[1], p[2], 0)
        if x > 0: q.append((x - 1, y))
        if x < w - 1: q.append((x + 1, y))
        if y > 0: q.append((x, y - 1))
        if y < h - 1: q.append((x, y + 1))
    if remove_shadow:
        # Flood the cast shadow out from the cleared background: BFS
        # through pixels matching the shadow signature (a darkened,
        # near-ratio-uniform version of bg). Depth-unlimited, so big
        # wedge shadows vanish; saturated or much-darker ship paint is
        # not shadowish and stops the fill. Black sails ARE near-shadow
        # coloured, so the black sheet instead peels a few layers only.
        if max_layers is None:
            sq = deque()
            inq = bytearray(w * h)
            for y in range(h):
                for x in range(w):
                    if px[x, y][3] == 0:
                        sq.append((x, y))
                        inq[y * w + x] = 1
            while sq:
                x, y = sq.popleft()
                for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
                    if not (0 <= nx < w and 0 <= ny < h):
                        continue
                    j = ny * w + nx
                    if inq[j]:
                        continue
                    p = px[nx, ny]
                    if p[3] == 0 or not shadowish(p, bg, lo, hi, dev):
                        continue
                    px[nx, ny] = (p[0], p[1], p[2], 0)
                    inq[j] = 1
                    sq.append((nx, ny))
        else:
            for _ in range(max_layers):
                edge = []
                for y in range(h):
                    for x in range(w):
                        p = px[x, y]
                        if p[3] == 0:
                            continue
                        for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
                            if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                                edge.append((x, y))
                                break
                if not edge:
                    break
                cleared = 0
                for x, y in edge:
                    p = px[x, y]
                    if shadowish(p, bg, lo, hi, dev):
                        px[x, y] = (p[0], p[1], p[2], 0)
                        cleared += 1
                if not cleared:
                    break
    # keep only the ship blob: the largest component plus any component
    # within 2 px of it (pennant tips, thin rigging strands). Everything
    # else — shadow crumbs, masking debris, dark fringe — is dropped.
    comp = [0] * (w * h)
    labels = []
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if px[x, y][3] == 0 or comp[i]:
                continue
            lbl = len(labels) + 1
            members = []
            qq = deque([(x, y)])
            comp[i] = lbl
            while qq:
                ax, ay = qq.popleft()
                members.append((ax, ay))
                for nx, ny in ((ax-1,ay),(ax+1,ay),(ax,ay-1),(ax,ay+1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        j = ny * w + nx
                        if not comp[j] and px[nx, ny][3] > 0:
                            comp[j] = lbl
                            qq.append((nx, ny))
            labels.append(members)
    if labels:
        main_lbl = max(range(len(labels)), key=lambda i: len(labels[i])) + 1
        near = bytearray(w * h)  # largest component dilated by 2 px
        for x, y in labels[main_lbl - 1]:
            for dy in (-2, -1, 0, 1, 2):
                for dx in (-2, -1, 0, 1, 2):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h:
                        near[ny * w + nx] = 1
        keep = {main_lbl}
        for idx, members in enumerate(labels):
            if any(near[y * w + x] for x, y in members):
                keep.add(idx + 1)
        for idx, members in enumerate(labels):
            if idx + 1 not in keep:
                for x, y in members:
                    p = px[x, y]
                    px[x, y] = (p[0], p[1], p[2], 0)
    # erode the alpha edge by 1 px to strip residual dark fringe, feather
    a = im.getchannel("A").filter(ImageFilter.MinFilter(3))
    im.putalpha(a)
    a = im.getchannel("A").filter(ImageFilter.GaussianBlur(1.2))
    im.putalpha(a)
    return im


def _dense_run(counts, thresh):
    """Longest contiguous run of indexes above thresh → (start, end)."""
    xs = [i for i, c in enumerate(counts) if c > thresh]
    if not xs:
        return 0, len(counts) - 1
    best_start = best_end = start = prev = xs[0]
    for x in xs[1:]:
        if x == prev + 1:
            prev = x
        else:
            if prev - start > best_end - best_start:
                best_start, best_end = start, prev
            start = prev = x
    if prev - start > best_end - best_start:
        best_start, best_end = start, prev
    return best_start, best_end


def hull_metrics(im):
    """Hull footprint: fraction of sprite width covered by the hull body,
    plus the hull centre in both axes. Columns/rows whose opaque coverage
    reaches a fair share of the perpendicular extent are 'dense' — the
    hull body is dense while pennants, rigging and bowsprit are sparse."""
    w, h = im.size
    a = im.getchannel("A").load()
    col = [0] * w
    row = [0] * h
    for x in range(w):
        for y in range(h):
            if a[x, y] > 128:
                col[x] += 1
                row[y] += 1
    x0, x1 = _dense_run(col, h * 0.22)
    # hull beam centreline: within the hull's dense column run, the rows
    # whose coverage is >= 70% of the widest row form the thick hull band
    # — sails and pennants produce thinner rows and drop out.
    sub = [0] * h
    for y in range(h):
        for x in range(x0, x1 + 1):
            if a[x, y] > 128:
                sub[y] += 1
    peak = max(sub) or 1
    band = [y for y, c in enumerate(sub) if c >= peak * 0.7]
    hull_cy = (band[0] + band[-1]) / 2 / h if band else 0.5
    # body extent along the length axis: columns holding real ship
    # (bowsprit, yards, sails — coverage >= 8% of height). Trailing
    # pennant wisps fall below the threshold and are excluded.
    lx0 = next((x for x in range(w) if col[x] > h * 0.08), 0)
    lx1 = next((x for x in range(w - 1, -1, -1) if col[x] > h * 0.08), w - 1)
    return {
        "hullFraction": (x1 - x0 + 1) / w,
        "hullCx": (x0 + x1) / 2 / w,
        "hullCy": hull_cy,
        "lenFraction": (lx1 - lx0 + 1) / w,
        "lenCx": (lx0 + lx1) / 2 / w,
    }


def extract(sheet, ship, box, color):
    w, h = sheet.size
    l, t, r, b = box
    crop = sheet.crop((int(l * w), int(t * h), int(r * w), int(b * h))).convert("RGBA")
    bg = bg_color(crop)
    px = crop.load()
    cw, ch = crop.size
    masks = UI_MASKS.get((color, ship), []) + UI_MASKS.get(("*", ship), [])
    for ml, mt, mr, mb in masks:
        for y in range(int(mt * ch), int(mb * ch)):
            for x in range(int(ml * cw), int(mr * cw)):
                px[x, y] = bg
    cut = remove_bg(crop, bg, SHADOW_BAND[color])
    bbox = cut.getchannel("A").getbbox() or (0, 0, cw, ch)
    cut = cut.crop((
        max(0, bbox[0] - PAD), max(0, bbox[1] - PAD),
        min(cw, bbox[2] + PAD), min(ch, bbox[3] + PAD),
    ))
    if ship in ROTATE:
        cut = cut.rotate(ROTATE[ship], expand=True)
    # strip thin full-height/width frame lines caught at a crop edge
    cut = strip_frame_edges(cut)
    return cut


def strip_frame_edges(im):
    """If the outermost columns/rows are almost fully opaque (a source
    frame line sliced by the crop), clear them; real ship parts taper."""
    im = im.copy()
    a = im.getchannel("A").load()
    w, h = im.size
    def clear(px, py):
        p = a[px, py]
        im.putpixel((px, py), (0, 0, 0, 0))
    # left/right
    for edge, rng in ((0, range(0, 8)), (w - 1, range(w - 1, w - 9, -1))):
        for x in rng:
            cov = sum(1 for y in range(h) if a[x, y] > 128)
            if cov > h * 0.85:
                for y in range(h):
                    clear(x, y)
            else:
                break
    # top/bottom
    a = im.getchannel("A").load()
    for rng in (range(0, 8), range(h - 1, h - 9, -1)):
        for y in rng:
            cov = sum(1 for x in range(w) if a[x, y] > 128)
            if cov > w * 0.85:
                for x in range(w):
                    clear(x, y)
            else:
                break
    # re-trim after stripping
    bbox = im.getchannel("A").getbbox()
    if bbox:
        im = im.crop(bbox)
    return im


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for color in COLORS:
        sheet = Image.open(SRC / f"sheet-{color}.jpg").convert("RGB")
        (OUT / color).mkdir(exist_ok=True)
        for ship, box in BOXES.items():
            sprite = extract(sheet, ship, box, color)
            path = OUT / color / f"{ship}.png"
            sprite.save(path)
            m = hull_metrics(sprite)
            manifest[f"{color}/{ship}"] = {
                "w": sprite.width,
                "h": sprite.height,
                "hullFraction": round(m["hullFraction"], 3),
                "hullCx": round(m["hullCx"], 4),
                "hullCy": round(m["hullCy"], 4),
                "lenFraction": round(m["lenFraction"], 3),
                "lenCx": round(m["lenCx"], 4),
            }
            print(f"{color}/{ship}: {sprite.width}x{sprite.height} "
                  f"hull={manifest[f'{color}/{ship}']['hullFraction']} "
                  f"c=({manifest[f'{color}/{ship}']['hullCx']},"
                  f"{manifest[f'{color}/{ship}']['hullCy']})")
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
