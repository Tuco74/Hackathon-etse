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
- [~] **B4** Endurecer validación: límite de mensajes por segundo y `refId` en errores.
- [ ] **B5** Tests de integración de la sala (dobles de WebSocket) además del smoke.

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

## Workstream D — UI/UX

- [ ] **D1** Tipografía pixel con `ñ` y acentos verificada en Chromium/Firefox.
- [ ] **D2** Accesibilidad: nunca color como única información (formas + etiquetas).
- [ ] **D3** Layout legible a 1280×720 y 1920×1080 sin blur.

## Workstream E — arte y audio

- [x] **E1** Atlas de 22 objetos, 13 siluetas y 9 parejas trampa, mismo contraste para todas.
- [x] **E2** Paleta cerrada de 46 colores documentada en `docs/ART.md`.
- [x] **E3** SFX chiptune (mazo, monedas, giro, tensión) con volumen y mute persistentes.
- [x] **E4** Manifiesto único + pipeline `pnpm assets:build`/`assets:validate`.