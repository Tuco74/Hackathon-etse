# ART — Trastero Wars (workstream E)

Guía de arte, paleta cerrada, catálogo de sprites y pipeline de assets.
Todo lo que hay en `assets/` se genera con `pnpm assets:build`; nada se edita a
mano en `assets/atlases/`.

- Resolución interna: **480 × 270**, escalado **entero** (×4 = 1920×1080, ×3 = 1440×810).
- Phaser: `pixelArt: true`, `roundPixels: true`, `antialias: false`.
- Nada de rotaciones suaves, escalas fraccionarias ni posiciones subpíxel.
- Paleta cerrada de **46 colores** (límite 32–48). `pnpm assets:validate` falla si
  un sprite usa un color fuera de la lista.
- Idioma de la UI: español. Código, ids y ficheros en inglés.

Referencias visuales generadas: `assets/src/preview_round.png` (vista previa con
siluetas), `assets/src/preview_reveal.png` (revelado), `assets/src/objects_contact_sheet.png`,
`assets/src/font_preview.png`.

---

## 1. Paleta cerrada

Fuente única: `tools/assets-build/art/palette.py` → `assets/palette.json` + `assets/palette.png`.
Regla: **ningún** color fuera de esta tabla. Sombras y luces se hacen con otra
entrada de la paleta, nunca con opacidad ni con filtros.

| Grupo | Nombre | Hex | Uso |
|---|---|---|---|
| neutros | `ink` | `#0b0910` | contorno de todos los sprites, texto |
| | `night` | `#14111d` | fondo de escena, huecos, pantallas apagadas |
| | `shadow` | `#1e1a29` | sombras duras, ranuras |
| | `wall_dark` | `#2a2438` | pared base |
| | `wall` | `#3a3349` | paneles, muebles |
| | `wall_light` | `#4d4560` | luces de pared y marcos |
| | `grey1` | `#5f576f` | metal oscuro |
| | `grey2` | `#7d7589` | metal medio |
| | `grey3` | `#a49cb2` | metal claro, iconos |
| | `grey4` | `#cfc9d9` | brillos metálicos |
| | `white` | `#f6f3fa` | texto, destellos |
| madera | `brown1` | `#2f1d14` | juntas, sombra de madera |
| | `brown2` | `#4a2c1c` | suelo oscuro |
| | `brown3` | `#6d4527` | cajas, madera media |
| | `brown4` | `#96683a` | madera clara, cuero |
| | `brown5` | `#c19057` | canto iluminado |
| | `brown6` | `#e6c089` | cartón claro |
| rojo | `red1` | `#4a141f` | sombra de rojo |
| | `red2` | `#7c2033` | rojo profundo |
| | `red3` | `#b63246` | rojo principal (ruleta) |
| | `red4` | `#e35d68` | luz de rojo |
| naranja/amarillo | `orange1` | `#7a3a10` | óxido oscuro |
| | `orange2` | `#b86a18` | óxido |
| | `orange3` | `#f0a03a` | óxido claro, herramientas |
| | `yellow1` | `#ffd166` | luz, monedas, emotes |
| | `yellow2` | `#f2b134` | amarillo secundario |
| verde | `green1` | `#173327` | verde profundo |
| | `green2` | `#2c5e3d` | verde medio |
| | `green3` | `#4f9455` | verde principal (puja, 0 ruleta) |
| | `green4` | `#8fcf74` | verde claro |
| teal/cian | `teal1` | `#123a3a` | pantallas, agua |
| | `teal2` | `#1f6a63` | tuberías, barriles |
| | `teal3` | `#3fb8a6` | brillo teal (glare CRT) |
| | `cyan1` | `#6fe3e1` | acento cian |
| azul | `blue1` | `#16243c` | azul profundo |
| | `blue2` | `#274a75` | azul principal |
| | `blue3` | `#3f7bb0` | azul claro |
| | `blue4` | `#7fb6dd` | agua, brillos |
| morado/rosa | `purple1` | `#2e1a44` | morado profundo |
| | `purple2` | `#53306b` | morado medio |
| | `purple3` | `#7d4a93` | morado principal |
| | `purple4` | `#b07ac4` | morado claro |
| | `pink1` | `#d94f8a` | rosa (batidora vintage) |
| | `pink2` | `#ff8fc0` | rosa claro |
| oro | `gold1` | `#c99a3c` | oro |
| | `gold2` | `#f0d27a` | oro brillante |

Contraste: el texto de UI va siempre en `white` o `grey4` sobre `panel_dark` o
`night`; `ink` se reserva para contornos y sombras duras. Evitar texto sobre
`purple3`, `red3` y `green3` sin panel oscuro detrás.

---

## 2. Reglas de silueta (anti-fuga)

La vista previa **solo** muestra la silueta. El valor real no puede deducirse de
la imagen antes del revelado.

- Silueta = relleno plano `#4a4459` + un tono de sombra `#2f2a3c` en el borde
  inferior/derecho + contorno `ink`. **Idéntico para los 22 objetos.**
- Se deriva del alfa del sprite (`Canvas.silhouette()`), no se dibuja aparte:
  si el sprite cambia, la silueta cambia igual.
- Prohibido: degradados, más de un tono de sombra, detalles internos, cambios de
  contraste por rareza, brillos o partículas pegadas al objeto.
- La vista previa oscurece el fondo (`ink` al 35 %) y usa la luz de la sala para
  que la silueta tenga el mismo contraste en las 3 variantes de trastero.
- Las **parejas trampa** comparten geometría exacta (misma función de dibujo) y
  solo cambian de paleta. Dos siluetas iguales ⇒ dos valores muy distintos.

| Silueta | Objetos (barato / caro) | Valores | Ratio |
|---|---|---|---|
| `sil_tv` | `tv_bw` / `tv_studio` | 35 € / 420 € | 12× |
| `sil_radio` | `radio_plastic` / `radio_bakelite` | 20 € / 340 € | 17× |
| `sil_toolbox` | `toolbox_rusty` / `toolbox_pro` | 30 € / 360 € | 12× |
| `sil_chair` | `chair_folding` / `chair_designer` | 15 € / 500 € | 33× |
| `sil_vase` | `vase_repro` / `vase_ming` | 25 € / 900 € | 36× |
| `sil_jacket` | `jacket_work` / `jacket_leather` | 20 € / 280 € | 14× |
| `sil_trophy` | `trophy_participant` / `trophy_champions` | 15 € / 650 € | 43× |
| `sil_mixer` | `mixer_basic` / `mixer_vintage` | 25 € / 450 € | 18× |
| `sil_crate` | `crate_cardboard` / `crate_locked` | 45 € / 480 € | 10,7× |

Objetos sin pareja (silueta única): `drill_corded`, `lamp_tiffany`, `comic_slab`,
`sneakers_boxed`. Son "comodines": su forma no promete nada.

---

## 3. Objetos

22 objetos, 8 categorías, sprites de 24 × 24 con ancla **bottom-center** `(0.5, 1.0)`
para que todos se apoyen en el mismo suelo. El ancho/alto útil está en `assets/catalog.json`.

| Categoría | Objetos |
|---|---|
| `electronics` | Televisor en blanco y negro, Monitor de estudio de los 80, Radio de plástico, Radio de baquelita |
| `tools` | Caja de herramientas oxidada, Maletín de herramientas pro, Taladro con cable |
| `furniture` | Silla plegable, Silla de diseñador, Lámpara Tiffany |
| `collectibles` | Jarrón réplica, Jarrón Ming auténtico, Cómic precintado |
| `clothing` | Chaqueta de trabajo, Chaqueta de cuero, Zapatillas sin estrenar |
| `sports` | Trofeo de participación, Trofeo de campeón |
| `kitchen` | Batidora básica, Batidora vintage |
| `mystery` | Caja de cartón cerrada, Caja cerrada con candado |

Cada objeto tiene 1–2 `hints` ambiguas ("pesa lo suyo", "huele a gasolina") que
pueden mostrarse antes del revelado: **nunca** mencionan valor ni rareza.

Valores de referencia y reparto de lotes: `assets/catalog.json` (privado, solo
servidor/game-core) y `docs/CATALOG.md`. El cliente **solo** recibe
`assets/catalog.public.json` (id, categoría, silueta, hints).

---

## 4. Trasteros y capas

3 variantes de trastero, cada una en 3 capas de 480 × 270 + overlays:

| Variante | Capas | Ambiente |
|---|---|---|
| `unit_a` | `unit_a_back/mid/front.png` | puerta metálica enrollable medio abierta, estantería metálica, neumático |
| `unit_b` | `unit_b_back/mid/front.png` | garaje con puerta cerrada, ventana nocturna, estantería de madera, neumáticos |
| `unit_c` | `unit_c_back/mid/front.png` | sótano de ladrillo, tuberías, bombilla colgante, charco |

- Parallax declarado en `manifest.json`: `[0.0, 0.35, 0.6]` (fondo, medio, frente).
- `backgrounds/light_cone.png`: haz de luz cálido, se compone con `ADD`/`SCREEN`.
- `backgrounds/vignette.png`: viñeta `ink`; usar por encima de todo.
- `backgrounds/dust.png`: hoja de 8 frames de 16 × 16, `animations.dust` a 8 fps.
- El frente (`*_front.png`) tapa los bordes: no colocar HUD crítico en los 24 px
  exteriores.

---

## 5. UI kit

Atlas `ui` (`assets/atlases/ui.png` + `.json`). Los paneles y botones son
**9-slice** con bordes `8,8,8,8` (ver `manifest.ui.*.nineSlice`).

| Sprite | Uso |
|---|---|
| `panel`, `panel_dark`, `panel_gold`, `panel_alert`, `input` | marcos de HUD, modales, campos |
| `button`, `button_hover`, `button_active`, `button_disabled` | botones estándar |
| `button_bid`, `button_danger` | pujar / puja máxima, acciones destructivas |
| `coin_0..7` | moneda girando (`animations.coin_spin`, 12 fps) |
| `gavel` | mazo, cierre de subasta |
| `wheel`, `pointer` | ruleta (96 × 96) y aguja |
| `icon_electronics` … `icon_mystery` | 8 iconos de categoría, 16 × 16 |
| `icon_money`, `icon_clock`, `icon_lock`, `icon_profit`, `icon_loss`, `icon_users`, `icon_timer` | HUD y revelado (beneficio/pérdida **con icono**, no solo color) |
| `emote_happy/sad/angry/wow/cool/think` | 6 emotes, 12 × 12 |
| `cursor` | cursor pixel alternativo (opcional) |

Reglas:
- Los botones deshabilitados usan `button_disabled` **y** texto/motivo visible
  ("sin fondos", "fuera de fase"): el color no es la única señal.
- Beneficio/pérdida: `icon_profit`/`icon_loss` + signo `+`/`−` + cifra.
- Ruleta: rojo/negro/verde llevan símbolo o etiqueta además del color.

---

## 6. Tipografía

`assets/atlases/font.png` + `font.json` (BMFont JSON, cargable con
`this.load.bitmapFont('pixel', 'atlases/font.png', 'atlases/font.json')`).

- Caja 6 × 14 px, avance 6 px: 80 caracteres por línea a 480 px.
- Mayúsculas 5 × 7, x-height 5 px, descendentes 2 px, acentos incluidos.
- Cobertura: `A-Z a-z 0-9`, puntuación, `€`, `¡ ¿ ñ á é í ó ú ü Ñ Á É Í Ó Ú Ü º ª`.
- `assets/src/font_preview.png` es la prueba visual de acentos y ñ.
- Si el equipo D prefiere DOM para formularios: misma rejilla de 6 px y
  `image-rendering: pixelated`; no mezclar dos fuentes en la misma pantalla.

---

## 7. Audio

Chiptune sintetizado (mono, 16 bits, 22,05 kHz), volúmenes en `manifest.audio`.

| Sonido | Evento | Loop | Vol. |
|---|---|---|---|
| `sfx_bid` | puja aceptada | no | 0,50 |
| `sfx_gavel` | cierre de subasta / adjudicación | no | 0,70 |
| `sfx_coin` | dinero que entra en el revelado | no | 0,60 |
| `sfx_spin` | giro de ruleta | no | 0,50 |
| `sfx_tension` | últimos 3 s del timer | sí | 0,35 |
| `sfx_roulette` | resultado de ruleta | no | 0,60 |
| `sfx_win` | fin de partida, ganador | no | 0,70 |
| `sfx_lose` | fin de partida, resto | no | 0,60 |
| `music_loop` | lobby y partida | sí | 0,30 |

Mute y volumen persistentes en `localStorage` (lo implementa C/D; aquí solo se
declaran los volúmenes base).

---

## 8. Pipeline

Requisitos: Python 3.10+ y Pillow (`tools/assets-build/requirements.txt`).

```bash
pnpm assets:build      # regenera TODO assets/ desde tools/assets-build/art/
pnpm assets:validate   # contrato: paleta, atlas, parejas, catálogo, anti-fuga, audio, fuente
```

Salidas:

```
assets/palette.json|png
assets/manifest.json            # punto de entrada del cliente (sin valores)
assets/catalog.json             # PRIVADO: valores reales (servidor/game-core)
assets/catalog.public.json      # cliente: sin valores ni rareza
assets/atlases/{objects,ui,font}.png|json
assets/backgrounds/*.png
assets/audio/*.wav
assets/src/**                   # fuentes editables + hojas de contacto
```

Editar arte: se toca `tools/assets-build/art/{objects,backgrounds,ui,font,audio}.py`
y se vuelve a ejecutar el build. Los PNG de `assets/src/objects/` y sus
`*.roles.json` son la vista editable (mapeo rol → color) y se pueden abrir en
Aseprite para retoques puntuales; cualquier retoque manual debe volver al código
para que el build sea reproducible.

Los atlas generados **se commitean** (requisito de §1.3) para que el cliente no
dependa de Python en CI.

### Integración mínima (cliente)

```ts
// preload (C)
this.load.atlas('objects', 'atlases/objects.png', 'atlases/objects.json');
this.load.atlas('ui', 'atlases/ui.png', 'atlases/ui.json');
this.load.bitmapFont('pixel', 'atlases/font.png', 'atlases/font.json');
this.load.image('unit_a_back', 'backgrounds/unit_a_back.png');
// ...
```

Vista previa: usar `manifest.silhouettes[lot.silhouette]` (nunca `sprites[...]`,
que es el sprite a color del revelado). El cliente no debe pedir
`catalog.json`: si el bundle contiene ese fichero, es un fallo de anti-fuga.

---

## 9. Checklist de E

- [x] Paleta cerrada (46) y guía de estilo.
- [x] 22 objetos en 8 categorías + 13 siluetas derivadas del alfa.
- [x] 9 parejas trampa con ratio ≥ 10× y misma silueta exacta.
- [x] 3 trasteros en 3 capas + luz + polvo + viñeta.
- [x] UI kit pixel (paneles, botones, moneda, mazo, ruleta, iconos, emotes).
- [x] Fuente pixel con acentos, ñ, ¡¿ y €; prueba visual.
- [x] SFX + música loop con volúmenes en el manifiesto.
- [x] `pnpm assets:build` reproducible y `pnpm assets:validate` en verde.
- [x] Catálogo público/privado separado (anti-fuga).
- [ ] Sustituir las fuentes procedurales por `.aseprite` si el equipo quiere
      retoque manual intensivo (hoy: código + PNG/roles exportados).
- [ ] Integración real en Phaser (C) y revisión de contraste en 3 salas (D).
