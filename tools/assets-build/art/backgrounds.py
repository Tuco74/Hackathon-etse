"""Backgrounds: three storage units, three parallax layers each, plus light,
dust and vignette overlays.  Procedural and deterministic (seeded)."""

import random

from PIL import Image, ImageDraw

from palette import rgba

W, H = 480, 270
FLOOR = 200


def _new():
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))


def _base(seed: int, wall: str = "wall_dark") -> Image.Image:
    img = _new()
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, W, FLOOR), fill=rgba(wall))
    # ceiling + beam
    d.rectangle((0, 0, W, 12), fill=rgba("night"))
    d.rectangle((0, 12, W, 17), fill=rgba("brown2"))
    d.rectangle((0, 17, W, 19), fill=rgba("brown1"))
    # wall panel seams
    for x in range(0, W, 80):
        d.rectangle((x, 19, x + 1, FLOOR), fill=rgba("shadow"))
    # grime
    rnd = random.Random(seed)
    for _ in range(70):
        x, y = rnd.randint(0, W - 1), rnd.randint(20, FLOOR - 6)
        d.rectangle((x, y, x + rnd.randint(1, 6), y + rnd.randint(1, 3)), fill=rgba("shadow"))
    # floor
    d.rectangle((0, FLOOR, W, H), fill=rgba("brown2"))
    for y in range(FLOOR, H, 10):
        d.rectangle((0, y, W, y + 1), fill=rgba("brown1"))
    for x in range(0, W + 48, 48):
        d.line((x, FLOOR, x - 28, H), fill=rgba("brown1"))
    for y in range(FLOOR, H, 4):
        d.rectangle((0, y, W, y + 1), fill=rgba("brown3") if (y // 4) % 3 == 0 else rgba("brown2"))
    d.rectangle((0, FLOOR - 5, W, FLOOR), fill=rgba("wall"))
    d.rectangle((0, FLOOR - 5, W, FLOOR - 4), fill=rgba("wall_light"))
    return img


def _nine(img, d, box, fill, light, shadow, dark="ink"):
    x0, y0, x1, y1 = box
    d.rectangle(box, fill=rgba(fill))
    d.rectangle((x0, y0, x1, y0 + 1), fill=rgba(light))
    d.rectangle((x0, y0, x0 + 1, y1), fill=rgba(light))
    d.rectangle((x0, y1 - 1, x1, y1), fill=rgba(shadow))
    d.rectangle((x1 - 1, y0, x1, y1), fill=rgba(shadow))
    d.rectangle(box, outline=rgba(dark))


def _door_a(img):
    d = ImageDraw.Draw(img)
    # opening
    d.rectangle((34, 38, 212, FLOOR), fill=rgba("night"))
    # roller door half raised
    d.rectangle((34, 38, 212, 132), fill=rgba("grey1"))
    for y in range(40, 132, 8):
        d.rectangle((34, y, 212, y + 1), fill=rgba("grey2"))
        d.rectangle((34, y + 5, 212, y + 6), fill=rgba("shadow"))
    d.rectangle((34, 128, 212, 132), fill=rgba("grey2"))
    d.rectangle((34, 130, 212, 133), fill=rgba("ink"))
    d.rectangle((160, 128, 176, 133), fill=rgba("grey3"))
    # rails
    d.rectangle((28, 38, 34, FLOOR), fill=rgba("wall_light"))
    d.rectangle((212, 38, 218, FLOOR), fill=rgba("wall_light"))
    d.rectangle((28, 34, 218, 38), fill=rgba("wall_light"))
    # darkness inside, light pool
    d.rectangle((34, 133, 212, FLOOR), fill=rgba("night"))
    d.ellipse((60, 176, 190, 208), fill=rgba("shadow"))


def _door_b(img):
    d = ImageDraw.Draw(img)
    # big closed garage door
    _nine(img, d, (110, 40, 372, 196), "wall", "wall_light", "shadow")
    for y in range(46, 194, 12):
        d.rectangle((114, y, 368, y + 1), fill=rgba("shadow"))
        d.rectangle((114, y + 2, 368, y + 3), fill=rgba("wall_light"))
    d.rectangle((110, 186, 372, 196), fill=rgba("brown2"))
    d.rectangle((110, 186, 372, 188), fill=rgba("orange2"))
    for x in range(112, 372, 16):
        d.polygon([(x, 188), (x + 8, 188), (x + 2, 196), (x - 6, 196)], fill=rgba("orange3"))
    d.rectangle((228, 108, 256, 112), fill=rgba("grey3"))
    d.rectangle((236, 104, 248, 108), fill=rgba("grey1"))
    # window with night sky
    d.rectangle((386, 42, 446, 96), fill=rgba("blue1"))
    d.rectangle((386, 42, 446, 44), fill=rgba("wall_light"))
    d.rectangle((386, 94, 446, 96), fill=rgba("wall_light"))
    d.rectangle((383, 42, 386, 96), fill=rgba("wall_light"))
    d.rectangle((446, 42, 449, 96), fill=rgba("wall_light"))
    rnd = random.Random(19)
    for _ in range(18):
        d.point((rnd.randint(389, 443), rnd.randint(46, 92)), fill=rgba("grey4"))
    d.ellipse((420, 48, 434, 62), fill=rgba("yellow1"))
    d.ellipse((423, 49, 432, 58), fill=rgba("blue1"))
    d.rectangle((415, 42, 417, 96), fill=rgba("wall_light"))
    d.rectangle((386, 68, 446, 70), fill=rgba("wall_light"))


def _door_c(img):
    d = ImageDraw.Draw(img)
    # brick wall
    for row, y in enumerate(range(20, FLOOR, 10)):
        off = 0 if row % 2 == 0 else 12
        for x in range(-12 + off, W, 24):
            d.rectangle((x, y, x + 22, y + 8), fill=rgba("wall"))
            d.rectangle((x, y, x + 22, y + 1), fill=rgba("wall_light"))
            d.rectangle((x, y + 7, x + 22, y + 8), fill=rgba("shadow"))
    # pipes
    d.rectangle((0, 34, W, 40), fill=rgba("teal2"))
    d.rectangle((0, 34, W, 36), fill=rgba("teal3"))
    for x in range(30, W, 90):
        d.rectangle((x, 30, x + 4, 44), fill=rgba("grey1"))
    d.rectangle((300, 40, 306, 196), fill=rgba("teal2"))
    d.rectangle((300, 40, 302, 196), fill=rgba("teal3"))
    d.rectangle((58, 44, 64, 120), fill=rgba("brown3"))
    d.rectangle((58, 44, 60, 120), fill=rgba("brown4"))
    # puddle
    d.ellipse((96, 224, 208, 248), fill=rgba("blue1"))
    d.ellipse((112, 228, 180, 240), fill=rgba("blue2"))
    d.ellipse((120, 230, 140, 234), fill=rgba("blue4"))


def _mid_a():
    img = _new()
    d = ImageDraw.Draw(img)
    # metal shelving on the right
    for x in (250, 400):
        d.rectangle((x, 54, x + 5, FLOOR), fill=rgba("grey2"))
        d.rectangle((x, 54, x + 2, FLOOR), fill=rgba("grey3"))
    for y in (96, 140, 184):
        d.rectangle((250, y, 470, y + 5), fill=rgba("grey1"))
        d.rectangle((250, y, 470, y + 2), fill=rgba("grey3"))
    rnd = random.Random(7)
    boxes = [(258, 68, 40, 26), (306, 74, 34, 20), (352, 64, 44, 30), (258, 112, 52, 26),
             (322, 118, 36, 20), (368, 108, 42, 30), (258, 156, 44, 26), (316, 150, 48, 32),
             (376, 158, 40, 24)]
    for bx, by, bw, bh in boxes:
        shade = rnd.choice(["brown3", "brown4", "brown2"])
        d.rectangle((bx, by, bx + bw, by + bh), fill=rgba(shade))
        d.rectangle((bx, by, bx + bw, by + 2), fill=rgba("brown5"))
        d.rectangle((bx + bw // 2, by, bx + bw // 2 + 2, by + bh), fill=rgba("brown1"))
        d.rectangle((bx, by + bh - 2, bx + bw, by + bh), fill=rgba("brown1"))
    # bottles on shelf
    for i in range(4):
        d.rectangle((408 + i * 10, 84, 412 + i * 10, 96), fill=rgba("green2"))
        d.rectangle((409 + i * 10, 82, 411 + i * 10, 84), fill=rgba("teal3"))
    # tyre leaning on the door frame
    d.ellipse((150, 158, 200, 200), fill=rgba("ink"))
    d.ellipse((152, 160, 198, 198), fill=rgba("grey1"))
    d.ellipse((162, 166, 188, 192), fill=rgba("night"))
    d.ellipse((170, 174, 180, 184), fill=rgba("ink"))
    for a in range(0, 360, 45):
        import math
        ax = 175 + math.cos(math.radians(a)) * 18
        ay = 179 + math.sin(math.radians(a)) * 14
        d.rectangle((ax - 1, ay - 1, ax + 1, ay + 1), fill=rgba("grey2"))
    return img


def _mid_b():
    img = _new()
    d = ImageDraw.Draw(img)
    # wooden shelves left
    for x in (24, 150):
        d.rectangle((x, 50, x + 6, FLOOR), fill=rgba("brown3"))
        d.rectangle((x, 50, x + 2, FLOOR), fill=rgba("brown4"))
    for y in (92, 136, 180):
        d.rectangle((24, y, 156, y + 5), fill=rgba("brown4"))
        d.rectangle((24, y, 156, y + 2), fill=rgba("brown5"))
    rnd = random.Random(3)
    for (bx, by, bw, bh) in [(32, 62, 44, 28), (84, 68, 38, 22), (32, 106, 52, 28),
                             (94, 112, 30, 22), (32, 150, 40, 28), (80, 148, 44, 30)]:
        shade = rnd.choice(["brown3", "brown4", "brown2"])
        d.rectangle((bx, by, bx + bw, by + bh), fill=rgba(shade))
        d.rectangle((bx, by, bx + bw, by + 2), fill=rgba("brown5"))
        d.rectangle((bx, by + bh - 2, bx + bw, by + bh), fill=rgba("brown1"))
        d.rectangle((bx + bw // 2, by + 2, bx + bw // 2 + 2, by + bh - 2), fill=rgba("brown1"))
    # stacked tyres right
    for i, ty in enumerate((150, 164, 178)):
        d.ellipse((382, ty, 438, ty + 22), fill=rgba("ink"))
        d.ellipse((384, ty + 2, 436, ty + 20), fill=rgba("grey1"))
        d.ellipse((394, ty + 5, 426, ty + 17), fill=rgba("night"))
        d.ellipse((404, ty + 8, 416, ty + 14), fill=rgba("ink"))
    # paint bucket
    d.rectangle((300, 178, 320, 196), fill=rgba("blue2"))
    d.rectangle((300, 178, 320, 181), fill=rgba("blue3"))
    d.rectangle((298, 174, 322, 178), fill=rgba("grey2"))
    return img


def _mid_c():
    img = _new()
    d = ImageDraw.Draw(img)
    rnd = random.Random(11)
    # stacked crates
    for (bx, by, bw, bh) in [(28, 150, 54, 46), (34, 124, 42, 24), (96, 162, 48, 34),
                             (330, 158, 56, 40), (338, 128, 40, 28)]:
        d.rectangle((bx, by, bx + bw, by + bh), fill=rgba("brown4"))
        d.rectangle((bx, by, bx + bw, by + 3), fill=rgba("brown5"))
        d.rectangle((bx, by + bh - 3, bx + bw, by + bh), fill=rgba("brown2"))
        d.rectangle((bx, by + bh // 2, bx + bw, by + bh // 2 + 1), fill=rgba("brown1"))
        d.rectangle((bx + bw // 2, by, bx + bw // 2 + 2, by + bh), fill=rgba("brown2"))
    # hanging bulb
    d.rectangle((238, 0, 240, 44), fill=rgba("grey1"))
    d.rectangle((232, 44, 246, 48), fill=rgba("grey2"))
    d.ellipse((232, 48, 246, 62), fill=rgba("yellow1"))
    d.ellipse((234, 50, 241, 57), fill=rgba("white"))
    # cobwebs
    for i in range(6):
        d.line((0, 20 + i * 4, 22 + i * 6, 20 + i * 2), fill=rgba("grey3"))
    # barrel
    d.rectangle((392, 168, 434, 200), fill=rgba("teal2"))
    d.rectangle((392, 168, 434, 171), fill=rgba("teal3"))
    d.rectangle((392, 182, 434, 185), fill=rgba("teal1"))
    d.rectangle((392, 194, 434, 197), fill=rgba("teal1"))
    return img


def _front():
    img = _new()
    d = ImageDraw.Draw(img)
    # door jambs
    for x0 in (0, 458):
        d.rectangle((x0, 0, x0 + 21, H), fill=rgba("wall_dark"))
        d.rectangle((x0, 0, x0 + 3, H), fill=rgba("wall"))
        d.rectangle((x0 + 18, 0, x0 + 21, H), fill=rgba("ink"))
        for y in range(0, H, 30):
            d.rectangle((x0, y, x0 + 21, y + 2), fill=rgba("shadow"))
    # foreground crate corner
    d.rectangle((408, 232, 480, 270), fill=rgba("brown3"))
    d.rectangle((408, 232, 480, 236), fill=rgba("brown5"))
    d.rectangle((408, 232, 412, 270), fill=rgba("brown4"))
    d.rectangle((424, 232, 428, 270), fill=rgba("brown1"))
    # ceiling shadow
    d.rectangle((0, 0, W, 10), fill=rgba("ink"))
    return img


def _light_cone():
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for y in range(0, 240, 4):
        t = y / 240
        half = 18 + t * 150
        alpha = int(26 * (1 - t) + 5)
        d.rectangle((W / 2 - half, y, W / 2 + half, y + 4), fill=rgba("yellow1", alpha))
    d.ellipse((120, 178, 360, 246), fill=rgba("yellow1", 14))
    return img


def _vignette():
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    px = img.load()
    cx, cy = W / 2, H / 2
    maxd = (cx ** 2 + cy ** 2) ** 0.5
    for y in range(H):
        for x in range(W):
            dx, dy = (x - cx) / 1.35, y - cy
            t = (dx * dx + dy * dy) ** 0.5 / maxd
            a = max(0, int((t - 0.55) * 300))
            if a:
                px[x, y] = rgba("ink", min(a, 170))
    return img


def _dust_sheet():
    sheet = Image.new("RGBA", (16 * 8, 16), (0, 0, 0, 0))
    rnd = random.Random(23)
    positions = [(rnd.randint(1, 13), rnd.randint(1, 13)) for _ in range(9)]
    for f in range(8):
        frame = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
        d = ImageDraw.Draw(frame)
        for i, (x, y) in enumerate(positions):
            if (i + f) % 4 == 0:
                continue
            yy = (y + f) % 15 + 1
            xx = (x + f // 2) % 15 + 1
            alpha = 255 if i % 3 else 170
            d.point((xx, yy), fill=rgba("yellow1", alpha))
        sheet.alpha_composite(frame, (f * 16, 0))
    return sheet


def build(out_dir):
    import os
    os.makedirs(out_dir, exist_ok=True)
    variants = {
        "unit_a": (101, _door_a, _mid_a),
        "unit_b": (202, _door_b, _mid_b),
        "unit_c": (303, _door_c, _mid_c),
    }
    files = {}
    for name, (seed, door, mid) in variants.items():
        back = _base(seed)
        door(back)
        files[f"{name}_back"] = back
        files[f"{name}_mid"] = mid()
        files[f"{name}_front"] = _front()
    files["light_cone"] = _light_cone()
    files["vignette"] = _vignette()
    files["dust"] = _dust_sheet()
    for key, img in files.items():
        img.save(os.path.join(out_dir, f"{key}.png"))
    return list(files)
