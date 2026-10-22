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

---

## B — Servidor y netcode

### D-B01 — Reloj monótono inyectado

**Contexto:** usar `Date.now()` en cada timer permite que un salto de hora del sistema
abra o cierre subastas antes de tiempo.

**Decisión:** `clock.ts` construye un reloj monótono en milisegundos epoch
(`Date.now() - performance.now()` como origen). `Room` recibe `now()` y `tick()` es el
único que evalúa deadlines; los tests inyectan un reloj falso y avanzan el tiempo a mano.

**Consecuencias:** los `endsAt` siguen siendo epoch (el cliente compara con `Date.now()`),
pero el servidor no depende del reloj de pared. Nada de `setTimeout` para reglas.

### D-B02 — Reconexión por token privado, no por `playerId`

**Contexto:** el `playerId` viaja en `S2C_ROOM_STATE` a toda la sala; usarlo como
credencial permitiría a cualquiera robar un asiento.

**Decisión:** al hacer `C2S_JOIN` se genera un token de 32 bytes (hex) y se envía solo a
ese socket dentro de `S2C_JOINED` (mensaje nuevo, nunca broadcast). `C2S_RECONNECT`
exige `playerId + token`, comparado con `timingSafeEqual`. La reserva dura 45 s; al
expirar se borra el token y el asiento queda como desconectado permanente.

**Consecuencias:** el cliente guarda `{roomCode, playerId, token}` en `localStorage`
(clave `tw.session`) y puede recargar la pestaña sin duplicar apodo. Cambiar de sala
invalida el asiento anterior al hacer `C2S_JOIN`.

### D-B03 — Dedupe, rate limit y `refId` en el borde

**Decisión:** `wire.ts` valida sobre y payload (el `type` de ambos debe coincidir), aplica
un dedupe de 256 ids por conexión y un token bucket de 30 de ráfaga / 15 msg/s. Los
errores devuelven `refId` con el `id` del mensaje culpable. `maxPayload` 16 KiB y
heartbeat de 15 s.

**Consecuencias:** una retransmisión de `C2S_BID` no se aplica dos veces y un flood no
bloquea al resto de la sala. El límite es por conexión, no por IP: suficiente para el
hackathon, no para internet abierta.

### D-B04 — El resultado de la ruleta se deriva de la semilla comprometida

**Contexto:** se publicaba `sha256(seed)` pero el giro volvía a llamar al RNG; el
compromiso no demostraba nada.

**Decisión:** `spinRoulette` calcula `result = FNV1a32(seed) % 37` con
`rouletteResultFromSeed(seed)` (exportado desde `game-core`). El servidor solo hashea la
semilla para el compromiso y la revela al girar.

**Consecuencias:** el cliente o un auditor puede verificar ambos pasos sin confiar en el
servidor. La distribución módulo 37 tiene un sesgo despreciable para una demo; si se
quiere criptográfico puro, sustituir FNV por SHA-256 en `game-core` (requiere mover la
función a `shared` para que el cliente la recalcule).

### D-B05 — Ciclo de vida de salas y asientos

**Decisión:** una sala sin conexiones se elimina en LOBBY/GAME_OVER o cuando todos los
asientos expiraron; nunca se borra una partida en curso con reservas vivas. `Room.leave`
solo actúa si el socket es el titular actual del asiento, para que un socket viejo no
tumbe a la conexión nueva. El apodo es único por sala (case-insensitive) y el `ready`
de los jugadores ya sentados se conserva al entrar alguien nuevo.

**Consecuencias:** recargar dos pestañas con el mismo apodo da `NAME_TAKEN` en vez de
dos jugadores duplicados.

### D-B06 — La reconexión del cliente entra en el workstream B

**Contexto:** el servidor ya soporta `C2S_RECONNECT`, pero sin cambios en el cliente la
funcionalidad no se puede usar en el navegador y el criterio de aceptación no se podría
demostrar.

**Decisión:** se toca lo mínimo de `apps/client/src/net/socket.ts` (evento `onClose`) y
`apps/client/src/main.ts` (sesión en `localStorage`, reconexión al cargar y con backoff).
No se altera la escena ni la lógica de juego.

**Consecuencias:** C debe revisar estos dos ficheros antes de continuar su workstream;
cualquier rediseño del transporte tiene que conservar `S2C_JOINED` y el token.
### D-D01 — La interfaz es DOM, no Phaser

Todo el texto y los controles viven en `apps/client/src/ui` (DOM), sobre el canvas
de Phaser. Motivo: foco, teclado, lectores de pantalla, `dialog` nativo y textos que
no se emborronan al escalar. El canvas queda como escenario. `GameScene` ya no
pinta textos ni botones: eran placeholders que duplicaban el HUD.

### D-D02 — Iconos desde el atlas de E, sin copiar `assets/`

`ui/icons.ts` importa `assets/atlases/ui.png` con `?url` (Vite lo empaqueta con
hash) y lee las coordenadas de los frames de `ui.json`. Copiar `assets/` como
`publicDir` habría metido `catalog.json` (valores privados) en el bundle.

### D-D03 — Anuncio del lote después de la ruleta

`advanceAfterRoulette` ya había hecho `startRound`, pero la sala no enviaba
`S2C_ROUND_INTRO`: la ronda siguiente se pujaba a ciegas. La sala ahora anuncia el
lote 4 s después del resultado (`RESULT_PAUSE_MS`), con el temporizador de la
subasta ya corriendo, igual que en `D-A10`.

### D-D04 — Categoría del revelado

El generador asigna una categoría por lote; el payload público de revelado no
incluye categoría por objeto. La UI usa `lot.category` para las etiquetas y mapea
las categorías del servidor (`jewelry`, `art`, `antique`, `misc`) a los 8 iconos
de E.
