import { CONFIG, lotValueBand } from "@trastero/shared";
import type { LotPublic, LotSecret } from "@trastero/shared";
import type { Rng } from "./types.js";

// Canonical ids from E's catalog: the client can resolve them directly.
const SILHOUETTES = [
  "sil_tv", "sil_radio", "sil_toolbox", "sil_drill", "sil_chair", "sil_lamp",
  "sil_vase", "sil_comic", "sil_jacket", "sil_sneaker", "sil_trophy", "sil_mixer",
  "sil_crate",
];
const CATEGORIES = ["electronics", "tools", "jewelry", "art", "misc", "antique"];
const NAMES: Record<string, string[]> = {
  electronics: ["Radio vieja", "Televisor CRT", "Walkman", "Calculadora"],
  tools: ["Taladro", "Sierra", "Caja de herramientas", "Llave inglesa"],
  jewelry: ["Collar", "Anillo", "Reloj de bolsillo", "Pendientes"],
  art: ["Cuadro", "Escultura", "Lámina", "Vaso griego"],
  misc: ["Caja misteriosa", "Muñeca", "Libro antiguo", "Juguete"],
  antique: ["Candelabro", "Espejo", "Reloj de pared", "Báscula"],
};

function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)] as T;
}

/** Fisher–Yates with the injected RNG (deterministic for tests). */
function shuffled<T>(rng: Rng, source: readonly T[]): T[] {
  const arr = [...source];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
  return arr;
}

function weightedCount(rng: Rng): number {
  const w = CONFIG.lot.objectCountWeights;
  // w[index]=weight for count=index
  const total = w.reduce((a: number, b: number) => a + b, 0);
  let r = rng() * total;
  for (let c = CONFIG.lot.minObjects; c <= CONFIG.lot.maxObjects; c++) {
    r -= w[c];
    if (r < 0) return c;
  }
  return CONFIG.lot.maxObjects;
}

export function generateLot(round: number, rng: Rng): { public: LotPublic; secret: LotSecret } {
  const band = lotValueBand(round);
  const range = CONFIG.lotValueRanges[band];
  const total = Math.round(range.min + rng() * (range.max - range.min));

  const count = weightedCount(rng);

  // values: one hook ~35-55% of total, rest split
  const values: number[] = [];
  const hook = Math.round(total * (0.35 + rng() * 0.2));
  values.push(hook);
  let remaining = total - hook;
  for (let i = 1; i < count; i++) {
    if (i === count - 1) {
      values.push(Math.max(0, remaining));
    } else {
      const v = Math.round(remaining * (0.2 + rng() * 0.4));
      values.push(Math.max(0, v));
      remaining -= v;
    }
  }
  // adjust sum to total
  const sum = values.reduce((a, b) => a + b, 0);
  if (values.length > 0) values[values.length - 1] = (values[values.length - 1] as number) + (total - sum);

  // Each object gets its own category and a distinct silhouette (except the
  // deliberate trap pair), so preview and reveal don't repeat one image/type
  // for the whole lot.
  const catPool = shuffled(rng, CATEGORIES);
  const categories = Array.from({ length: count }, (_, i) => catPool[i % catPool.length] as string);
  const silPool = shuffled(rng, SILHOUETTES);

  // silhouettes: trap pair chance ~40%
  const silhouettes: string[] = [];
  const objects: LotSecret["objects"] = [];
  const trapPair = rng() < 0.4 && count >= 3;
  let trapSilhouette: string | null = null;
  let trapIndexA = -1;
  let trapIndexB = -1;
  let silCursor = 0;
  if (trapPair) {
    trapSilhouette = silPool[silCursor++] as string;
    trapIndexA = Math.floor(rng() * count);
    // bounded search: a degenerate RNG must never hang the generator
    let attempts = 0;
    trapIndexB = trapIndexA;
    while (trapIndexB === trapIndexA && attempts < 8) {
      trapIndexB = Math.floor(rng() * count);
      attempts++;
    }
    if (trapIndexB === trapIndexA) {
      trapIndexB = (trapIndexA + 1) % count;
    }
  }

  const usedNames = new Map<string, Set<string>>();
  for (let i = 0; i < count; i++) {
    const sil =
      trapPair && (i === trapIndexA || i === trapIndexB)
        ? (trapSilhouette as string)
        : (silPool[silCursor++] ?? silPool[silPool.length - 1] as string);
    silhouettes.push(sil);

    const category = categories[i] as string;
    const used = usedNames.get(category) ?? new Set<string>();
    const pool = NAMES[category] ?? NAMES.misc!;
    const free = pool.filter((name) => !used.has(name));
    const name = pick(rng, free.length > 0 ? free : pool);
    used.add(name);
    usedNames.set(category, used);

    const val = Math.max(0, values[i] ?? 0);
    objects.push({ silhouetteId: sil, name, trueValue: val, category });
  }

  // Trap pair: same silhouette, one object worth 10x the other. Rebalance the
  // remaining objects so `trueTotal` stays inside the round band: the x10 must
  // not push the lot past `range.max` (the band is a contract, see BALANCE.md).
  if (trapPair) {
    const smallIdx = objects[trapIndexA]!.trueValue <= objects[trapIndexB]!.trueValue ? trapIndexA : trapIndexB;
    const bigIdx = smallIdx === trapIndexA ? trapIndexB : trapIndexA;
    const others = objects.filter((_, i) => i !== smallIdx && i !== bigIdx);
    // 11x the small value plus at least 1 per remaining object must fit
    const maxSmall = Math.floor((total - others.length) / 11);
    const small = Math.max(1, Math.min(objects[smallIdx]!.trueValue, maxSmall));
    objects[smallIdx]!.trueValue = small;
    objects[bigIdx]!.trueValue = small * 10;

    const remaining = total - small * 11;
    const othersValue = others.reduce((sum, o) => sum + o.trueValue, 0);
    let assigned = 0;
    others.forEach((o, i) => {
      const share = i === others.length - 1
        ? remaining - assigned
        : Math.floor((othersValue > 0 ? o.trueValue / othersValue : 1 / others.length) * remaining);
      o.trueValue = Math.max(0, share);
      assigned += o.trueValue;
    });
  }

  const trueTotal = objects.reduce((s: number, o: { trueValue: number }) => s + o.trueValue, 0);

  const id = `lot_r${round}_${Math.floor(rng() * 1e6)}`;
  const clues = [`${count} objetos`, "polvo y cajas", "iluminación tenue"];
  const uniqueCategories = new Set(objects.map((o) => o.category));
  const category = uniqueCategories.size > 1 ? "mixed" : (objects[0]?.category ?? "misc");

  const publicLot: LotPublic = {
    id,
    round,
    objectCount: count,
    silhouettes,
    clues,
    category,
  };
  const secretLot: LotSecret = { id, round, objects, trueTotal };

  return { public: publicLot, secret: secretLot };
}