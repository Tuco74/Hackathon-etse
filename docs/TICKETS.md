# Tickets

Estado: `[x]` hecho · `[~]` en curso · `[ ]` pendiente.
Cada ticket indica dueño, ficheros que toca y Definition of Done.

## Fase 0 — contratos y esqueleto (dueño: A)

- [x] **T0.1 Monorepo + CI + CODEOWNERS**
  Ficheros: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`,
  `.github/workflows/ci.yml`, `CODEOWNERS`.
  DoD: `main` verde con typecheck, tests, build, escáner anti-fuga, smoke E2E y docker build.

- [x] **T0.2 `packages/shared`**
  `config.ts` (todos los números), `protocol.ts` (sobre + uniones zod C2S/S2C, `GamePhase`
  y transiciones válidas, códigos de error), `secret.ts` (server-only).
  DoD: `tsc -b` sin errores; el cliente no importa `secret.ts`.

- [x] **T0.3 `packages/game-core` + tests**
  `match.ts` (startMatch, startRound, placeBid, tick, resolveAuction, reveal, afterReveal,
  placeRouletteBet, spinRoulette, finishMatch), `lotGenerator.ts` (bandas de valor, pares
  trampa, objeto gancho).
  DoD: 15 tests verdes, incluidos los 3 anti-fuga.

- [x] **T0.4 Walking skeleton**
  `apps/server` (sala autoritativa `ws`, timers, reconexión con reserva de asiento,
  commit-reveal) + `apps/client` (Phaser 3 + overlay DOM de lobby).
  DoD: `tools/smoke.mjs` completa una partida de 2 rondas con 2 clientes y hay pujas reales.

- [x] **T0.5 Documentación**
  `docs/GDD.md`, `PROTOCOL.md`, `ARCHITECTURE.md`, `ART.md`, `BALANCE.md`, `TICKETS.md`,
  `DECISIONS.md`, `README.md`.
  DoD: otra persona arranca en menos de 5 minutos siguiendo el README.

## Workstream A — core y balance (`packages/game-core`, `tools/balance-sim`)

- [x] **A1** Máquina de estados de partida como funciones puras.
- [x] **A2** Generador de lotes con pares trampa y objeto gancho.
- [x] **A3** Simulador de 1.000 partidas con 4 bots (`tools/balance-sim`).
  DoD: reporta mediana, % de lotes rentables, quiebras y duración media → `docs/BALANCE.md`.
- [~] **A4** Tests de propiedades (invariantes de dinero, determinismo por semilla).
  Falta: `fast-check` sobre 1.000 secuencias aleatorias y conservación de dinero.
- [ ] **A5** Reajustar curva de valor con los resultados del simulador (la mediana actual
  de 33.227 € indica que los bots pujan demasiado bajo).

## Workstream B — servidor (`apps/server`)

- [x] **B1** Sala, join/leave, reserva de asiento 45 s.
- [x] **B2** Timers de subasta, resolución y revelado automático.
- [x] **B3** Commit–reveal de la ruleta.
- [x] **B4** Endurecer validación: límite de mensajes por segundo y `refId` en errores.
  Además: sobre validado (type de sobre = type de payload), dedupe por `id`,
  `maxPayload` 16 KiB, heartbeat, `NAME_TAKEN` y `ALREADY_JOINED`.
- [x] **B5** Tests de integración de la sala (dobles de WebSocket) además del smoke.
  `apps/server/src/room.test.ts`: 5 clientes / 5 rondas, reconexión a mitad de subasta,
  expiración de asiento, resync en REVEAL y barrido anti-fuga.
  `apps/server/src/wire.test.ts`: fuzzing de sobres/payloads, dedupe y rate limit.
- [x] **B6** Reconexión end-to-end: `C2S_RECONNECT` + `S2C_JOINED` + token privado,
  snapshot por fase, expiración a los 45 s y `tools/reconnect-smoke.mjs` en CI.
- [x] **B7** Commit–reveal verificable: `result = FNV1a32(seed) % 37`, comprobado contra
  `sha256(seed)` en el test de partida completa.
- [x] **B8** Reloj monótono inyectado (`clock.ts`), logs JSON por sala (`log.ts`) sin
  secretos y apagado limpio con SIGINT/SIGTERM.
- [x] **B10** Ruleta sin apuestas: `skipped`, salto de animación y ronda inmediata; test.
- [x] **B9** Ruleta interactiva: `C2S_ROULETTE_PASS`/`C2S_ROULETTE_SPIN`, snapshot con
  `bets/passed/readyToSpin`, giro bloqueado hasta que todos deciden (`SPIN_NOT_READY`),
  auto-pass al desconectarse, pausa de 4 s y continuación a la ronda siguiente. Test de
  integración del flujo apuesta → pase → giro → resultado → ronda 6.

## Workstream C — cliente (`apps/client`)

- [x] **C1** Phaser 3 + Vite + lobby DOM + conexión WebSocket con deduplicación.
- [x] **C2** Escenas `Boot/Lobby/Garage/Reveal/Roulette/Results` con arte real de E, pujas,
  revelado objeto a objeto, ruleta y ranking.
- [x] **C3** `net/mockServer.ts` para trabajar sin servidor (mock-first):
  `http://localhost:5173/?mock=1` (3 rondas, ruleta tras la 2; `&roulette=1` para la 1).
- [x] **C4** Interpolación de la cuenta atrás desde `endsAt` del servidor con desfase de reloj
  (PING/PONG + `ts` del sobre), snap a píxel en tweens y escalado entero.
- [x] **C5** Carga de assets (`manifest.json`, atlas, fuente, salas, audio) con barra de carga,
  reintento y montaje seguro en `/game-assets` (el `catalog.json` privado nunca entra en `dist`).
- [ ] **C6** Coordinar con A: que `game-core` genere lotes desde `assets/catalog.json`
  (hoy el cliente traduce `s_*`/nombres genéricos en `src/game/assetMap.ts`).
  DoD: `silhouetteId` y `name` del protocolo son ids del catálogo de E; se borra el adaptador.
- [x] **C7** Integración con el netcode de B: `S2C_JOINED` como fuente de identidad,
  `C2S_RECONNECT` con token en `sessionStorage` (una sesión por pestaña), backoff y
  manejo de `SEAT_EXPIRED`/`RECONNECT_FAILED`. Mock sigue usando el heurístico de apodo.
- [x] **C10** Lotes variados: cada objeto lleva su propia `category`, nombres únicos y silueta distinta (salvo la pareja trampa); el revelado pinta icono+tipo por objeto.
- [x] **C9** UI: textos 100% español (categorías, `compromiso`, `SONIDO ACTIVADO`), líder fijo `👑` y panel de ruleta con `skipped`.
- [x] **C8** Panel de ruleta accionable: cantidad + color, `Pasar`, `Girar ahora`
  (deshabilitado con motivo hasta `readyToSpin`), confirmación de apuesta, errores
  visibles y limpieza al pasar de fase. Verificado en mock y contra el servidor.

## Workstream D — UI/UX

- [x] **D1** Tipografía pixel con `ñ` y acentos verificada en Chromium/Firefox.
      Silkscreen OFL autoalojada (400/700) en `apps/client/src/ui/fonts/`.
- [x] **D2** Accesibilidad: nunca color como única información (formas + etiquetas).
      Ruleta con símbolo+etiqueta, ganancia/pérdida con icono+signo, foco visible,
      `aria-live`, `prefers-reduced-motion`, botones deshabilitados con motivo.
- [x] **D3** Layout legible a 1280×720 y 1920×1080 sin blur. Probado además a
      900×600; la UI es DOM en píxeles reales sobre el canvas.
- [x] **D4** Lobby completo (apodo, código, enlace, lista, listo, empezar).
- [x] **D5** HUD de subasta (dinero, ronda, fase, timer, mejor puja, atajos).
- [x] **D6** Revelado escalonado con total, pagado y neto; ruleta y ranking final
      con gráfico de evolución y mejores/peores compras.
- [x] **D7** `docs/UI.md` con pantallas, atajos, accesibilidad y límites conocidos.
- [x] **D8** Reconciliar la UI DOM de D con el cliente de escenas de C. En `main`
  la capa activa es la de C (escenas Phaser + shell DOM propia); `src/ui/*` de D
  queda en el árbol como referencia y sus tests siguen verdes. Decidir si se
  reengancha (p. ej. HUD/accesibilidad) o se retira antes de la entrega.

## Workstream E — arte y audio

- [x] **E1** Atlas de 22 objetos, 13 siluetas y 9 parejas trampa, mismo contraste para todas.
- [x] **E2** Paleta cerrada de 46 colores documentada en `docs/ART.md`.
- [x] **E3** SFX chiptune (mazo, monedas, giro, tensión) con volumen y mute persistentes.
- [x] **E4** Manifiesto único + pipeline `pnpm assets:build`/`assets:validate`.