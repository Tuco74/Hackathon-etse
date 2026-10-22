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

## Workstream C — cliente (`apps/client`)

- [x] **C1** Phaser 3 + Vite + lobby DOM + conexión WebSocket con deduplicación.
- [x] **C2** Escena de trastero, siluetas placeholder, pujas, revelado, ruleta, fin de partida.
- [ ] **C3** `net/mockServer.ts` para trabajar sin servidor (mock-first).
- [ ] **C4** Interpolación de la cuenta atrás y snap a píxel en tweens.

## Workstream D — UI/UX

- [ ] **D1** Tipografía pixel con `ñ` y acentos verificada en Chromium/Firefox.
- [ ] **D2** Accesibilidad: nunca color como única información (formas + etiquetas).
- [ ] **D3** Layout legible a 1280×720 y 1920×1080 sin blur.

## Workstream E — arte y audio

- [ ] **E1** Atlas de siluetas (12) y objetos revelados, mismo contraste para todos.
- [ ] **E2** Paleta cerrada de 32–48 colores documentada en `docs/ART.md`.
- [ ] **E3** SFX chiptune (mazo, monedas, giro) con volumen y mute persistentes.