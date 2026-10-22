# DECISIONS

Registro de decisiones. Cada workstream añade entradas con prefijo.
Formato: `D-<ws><n> — título`, contexto, decisión, consecuencias.

## E — Arte, contenido y audio

### D-E01 — Fuentes de arte en código, no `.aseprite` binario

**Contexto:** §1.3 pide fuentes `.aseprite`/`.psd` en `assets/src` y export
reproducible. En este repo no hay Fase 0 ni pipeline de Aseprite, y un binario
no se puede revisar en un PR de hackathon.

**Decisión:** la fuente autoritativa son módulos Python legibles
(`tools/assets-build/art/*.py`) con geometría por primitivas y roles de paleta.
El build exporta a `assets/src/objects/<id>.png` + `<id>.roles.json` (rol → hex),
que se abren en Aseprite para retoques puntuales, y hojas de contacto.

**Consecuencias:** el arte es diffeable y determinista; el retoque manual debe
volver al código. Si el equipo quiere edición intensiva en Aseprite, se pueden
sustituir los PNG fuente sin cambiar el manifiesto ni el cliente.

### D-E02 — Build de assets en Python + Pillow, invocado desde pnpm

**Contexto:** el monorepo es Node/pnpm, pero la máquina de trabajo no tiene Node
instalado y el arte no necesita el runtime del juego.

**Decisión:** `pnpm assets:build` ejecuta `python3 tools/assets-build/build.py`
(única dependencia: Pillow, ver `requirements.txt`). `pnpm assets:validate`
ejecuta las comprobaciones de contrato.

**Consecuencias:** CI necesita Python 3 + Pillow solo para el job de assets; el
cliente consume PNG/JSON ya generados y commiteados. Si A prefiere Node puro, el
script se puede portar sin tocar los assets.

### D-E03 — Root `package.json` mínimo (stub para A)

**Contexto:** no existe scaffold de Fase 0; `pnpm assets:build` debe funcionar ya.

**Decisión:** se añade un `package.json` raíz **solo** con `name`, `private`,
`packageManager` y los scripts `assets:*`. No declara dependencias ni workspaces.

**Consecuencias:** A debe fusionar sus scripts/dependencias en este fichero, no
reemplazarlo a ciegas. No interfiere con `pnpm install && pnpm test` porque no
hay dependencias.

### D-E04 — Silueta derivada del alfa, 2 tonos + contorno

**Decisión:** cada silueta se genera desde el canal alfa del sprite
(`Canvas.silhouette()`), relleno plano `#4a4459` + sombra `#2f2a3c` en borde
inferior/derecho + contorno `ink`. Idéntico para los 22 objetos.

**Consecuencias:** imposible filtrar valor por color, detalle o contraste; las
parejas trampa son pixel-idénticas en la vista previa. `validate.py` comprueba
que la paleta de siluetas es exactamente esa terna.

### D-E05 — 22 objetos, 24×24, 8 categorías, 9 parejas trampa

**Decisión:** catálogo de 22 objetos (rango pedido 20–30), 13 siluetas únicas,
ancla bottom-center `(0.5, 1.0)`, tamaño de lienzo 24×24. 9 parejas comparten
geometría y difieren ≥ 10× en valor. Objetos "gancho" marcados con `hook: true`.

**Consecuencias:** el generador de A dispone de piezas suficientes para las tres
bandas de valor; cualquier objeto nuevo debe pasar `pnpm assets:validate`.

### D-E06 — Catálogo público y privado separados

**Contexto:** regla anti-fuga: el cliente no puede recibir valores antes del
revelado.

**Decisión:** `assets/catalog.json` (privado, con `value`, `rarity`, `hook`) es
para servidor/game-core. `assets/catalog.public.json` (id, categoría, silueta,
hints) es lo único enlazado desde `manifest.json`. `validate.py` falla si el
manifiesto contiene claves `value`/`trueValue` o si apunta al catálogo privado.

**Consecuencias:** el cliente puede precargar metadatos públicos sin riesgo. Los
`hints` son ambiguos y nunca mencionan precio ni rareza.

### D-E07 — Audio WAV mono 22,05 kHz generado por síntesis

**Decisión:** 8 SFX + 1 loop de música sintetizados con la librería estándar
(`wave`), sin samples ni codificadores externos. Volúmenes y `loop` viven en
`manifest.audio`.

**Consecuencias:** reproducible y sin licencias de terceros; ~0,9 MB en total.
Si el tamaño molesta en producción, se pueden transcodificar a OGG sin cambiar
las claves del manifiesto.

### D-E08 — Fuente bitmap propia con acentos y ñ

**Decisión:** fuente 5×7 (caja 6×14, avance 6) en formato BMFont JSON, con
`á é í ó ú ü ñ Á É Í Ó Ú Ü Ñ ¡ ¿ € º ª`. `assets/src/font_preview.png` es la
prueba visual.

**Consecuencias:** no depende de fuentes web externas; D puede usar la misma
rejilla en overlay DOM. Si se necesita otro tamaño, escalar por enteros.

### D-E09 — Repo sin Fase 0: assets "drop-in"

**Contexto:** el repo de origen solo contenía los prompts A–E; ni monorepo ni
`docs/PROTOCOL.md` existen todavía.

**Decisión:** se entregan solo los ficheros propiedad de E (`assets/`, `docs/ART.md`,
`docs/CATALOG.md`, `tools/assets-build/`, este registro y el stub de `package.json`),
con las rutas exactas de §1.3 para que A los integre sin mover nada.

**Consecuencias:** no se toca `apps/*`, `packages/*` ni la CI de A. La validación
de assets es independiente y puede añadirse como job de CI.
