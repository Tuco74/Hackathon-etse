"""Tiny deterministic pixel canvas.

Sprites are described as a list of primitive ops with *role* names
(`base`, `light`, `shadow`, `metal`, ...).  A variant supplies role -> palette
name, so two variants of the same shape share geometry, outline and
silhouette while differing in palette.  That is what makes the "trap pairs"
honest: the preview silhouette is pixel-identical, the value is not.
"""

from PIL import Image, ImageDraw

from palette import SILHOUETTE, hex_rgba, rgba


class Canvas:
    def __init__(self, w: int, h: int):
        self.w, self.h = w, h
        self.ops: list[tuple] = []

    # -- primitives -----------------------------------------------------
    def rect(self, x: int, y: int, w: int, h: int, role: str):
        if w <= 0 or h <= 0:
            return self
        self.ops.append(("rect", (x, y, x + w - 1, y + h - 1), role))
        return self

    def ellipse(self, x0: int, y0: int, x1: int, y1: int, role: str):
        self.ops.append(("ellipse", (x0, y0, x1, y1), role))
        return self

    def poly(self, points: list[tuple[int, int]], role: str):
        self.ops.append(("poly", points, role))
        return self

    def line(self, x0: int, y0: int, x1: int, y1: int, role: str, width: int = 1):
        self.ops.append(("line", (x0, y0, x1, y1, width), role))
        return self

    def dot(self, x: int, y: int, role: str):
        return self.rect(x, y, 1, 1, role)

    def checker(self, x: int, y: int, w: int, h: int, step: int, role: str):
        for yy in range(0, h, step):
            for xx in range(0, w, step):
                self.dot(x + xx, y + yy, role)
        return self

    # -- rendering ------------------------------------------------------
    def mask(self) -> Image.Image:
        m = Image.new("L", (self.w, self.h), 0)
        d = ImageDraw.Draw(m)
        for kind, geom, _ in self.ops:
            if kind == "rect":
                d.rectangle(geom, fill=255)
            elif kind == "ellipse":
                d.ellipse(geom, fill=255)
            elif kind == "poly":
                d.polygon(geom, fill=255)
            elif kind == "line":
                x0, y0, x1, y1, width = geom
                d.line((x0, y0, x1, y1), fill=255, width=width)
        return m

    def render(self, roles: dict[str, str]) -> Image.Image:
        """Paint the ops using a role->palette-name map, then add a 1px rim."""
        img = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        for kind, geom, role in self.ops:
            colour = rgba(roles[role])
            if kind == "rect":
                d.rectangle(geom, fill=colour)
            elif kind == "ellipse":
                d.ellipse(geom, fill=colour)
            elif kind == "poly":
                d.polygon(geom, fill=colour)
            elif kind == "line":
                x0, y0, x1, y1, width = geom
                d.line((x0, y0, x1, y1), fill=colour, width=width)
        _outline(img, roles.get("outline", "ink"))
        return img

    def silhouette(self) -> Image.Image:
        """Flat fill + one shade tone, derived from alpha.  Same for every
        object in the game, so value cannot leak through rendering."""
        m = self.mask()
        img = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        fill = hex_rgba(SILHOUETTE["fill"])
        shade = hex_rgba(SILHOUETTE["shade"])
        px = m.load()
        out = img.load()
        for y in range(self.h):
            for x in range(self.w):
                if px[x, y] == 0:
                    continue
                below = y + 1 < self.h and px[x, y + 1] != 0
                right = x + 1 < self.w and px[x + 1, y] != 0
                out[x, y] = shade if not (below and right) else fill
        _outline(img, SILHOUETTE["outline"])
        return img


def _outline(img: Image.Image, palette_name: str) -> None:
    w, h = img.size
    src = img.load()
    rim = hex_rgba(palette_name) if palette_name.startswith("#") else rgba(palette_name)
    edge = []
    for y in range(h):
        for x in range(w):
            if src[x, y][3] == 0:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and src[nx, ny][3] != 0:
                        edge.append((x, y))
                        break
    for x, y in edge:
        src[x, y] = rim
