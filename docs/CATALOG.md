# CATALOG — datos de objetos (workstream E ↔ A)

`assets/catalog.json` es la **fuente privada** de datos de objetos. Contiene los
valores reales y **no debe llegar nunca al cliente** (ni al bundle, ni a un
endpoint previo al revelado). El cliente solo recibe
`assets/catalog.public.json`: `id`, `category`, `silhouette`, `hints`.

El generador de lotes de A (`packages/game-core`) debe consumir este catálogo
como datos, no hardcodear valores. Propiedad de los valores: E los propone,
A los ajusta en `config.ts`/balance y avisa para regenerar el catálogo.

## Esquema

```jsonc
{
  "categories": { "electronics": "Electrónica", ... },
  "objects": [{
    "id": "tv_studio",              // id estable, usado por el protocolo
    "name": "Monitor de estudio de los 80", // solo se muestra en el revelado
    "category": "electronics",
    "silhouette": "sil_tv",         // clave en manifest.silhouettes
    "value": 420,                   // PRIVADO, euros
    "rarity": "rare",               // common | uncommon | rare
    "hook": true,                   // objeto "gancho" del lote
    "width": 20, "height": 22,      // tamaño útil del sprite (24x24 canvas)
    "hints": ["la carcasa parece buena", "el cristal está intacto"],
    "sprite": "obj_tv_studio",      // clave en manifest.sprites
    "silhouetteSprite": "sil_tv",   // clave en manifest.silhouettes
    "silhouetteFrame": "sil_sil_tv" // frame dentro del atlas objects
  }],
  "trapPairs": [{ "silhouette": "sil_tv", "objects": ["tv_bw", "tv_studio"], "ratio": 12.0 }]
}
```

## Objetos

| id | Nombre | Categoría | Silueta | Valor | Rareza | Gancho |
|---|---|---|---|---|---|---|
| `tv_bw` | Televisor en blanco y negro | electronics | sil_tv | 35 | common | no |
| `tv_studio` | Monitor de estudio de los 80 | electronics | sil_tv | 420 | rare | sí |
| `radio_plastic` | Radio de plástico | electronics | sil_radio | 20 | common | no |
| `radio_bakelite` | Radio de baquelita | electronics | sil_radio | 340 | rare | sí |
| `toolbox_rusty` | Caja de herramientas oxidada | tools | sil_toolbox | 30 | common | no |
| `toolbox_pro` | Maletín de herramientas pro | tools | sil_toolbox | 360 | rare | no |
| `drill_corded` | Taladro con cable | tools | sil_drill | 170 | uncommon | no |
| `chair_folding` | Silla plegable | furniture | sil_chair | 15 | common | no |
| `chair_designer` | Silla de diseñador | furniture | sil_chair | 500 | rare | sí |
| `lamp_tiffany` | Lámpara Tiffany | furniture | sil_lamp | 380 | uncommon | no |
| `vase_repro` | Jarrón réplica | collectibles | sil_vase | 25 | common | no |
| `vase_ming` | Jarrón Ming auténtico | collectibles | sil_vase | 900 | rare | sí |
| `comic_slab` | Cómic precintado | collectibles | sil_comic | 240 | uncommon | no |
| `jacket_work` | Chaqueta de trabajo | clothing | sil_jacket | 20 | common | no |
| `jacket_leather` | Chaqueta de cuero | clothing | sil_jacket | 280 | rare | no |
| `sneakers_boxed` | Zapatillas sin estrenar | clothing | sil_sneaker | 120 | uncommon | no |
| `trophy_participant` | Trofeo de participación | sports | sil_trophy | 15 | common | no |
| `trophy_champions` | Trofeo de campeón | sports | sil_trophy | 650 | rare | sí |
| `mixer_basic` | Batidora básica | kitchen | sil_mixer | 25 | common | no |
| `mixer_vintage` | Batidora vintage | kitchen | sil_mixer | 450 | rare | sí |
| `crate_cardboard` | Caja de cartón cerrada | mystery | sil_crate | 45 | common | no |
| `crate_locked` | Caja cerrada con candado | mystery | sil_crate | 480 | rare | sí |

## Uso en el generador de lotes (A)

- 2–5 objetos por lote, con peso mayor a 3.
- Garantizar **1 objeto gancho** (`hook: true`) por lote.
- Respetar las bandas de valor total por ronda de `config.ts`
  (150–900 / 400–1.800 / 700–3.000 €): el catálogo da piezas, el generador
  escala o combina, no cambia valores a mano.
- Los pares trampa deben poder caer en el mismo lote (misma silueta, dos valores)
  o en lotes distintos de la misma partida: el jugador no debe aprender la
  asociación forma → valor.
- Si A añade objetos, debe añadir también la geometría en
  `tools/assets-build/art/objects.py` (o reutilizar una silueta existente) y
  regenerar; `pnpm assets:validate` comprueba categorías, ids y parejas.
