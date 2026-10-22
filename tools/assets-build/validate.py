#!/usr/bin/env python3
"""Asset contract checks:  pnpm assets:validate

Fails (exit 1) when an asset breaks a rule from docs/ART.md or E-arte.md:
palette closure, atlas/manifest consistency, silhouette ambiguity, catalog
shape, client-side value leaks, audio and font coverage.
"""

import hashlib
import json
import os
import sys
import wave

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ASSETS = os.path.join(ROOT, "assets")

problems: list[str] = []


def fail(msg: str):
    problems.append(msg)


def load(*parts):
    with open(os.path.join(ASSETS, *parts), encoding="utf-8") as f:
        return json.load(f)


def walk_keys(node, path=""):
    if isinstance(node, dict):
        for k, v in node.items():
            yield path + "/" + k, k, v
            yield from walk_keys(v, path + "/" + k)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield f"{path}[{i}]", None, v


def main():
    try:
        manifest = load("manifest.json")
        palette = load("palette.json")
        catalog = load("catalog.json")
        public = load("catalog.public.json")
    except FileNotFoundError as exc:
        print(f"assets missing: {exc}. Run pnpm assets:build first.")
        return 1

    # ---- palette closure -------------------------------------------------
    colours = {v.lower() for v in palette["colours"].values()}
    if not 32 <= palette["count"] <= 48:
        fail(f"palette must have 32-48 colours, has {palette['count']}")
    if len(colours) != palette["count"]:
        fail("palette has duplicate hex values")

    # ---- atlas / manifest consistency ------------------------------------
    atlases = {}
    for name, entry in manifest["atlases"].items():
        for key in ("image", "data"):
            path = os.path.join(ASSETS, entry[key])
            if not os.path.isfile(path):
                fail(f"atlas {name}: missing {entry[key]}")
        try:
            data = load(entry["data"])
            atlases[name] = data["frames"]
        except Exception as exc:  # noqa: BLE001
            fail(f"atlas {name}: unreadable json ({exc})")
            continue
        img = Image.open(os.path.join(ASSETS, entry["image"])).convert("RGBA")
        used = {f"#{r:02x}{g:02x}{b:02x}" for r, g, b, a in img.getdata() if a > 0}
        outside = used - colours - {v.lower() for v in palette["silhouette"].values()}
        if outside:
            fail(f"atlas {name}: colours outside palette: {sorted(outside)[:5]}")

    for kind in ("sprites", "silhouettes"):
        for name, entry in manifest[kind].items():
            frames = atlases.get(entry["atlas"])
            if frames is None:
                fail(f"{kind}.{name}: unknown atlas {entry['atlas']}")
            elif entry["frame"] not in frames:
                fail(f"{kind}.{name}: frame {entry['frame']} not in atlas")

    for name, entry in manifest["ui"].items():
        frames = atlases.get(entry["atlas"])
        if frames is None or entry["frame"] not in frames:
            fail(f"ui.{name}: frame {entry['frame']} missing from atlas {entry['atlas']}")

    for anim in manifest["animations"].values():
        if "atlas" in anim:
            frames = atlases.get(anim["atlas"], {})
            for frame in anim["frames"]:
                if frame not in frames:
                    fail(f"animation frame {frame} missing from atlas {anim['atlas']}")
        else:
            if not os.path.isfile(os.path.join(ASSETS, anim["image"])):
                fail(f"animation sheet missing: {anim['image']}")

    for group in ("backgrounds", "overlays"):
        for name, value in manifest[group].items():
            paths = value.values() if isinstance(value, dict) else [value]
            for p in paths:
                if isinstance(p, str) and p.endswith(".png"):
                    if not os.path.isfile(os.path.join(ASSETS, p)):
                        fail(f"{group}.{name}: missing {p}")

    # ---- audio -----------------------------------------------------------
    for name, entry in manifest["audio"].items():
        path = os.path.join(ASSETS, entry["file"])
        if not os.path.isfile(path):
            fail(f"audio.{name}: missing {entry['file']}")
            continue
        try:
            with wave.open(path, "rb") as w:
                frames, rate = w.getnframes(), w.getframerate()
            if frames == 0 or rate < 8000:
                fail(f"audio.{name}: empty or bad sample rate")
            if frames / rate > 30:
                fail(f"audio.{name}: longer than 30s")
        except Exception as exc:  # noqa: BLE001
            fail(f"audio.{name}: not a valid wav ({exc})")
        if not 0 <= entry.get("volume", -1) <= 1:
            fail(f"audio.{name}: volume must be 0..1")

    # ---- font coverage ---------------------------------------------------
    font_data = load(manifest["font"]["data"])
    have = {chr(c["id"]) for c in font_data["chars"]}
    needed = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:;!?'\"-+/%()=€&*#@_<>[]{}°~ºª")
    needed |= set("áéíóúüñÁÉÍÓÚÜÑ¡¿")
    missing = sorted(needed - have)
    if missing:
        fail(f"font missing glyphs: {''.join(missing)}")
    if not os.path.isfile(os.path.join(ASSETS, manifest["font"]["image"])):
        fail("font image missing")

    # ---- catalog ---------------------------------------------------------
    objects = catalog["objects"]
    categories = catalog["categories"]
    if not 20 <= len(objects) <= 30:
        fail(f"catalog should have 20-30 objects, has {len(objects)}")
    if not 6 <= len(categories) <= 8:
        fail(f"catalog should have 6-8 categories, has {len(categories)}")
    if len({o["id"] for o in objects}) != len(objects):
        fail("catalog ids are not unique")
    per_cat: dict[str, int] = {}
    by_sil: dict[str, list[dict]] = {}
    for obj in objects:
        if obj["category"] not in categories:
            fail(f"{obj['id']}: unknown category {obj['category']}")
        per_cat[obj["category"]] = per_cat.get(obj["category"], 0) + 1
        by_sil.setdefault(obj["silhouette"], []).append(obj)
        if obj["value"] <= 0:
            fail(f"{obj['id']}: value must be positive")
        for key in ("sprite", "silhouetteSprite", "name", "hints"):
            if key not in obj:
                fail(f"{obj['id']}: missing {key}")
        if obj.get("sprite") not in manifest["sprites"]:
            fail(f"{obj['id']}: sprite not in manifest")
    for cat in categories:
        if per_cat.get(cat, 0) < 2:
            fail(f"category {cat} has fewer than 2 objects")

    # trap pairs: identical silhouette pixels, ratio >= 8x
    digests: dict[str, set[str]] = {}
    for sil in manifest["silhouettes"]:
        path = os.path.join(ASSETS, "atlases", "objects.png")
        digest = None
        if os.path.isfile(path):
            atlas = Image.open(path).convert("RGBA")
            frame = atlases["objects"][f"sil_{sil}"]["frame"]
            crop = atlas.crop((frame["x"], frame["y"], frame["x"] + frame["w"], frame["y"] + frame["h"]))
            digest = hashlib.sha1(crop.tobytes()).hexdigest()
        digests.setdefault(sil, set()).add(digest)
    pairs = 0
    for sil, group in by_sil.items():
        if len(group) < 2:
            continue
        pairs += 1
        values = [o["value"] for o in group]
        if max(values) / min(values) < 8:
            fail(f"trap pair {sil}: value ratio below 8x")
        if len({o["sprite"] for o in group}) != len(group):
            fail(f"trap pair {sil}: duplicate sprites")
    if pairs < 6:
        fail(f"expected at least 6 trap pairs, found {pairs}")

    # ---- anti-leak -------------------------------------------------------
    leaked = [p for p, k, _ in walk_keys(manifest) if k in ("value", "trueValue", "values")]
    if leaked:
        fail(f"client manifest leaks values: {leaked[:5]}")
    for entry in public["objects"]:
        for key in ("value", "trueValue", "rarity", "hook"):
            if key in entry:
                fail(f"public catalog leaks {key} for {entry.get('id')}")
    if manifest.get("catalog") == "catalog.json":
        fail("manifest must point to catalog.public.json, never the private catalog")

    # ---- report ----------------------------------------------------------
    if problems:
        print("assets:validate FAILED")
        for p in problems:
            print(f"  - {p}")
        return 1
    print(f"assets:validate OK -> {len(objects)} objects, {pairs} trap pairs, "
          f"{len(manifest['sprites'])} sprites, {len(manifest['audio'])} sounds, "
          f"{palette['count']} colours")
    return 0


if __name__ == "__main__":
    sys.exit(main())
