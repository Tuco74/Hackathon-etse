"""Closed 46-colour palette for Trastero Wars.

Single source of truth: `assets/palette.json` and `assets/palette.png` are
generated from this file by `pnpm assets:build`. Never add a colour outside
this list to a sprite; `validate.py` fails the build if a sprite uses one.

Groups are used by docs/ART.md and by the theme helpers (ramps).
"""

# name -> (hex, group)
PALETTE = {
    # neutrals / structure
    "ink": "#0b0910",
    "night": "#14111d",
    "shadow": "#1e1a29",
    "wall_dark": "#2a2438",
    "wall": "#3a3349",
    "wall_light": "#4d4560",
    "grey1": "#5f576f",
    "grey2": "#7d7589",
    "grey3": "#a49cb2",
    "grey4": "#cfc9d9",
    "white": "#f6f3fa",
    # wood / cardboard
    "brown1": "#2f1d14",
    "brown2": "#4a2c1c",
    "brown3": "#6d4527",
    "brown4": "#96683a",
    "brown5": "#c19057",
    "brown6": "#e6c089",
    # red
    "red1": "#4a141f",
    "red2": "#7c2033",
    "red3": "#b63246",
    "red4": "#e35d68",
    # orange / yellow
    "orange1": "#7a3a10",
    "orange2": "#b86a18",
    "orange3": "#f0a03a",
    "yellow1": "#ffd166",
    "yellow2": "#f2b134",
    # green
    "green1": "#173327",
    "green2": "#2c5e3d",
    "green3": "#4f9455",
    "green4": "#8fcf74",
    # teal / cyan
    "teal1": "#123a3a",
    "teal2": "#1f6a63",
    "teal3": "#3fb8a6",
    "cyan1": "#6fe3e1",
    # blue
    "blue1": "#16243c",
    "blue2": "#274a75",
    "blue3": "#3f7bb0",
    "blue4": "#7fb6dd",
    # purple / pink
    "purple1": "#2e1a44",
    "purple2": "#53306b",
    "purple3": "#7d4a93",
    "purple4": "#b07ac4",
    "pink1": "#d94f8a",
    "pink2": "#ff8fc0",
    # gold
    "gold1": "#c99a3c",
    "gold2": "#f0d27a",
}

# Silhouette rendering uses exactly these three colours for every object so
# that shape (never colour or detail) is the only information in the preview.
SILHOUETTE = {
    "fill": "#4a4459",
    "shade": "#2f2a3c",
    "outline": "#0b0910",
}

# Drawable roles -> palette names.  `outline` is special: it is applied to the
# 1px rim of every sprite and is never drawn as a shape.
COMMON = {"outline": "ink", "dark": "ink"}


def rgb(name: str) -> tuple[int, int, int]:
    h = PALETTE[name].lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def rgba(name: str, alpha: int = 255) -> tuple[int, int, int, int]:
    r, g, b = rgb(name)
    return r, g, b, alpha


def hex_rgba(hexstr: str, alpha: int = 255) -> tuple[int, int, int, int]:
    h = hexstr.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), alpha


def palette_json():
    """Client-facing palette document (also written to assets/palette.json)."""
    groups: dict[str, list[str]] = {}
    for name, hexv in PALETTE.items():
        groups.setdefault(hexv, []).append(name)
    return {
        "version": 1,
        "count": len(PALETTE),
        "note": "Cerrada: ningun sprite puede usar un color fuera de esta lista.",
        "colours": {name: hexv for name, hexv in PALETTE.items()},
        "silhouette": SILHOUETTE,
        "groups": {
            "neutrals": ["ink", "night", "shadow", "wall_dark", "wall", "wall_light",
                         "grey1", "grey2", "grey3", "grey4", "white"],
            "wood": ["brown1", "brown2", "brown3", "brown4", "brown5", "brown6"],
            "red": ["red1", "red2", "red3", "red4"],
            "orange_yellow": ["orange1", "orange2", "orange3", "yellow1", "yellow2"],
            "green": ["green1", "green2", "green3", "green4"],
            "teal_cyan": ["teal1", "teal2", "teal3", "cyan1"],
            "blue": ["blue1", "blue2", "blue3", "blue4"],
            "purple_pink": ["purple1", "purple2", "purple3", "purple4", "pink1", "pink2"],
            "gold": ["gold1", "gold2"],
        },
    }
