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

  // trap: ensure values differ ~10x. Adjust one of pair.
  if (trapPair) {
    const a = objects[trapIndexA]!.trueValue;
    const b = objects[trapIndexB]!.trueValue;
    const small = Math.min(a, b);
    const large = small * 10;
    if (a >= b) objects[trapIndexA]!.trueValue = large;
    else objects[trapIndexB]!.trueValue = large;
    // recompute total? keep; total is target but trap may exceed; clamp not needed
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