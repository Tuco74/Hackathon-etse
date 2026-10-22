import { CONFIG, lotValueBand } from "@trastero/shared";
import type { LotPublic, LotSecret } from "@trastero/shared";
import type { Rng } from "./types.js";

const SILHOUETTES = ["s_box", "s_vase", "s_tool", "s_frame", "s_lamp", "s_chest", "s_bottle", "s_statue", "s_guitar", "s_tv", "s_clock", "s_bag"];
const CATEGORIES = ["electronics", "tools", "jewelry", "art", "misc", "antique"];
const NAMES: Record<string, string[]> = {
  electronics: ["Radio vieja", "Televisor CRT", "Walkman", "Calculadora"],
  tools: ["Taladro", "Sierra", "Caja de herramientas", "Llave inglesa"],
  jewelry: ["Collar", "Anillo", "Reloj de bolsillo", "Pendientes"],
  art: ["Cuadro", "Escultura", "Lámina", "Vaso griego"],
  misc: ["Caja misteriosa", "Muñeca", "Libro antiguo", "Juguete"],
  antique: ["Candelabro", "Espejo", "Reloj de pared", "Báscula"],
};

function pick<T>(rng: Rng, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)] as T;
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
  const category = pick(rng, CATEGORIES);

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

  // silhouettes: trap pair chance ~40%
  const silhouettes: string[] = [];
  const objects: LotSecret["objects"] = [];
  const trapPair = rng() < 0.4 && count >= 3;
  let trapSilhouette: string | null = null;
  let trapIndexA = -1;
  let trapIndexB = -1;
  if (trapPair) {
    trapSilhouette = pick(rng, SILHOUETTES);
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

  for (let i = 0; i < count; i++) {
    let sil: string;
    if (trapPair && (i === trapIndexA || i === trapIndexB)) {
      sil = trapSilhouette!;
    } else {
      // avoid reuse? allow
      sil = pick(rng, SILHOUETTES);
    }
    silhouettes.push(sil);
    const val = Math.max(0, values[i] ?? 0);
    const name = pick(rng, (NAMES[category] ?? NAMES.misc) as string[]);
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