// Icons come from E's UI atlas (assets/atlases/ui.png). Vite bundles the PNG at
// build time; we never copy the whole assets folder because it contains the
// private catalog.
import uiImageUrl from "../../../../assets/atlases/ui.png?url";
import uiJson from "../../../../assets/atlases/ui.json";

interface AtlasFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface AtlasEntry {
  frame: AtlasFrame;
}

interface Atlas {
  /** TexturePacker JSON: either a hash keyed by name or an array. */
  frames: Record<string, AtlasEntry> | Array<AtlasEntry & { filename: string }>;
  meta: { size: { w: number; h: number } };
}

const atlas = uiJson as unknown as Atlas;

const FRAMES = new Map<string, AtlasFrame>(
  Array.isArray(atlas.frames)
    ? atlas.frames.map((entry) => [entry.filename, entry.frame])
    : Object.entries(atlas.frames).map(([filename, entry]) => [filename, entry.frame]),
);

const ATLAS_W = atlas.meta.size.w;
const ATLAS_H = atlas.meta.size.h;

export type IconName =
  | "gavel"
  | "wheel"
  | "pointer"
  | "coin"
  | "money"
  | "clock"
  | "timer"
  | "users"
  | "lock"
  | "profit"
  | "loss"
  | "electronics"
  | "tools"
  | "furniture"
  | "collectibles"
  | "clothing"
  | "sports"
  | "kitchen"
  | "mystery";

function frameName(name: IconName): string {
  switch (name) {
    case "coin":
      return "coin_0";
    case "money":
    case "clock":
    case "timer":
    case "users":
    case "lock":
    case "profit":
    case "loss":
      return `icon_${name}`;
    case "gavel":
    case "wheel":
    case "pointer":
      return name;
    default:
      return `icon_${name}`;
  }
}

/** Decorative sprite icon. Always pair it with visible text: colour/sprite is
 * never the only carrier of information. */
export function icon(name: IconName, scale = 2): HTMLSpanElement {
  const node = document.createElement("span");
  node.className = "icon";
  node.setAttribute("aria-hidden", "true");
  const frame = FRAMES.get(frameName(name));
  if (!frame) return node;
  node.style.width = `${frame.w * scale}px`;
  node.style.height = `${frame.h * scale}px`;
  node.style.backgroundImage = `url(${uiImageUrl})`;
  node.style.backgroundPosition = `${-frame.x * scale}px ${-frame.y * scale}px`;
  node.style.backgroundSize = `${ATLAS_W * scale}px ${ATLAS_H * scale}px`;
  return node;
}

const CATEGORY_ICON: Record<string, IconName> = {
  electronics: "electronics",
  tools: "tools",
  furniture: "furniture",
  collectibles: "collectibles",
  clothing: "clothing",
  sports: "sports",
  kitchen: "kitchen",
  mystery: "mystery",
  // Server-side categories without a dedicated sprite fall back to the
  // closest silhouette family (shape + label still carry the meaning).
  jewelry: "collectibles",
  art: "collectibles",
  antique: "furniture",
  misc: "mystery",
};

export function categoryIcon(category: string, scale = 2): HTMLSpanElement {
  return icon(CATEGORY_ICON[category] ?? "mystery", scale);
}
