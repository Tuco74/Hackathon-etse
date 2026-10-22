import type { Manifest, SilhouetteRef } from "./manifest";
import type { PublicCatalog } from "./catalog";

/**
 * Temporary adapter between game-core's generic silhouette/name vocabulary
 * (s_box, "Televisor CRT", ...) and E's art catalog (sil_tv, obj_tv_bw, ...).
 *
 * It lives in the client so A's pure rules keep their current vocabulary.
 * When A adopts `assets/catalog.json`, this file can be deleted and the
 * protocol can carry `sprite`/`silhouette` ids directly.
 */

const SILHOUETTE_ALIASES: Record<string, string> = {
  s_box: "sil_crate",
  s_chest: "sil_crate",
  s_vase: "sil_vase",
  s_bottle: "sil_vase",
  s_tool: "sil_toolbox",
  s_lamp: "sil_lamp",
  s_frame: "sil_comic",
  s_statue: "sil_trophy",
  s_guitar: "sil_jacket",
  s_tv: "sil_tv",
  s_clock: "sil_radio",
  s_bag: "sil_toolbox",
};

const NAME_SPRITES: Record<string, string> = {
  // electronics
  "Radio vieja": "obj_radio_plastic",
  "Televisor CRT": "obj_tv_bw",
  Walkman: "obj_radio_bakelite",
  Calculadora: "obj_radio_plastic",
  // tools
  Taladro: "obj_drill_corded",
  Sierra: "obj_toolbox_rusty",
  "Caja de herramientas": "obj_toolbox_pro",
  "Llave inglesa": "obj_toolbox_rusty",
  // jewelry
  Collar: "obj_trophy_participant",
  Anillo: "obj_trophy_participant",
  "Reloj de bolsillo": "obj_radio_bakelite",
  Pendientes: "obj_trophy_participant",
  // art
  Cuadro: "obj_comic_slab",
  Escultura: "obj_trophy_champions",
  "Lámina": "obj_comic_slab",
  "Vaso griego": "obj_vase_ming",
  // misc
  "Caja misteriosa": "obj_crate_locked",
  "Muñeca": "obj_jacket_work",
  "Libro antiguo": "obj_comic_slab",
  Juguete: "obj_radio_plastic",
  // antique
  Candelabro: "obj_lamp_tiffany",
  Espejo: "obj_comic_slab",
  "Reloj de pared": "obj_radio_bakelite",
  "Báscula": "obj_mixer_basic",
};

export function resolveSilhouetteId(id: string): string {
  return SILHOUETTE_ALIASES[id] ?? id;
}

export function silhouetteFor(
  manifest: Manifest,
  id: string,
): SilhouetteRef | undefined {
  const direct = manifest.silhouettes[id];
  if (direct) return direct;
  const aliased = manifest.silhouettes[resolveSilhouetteId(id)];
  if (aliased) return aliased;
  return manifest.silhouettes.sil_crate;
}

export function spriteForObject(
  manifest: Manifest,
  catalog: PublicCatalog,
  name: string,
  silhouetteId: string,
): string {
  const fromCatalog = catalog.objects.find((object) => object.name === name);
  if (fromCatalog && manifest.sprites[fromCatalog.sprite]) return fromCatalog.sprite;

  const mapped = NAME_SPRITES[name];
  if (mapped && manifest.sprites[mapped]) return mapped;

  const silhouette = resolveSilhouetteId(silhouetteId);
  const canonical = catalog.objects.find((object) => object.silhouette === silhouette);
  return canonical?.sprite ?? "obj_crate_locked";
}
