"""Pixel UI kit: 9-slice panels/buttons, HUD icons, coin spin, gavel, roulette
wheel, category icons and emotes.  Everything is drawn from the closed palette.
"""

from PIL import Image, ImageDraw

from canvas import Canvas
from palette import PALETTE, rgba

NINE = {"left": 8, "right": 8, "top": 8, "bottom": 8}


def _panel(fill, light, shadow, inner=None):
    c = Canvas(24, 24)
    c.rect(0, 0, 24, 24, "base")
    c.rect(1, 1, 22, 1, "light")
    c.rect(1, 1, 1, 22, "light")
    c.rect(1, 22, 22, 1, "shadow")
    c.rect(22, 1, 1, 22, "shadow")
    c.rect(3, 3, 18, 1, "inner")
    c.rect(3, 3, 1, 18, "inner")
    c.rect(3, 20, 18, 1, "inner2")
    c.rect(20, 3, 1, 18, "inner2")
    roles = {"base": fill, "light": light, "shadow": shadow, "inner": inner or light,
             "inner2": inner or shadow, "outline": "ink"}
    return c.render(roles), dict(NINE)


def _coin(frame: int, total: int = 8):
    widths = [3, 5, 7, 9, 11, 9, 7, 5]
    w = widths[frame % total]
    img = Image.new("RGBA", (12, 12), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x0 = 6 - w / 2
    d.ellipse((x0, 1.5, x0 + w, 10.5), fill=rgba("gold1"), outline=rgba("brown3"))
    if w > 5:
        d.ellipse((x0 + 1, 2.5, x0 + w - 1, 9.5), outline=rgba("gold2"))
        d.rectangle((4, 4, 7, 5), fill=rgba("gold2"))
    return img


def _gavel():
    c = Canvas(16, 16)
    c.line(4, 13, 11, 6, "handle", width=2)
    c.rect(8, 1, 6, 5, "head")
    c.rect(8, 1, 6, 1, "light")
    c.rect(8, 5, 6, 1, "shadow")
    c.rect(10, 1, 1, 5, "band")
    return c.render({"handle": "brown3", "head": "brown4", "light": "brown5",
                     "shadow": "brown1", "band": "gold1", "outline": "ink"})


def _wheel(size: int = 96):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = size / 2
    r = size / 2 - 2
    sectors = 16
    step = 360 / sectors
    start = -90 - step / 2
    for i in range(sectors):
        a0 = start + i * step
        a1 = a0 + step
        if i == 0:
            colour = "green3"
        elif i % 2 == 0:
            colour = "red3"
        else:
            colour = "night"
        d.pieslice((cx - r, cy - r, cx + r, cy + r), a0, a1, fill=rgba(colour))
        # pocket marker
        import math
        mid = math.radians((a0 + a1) / 2)
        px, py = cx + math.cos(mid) * (r - 12), cy + math.sin(mid) * (r - 12)
        d.rectangle((px - 1, py - 1, px + 1, py + 1), fill=rgba("white" if i == 0 else "grey4"))
    for i in range(sectors):
        a = math.radians(start + i * step)
        d.line((cx, cy, cx + math.cos(a) * r, cy + math.sin(a) * r), fill=rgba("ink"))
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=rgba("gold1"), width=3)
    d.ellipse((cx - r + 3, cy - r + 3, cx + r - 3, cy + r - 3), outline=rgba("gold2"))
    d.ellipse((cx - 9, cy - 9, cx + 9, cy + 9), fill=rgba("gold1"), outline=rgba("brown3"))
    d.ellipse((cx - 5, cy - 5, cx + 5, cy + 5), fill=rgba("brown2"))
    d.rectangle((cx - 1, cy - 4, cx + 1, cy + 4), fill=rgba("gold2"))
    d.rectangle((cx - 4, cy - 1, cx + 4, cy + 1), fill=rgba("gold2"))
    return img


def _pointer():
    img = Image.new("RGBA", (10, 14), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.polygon([(1, 1), (9, 1), (5, 12)], fill=rgba("yellow1"), outline=rgba("ink"))
    d.rectangle((4, 1, 6, 8), fill=rgba("gold2"))
    return img


def _icon_tv(c):
    c.rect(1, 3, 14, 10, "base")
    c.rect(2, 4, 9, 7, "screen")
    c.rect(3, 5, 3, 2, "glare")
    c.rect(12, 5, 2, 2, "detail")
    c.rect(12, 8, 2, 1, "detail")
    c.rect(3, 13, 3, 1, "base")
    c.rect(10, 13, 3, 1, "base")


def _icon_tools(c):
    c.line(3, 13, 11, 5, "base", width=2)
    c.ellipse(9, 2, 14, 7, "base")
    c.rect(9, 4, 2, 2, "screen")
    c.rect(2, 11, 4, 4, "accent")


def _icon_furniture(c):
    c.rect(3, 2, 3, 9, "base")
    c.rect(3, 10, 11, 3, "base")
    c.rect(4, 13, 2, 3, "base")
    c.rect(11, 13, 2, 3, "base")


def _icon_collectibles(c):
    c.poly([(8, 1), (14, 7), (8, 15), (2, 7)], "base")
    c.poly([(8, 1), (10, 7), (8, 15), (6, 7)], "light")
    c.rect(2, 7, 12, 1, "accent")


def _icon_clothing(c):
    c.poly([(4, 5), (6, 2), (10, 2), (12, 5), (14, 6), (12, 9), (11, 7), (11, 14), (5, 14), (5, 7), (4, 9), (2, 6)], "base")
    c.rect(6, 4, 2, 3, "accent")


def _icon_sports(c):
    c.ellipse(1, 1, 15, 15, "base")
    c.rect(1, 7, 14, 2, "light")
    c.rect(7, 1, 2, 14, "light")


def _icon_kitchen(c):
    c.rect(2, 6, 12, 8, "base")
    c.rect(2, 6, 12, 2, "light")
    c.rect(14, 8, 2, 2, "base")
    c.rect(5, 3, 6, 1, "accent")


def _icon_mystery(c):
    c.rect(5, 2, 6, 2, "base")
    c.rect(11, 4, 2, 3, "base")
    c.rect(8, 7, 4, 2, "base")
    c.rect(8, 9, 2, 2, "base")
    c.rect(8, 12, 2, 2, "accent")


ICON_SHAPES = {
    "icon_electronics": _icon_tv,
    "icon_tools": _icon_tools,
    "icon_furniture": _icon_furniture,
    "icon_collectibles": _icon_collectibles,
    "icon_clothing": _icon_clothing,
    "icon_sports": _icon_sports,
    "icon_kitchen": _icon_kitchen,
    "icon_mystery": _icon_mystery,
}
ICON_ROLES = {"base": "grey3", "light": "grey4", "screen": "night", "glare": "teal3",
              "detail": "grey1", "accent": "yellow1", "outline": "ink"}


def _status_icon(kind: str):
    c = Canvas(16, 16)
    if kind == "money":
        c.ellipse(2, 2, 14, 14, "base")
        c.ellipse(4, 4, 12, 12, "light")
        c.rect(7, 5, 2, 7, "screen")
        c.rect(6, 6, 4, 1, "screen")
    elif kind == "clock":
        c.ellipse(1, 1, 15, 15, "base")
        c.ellipse(3, 3, 13, 13, "screen")
        c.rect(8, 4, 1, 5, "light")
        c.rect(8, 8, 4, 1, "light")
    elif kind == "lock":
        c.rect(3, 7, 10, 8, "base")
        c.rect(5, 2, 6, 1, "metal")
        c.rect(5, 2, 1, 6, "metal")
        c.rect(10, 2, 1, 6, "metal")
        c.rect(7, 9, 2, 3, "screen")
    elif kind in ("profit", "loss"):
        up = kind == "profit"
        c.poly([(8, 1), (14, 8), (11, 8), (11, 14), (5, 14), (5, 8), (2, 8)] if up
               else [(8, 14), (14, 7), (11, 7), (11, 1), (5, 1), (5, 7), (2, 7)], "base")
    elif kind == "users":
        c.ellipse(2, 2, 8, 8, "base")
        c.ellipse(9, 4, 14, 9, "light")
        c.rect(1, 9, 9, 5, "base")
        c.rect(8, 10, 7, 4, "light")
    elif kind == "timer":
        c.ellipse(2, 3, 14, 15, "base")
        c.ellipse(4, 5, 12, 13, "screen")
        c.rect(7, 6, 2, 4, "light")
        c.rect(7, 1, 2, 2, "metal")
    return c.render({"base": "grey3", "light": "gold2", "screen": "night", "metal": "grey1",
                     "outline": "ink"})


def _emote(kind: str):
    c = Canvas(12, 12)
    c.ellipse(1, 1, 10, 10, "face")
    if kind == "happy":
        c.rect(3, 4, 2, 2, "dark")
        c.rect(7, 4, 2, 2, "dark")
        c.rect(4, 7, 4, 1, "dark")
        c.rect(3, 6, 1, 1, "dark")
        c.rect(8, 6, 1, 1, "dark")
    elif kind == "sad":
        c.rect(3, 4, 2, 2, "dark")
        c.rect(7, 4, 2, 2, "dark")
        c.rect(4, 8, 4, 1, "dark")
        c.rect(3, 6, 1, 1, "dark")
        c.rect(8, 6, 1, 1, "dark")
    elif kind == "angry":
        c.rect(3, 5, 2, 2, "dark")
        c.rect(7, 5, 2, 2, "dark")
        c.rect(3, 3, 2, 1, "dark")
        c.rect(7, 3, 2, 1, "dark")
        c.rect(4, 8, 4, 1, "dark")
    elif kind == "wow":
        c.rect(3, 4, 2, 2, "dark")
        c.rect(7, 4, 2, 2, "dark")
        c.ellipse(5, 7, 7, 9, "dark")
    elif kind == "cool":
        c.rect(2, 4, 8, 2, "dark")
        c.rect(3, 5, 2, 1, "glass")
        c.rect(7, 5, 2, 1, "glass")
        c.rect(4, 8, 4, 1, "dark")
    else:  # think
        c.rect(3, 5, 2, 2, "dark")
        c.rect(7, 3, 2, 2, "dark")
        c.rect(4, 8, 3, 1, "dark")
    roles = {"face": "yellow1", "dark": "ink", "glass": "teal3", "outline": "ink"}
    return c.render(roles)


def _cursor():
    img = Image.new("RGBA", (8, 8), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.polygon([(1, 0), (1, 7), (3, 5), (5, 7), (7, 5), (4, 4), (7, 3)], fill=rgba("white"),
              outline=rgba("ink"))
    return img


def build():
    sprites = {}
    meta = {}

    sprites["panel"], meta["panel"] = _panel("wall_dark", "wall_light", "shadow")
    sprites["panel_dark"], meta["panel_dark"] = _panel("night", "wall", "ink")
    sprites["panel_gold"], meta["panel_gold"] = _panel("brown3", "gold1", "brown1")
    sprites["panel_alert"], meta["panel_alert"] = _panel("red2", "red4", "red1")
    sprites["input"], meta["input"] = _panel("night", "wall", "ink", "wall_dark")

    for name, fill, light, shadow in (
        ("button", "brown3", "brown5", "brown1"),
        ("button_hover", "brown4", "brown6", "brown2"),
        ("button_active", "brown2", "brown4", "brown1"),
        ("button_disabled", "grey1", "grey2", "shadow"),
        ("button_bid", "green2", "green4", "green1"),
        ("button_danger", "red2", "red4", "red1"),
    ):
        sprites[name], meta[name] = _panel(fill, light, shadow)

    for i in range(8):
        sprites[f"coin_{i}"] = _coin(i)
    sprites["gavel"] = _gavel()
    sprites["wheel"] = _wheel()
    sprites["pointer"] = _pointer()
    sprites["cursor"] = _cursor()
    for name, fn in ICON_SHAPES.items():
        c = Canvas(16, 16)
        fn(c)
        sprites[name] = c.render(ICON_ROLES)
    for kind in ("money", "clock", "lock", "profit", "loss", "users", "timer"):
        sprites[f"icon_{kind}"] = _status_icon(kind)
    for kind in ("happy", "sad", "angry", "wow", "cool", "think"):
        sprites[f"emote_{kind}"] = _emote(kind)
    return sprites, meta
