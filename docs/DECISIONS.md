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

---

## Integración de workstreams (main)

### D-INT01 — El cliente activo es el de C; la UI DOM de D queda como referencia

**Contexto:** D y C partieron del mismo `main` y reescribieron el cliente en paralelo.
D monta lobby/HUD/revelado/ruleta/resultados en DOM sobre un `GameScene` simplificado;
C monta escenas Phaser (`Boot/Lobby/Garage/Reveal/Roulette/Results`) con el arte de E,
su propio shell DOM, mock server y escalado entero. Activar ambas capas duplicaría
lobby, HUD y controles.

**Decisión:** la capa activa es la de C (es el workstream dueño del cliente y la que
usa los assets reales). La UI de D se conserva en `apps/client/src/ui/*`, con sus tests,
pero `main.ts` no la monta. Se documenta como ticket **D8** para reconciliar o retirar.

**Consecuencias:** `docs/UI.md` describe una UI que no está cableada en `main`; hay que
leerla como referencia de diseño. `GameScene.ts` de D tampoco se usa (C usa `GarageScene`).

### D-INT02 — Sesión de reconexión en `sessionStorage`, no `localStorage`

**Contexto:** probando con dos pestañas, la segunda heredaba `tw.session` de la primera
e intentaba reconectar como el mismo jugador (`ALREADY_JOINED`): `localStorage` se
comparte por origen.

**Decisión:** `{roomCode, playerId, token}` vive en `sessionStorage` (una sesión por
pestaña). `tw.nickname` sigue en `localStorage` porque es una preferencia, no identidad.

**Consecuencias:** abrir dos pestañas para jugar 1v1 funciona; recargar una pestaña
mantiene su asiento. Duplicar una pestaña sí clona la sesión: la segunda recibe
`ALREADY_JOINED` hasta que la primera se desconecte.

### D-INT03 — Correcciones de #4 conservadas y unificadas

`placeBid` usa la lógica de prórrogas de #4 (una puja dentro de la ventana anti-snipe
solo reinicia el timer si quedan prórrogas; con el lote expirado se rechaza) y
`antiSnipeWindowMs` de B como única constante. `spinRoulette` persiste los pagos en
`state.players` (antes se calculaban y se descartaban) y deriva el resultado de la
semilla con `rouletteResultFromSeed`. El generador de lotes mantiene la banda de valor
tras aplicar la pareja trampa ×10. El `room.ts` de B prevalece sobre el de #4/D.

### D-INT04 — Pausa de 4 s tras la ruleta

La sala anuncia el lote siguiente `CONFIG.server.resultPauseMs` después del resultado
(D-D03), con la subasta ya corriendo. Sin esa pausa, `S2C_ROULETTE_RESULT` y
`S2C_ROUND_INTRO` llegaban en el mismo tick y el cliente saltaba la animación del giro.

### D-B10 — La ruleta se gira cuando todos deciden (con botón y fallback)

**Contexto:** el flujo anterior solo tenía un temporizador de 20 s y ningún botón de
giro; tras apostar, el panel se vaciaba y parecía que la ruleta no respondía. Además,
un jugador desconectado podía dejar la fase colgada hasta el final de la ventana.

**Decisión:** cada jugador decide una vez con `C2S_ROULETTE_BET` o `C2S_ROULETTE_PASS`.
`readyToSpin` es true cuando todos los conectados han decidido; entonces cualquier
jugador puede `C2S_ROULETTE_SPIN` (si no, `SPIN_NOT_READY`). Si nadie pulsa, el servidor
gira al agotar los 20 s. Un jugador que se desconecta durante la fase se auto-marca como
`passed`. El snapshot `S2C_ROULETTE_PHASE` se reemite con `bets/passed/readyToSpin`.
El giro sigue siendo server-side y el resultado deriva de la semilla comprometida.

**Consecuencias:** el saldo se actualiza al recibir `S2C_ROULETTE_RESULT`/`ROOM_STATE` y
la partida continúa tras `resultPauseMs`. La ruleta sigue siendo tras las rondas 5, 10 y
15: la ronda 20 es el final (el enunciado del bug menciona 20, pero el GDD cierra ahí).

### D-D05 — Puja actual visible y botones incrementales

La barra superior muestra de forma persistente `PUJA X €` (o `SIN PUJAS`) durante la
subasta. Los tres botones inferiores pasan a ser incrementales: **+10 €, +25 € y
+50 €** sobre la puja actual (con 0 € de base abren en 10/25/50 €).

Para que una puja de +10 € sea válida, `CONFIG.auction.minIncrement` baja de 25 a 10.
El servidor sigue siendo la autoridad: rechaza cualquier importe por debajo de
`currentBid + 10` y el cliente no calcula reglas, solo pinta los tres atajos.
### D-B11 — La ruleta no gira si nadie apuesta

**Decisión:** al decidir el último jugador, si `bets.length === 0` la sala resuelve en el
acto (`skipped: true`), salta la animación y anuncia la ronda siguiente sin `resultPauseMs`.
Con al menos una apuesta se mantiene el giro y la pausa de 4 s. El cliente respeta
`skipped` y no anima. La UI muestra el líder fijo arriba (`👑 VAS GANANDO` / `VA GANANDO`).
## Integración final C + D (PR de integración)

### D-I01 — Phaser dibuja el escenario; el DOM dibuja todo lo legible

**Contexto:** el merge de C sustituyó `index.html`, `main.ts` y `styles.css` por la
versión de C y dejó la UI de D (`src/ui/*`) sin montar y sin estilos.

**Decisión:** se recuperan `index.html` y `styles.css` de D (`10aaef3`) y
`main.ts` pasa a: cargar manifiesto/catálogo → crear Phaser con las escenas de C →
`mountUi({ socket })` para lobby/HUD/revelado/ruleta/resultados.

Las escenas de C quedan como **solo escenario**: trastero, siluetas, volteo y
rueda. Se eliminan de Phaser el HUD, los botones de puja, el panel de revelado,
el resultado de ruleta y el ranking para no duplicar la UI de D.

**Consecuencias:** una sola fuente de verdad visual por elemento; accesibilidad y
tipografía de D; arte y animación de C/E. `session` (C) y el reducer de D se
alimentan del mismo socket, así que escenas y DOM nunca se desincronizan.

### D-I02 — Mock y audio en la integración

**Decisión:** `?mock=1` preconecta el transporte mock antes de montar la UI, de
modo que el lobby de D lo reutiliza sin abrir WebSocket. Los SFX de puja llegan
por `S2C_BID_EVENT`; moneda, giro y resultado siguen en las escenas. El mute
persistente de `audio.ts` queda accesible por API (falta botón en la UI de D).

### D-INT05 — Integración final: UI de D sobre el escenario de C

Se monta la interfaz DOM de D (`src/ui/*`) sobre las escenas de C, que quedan como
escenario (trastero, siluetas, volteo, rueda). El estado de D se alimenta del mismo
socket que `session` de C. Sobre esa base se reaplican los fixes de B:

- Ruleta: `Pasar` envía `C2S_ROULETTE_PASS`; `Girar ahora` se habilita con
  `readyToSpin` y envía `C2S_ROULETTE_SPIN`; `skipped` no anima ni espera.
- Reconexión: `S2C_JOINED` aporta `playerId`/token, la sesión vive en `sessionStorage`
  (una por pestaña) y se reanuda al recargar.
- Líder: banner fijo `👑 VAS GANANDO` / `VA GANANDO: …` bajo la fila de jugadores.
- Subasta: puja mínima + 10 €, atajos +25 € y +50 € (los tres botones de cc0ba3f).
- Textos: 100 % español (`Intro` en vez de `Enter`, `Compromiso`, categorías traducidas).

### D-B12 — Lotes variados: categoría y silueta por objeto

**Contexto:** el generador elegía una sola categoría por lote y podía repetir siluetas; el
revelado usaba `lot.category` para todos los objetos, así que todos mostraban el mismo
icono y el mismo tipo.

**Decisión:** `generateLot` baraja categorías y siluetas y asigna una categoría distinta a
cada objeto (nombre único dentro del lote), con siluetas canónicas `sil_*` sin repetir
salvo la pareja trampa intencional. `S2C_REVEAL.objects[].category` viaja por objeto y la
UI pinta icono/etiqueta propios. `LotPublic.category` pasa a `"mixed"` si hay variedad.
