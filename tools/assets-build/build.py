#!/usr/bin/env python3
"""Reproducible asset build:  pnpm assets:build

Reads the art sources in tools/assets-build/art/ and writes:
  assets/palette.json|png
  assets/atlases/{objects,ui,font}.{png,json}
  assets/backgrounds/*.png
  assets/audio/*.wav
  assets/catalog.json            (private: values, server-side only)
  assets/catalog.public.json     (client-safe: no values)
  assets/manifest.json           (client entry point)
  assets/src/**                  (editable sources / contact sheets)

Only Pillow is required (see requirements.txt).
"""

import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "tools", "assets-build", "art"))

import audio  # noqa: E402
import backgrounds  # noqa: E402
import font as pixel_font  # noqa: E402
import objects  # noqa: E402
import ui  # noqa: E402
from canvas import Canvas  # noqa: E402
from palette import PALETTE, SILHOUETTE, palette_json  # noqa: E402

ASSETS = os.path.join(ROOT, "assets")


def ensure(*parts):
    path = os.path.join(ASSETS, *parts)
    os.makedirs(path, exist_ok=True)
    return path


def save(img: Image.Image, *parts):
    path = os.path.join(ASSETS, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    return os.path.relpath(path, ASSETS).replace(os.sep, "/")


def pack(images, padding=1, max_width=256):
    items = sorted(images.items(), key=lambda kv: (-kv[1].height, -kv[1].width))
    x = y = row_h = 0
    rects = {}
    for name, img in items:
        if x + img.width + padding > max_width and x:
            x = 0
            y += row_h + padding
            row_h = 0
        rects[name] = (x, y, img.width, img.height)
        x += img.width + padding
        row_h = max(row_h, img.height)
    width = max_width
    height = y + row_h + padding
    sheet = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    for name, img in images.items():
        rx, ry, _, _ = rects[name]
        sheet.alpha_composite(img, (rx, ry))
    return sheet, rects


def atlas_json(rects, image_name, size):
    frames = {}
    for name, (x, y, w, h) in rects.items():
        frames[name] = {
            "frame": {"x": x, "y": y, "w": w, "h": h},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h},
            "sourceSize": {"w": w, "h": h},
        }
    return {
        "frames": frames,
        "meta": {"app": "trastero-wars assets:build", "version": "1.0",
                 "image": image_name, "format": "RGBA8888",
                 "size": {"w": size[0], "h": size[1]}, "scale": "1"},
    }


def main():
    ensure()
    for sub in ("atlases", "backgrounds", "audio", "src", "src/objects", "src/ui"):
        ensure(sub)

    # ---- palette -----------------------------------------------------
    with open(os.path.join(ASSETS, "palette.json"), "w", encoding="utf-8") as f:
        json.dump(palette_json(), f, indent=2, ensure_ascii=False)
        f.write("\n")
    sw = 24
    cols = 10
    rows = (len(PALETTE) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (sw + 4) + 4, rows * (sw + 4) + 4), (20, 17, 29))
    from palette import rgb
    for i, (name, hexv) in enumerate(PALETTE.items()):
        x = 4 + (i % cols) * (sw + 4)
        y = 4 + (i // cols) * (sw + 4)
        from PIL import ImageDraw
        ImageDraw.Draw(sheet).rectangle((x, y, x + sw - 1, y + sw - 1), fill=rgb(name))
    save(sheet, "palette.png")

    # ---- objects + silhouettes --------------------------------------
    sprites = {}
    silhouettes = {}
    ui_sprites, ui_meta = ui.build()

    objects_atlas = {}
    for entry in objects.CATALOG:
        canvas = Canvas(objects.SPRITE, objects.SPRITE)
        objects.SHAPES[entry["silhouette"]](canvas)
        sprite = canvas.render(objects.ROLES[entry["id"]])
        sil = canvas.silhouette()
        objects_atlas[f"obj_{entry['id']}"] = sprite
        sprites[f"obj_{entry['id']}"] = {
            "atlas": "objects", "frame": f"obj_{entry['id']}",
            "category": entry["category"], "silhouette": entry["silhouette"],
            "w": sprite.width, "h": sprite.height, "anchor": [0.5, 1.0],
        }
        silhouettes[entry["silhouette"]] = {
            "atlas": "objects", "frame": f"sil_{entry['silhouette']}",
            "w": sil.width, "h": sil.height, "anchor": [0.5, 1.0],
        }
        save(sprite, "src", "objects", f"{entry['id']}.png")
        with open(os.path.join(ASSETS, "src", "objects", f"{entry['id']}.roles.json"), "w",
                  encoding="utf-8") as f:
            roles = dict(objects.ROLES[entry["id"]])
            json.dump({"palette": {r: PALETTE[p] for r, p in roles.items()}},
                      f, indent=2, ensure_ascii=False)
            f.write("\n")

    for shape_id in objects.SHAPES:
        canvas = Canvas(objects.SPRITE, objects.SPRITE)
        objects.SHAPES[shape_id](canvas)
        objects_atlas[f"sil_{shape_id}"] = canvas.silhouette()

    obj_img, obj_rects = pack(objects_atlas, max_width=256)
    save(obj_img, "atlases", "objects.png")
    with open(os.path.join(ASSETS, "atlases", "objects.json"), "w", encoding="utf-8") as f:
        json.dump(atlas_json(obj_rects, "objects.png", obj_img.size), f, indent=2)
        f.write("\n")

    # source contact sheet (both variants + silhouette)
    cell = 24 * 4 + 6
    cols = 6
    rows = (len(objects.CATALOG) + cols - 1) // cols
    contact = Image.new("RGBA", (cols * cell, rows * (cell + 10)), (20, 17, 29, 255))
    from PIL import ImageDraw
    cd = ImageDraw.Draw(contact)
    for i, entry in enumerate(objects.CATALOG):
        x = (i % cols) * cell + 3
        y = (i // cols) * (cell + 10) + 3
        contact.alpha_composite(objects_atlas[f"obj_{entry['id']}"].resize((96, 96), Image.NEAREST), (x, y))
        contact.alpha_composite(objects_atlas[f"sil_{entry['silhouette']}"].resize((48, 48), Image.NEAREST),
                                (x + 48, y + 48))
        cd.text((x, y + 98), entry["id"], fill=(207, 201, 217, 255))
    save(contact, "src", "objects_contact_sheet.png")

    # ---- ui ----------------------------------------------------------
    for name, img in ui_sprites.items():
        save(img, "src", "ui", f"{name}.png")
    ui_img, ui_rects = pack(ui_sprites, max_width=128)
    save(ui_img, "atlases", "ui.png")
    with open(os.path.join(ASSETS, "atlases", "ui.json"), "w", encoding="utf-8") as f:
        json.dump(atlas_json(ui_rects, "ui.png", ui_img.size), f, indent=2)
        f.write("\n")

    # ---- font --------------------------------------------------------
    font_img, font_data, font_preview, font_xml = pixel_font.build()
    save(font_img, "atlases", "font.png")
    with open(os.path.join(ASSETS, "atlases", "font.json"), "w", encoding="utf-8") as f:
        json.dump(font_data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    with open(os.path.join(ASSETS, "atlases", "font.xml"), "w", encoding="utf-8") as f:
        f.write(font_xml)
    save(font_preview, "src", "font_preview.png")

    # ---- backgrounds -------------------------------------------------
    bg_names = backgrounds.build(os.path.join(ASSETS, "backgrounds"))

    # ---- in-context previews (docs + manual check) --------------------
    def scene(entries, silhouettes_only, name):
        base = Image.open(os.path.join(ASSETS, "backgrounds", "unit_b_back.png")).convert("RGBA")
        base.alpha_composite(Image.open(os.path.join(ASSETS, "backgrounds", "unit_b_mid.png")))
        base.alpha_composite(Image.open(os.path.join(ASSETS, "backgrounds", "light_cone.png")))
        dim = Image.new("RGBA", base.size, (11, 9, 16, 90))
        base.alpha_composite(dim)
        from PIL import ImageDraw
        positions = [(96, 146), (176, 146), (256, 146)]
        for key, (x, y) in zip(entries, positions):
            sprite = objects_atlas[key].resize((48, 48), Image.NEAREST)
            ImageDraw.Draw(base).ellipse((x + 2, y + 42, x + 46, y + 50), fill=(11, 9, 16, 120))
            base.alpha_composite(sprite, (x, y))
        base.alpha_composite(Image.open(os.path.join(ASSETS, "backgrounds", "unit_b_front.png")))
        base.alpha_composite(Image.open(os.path.join(ASSETS, "backgrounds", "vignette.png")))
        save(base, "src", name)

    demo = ["vase_ming", "tv_studio", "toolbox_rusty"]
    scene([f"sil_{[e for e in objects.CATALOG if e['id'] == i][0]['silhouette']}" for i in demo],
          True, "preview_round.png")
    scene([f"obj_{i}" for i in demo], False, "preview_reveal.png")

    # ---- audio -------------------------------------------------------
    audio_files = audio.build(os.path.join(ASSETS, "audio"))

    # ---- catalog -----------------------------------------------------
    public_catalog = []
    private_catalog = []
    seen_sig = {}
    for entry in objects.CATALOG:
        sig = entry["silhouette"]
        seen_sig.setdefault(sig, []).append(entry["id"])
        private_catalog.append({
            **entry,
            "sprite": f"obj_{entry['id']}",
            "silhouetteSprite": entry["silhouette"],
            "silhouetteFrame": f"sil_{entry['silhouette']}",
        })
        public_catalog.append({
            "id": entry["id"],
            "name": entry["name"],
            "category": entry["category"],
            "silhouette": entry["silhouette"],
            "sprite": f"obj_{entry['id']}",
            "hints": entry["hints"],
        })
    trap_pairs = [
        {"silhouette": sil, "objects": ids,
         "ratio": round(max(o["value"] for o in objects.CATALOG if o["id"] in ids) /
                        min(o["value"] for o in objects.CATALOG if o["id"] in ids), 1)}
        for sil, ids in seen_sig.items() if len(ids) > 1
    ]
    with open(os.path.join(ASSETS, "catalog.json"), "w", encoding="utf-8") as f:
        json.dump({
            "note": "PRIVATE - contains true values. Server/game-core only. Never bundle for the client.",
            "categories": {c: objects.CATEGORY_LABELS[c] for c in objects.CATEGORIES},
            "objects": private_catalog,
            "trapPairs": trap_pairs,
        }, f, indent=2, ensure_ascii=False)
        f.write("\n")
    with open(os.path.join(ASSETS, "catalog.public.json"), "w", encoding="utf-8") as f:
        json.dump({"objects": public_catalog}, f, indent=2, ensure_ascii=False)
        f.write("\n")

    # ---- manifest ----------------------------------------------------
    manifest = {
        "version": 1,
        "game": {"width": 480, "height": 270, "scale": 4, "pixelArt": True,
                 "roundPixels": True, "antialias": False},
        "palette": {"file": "palette.json", "colours": len(PALETTE),
                    "silhouette": SILHOUETTE},
        "font": {"image": "atlases/font.png", "data": "atlases/font.xml",
                 "json": "atlases/font.json",
                 "charWidth": pixel_font.CELL_W, "lineHeight": pixel_font.CELL_H},
        "atlases": {
            "objects": {"image": "atlases/objects.png", "data": "atlases/objects.json"},
            "ui": {"image": "atlases/ui.png", "data": "atlases/ui.json"},
        },
        "sprites": sprites,
        "silhouettes": silhouettes,
        "ui": {name: {"atlas": "ui", "frame": name, **ui_meta.get(name, {})}
               for name in ui_sprites},
        "animations": {
            "coin_spin": {"atlas": "ui", "frames": [f"coin_{i}" for i in range(8)],
                          "fps": 12, "loop": True},
            "dust": {"image": "backgrounds/dust.png", "frameWidth": 16, "frameHeight": 16,
                     "frames": 8, "fps": 8, "loop": True},
        },
        "backgrounds": {
            "unit_a": {"back": "backgrounds/unit_a_back.png", "mid": "backgrounds/unit_a_mid.png",
                       "front": "backgrounds/unit_a_front.png", "parallax": [0.0, 0.35, 0.6]},
            "unit_b": {"back": "backgrounds/unit_b_back.png", "mid": "backgrounds/unit_b_mid.png",
                       "front": "backgrounds/unit_b_front.png", "parallax": [0.0, 0.35, 0.6]},
            "unit_c": {"back": "backgrounds/unit_c_back.png", "mid": "backgrounds/unit_c_mid.png",
                       "front": "backgrounds/unit_c_front.png", "parallax": [0.0, 0.35, 0.6]},
        },
        "overlays": {"light": "backgrounds/light_cone.png", "vignette": "backgrounds/vignette.png"},
        "audio": {
            "sfx_bid": {"file": "audio/sfx_bid.wav", "volume": 0.5, "loop": False},
            "sfx_gavel": {"file": "audio/sfx_gavel.wav", "volume": 0.7, "loop": False},
            "sfx_coin": {"file": "audio/sfx_coin.wav", "volume": 0.6, "loop": False},
            "sfx_spin": {"file": "audio/sfx_spin.wav", "volume": 0.5, "loop": False},
            "sfx_tension": {"file": "audio/sfx_tension.wav", "volume": 0.35, "loop": True},
            "sfx_win": {"file": "audio/sfx_win.wav", "volume": 0.7, "loop": False},
            "sfx_lose": {"file": "audio/sfx_lose.wav", "volume": 0.6, "loop": False},
            "sfx_roulette": {"file": "audio/sfx_roulette.wav", "volume": 0.6, "loop": False},
            "music_loop": {"file": "audio/music_loop.wav", "volume": 0.3, "loop": True},
        },
        "catalog": "catalog.public.json",
    }
    with open(os.path.join(ASSETS, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write("\n")

    total = 0
    for base, _, files in os.walk(ASSETS):
        total += sum(os.path.getsize(os.path.join(base, fn)) for fn in files)
    print(f"assets:build OK -> {len(objects.CATALOG)} objects, {len(objects.SHAPES)} silhouettes, "
          f"{len(ui_sprites)} ui sprites, {len(bg_names)} background layers, "
          f"{len(audio_files)} sounds, {len(PALETTE)} colours, {total / 1024:.0f} KiB")


if __name__ == "__main__":
    main()
