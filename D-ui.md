# Prompt — Workstream UI/UX

> Pega **todo** este fichero como primer mensaje en una conversación nueva.

---

## §1 Prompt maestro (pegar tal cual)

Eres el ingeniero responsable de llevar a producción un juego web multijugador en tiempo real llamado provisionalmente **Trastero Wars**, en el contexto de un hackathon. Trabaja de forma autónoma, decide y documenta; no me hagas preguntas cuya respuesta esté en este documento. Si algo es ambiguo, elige la opción más simple que cumpla los criterios de aceptación y anótalo en `docs/DECISIONS.md`.

### 1.1 Producto

Juego de subastas de trasteros/garajes (estilo *Storage Wars*) para **2–5 jugadores** en la misma sala (objetivo: 4–5), partida de **20 rondas**, en **pixel art**.

Bucle de juego:
1. Cada jugador empieza con **1.000 €**.
2. Cada ronda se abre un trastero con **2–5 objetos** cuyo valor real es **desconocido**.
3. Se muestra una **vista previa ambigua**: siluetas de los objetos (sin color ni detalle), polvo, cajas, iluminación. Objetos con siluetas parecidas pueden valer 10 € o 900 €. La vista previa debe **sugerir sin confirmar**.
4. **Subasta ascendente** en tiempo real. El ganador paga su puja y, al revelarse, **suma a su dinero el valor de los objetos** del trastero.
5. **Revelado**: se voltean los objetos uno a uno con su nombre y valor, se muestra el total, la puja pagada y el beneficio/pérdida neta.
6. Tras las rondas **5, 10 y 15** hay una **fase de ruleta** opcional: cada jugador puede apostar dinero para remontar.
7. Gana quien tenga **más dinero al final de la ronda 20**.

Decisiones de diseño ya tomadas (no las cambies sin justificar en `docs/DECISIONS.md`):
- **Sin cuentas ni login**: el jugador entra con un apodo y un código de sala de 4–6 caracteres. Sin base de datos obligatoria; el estado vive en memoria del servidor.
- **Sin matchmaking**: se juega por código/enlace de sala.
- **Sin chat de texto libre** (solo 4–6 emotes predefinidos, opcional).
- **No hay inventario persistente**: los objetos se convierten en dinero al revelarse; solo se guarda un historial de lotes para la pantalla final.
- **Servidor autoritativo siempre**: el cliente nunca decide pujas, timers, RNG ni valores. El cliente es no confiable.
- **Los valores reales de los objetos nunca se envían al cliente antes del revelado** (ni en el estado, ni en el bundle, ni en un endpoint).
- **Idioma de la UI: español**. Código y nombres de ficheros en inglés.

### 1.2 Reglas exactas (defaults, todas en `packages/shared/src/config.ts`)

| Parámetro | Valor |
|---|---|
| Jugadores por sala | 2–5 (objetivo 5) |
| Rondas | 20 |
| Dinero inicial | 1.000 € |
| Objetos por lote | 2–5 (peso mayor a 3) |
| Valor total del lote | ronda 1–5: 150–900 € · 6–14: 400–1.800 € · 15–20: 700–3.000 € |
| Puja mínima | 10 € |
| Incremento mínimo | 25 € |
| Timer por puja | 12 s, se reinicia con cada puja |
| Prórrogas | máx. 3 (anti-snipe); al agotarse, cierra |
| Puja inicial | 0 € (se puede abrir en 10 €) |
| Si nadie puja | el lote queda desierto, nadie gana ni pierde |
| Ruleta | tras rondas 5, 10 y 15 |
| Apuestas de ruleta | rojo/negro (1:1) y verde 0 (35:1), apuesta mínima 10 €, máxima = todo el dinero |
| Ventana de apuesta | 20 s; se puede pasar |
| Desempate final | dinero → valor total de lotes ganados → moneda al aire con semilla del servidor |

Detalles de la subasta:
- Solo puede pujar quien tiene dinero ≥ puja. No se puede pujar contra uno mismo ni bajar la puja.
- Si un jugador se desconecta durante la subasta, su asiento se reserva 45 s; sus pujas previas siguen siendo válidas y puede reconectar y seguir.
- Si un jugador se queda a 0 €, sigue en la partida y puede usar la ruleta (es su única vía de remontar).
- Al agotarse el timer sin pujas nuevas, el lote se adjudica al mejor postor y empieza el revelado automáticamente.

Ruleta (equilibrio):
- Rojo/negro pagan 1:1 (ganancia neta = apuesta). Verde 0 paga 35:1. Ventaja de la casa ≈ 2,7 %.
- El giro usa un RNG server-side con **commit–reveal**: el servidor publica `hash(seed)` al empezar la fase y revela `seed` al girar, para que el resultado sea verificable.
- Máximo 1 apuesta por jugador y fase.

### 1.3 Stack y arquitectura

- **Monorepo** con `pnpm` + workspaces + `turbo`. TypeScript `strict` en todo. Node 22.
- **Cliente**: `Phaser 3` + `Vite` + TypeScript. Todo el juego (escena, preview, revelado, ruleta) en Phaser; lobby/formularios/ayuda pueden ser overlay DOM con la misma fuente pixel y `image-rendering: pixelated`.
- **Servidor**: Node + **Colyseus** (rooms, sincronización, reconexión) + `zod` para validar entrada. Sirve también el cliente estático en producción (mismo origen → sin CORS, `wss` bajo el mismo dominio).
- **Alternativa permitida**: `ws` + protocolo propio, solo si Colyseus bloquea el trabajo. Documenta el motivo. Si usas Colyseus, **regla crítica**: los valores reales de los objetos NO pueden estar en el `RoomState` sincronizado; guárdalos en campos privados del servidor (clase sin decoradores `@type`).
- **Tests**: `Vitest` (unitario, `game-core` sin I/O) + `Playwright` (E2E con 3–5 contextos de navegador).
- **CI**: GitHub Actions → lint, typecheck, unit, build, E2E corto, docker build. `main` siempre verde.
- **Deploy**: `docker-compose` (app + reverse proxy Caddy/nginx con TLS) en un VPS, Railway o Fly.io. Un solo comando documentado en `README.md`.
- **Assets**: fuentes `.aseprite`/`.psd` en `assets/src`, export a atlas PNG+JSON con un script reproducible `pnpm assets:build`. Los atlas generados se commitean.

Estructura del repo (crear exactamente esta):

```
apps/
  client/                 # Phaser + Vite
  server/                 # Colyseus rooms + transporte
packages/
  shared/                 # protocolo zod, tipos, constantes, config, errores
  game-core/              # reglas puras: subasta, economía, ruleta, generador de lotes
assets/
  src/                    # fuentes de arte
  atlases/                # PNG + JSON exportados
  manifest.json
tools/
  balance-sim/            # simulación headless de 1.000 partidas con bots
docs/
  GDD.md PROTOCOL.md ARCHITECTURE.md ART.md BALANCE.md TICKETS.md DECISIONS.md
.github/workflows/ci.yml
CODEOWNERS
```

Separación obligatoria:
- `game-core` = funciones **puras**, sin red, sin disco, sin `Math.random()` ni `Date.now()` (inyecta `rng` y `now`). Es la única fuente de verdad de las reglas.
- `server` = salas, timers, transporte, autorización, commit–reveal, reconexión. Orquesta `game-core`.
- `client` = presentación e input. Nunca reimplementa reglas; si necesita saber si puede pujar, usa lo que diga el servidor (`canBid`, `minNextBid`).

### 1.4 Fase 0 — Contratos (primero, bloqueante)

Antes de escribir features, crea y congela:

1. `packages/shared`:
   - `config.ts` con todos los números de §1.2 (nadie hardcodea valores fuera de aquí).
   - `protocol.ts` con sobre `{ v: 1, type, id, ts, payload }`, unión discriminada de mensajes C2S/S2C y esquemas `zod`.
   - Tipos públicos vs secretos: `LotPublic` (id de silueta, categoría, pistas, sin valores) / `LotSecret` (solo servidor).
   - `GamePhase`: `LOBBY | ROUND_INTRO | AUCTION | REVEAL | ROULETTE | GAME_OVER` y tabla de transiciones válidas.
   - Códigos de error tipados (`NOT_YOUR_TURN`, `INSUFFICIENT_FUNDS`, `BID_TOO_LOW`, `PHASE_INVALID`, `ROOM_FULL`, …).
2. `docs/PROTOCOL.md`: cada mensaje con ejemplo de payload y efecto en la máquina de estados.
3. `docs/ARCHITECTURE.md`: diagrama de capas y flujo de una ronda.
4. **Esqueleto funcional** (walking skeleton): 2 clientes se unen a una sala, se ven, empieza una partida falsa de 2 rondas con rectángulos de placeholder, timers del servidor, revelado y pantalla de ganador. Debe estar en `main` y verde en CI antes de repartir trabajo.

Contratos de mensajes mínimos:
`C2S_JOIN`, `C2S_SET_READY`, `C2S_START_GAME`, `C2S_BID`, `C2S_ROULETTE_BET`, `C2S_EMOTE`, `C2S_PING`
`S2C_ROOM_STATE`, `S2C_ROUND_INTRO`, `S2C_AUCTION_STATE`, `S2C_BID_EVENT`, `S2C_REVEAL`, `S2C_ROULETTE_PHASE`, `S2C_ROULETTE_RESULT`, `S2C_GAME_OVER`, `S2C_ERROR`
Reglas: el servidor valida todo con `zod`, ignora mensajes desconocidos y responde `S2C_ERROR` sin tumbar la sala. Cada mensaje lleva `id` para deduplicar.

### 1.5 Arte pixel (resumen operativo; detalle en `docs/ART.md`)

- Resolución interna **480×270**, escalado **entero** (×4 = 1920×1080, ×3 = 1440×810). Nunca escalado fraccionario.
- Phaser: `pixelArt: true`, `roundPixels: true`, `antialias: false`. Nada de rotaciones suaves ni posiciones subpíxel.
- Paleta cerrada de **32–48 colores** documentada en `docs/ART.md`. Prohibido usar color como única fuente de información (daltonismo): añade forma/etiqueta.
- Fuente pixel con acentos y `ñ` (probarla antes de elegir; si no, usar texto en DOM con fuente web pixel).
- Siluetas: relleno plano de 1 color + 1 tono de sombra sobre fondo oscuro, mismo contraste para todos los objetos → **no filtrar valor por número de colores ni por detalle**.
- Animación de personajes 8–12 fps; tweens solo para UI, siempre con snap a píxel.
- SFX chiptune (mazo, monedas, giro, tensión), música opcional, volumen y mute persistentes.

### 1.6 Criterios de aceptación (Definition of Done)

- [ ] 5 navegadores en una sala completan 20 rondas + 3 ruletas + pantalla final con ranking y estadísticas.
- [ ] Reconexión < 60 s recupera asiento, dinero y fase actual (también en mitad de subasta).
- [ ] El servidor rechaza: pujas sin fondos, pujas por debajo del mínimo, pujas fuera de fase, doble apuesta de ruleta, mensajes malformados. Tests que lo demuestran.
- [ ] **Test anti-fuga**: ningún payload previo al revelado ni el bundle del cliente contiene `trueValue`/`value` de objetos. Añade un test que falle si aparece.
- [ ] Todos los timers son del servidor; el cliente solo interpola la cuenta atrás.
- [ ] Un jugador con lag o que cierra la pestaña no rompe ni bloquea la partida.
- [ ] `game-core` con cobertura ≥ 80 % y tests de propiedades (nunca dinero negativo, nunca puja > dinero, suma de dinero conservada salvo ruleta).
- [ ] E2E Playwright: 3 clientes headless, config de 5 rondas, partida completa.
- [ ] 60 FPS en portátil normal a 1080p; sin blur; UI legible a 1280×720.
- [ ] `README.md` con setup en < 5 min y URL de demo desplegada.
- [ ] `docs/TICKETS.md` con backlog priorizado y dueño por ticket.

### 1.7 Plan de tiempo (hackathon, ~12 h de trabajo)

| Hora | Objetivo |
|---|---|
| 0:00–1:00 | Fase 0: repo, contratos, CI, walking skeleton |
| 1:00–4:00 | Workstreams A–E en paralelo. **Checkpoint 4:00: vertical slice** (1 ronda real con arte placeholder) |
| 4:00–7:00 | 20 rondas + revelado + ruleta completos, integrados en `main` |
| 7:00–9:00 | Pase de arte, juice, audio, balance |
| 9:00–11:00 | Hardening: reconexión, errores, E2E, anti-fuga, deploy |
| 11:00–12:00 | Congelar features, demo script, ensayo de 5 jugadores |

Si en el checkpoint de las 4:00 no hay vertical slice, **recorta alcance** en este orden: emotes → música → animaciones de personajes → apuestas de ruleta complejas (dejar solo rojo/negro) → efectos de partículas. Nunca recortes: servidor autoritativo, anti-fuga, reconexión, revelado.

### 1.8 Reglas de trabajo en paralelo (5 personas, 5 máquinas)

1. **Contract-first**: si necesitas un mensaje o campo nuevo, PR a `packages/shared` + aviso en el canal. Nadie más lo edita.
2. **Propiedad de ficheros** en `CODEOWNERS`. No edites ficheros de otro workstream; si lo necesitas, pide el cambio.
3. **Trunk-based**: ramas cortas (`feat/<ws>-<tema>`), PR < 400 líneas, 1 review, auto-merge con CI verde. Integra `main` en tu rama 2 veces al día.
4. **Mock-first**: cliente contra un mock server (`apps/client/src/net/mockServer.ts`) y servidor con bots headless, para no bloquearse.
5. **Feature flags** en `config.ts` para todo lo que no esté integrado.
6. **Nada de `Math.random()`/`Date.now()` en `game-core`**: inyección de dependencias, tests deterministas con semillas.
7. **Lockfile**: solo una persona mergea cambios de dependencias; avisa antes.
8. **Sync de 10 min** cada 2 h: qué está en `main`, qué bloquea, qué se recorta.
9. **Regla de los 15 min**: bloqueado → pide ayuda, no luches solo.
10. **Commits** convencionales (`feat:`, `fix:`, `docs:`, `test:`, `chore:`), en inglés.

### 1.9 Entregables del agente en esta primera ejecución

1. Repo scaffold completo + CI verde + `CODEOWNERS`.
2. `docs/GDD.md`, `PROTOCOL.md`, `ARCHITECTURE.md`, `ART.md`, `BALANCE.md`, `TICKETS.md`, `DECISIONS.md`.
3. `packages/shared` y `packages/game-core` con tests (subasta, economía, ruleta, generador de lotes).
4. Walking skeleton funcionando en local con 2 pestañas.
5. Backlog en `TICKETS.md` repartido en A–E, con ficheros que toca cada ticket y su DoD.
6. Un `README.md` que permita a otra persona arrancar en < 5 min.

No implementes arte final ni las 20 rondas en esta primera ejecución: primero contratos, esqueleto y tests. Cuando termines, resume qué está hecho, qué falta y qué debe hacer cada workstream.

---

---

## Tu workstream

### D — UI/UX e interacción de subasta (`apps/client/src/ui`, overlay DOM)

Eres dueño de `src/ui`, estilos, textos y accesibilidad.

- Lobby: apodo, código de sala, copiar enlace, lista de jugadores, ready, start (host).
- HUD: dinero propio y de rivales, ronda X/20, fase, cronómetro, mejor postor, puja mínima siguiente.
- Controles de puja: ± incremento, puja rápida, puja máxima (con confirmación), atajos de teclado, deshabilitado con motivo visible (`sin fondos`, `fuera de fase`).
- Secuencia de revelado: objeto a objeto (nombre, categoría, valor), total, pagado, neto con color **y** icono; resumen de ronda.
- Ruleta: elegir cantidad (10 %, 25 %, 50 %, todo), rojo/negro/verde con símbolos además de color, animación de giro, resultado y nuevo saldo.
- Pantalla final: ranking, gráfico de evolución del dinero, mejores y peores compras, botón de revancha.
- Accesibilidad: foco visible, navegación por teclado, contraste, textos en español, sin depender del color, respetar `prefers-reduced-motion` (reducir animaciones sin romper el juego).
- Microcopy con humor de trastero, en español, sin bloquear la lectura del estado.

---

## Estado actual del repo (leer antes de empezar)

La **Fase 0 ya está completada** en `main`: repo, monorepo, contratos en `packages/shared`,
`packages/game-core` vacío con tests base, CI verde, `CODEOWNERS` y walking skeleton.

Reglas para esta conversación:
- Trabaja en una rama `feat/<tu-workstream>-<tema>`, nunca directamente en `main`.
- **No repitas ni reescribas la Fase 0** ni el scaffold. Si algo del esqueleto no encaja, propón el cambio y documenta el motivo.
- No edites ficheros de otros workstreams (ver `CODEOWNERS`). Si los necesitas, pide el cambio.
- Antes de escribir código: lee `docs/PROTOCOL.md`, `docs/ARCHITECTURE.md` y `docs/TICKETS.md`, y dime en 5 líneas tu plan y qué tickets vas a cerrar.
- Ejecuta `pnpm install && pnpm test` antes de tu primer commit y deja `main` verde.
