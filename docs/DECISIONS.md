# DECISIONS

Registro de decisiones. Cada workstream a├▒ade entradas con prefijo.
Formato: `D-<ws><n> ÔÇö t├¡tulo`, contexto, decisi├│n, consecuencias.

## E ÔÇö Arte, contenido y audio

### D-E01 ÔÇö Fuentes de arte en c├│digo, no `.aseprite` binario

**Contexto:** ┬º1.3 pide fuentes `.aseprite`/`.psd` en `assets/src` y export
reproducible. En este repo no hay Fase 0 ni pipeline de Aseprite, y un binario
no se puede revisar en un PR de hackathon.

**Decisi├│n:** la fuente autoritativa son m├│dulos Python legibles
(`tools/assets-build/art/*.py`) con geometr├¡a por primitivas y roles de paleta.
El build exporta a `assets/src/objects/<id>.png` + `<id>.roles.json` (rol ÔåÆ hex),
que se abren en Aseprite para retoques puntuales, y hojas de contacto.

**Consecuencias:** el arte es diffeable y determinista; el retoque manual debe
volver al c├│digo. Si el equipo quiere edici├│n intensiva en Aseprite, se pueden
sustituir los PNG fuente sin cambiar el manifiesto ni el cliente.

### D-E02 ÔÇö Build de assets en Python + Pillow, invocado desde pnpm

**Contexto:** el monorepo es Node/pnpm, pero la m├íquina de trabajo no tiene Node
instalado y el arte no necesita el runtime del juego.

**Decisi├│n:** `pnpm assets:build` ejecuta `python3 tools/assets-build/build.py`
(├║nica dependencia: Pillow, ver `requirements.txt`). `pnpm assets:validate`
ejecuta las comprobaciones de contrato.

**Consecuencias:** CI necesita Python 3 + Pillow solo para el job de assets; el
cliente consume PNG/JSON ya generados y commiteados. Si A prefiere Node puro, el
script se puede portar sin tocar los assets.

### D-E03 ÔÇö Root `package.json` m├¡nimo (stub para A)

**Contexto:** no existe scaffold de Fase 0; `pnpm assets:build` debe funcionar ya.

**Decisi├│n:** se a├▒ade un `package.json` ra├¡z **solo** con `name`, `private`,
`packageManager` y los scripts `assets:*`. No declara dependencias ni workspaces.

**Consecuencias:** A debe fusionar sus scripts/dependencias en este fichero, no
reemplazarlo a ciegas. No interfiere con `pnpm install && pnpm test` porque no
hay dependencias.

### D-E04 ÔÇö Silueta derivada del alfa, 2 tonos + contorno

**Decisi├│n:** cada silueta se genera desde el canal alfa del sprite
(`Canvas.silhouette()`), relleno plano `#4a4459` + sombra `#2f2a3c` en borde
inferior/derecho + contorno `ink`. Id├®ntico para los 22 objetos.

**Consecuencias:** imposible filtrar valor por color, detalle o contraste; las
parejas trampa son pixel-id├®nticas en la vista previa. `validate.py` comprueba
que la paleta de siluetas es exactamente esa terna.

### D-E05 ÔÇö 22 objetos, 24├ù24, 8 categor├¡as, 9 parejas trampa

**Decisi├│n:** cat├ílogo de 22 objetos (rango pedido 20ÔÇô30), 13 siluetas ├║nicas,
ancla bottom-center `(0.5, 1.0)`, tama├▒o de lienzo 24├ù24. 9 parejas comparten
geometr├¡a y difieren ÔëÑ 10├ù en valor. Objetos "gancho" marcados con `hook: true`.

**Consecuencias:** el generador de A dispone de piezas suficientes para las tres
bandas de valor; cualquier objeto nuevo debe pasar `pnpm assets:validate`.

### D-E06 ÔÇö Cat├ílogo p├║blico y privado separados

**Contexto:** regla anti-fuga: el cliente no puede recibir valores antes del
revelado.

**Decisi├│n:** `assets/catalog.json` (privado, con `value`, `rarity`, `hook`) es
para servidor/game-core. `assets/catalog.public.json` (id, categor├¡a, silueta,
hints) es lo ├║nico enlazado desde `manifest.json`. `validate.py` falla si el
manifiesto contiene claves `value`/`trueValue` o si apunta al cat├ílogo privado.

**Consecuencias:** el cliente puede precargar metadatos p├║blicos sin riesgo. Los
`hints` son ambiguos y nunca mencionan precio ni rareza.

### D-E07 ÔÇö Audio WAV mono 22,05 kHz generado por s├¡ntesis

**Decisi├│n:** 8 SFX + 1 loop de m├║sica sintetizados con la librer├¡a est├índar
(`wave`), sin samples ni codificadores externos. Vol├║menes y `loop` viven en
`manifest.audio`.

**Consecuencias:** reproducible y sin licencias de terceros; ~0,9 MB en total.
Si el tama├▒o molesta en producci├│n, se pueden transcodificar a OGG sin cambiar
las claves del manifiesto.

### D-E08 ÔÇö Fuente bitmap propia con acentos y ├▒

**Decisi├│n:** fuente 5├ù7 (caja 6├ù14, avance 6) en formato BMFont JSON, con
`├í ├® ├¡ ├│ ├║ ├╝ ├▒ ├ü ├ë ├ì ├ô ├Ü ├£ ├æ ┬í ┬┐ Ôé¼ ┬║ ┬¬`. `assets/src/font_preview.png` es la
prueba visual.

**Consecuencias:** no depende de fuentes web externas; D puede usar la misma
rejilla en overlay DOM. Si se necesita otro tama├▒o, escalar por enteros.

### D-E09 ÔÇö Repo sin Fase 0: assets "drop-in"

**Contexto:** el repo de origen solo conten├¡a los prompts AÔÇôE; ni monorepo ni
`docs/PROTOCOL.md` existen todav├¡a.

**Decisi├│n:** se entregan solo los ficheros propiedad de E (`assets/`, `docs/ART.md`,
`docs/CATALOG.md`, `tools/assets-build/`, este registro y el stub de `package.json`),
con las rutas exactas de ┬º1.3 para que A los integre sin mover nada.

**Consecuencias:** no se toca `apps/*`, `packages/*` ni la CI de A. La validaci├│n
de assets es independiente y puede a├▒adirse como job de CI.

---

## A — Core, reglas y arquitectura

### D-A01 — Transporte: `ws` + protocolo propio en lugar de Colyseus

**Contexto:** la especificación permite `ws` solo si Colyseus bloquea el trabajo.

**Decisión:** servidor sobre `ws` con el sobre `{v,type,id,ts,payload}` de `packages/shared`.

**Consecuencias:** reconexión, timers y deduplicación son nuestros: `Room` gestiona la
reserva de asiento de 45 s, el tick de 200 ms y la deduplicación por `id` en el cliente.

### D-A02 — Node 24 en local, 22 en CI/Docker

`engines.node >= 22`. El entorno de desarrollo tiene 24 LTS; CI y la imagen Docker fijan 22.

### D-A03 — Dinero en euros enteros

Sin decimales ni céntimos: evita errores de coma flotante en economía y ruleta.

### D-A04 — RNG y reloj inyectados

`game-core` nunca usa `Math.random()` ni `Date.now()`; firma `(state, rng, now)`. Los tests
usan un LCG determinista y el servidor siembra con `Date.now()`.

### D-A05 — Ruleta con commit–reveal

Al abrir la fase se publica `hashSeed` (sha256 de la semilla) y al girar se revela la semilla
y el resultado, de modo que el cliente puede verificar que no se cambió el resultado.

### D-A06 — Anti-fuga estructural

`LotSecret` vive en `packages/shared/src/secret.ts`, que el cliente **no importa**;
`protocol.ts` solo expone `LotPublic`. Dos barreras: test unitario
(`packages/game-core/src/leak.test.ts`) y escáner del bundle (`tools/check-leak.mjs`, en CI).

### D-A07 — Prórrogas anti-snipe

Ventana de 3 s, máximo 3 prórrogas; agotadas, el lote cierra en el timer vigente. Cada puja
reinicia el timer a 12 s.

### D-A08 — Lote desierto

Si nadie puja no hay transferencia de dinero y el historial registra `deserted: true`.

### D-A09 — Escalado del canvas

`pixelArt: true`, `roundPixels: true`, `antialias: false`, resolución interna 480×270.
El walking skeleton usa `Scale.FIT`; el pase de arte lo cambia a escalado entero ×3/×4.

### D-A10 — Fase `ROUND_INTRO`

La subasta se abre en el servidor y se envía `S2C_ROUND_INTRO` con 3 s de margen: el cliente
muestra el lote con el temporizador ya corriendo, sin pausa bloqueante para 5 jugadores.

### D-A11 — Códigos de error tipados

Unión cerrada en `protocol.ts` (`BID_TOO_LOW`, `INSUFFICIENT_FUNDS`, `PHASE_INVALID`,
`NOT_ALL_READY`, …). El servidor responde `S2C_ERROR` sin tumbar la sala.

### D-A12 — Fusión del stub de `package.json` de E

Se conservan los scripts `assets:build` / `assets:validate` (pipeline Python de E) y se añaden
los scripts de Node (turbo, vitest, smoke, balance). El stub no declaraba workspaces; este
commit introduce el monorepo real.

## C — Cliente: motor, render y red

### D-C01 — Escalado entero con `Scale.NONE` + zoom calculado

**Contexto:** `Scale.FIT` escala de forma fraccionaria y emborrona el pixel art.

**Decisión:** Phaser arranca en `Scale.NONE` con `zoom = floor(min(vw/480, vh/270))`
(mínimo 1) y `autoCenter: CENTER_BOTH`; en `resize`/`orientationchange` se recalcula
el zoom entero. La UI DOM (lobby/HUD/acciones) queda a tamaño de ventana.

**Consecuencias:** nunca hay escalas fraccionarias ni blur; en 800×600 se juega a ×1
y en 1920×1080 a ×4. `attachIntegerScaling()` centraliza el cálculo.

### D-C02 — Assets servidos en `/game-assets` con lista blanca

**Contexto:** `assets/` cuelga de la raíz del repo y contiene `catalog.json` con
valores reales; un `publicDir` directo filtraría secretos al bundle.

**Decisión:** plugin de Vite (`vite.config.ts`) que (a) sirve en dev solo ficheros
permitidos bajo `/game-assets/` y (b) copia a `dist/game-assets/` únicamente los
ficheros referenciados por `manifest.json` más `catalog.public.json`.

**Consecuencias:** `apps/client/dist/game-assets/catalog.json` no existe y
`tools/check-leak.mjs` sigue en verde. Los assets no se duplican en el repo.

### D-C03 — `mockServer` con partida completa y parámetros de demo

**Decisión:** `src/net/mockServer.ts` implementa el mismo protocolo que la sala
(timers, bots, commit–reveal, desierto) en memoria. Se activa con `?mock=1`
(3 rondas, ruleta tras la ronda 2; `&roulette=1` la adelanta). El módulo se carga
con import dinámico solo en modo mock.

**Consecuencias:** se puede desarrollar y demostrar el cliente sin B. Los valores
del mock viven en ese chunk, nunca se emiten antes de `S2C_REVEAL` y no son los
del catálogo real.

### D-C04 — Reloj del servidor para la cuenta atrás

**Decisión:** el socket estima el desfase con el `ts` de cada sobre y la mediana
de los últimos PING/PONG (`session.clockOffset`). Las cuentas atrás se interpolan
con `session.now()`; el cliente no decide timers ni fases.

**Consecuencias:** la barra de tiempo no salta por la latencia. Cada mensaje se
deduplica por `id`; al perder la conexión se reintenta con backoff y se encola
lo pendiente. La reserva de asiento real sigue pendiente en B (no hay mensaje de
reconexión en el protocolo).

### D-C05 — Adaptador temporal de ids/nombres de A

**Contexto:** `game-core` genera siluetas `s_box`, `s_lamp`… y nombres genéricos
("Televisor CRT"), mientras el arte de E usa `sil_*`/`obj_*` y 22 objetos.

**Decisión:** `src/game/assetMap.ts` traduce silueta y nombre a arte de E con
fallback determinista. Vive en el cliente y no toca las reglas.

**Consecuencias:** el cliente ya muestra arte real con el servidor actual. El
ticket C6 propone que A adopte `assets/catalog.json`; entonces el adaptador se
borra y el protocolo lleva ids de arte.

### D-C06 — Ruleta: 16 sectores estilizados, resultado del servidor

**Decisión:** la rueda de E es decorativa (16 sectores). El resultado (0–36) y
los pagos vienen del servidor; el cliente solo elige un sector del color del
resultado para animar y muestra número, color y delta. El color del número se
usa únicamente para la animación.

**Consecuencias:** no se duplica la lógica de pagos ni el RNG. Si E pinta una
ruleta de 37 casillas, se puede mapear el sector exacto sin cambiar el protocolo.

### D-C07 — Director de escenas por fase

**Decisión:** un `Director` escucha los mensajes y cambia entre
`lobby/garage/reveal/roulette/results` según la fase; las escenas leen el estado
de `session` al crearse (nada se pierde si un mensaje llega durante el arranque).

**Consecuencias:** no hay lógica de reglas en el cliente y el lobby DOM de D
puede seguir viviendo por encima del canvas.
